"""Share-card deep links (#245).

A parent can mint an unguessable per-kid share token and drop a link into the
weekly WhatsApp share-card. Opening the link hits a PUBLIC, auth-free endpoint
that returns ONLY anonymized aggregates — no name, avatar, kid id, email or
skill ids — so a friend/relative sees the week's numbers and nothing personal.
The public page makes one fetch and no tracking pixels: zero analytics.

Routes:
  · GET    /kids/{kid_id}/share-token             (auth) — mint a NEW per-recipient token
  · POST   /kids/{kid_id}/share-token/rotate      (auth) — revoke all links, mint one fresh
  · DELETE /kids/{kid_id}/share-token             (auth) — revoke ALL links for the kid
  · DELETE /kids/{kid_id}/share-token/{token}     (auth) — revoke ONE link (others stay live)
  · GET    /share/{token}                         (public) — the anonymized weekly snapshot
"""
import asyncio
import hashlib
import secrets
import uuid
from collections import Counter
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import get_current_profile
from ..models import ContentItem, Kid, KidSettings, ParentEvent, Profile, ProgressEvent, ShareToken, SkillMastery
from ..ratelimit import ip_rate_limit, read_rate_limit

router = APIRouter(prefix="/api/v1", tags=["share"])

# #832 — /share/{token} is auth-free, so rate-limit by client IP only (there is
# no account to key on). 30 req/min is far more than a shared link gets opened
# while still blunting token-guessing hammering.
# #3117 — the budget is deployment-configurable (`settings.share_snapshot_ip_per_minute`)
# because share cards open on classroom/school Wi-Fi: many distinct families
# share one public IP (CGNAT), so a hard 30/min would false-positive 429 a whole
# classroom. The token itself carries 192 bits of entropy (token_urlsafe(24)),
# which is the real unguessability barrier, not the IP rate cap.
SHARE_SNAPSHOT_RATE_LIMIT = ip_rate_limit(limit=settings.share_snapshot_ip_per_minute, tag="share")

# #1764 — the authenticated share-token GET joins the read tier: minting/reading
# the opaque token is a read (no DB write), so it shares the higher read budget
# rather than the 120/min write budget.
SHARE_READ_RATE_LIMIT = read_rate_limit()

# #832 — a constant-cost delay so a guessed link isn't distinguishable from a
# valid-but-paused link (or a valid live link) by response time alone. Applied
# to BOTH the failure path (404) and the success path (200) — the aggregate
# queries on a live link are cheap, so a valid token would otherwise return
# measurably faster than the uniformly-delayed 404 and leak the liveness of a
# candidate token (the opposite of the stated goal).
_SHARE_TIMING_DELAY_SECONDS = 0.02


async def _share_timing_delay() -> None:
    """#3065 — the constant small delay applied to every public-share-path
    response (404 and 200 alike) so timing side channels don't classify tokens.

    Kept tiny (20 ms) so a real share-card open is not noticeably slowed while
    still washing out the query-cost gap between a dead and a live link."""
    await asyncio.sleep(_SHARE_TIMING_DELAY_SECONDS)

# #1800 — the mint/rotate audit timestamps live in migrations-owned columns
# (`share_token_created_at` / `share_token_revoked_at`) that are deliberately
# kept OFF the ORM model (models.py owns that addition), so the three write
# paths share ONE named SQL constant instead of three hand-written UPDATE
# strings that could silently drift from the column's migration.
_SHARE_TOKEN_MINT_SQL = text(
    "UPDATE kids SET share_token_created_at = now(), "
    "share_token_revoked_at = NULL WHERE id = CAST(:kid_id AS uuid)"
)


def _share_token_expired(created_at: datetime | None) -> bool:
    """#3057 — a minted token expires `settings.share_token_ttl_days` after it
    was created. A missing `created_at` is treated as expired (fail closed): an
    unknown-age link can't be trusted to stay open forever."""
    if created_at is None:
        return True
    if created_at.tzinfo is None:
        # #906 — legacy naive stamps are treated as UTC; anything naive is
        # necessarily older than a full TTL, so this is only a safety net.
        created_at = created_at.replace(tzinfo=timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.share_token_ttl_days)
    return created_at < cutoff


async def _share_not_found() -> None:
    await _share_timing_delay()
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")


def _share_token_hash(token: str) -> str:
    """#1777 — one-way fingerprint of a share token. The DB stores only this;
    the url-safe token lives solely in the minting response."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _is_legacy_raw(v: str | None) -> bool:
    """#1777 — legacy-plaintext detection. Before the hash migration, rows
    stored `secrets.token_urlsafe(24)` VERBATIM: exactly 32 url-safe chars. The
    new form is a 64-char lowercase sha256 hex digest, so any 32-char value is
    a legacy raw token; None/short/64-hex values are not."""
    return bool(v) and len(v) == 32


def resolve_share_token(stored: str | None, inbound: str) -> tuple[str | None, bool]:
    """#1777 — pure matcher for the public share-link lookup.

    Given what the DB stores (`stored` — either the new sha256 fingerprint or a
    legacy plaintext url-safe token) and the inbound link token, return
    `(matching_stored_value, needs_migration)`: the stored value that matches
    the inbound token, or `(None, False)` when nothing does. `needs_migration`
    is True only for a legacy plaintext row that the caller should lazily
    rewrite to its sha256 fingerprint (Done-when #2: old links keep resolving).
    """
    if not stored:
        return None, False
    if stored == _share_token_hash(inbound):
        return stored, False
    if _is_legacy_raw(stored) and stored == inbound:
        return stored, True
    return None, False


# #1552 — ProgressEvent has no session/duration column; `response_ms` is
# per-answer latency (models.py:265), NOT play time. The best available timing
# data is the round's own time, so cluster event stamps into play sessions (a
# gap over 5 minutes starts a new session) and sum each session's elapsed span.
# This is still an estimate, so the public payload sets `minutes_approx: true`.
_SESSION_GAP_SECONDS = 5 * 60


def _occurred_at(e: ProgressEvent) -> datetime:
    """#3029/#3060 — the effective occurred-at instant of a progress event.

    Session-span clustering and day-bucketing use the client-observed
    ``client_ts`` when present, else the integer epoch-ms ``timestamp`` (#1024),
    else the server-stamped ``created_at``. Without this, a whole offline
    drain batch carries one ``func.now()`` stamp (constant per statement) so
    every round collapses to one timestamp → minutes ≈ 0 and active_days = 1,
    exactly the audience an offline-first kid is. Mirrors ``_occurred_at`` in
    kids.py; kept local to avoid a kids↔shares import cycle.
    """
    if e.client_ts is not None:
        return e.client_ts
    ts = getattr(e, "timestamp", None)
    if ts is not None:
        try:
            return datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc)
        except (ValueError, OverflowError, OSError):
            pass
    return e.created_at


def _minutes_are_approximate(events: list[ProgressEvent]) -> bool:
    """#3070 — the `minutes_approx` flag, computed HONESTLY instead of hardcoded.

    `_occurred_at` prefers the client-observed instant (`client_ts`, then the
    integer epoch-ms `timestamp`) and only falls back to the server-stamped
    `created_at` when neither is present. When ANY event in the window had to
    rely on that `created_at` collapse — the classic offline-drain case where a
    whole batch carries one `func.now()` stamp — the session-span minutes are a
    genuine estimate and the flag is True. When every event carried a reliable
    client timestamp, the span is measured, not estimated, so the flag is False."""
    if not events:
        return True  # empty window: there is no timing data at all, so "0" is a guess
    return any(_occurred_at(e) is e.created_at for e in events)


def _session_span_minutes(events: list[ProgressEvent]) -> float:
    """Best-available play-time estimate for a set of progress events."""
    stamps = sorted({_occurred_at(e) for e in events if e.created_at is not None})
    if not stamps:
        return 0.0
    total = 0.0
    session_start = stamps[0]
    prev = stamps[0]
    for stamp in stamps[1:]:
        if (stamp - prev).total_seconds() > _SESSION_GAP_SECONDS:
            total += (prev - session_start).total_seconds() / 60.0
            session_start = stamp
        prev = stamp
    total += (prev - session_start).total_seconds() / 60.0
    return round(total, 1)


def _humanize_game_id(game_id: str) -> str:
    """Fallback display label: strip the internal 'game-' prefix and title-case
    the hyphen-separated slug (e.g. 'game-fruit-tree' → 'Fruit Tree')."""
    cleaned = game_id[5:] if game_id.startswith("game-") else game_id
    return cleaned.replace("-", " ").title() or game_id


# #1846 — SCENE-LEVEL key for a game id. CountPop/FruitAdd-style TIERS share one
# Phaser scene (game-countpop20, game-countpop50 → 'CountPop'), so "top game"
# must aggregate by the scene, not the raw tier game_id — otherwise a kid who
# split their week across three CountPop tiers reads as three tiny games instead
# of one clear favorite. Mirrors the kid app's GAME_SCENES (packages/core/src/
# skills.ts). Unknown/legacy ids fall back to the id itself (a single-scene game
# IS its own scene).
_GAME_SCENE_KEYS: dict[str, str] = {
    "game-cvcbuild": "CvcBuild",
    "game-plurals": "Plurals",
    "game-pasted": "PastEd",
    "game-casematch": "CaseMatch",
    "game-trace": "Trace",
    "game-bndaysmonths": "BanglaDays",
    "game-bnspelling": "BanglaSpell",
    "game-banglaspell": "BanglaSpell",
    "game-bnpronouns": "Pronoun",
    "game-countback": "CountBack",
    "game-countpop": "CountPop",
    "game-countpop20": "CountPop",
    "game-countpop50": "CountPop",
    "game-count100": "Count100",
    "game-build999": "Build999",
    "game-growcount": "GrowCount",
    "game-fruitadd-10": "FruitAdd",
    "game-fruitsub-10": "FruitAdd",
    "game-fruitadd-20": "FruitAdd",
    "game-fruitsub-20": "FruitAdd",
    "game-fruittree": "FruitTree",
    "game-shapecatcher": "ShapeCatcher",
    "game-shapenames": "ShapeCatcher",
    "game-tapdrag": "CatchBug",
    "game-villagecity": "VillageCity",
    "game-patience": "Patience",
    "game-froghop": "FrogHop",
    "game-memorypairs": "MemoryPairs",
    "game-memory": "Memory",
    "game-countsong": "CountingSong",
    "game-bnletters": "BnLetters",
    "game-bnconsonants": "BnLetters",
    "game-bnnumbers": "BnNumbers",
    "game-enletters": "EnLetters",
    "game-bnbonds": "NumberBonds",
    "game-bnbonds20": "NumberBonds",
    "game-oddeven": "OddEven",
    "game-shapeparts": "ShapeParts",
    "game-bncolors": "BnColors",
    "game-bdtaka": "BdMoney",
    "game-addfacts": "FactsAdd",
    "game-subfacts": "SubFacts",
    "game-doubles": "Doubles",
    "game-maketen": "MakeTen",
    "game-addregroup": "AddRegroup",
    "game-subborrow": "SubBorrow",
    "game-array-mult": "ArrayMult",
    "game-skipcount": "SkipCount",
    "game-shares2": "ShareRem",
    "game-fracset": "FracSet",
    "game-mixedfrac": "MixedFrac",
    "game-dectenths": "DecTenths",
    "game-makechange": "MakeChange",
    "game-elapsed": "ElapsedTime",
    "game-measure": "Measurement",
    "game-perim": "PerimFence",
    "game-solidmatch": "SolidMatch",
    "game-symmetry": "SymmetryMirror",
    "game-animalsmove": "AnimalsMove",
    "game-plantlife": "PlantLife",
    "game-plants": "PlantParts",
    "game-seasons": "WeatherSeasons",
    "game-living": "LivingSort",
    "game-senses": "FiveSenses",
    "game-shadows": "ShadowGuess",
    "game-magnets": "MagnetPoles",
    "game-watercycle": "WaterCycle",
    "game-keyboard": "KeyboardExplorer",
    "game-device": "DeviceManners",
    "game-computer": "ComputerSafety",
    "game-habits": "HabitSort",
    "game-professions": "ProfessionsMatch",
    "game-festivals": "FestivalSort",
    "game-kindness": "Kindness",
    "game-honesty": "Truth",
    "game-ordinals": "Ordinals",
    "game-idioms": "Idioms",
    "game-verbgender": "VerbGender",
    "game-classifiers": "Classifiers",
    "game-digraphs": "Digraphs",
    "game-longvowels": "LongVowel",
    "game-coinvalues": "CoinValue",
    "game-timewords": "TimeWords",
    "game-directionwords": "DirectionWords",
    "game-polite": "Polite",
    "game-enphonics": "EnPhonics",
    "game-rcontrolled": "RControlled",
    "game-magice": "MagicE",
    "game-prepositions": "Prepositions",
    "game-qwords": "QuestionWords",
    "game-story": "Story",
    "game-compounds-en": "CompoundEn",
    "game-readaloud": "ReadAloud",
    "game-alphabet": "AlphaOrder",
    "game-wordfam": "WordFamily",
    "game-yesno": "YesNo",
    "game-balloonpop": "BalloonPop",
    "game-balance": "Balance",
    "game-sinkfloat": "SinkFloat",
    "game-foodchain": "FoodChain",
    "game-foodsource": "FoodSource",
    "game-material": "MaterialSort",
    "game-oddevensort": "OddEvenSort",
    "game-vowelconsonant": "VowelConsonantSort",
    "game-shapecorner": "ShapeCornerSort",
    "game-plantanimal": "PlantAnimalSort",
    "game-daynight": "DayNight",
    "game-addsub100": "AddSub100",
    "game-clock": "ClockTime",
    "game-rocketmult": "RocketMult",
    "game-multable": "TimesTable",
    "game-share": "FairShare",
    "game-div-23": "DivisionFacts",
    "game-regroup": "Regroup",
    "game-pizzafrac": "PizzaFrac",
    "game-comparefrac": "CompareFrac",
    "game-bnwords": "BnWords",
    "game-conjunctfind": "ConjunctFind",
    "game-bnsightwords": "BnSightWords",
    "game-sentencebuilder": "SentenceBuilder",
    "game-storyread": "StoryRead",
    "game-rhymes": "RhymeTime",
    "game-wordpairs": "WordPairs",
    "game-punct": "Punct",
    "game-compounds": "Compound",
    "game-lettersound": "LetterSound",
    "game-matramatrix": "MatraMatrix",
    "game-readstory": "ReadStory",
    "game-numberwords": "NumberWords",
    "game-riddle": "Riddle",
    "game-cvc": "Cvc",
    "game-contracts": "Contracts",
    "game-compare": "Compare",
    "game-synant": "SynAnt",
    "game-irregulars": "IrregularPlurals",
    "game-past": "PastTense",
    "game-division": "DivisionFacts",
    "game-fracmatch": "FractionMatch",
    "game-placevalue": "PlaceValue",
    "game-round": "Rounding",
    "game-barchart": "BarChart",
    "game-picto": "PictoGraph",
    "game-bnmatras": "BnMatras",
    "game-sightwords": "SightWords",
    "game-animalhome": "AnimalHome",
    "game-decimals": "Decimals",
    "game-percent": "Percent",
    "game-area": "AreaPerim",
    "game-bnsentence": "BnSentence",
    "game-grammar": "Grammar",
    "game-bgs": "BgsFacts",
    "game-bnmatra-words": "BnMatras",
    "game-bgs-country": "BgsFacts",
    "game-bgs-civics": "BgsFacts",
    "game-onlinesafety": "OnlineSafety",
    "game-statematter": "StatesMatter",
    "game-encomprehension": "ReadAloud",
    "game-enparagraph": "ReadAloud",
    "game-humanbody": "HumanBody",
    "game-body-systems": "HumanBody",
    "game-sentenceorder": "Story",
    "game-mathsolve": "MathSolve",
    "game-negatives": "NegativeNumber",
    "game-sciencefacts": "ScienceFacts",
    "game-codelogic": "CodeLogic",
    "game-arcadecatch": "ArcadeCatch",
    "game-exploregarden": "ExploreGarden",
}


def _scene_key(game_id: str) -> str:
    """#1846 — the scene-level key a game id aggregates under. Shared-scene tiers
    (CountPop/FruitAdd) collapse to one scene; single-scene ids are their own key."""
    return _GAME_SCENE_KEYS.get(game_id, game_id)


def _top_game_scene(events: list[ProgressEvent]) -> tuple[str, str] | None:
    """#1846 — the most-played SCENE for an event list, plus a representative raw
    game id INSIDE that scene (so a caller can still resolve a catalog title).

    Counts by scene key instead of the raw tier game_id: a week split across
    CountPop's three tiers reads as ONE favorite, not three tiny per-tier counts.
    Returns `(scene_key, representative_game_id)` or None when empty, so callers
    can reuse it across the weekly card and the public share snapshot."""
    if not events:
        return None
    scene_counts: Counter[str] = Counter()
    scene_raw: dict[str, Counter[str]] = {}
    for e in events:
        sk = _scene_key(e.game_id)
        scene_counts[sk] += 1
        scene_raw.setdefault(sk, Counter())[e.game_id] += 1
    top_scene = scene_counts.most_common(1)[0][0]
    rep_id = scene_raw[top_scene].most_common(1)[0][0]
    return top_scene, rep_id


class ShareTokenOut(BaseModel):
    token: str
    # #3057 — the moment this link stops resolving, so the parent card can show
    # "expires in N days" (or omit nothing — the field is informational only).
    expires_at: str | None = None


class ShareSnapshotOut(BaseModel):
    """Aggregates only — deliberately carries ZERO identity. `week_of` is the
    calendar day the window ends on; top_game is a display label (never the raw
    internal game id); minutes_by_day is the 7-day minute curve (just floats —
    no dates). #867 — the live wallet balance is intentionally NOT included on
    the public card."""
    rounds: int
    # #1552 — `minutes` is a timestamp-derived session-span ESTIMATE, not a
    # measured session duration. #3070 — `minutes_approx` is now computed
    # HONESTLY on each snapshot: True only when the estimate relied on the
    # server-stamped `created_at` collapse (an offline drain batch with no
    # client timestamps); False when every event carried a client-observed
    # instant, so the span is measured rather than guessed.
    minutes: float
    minutes_approx: bool = True
    correct_pct: int  # intentional rounded int: round(100 * correct / rounds)
    active_days: int
    mastered_count: int
    top_game: str | None
    week_of: str
    minutes_by_day: list[float] = []


# #852 — `kid_id` is typed as a UUID so malformed path params 422 before the
# ownership query, matching the other kid routes (kids.py pattern).
@router.get("/kids/{kid_id}/share-token", response_model=ShareTokenOut)
async def get_share_token(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
    _rl: Profile = Depends(SHARE_READ_RATE_LIMIT),
):
    """MINT a fresh per-recipient token (#3061). Auth-protected + ownership-checked:
    only the parent can mint a token for their own kid, so the unguessable string
    never leaks through a guessed URL.

    Every call INSERTs a NEW `share_tokens` row (never reuses the previous
    token), so a parent sharing the week to a school group gets a link distinct
    from the one they already sent grandma — and can later revoke one audience
    without killing the other.

    #1777 — the DB stores ONLY the sha256 fingerprint of the url-safe token; the
    raw token lives solely in this response. #3062 — the mint is an atomic
    INSERT of a unique random fingerprint, so two concurrent first-share taps
    each produce their own valid token with no SELECT-then-UPDATE race and no
    last-writer-wins dead link."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    raw = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.share_token_ttl_days)
    # #3062 — atomic mint: INSERT (not SELECT-then-UPDATE). A random 24-byte
    # url-safe token can't collide in practice, and even if it somehow did the
    # unique constraint on token_hash would raise rather than hand out a dead link.
    await db.execute(
        insert(ShareToken).values(
            id=uuid.uuid4(), kid_id=kid_id, token_hash=_share_token_hash(raw)
        )
    )
    # #1550 — audit when this token was minted (stored via migrations.py; the
    # legacy kids.share_token_created_at stays for the pre-#3057 column backfill).
    await db.execute(_SHARE_TOKEN_MINT_SQL, {"kid_id": str(kid_id)})
    # #3062 — commit the mint before the audit row so a concurrent share-token
    # GET can't observe a half-minted state on a real session.
    await db.commit()
    # #1843 — audit the share-link mint on the parent's account.
    db.add(ParentEvent(profile_id=profile.id, action="share_mint", event_type="share", target=str(kid_id)))
    await db.commit()
    return ShareTokenOut(token=raw, expires_at=expires_at.isoformat())


# #1550 — rotate a leaked/outdated share-link set: revoke EVERY active token for
# the kid (so all previously-shared URLs stop resolving immediately) and mint ONE
# fresh replacement. Auth + ownership-checked exactly like GET /share-token.
@router.post("/kids/{kid_id}/share-token/rotate", response_model=ShareTokenOut)
async def rotate_share_token(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    # #3061 — revoke every active row at once (the "kill all prior links" flip
    # side of per-recipient minting).
    await db.execute(
        update(ShareToken)
        .where(ShareToken.kid_id == kid_id, ShareToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )
    raw = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.share_token_ttl_days)
    # #1777/#3062 — the DB stores only the sha256 fingerprint; the raw token is
    # returned exactly once, in this response. INSERT is atomic.
    await db.execute(
        insert(ShareToken).values(
            id=uuid.uuid4(), kid_id=kid_id, token_hash=_share_token_hash(raw)
        )
    )
    await db.execute(_SHARE_TOKEN_MINT_SQL, {"kid_id": str(kid_id)})
    # #1843 — audit the rotation on the parent's account.
    db.add(ParentEvent(profile_id=profile.id, action="share_rotate", event_type="share", target=str(kid_id)))
    await db.commit()
    return ShareTokenOut(token=raw, expires_at=expires_at.isoformat())


# #852 — same UUID path-param typing as GET above: malformed ids 422 before the
# ownership query, never a DB-level UUID error.
@router.delete("/kids/{kid_id}/share-token", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_token(
    kid_id: uuid.UUID,
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    """#866 — revoke EVERY active share link for a kid. Stamps `revoked_at` on
    every live `share_tokens` row so the public snapshot stops resolving
    immediately. The next share mints a fresh token, so the parent can share
    again without ever reusing a dead link."""
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    # #3061 — revoke all active rows (the parent's "stop sharing" kills every
    # audience at once).
    await db.execute(
        update(ShareToken)
        .where(ShareToken.kid_id == kid_id, ShareToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )
    # #1550 — audit when this token was revoked (migrations.py column).
    await db.execute(
        text("UPDATE kids SET share_token_revoked_at = now() WHERE id = CAST(:kid_id AS uuid)"),
        {"kid_id": str(kid_id)},
    )
    # #1843 — audit the revocation on the parent's account.
    db.add(ParentEvent(profile_id=profile.id, action="share_revoke", event_type="share", target=str(kid_id)))
    await db.commit()


# #3061 — revoke ONE token without killing the others. The `token` path param is
# the raw url-safe token (hashed before lookup, same #1777 scheme); the parent
# can drop a single leaked/outdated link while every other audience keeps theirs.
@router.delete("/kids/{kid_id}/share-token/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_one_share_token(
    kid_id: uuid.UUID,
    token: str = Path(max_length=64),
    profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
):
    owned = await db.scalar(select(Kid).where(Kid.id == kid_id, Kid.profile_id == profile.id))
    if not owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kid not found")
    await db.execute(
        update(ShareToken)
        .where(
            ShareToken.kid_id == kid_id,
            ShareToken.token_hash == _share_token_hash(token),
            ShareToken.revoked_at.is_(None),
        )
        .values(revoked_at=func.now())
    )
    db.add(ParentEvent(profile_id=profile.id, action="share_revoke", event_type="share", target=str(kid_id)))
    await db.commit()


@router.get(
    "/share/{token}",
    response_model=ShareSnapshotOut,
    dependencies=[Depends(SHARE_SNAPSHOT_RATE_LIMIT)],
)
async def get_share_snapshot(
    # #1645 — tokens are `token_urlsafe(24)` (~32 chars); a 64-char cap rejects
    # oversized/megabyte tokens at the framework boundary (422) before they ever
    # reach the DB equality lookup. The route is IP-rate-limited, but a single
    # request should still not be able to push a huge string into the query.
    token: str = Path(max_length=64),
    db: AsyncSession = Depends(get_db),
):
    """Public weekly snapshot for a share card. NO auth: the token IS the key.
    Unknown/revoked/paused tokens → 404 (a guessed link finds nothing)."""
    if not token:
        await _share_not_found()
    # #1777 — new-form lookup: the DB stores only the sha256 fingerprint, so
    # hash the inbound token before comparing.
    token_hash = _share_token_hash(token)
    # #3057/#3061 — resolve against the per-recipient `share_tokens` table first.
    # A revoked_or_expired row is a miss (404); `created_at` past the TTL is
    # rejected below.
    token_row = await db.scalar(
        select(ShareToken).where(
            ShareToken.token_hash == token_hash,
            ShareToken.revoked_at.is_(None),
        )
    )
    # #3057 — expire: a minted token older than the TTL stops resolving.
    if token_row is not None and _share_token_expired(token_row.created_at):
        await _share_not_found()

    kid: Kid | None = None
    if token_row is not None:
        kid = await db.get(Kid, token_row.kid_id)
    else:
        # #1777 — legacy fallback: a pre-#3057 row stores its single token on
        # `kids.share_token` (verbatim or hashed). Match it directly and lazily
        # migrate it into `share_tokens` (fresh created_at → full TTL) so
        # previously-minted links keep resolving AND now expire like new ones.
        legacy = await db.scalar(select(Kid).where(Kid.share_token == token_hash))
        if not legacy:
            legacy = await db.scalar(select(Kid).where(Kid.share_token == token))
        if legacy:
            kid = legacy
            await db.execute(
                pg_insert(ShareToken)
                .values(id=uuid.uuid4(), kid_id=legacy.id, token_hash=token_hash)
                .on_conflict_do_nothing(index_elements=["token_hash"])
            )
            await db.commit()
    if not kid:
        await _share_not_found()

    # #867 — the parent's pause kill-switch also gates the public card: while a
    # kid is paused, their share link stops resolving. A missing settings row
    # means defaults (not paused), so legacy kids keep sharing.
    settings = await db.get(KidSettings, kid.id)
    if settings is not None and settings.paused:
        await _share_not_found()

    # #1646 — events are stamped `datetime.now(timezone.utc)` server-side, so the
    # week window and `week_of` must derive from UTC too (mirrors kids.py weekly,
    # #857). A naive `date.today()` on a non-UTC host would shift the card's
    # 7-day window / active_days / minutes_by_day a day off from the in-app view.
    now = datetime.now(timezone.utc).date()
    start = now - timedelta(days=6)
    # Bind the window as an aware UTC midnight (same pattern as kids.py weekly) so
    # the timestamptz comparison doesn't depend on the Postgres session TimeZone.
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    events = (
        await db.scalars(
            select(ProgressEvent).where(
                ProgressEvent.kid_id == kid.id,
                ProgressEvent.created_at >= start_dt,
            )
        )
    ).all()
    rounds = len(events)
    correct = sum(1 for e in events if e.correct)
    # #1552 — minutes is a timestamp-derived session-span estimate, NOT Σ
    # response_ms (which is per-answer latency, not play time). #3060 — the
    # session-span clusters on the round's client-observed instant so a batch
    # of distinct rounds doesn't collapse to one `func.now()` stamp.
    minutes = _session_span_minutes(events)
    # #3060 — day-bucket by the round's real play time (client_ts → epoch-ms
    # timestamp → created_at), not the shared server sync stamp, so an offline
    # drain batch spreads across its true UTC days instead of one sync day.
    active_days = len({_occurred_at(e).date() for e in events})
    # #1846 — aggregate by SCENE key so CountPop/FruitAdd tiers collapse into one
    # favorite instead of fragmenting the week into several tiny per-tier counts.
    hit = _top_game_scene(events)
    top_game = None
    if hit:
        # Representative raw id within the winning scene — the catalog lookup
        # resolves a real game title (the scene key itself isn't a catalog id).
        # #1551 — resolve the raw game id to its catalog title so the public
        # snapshot never leaks an internal machine id. Unknown/legacy ids fall
        # back to a humanized slug.
        _scene, rep_id = hit
        title = await db.scalar(
            select(ContentItem.title).where(
                ContentItem.id == rep_id,
                ContentItem.kind == "game",
            )
        )
        top_game = title or _humanize_game_id(rep_id)

    mastered_rows = (
        await db.scalars(
            select(SkillMastery.skill_id).where(
                SkillMastery.kid_id == kid.id,
                SkillMastery.mastery >= 0.8,
            )
        )
    ).all()
    mastered_count = len(mastered_rows)

    # #8 — per-day minute curve (oldest → newest, zero-filled) so the share
    # card can draw 7-day bars. No dates, just floats — stays zero-identity.
    # #1552 — same session-span estimate as the total (never response_ms).
    min_by_day: list[float] = []
    for i in range(7):
        d = start + timedelta(days=i)
        min_by_day.append(_session_span_minutes([x for x in events if _occurred_at(x).date() == d]))

    # #3065 — the SAME constant timing delay as the 404 path, applied to the
    # success return so a valid live link and a dead/guessed link are
    # indistinguishable by response time (the aggregate queries on a live link
    # are cheap, so an un-delayed success would stand out).
    await _share_timing_delay()

    return ShareSnapshotOut(
        rounds=rounds,
        minutes=minutes,
        minutes_approx=_minutes_are_approximate(events),
        correct_pct=round(100 * correct / rounds) if rounds else 0,
        active_days=active_days,
        mastered_count=mastered_count,
        top_game=top_game,
        week_of=now.isoformat(),
        minutes_by_day=min_by_day,
    )
