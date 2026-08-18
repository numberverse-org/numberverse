#!/usr/bin/env python3
"""#1689 — right-to-erasure completeness: DELETE /auth/me removes EVERY table
that can reference a deleted profile/kid, while leaving the org curriculum and
the AdminAudit compliance trail intact.

Drives the REAL `auth.delete_account` handler with a fake in-memory
AsyncSession (same call-the-handler-directly technique as test_auth.py) against
a profile holding:
  kids + per-kid settings + sessions + skill mastery + progress events +
  learning stories + acceleration log + subscriptions + web-push subs +
  org membership + rate-limit buckets + an AdminAudit row + tenant-scoped org
  curriculum (subjects/skills/content/config) + a story embedding.

After the delete it asserts:
  ① every profile/kid-linked table is empty for that id set;
  ② rate-limit buckets keyed to the account are gone — but a DIFFERENT
     account's bucket survives;
  ③ the Organization + its tenant-scoped curriculum SURVIVE (never cascaded
     away — #1686); the tenant rows are disowned (SET NULL), not deleted;
  ④ the AdminAudit row survives with a ROTATED admin_id (#1688);
  ⑤ story_embeddings orphans are swept where the FK cascade is absent (#1682).

Run:  cd apps/api && python3 tests/test_deletion_cascade.py
"""

import sys
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select, text  # noqa: E402
from sqlalchemy.sql.dml import Delete  # noqa: E402
from sqlalchemy.sql.elements import (  # noqa: E402
    BinaryExpression,
    BindParameter,
    BooleanClauseList,
    Null,
    TextClause,
)
from sqlalchemy.sql.functions import count as count_fn  # noqa: E402

from app.models import (  # noqa: E402
    AccelerationLog,
    AdminAudit,
    ConfigEntry,
    ContentItem,
    Kid,
    KidSettings,
    LearningStory,
    Organization,
    OrgMember,
    Profile,
    ProgressEvent,
    PushSubscription,
    RateLimitBucket,
    Session,
    Skill,
    SkillMastery,
    Subject,
    Subscription,
)
from app.routers import auth  # noqa: E402
from app.schemas import DeleteAccountIn  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.story_embedding_model import HAVE_VECTOR, StoryEmbedding  # noqa: E402
from app.scrub import redact_text  # noqa: E402

passes = 0
fails = 0


def check(name, got, want):
    global passes, fails
    if got == want:
        passes += 1
    else:
        fails += 1
        print(f"  ✖ {name}: got {got!r}, want {want!r}")


# Tables whose FK chains the profile delete must empty for this id set.
_PROFILE_LINKED = (Session, Subscription, PushSubscription, OrgMember)
_KID_LINKED = (KidSettings, SkillMastery, ProgressEvent, LearningStory, AccelerationLog)
# Tenant-owned curriculum that must SURVIVE (disowned, never cascaded).
_TENANT_MODELS = (Subject, Skill, ContentItem, ConfigEntry)

_TABLES = {
    "profiles": Profile,
    "kids": Kid,
    "sessions": Session,
    "kid_settings": KidSettings,
    "skill_mastery": SkillMastery,
    "progress_events": ProgressEvent,
    "learning_stories": LearningStory,
    "acceleration_log": AccelerationLog,
    "subscriptions": Subscription,
    "push_subscriptions": PushSubscription,
    "rate_limit_buckets": RateLimitBucket,
    "org_members": OrgMember,
    "organizations": Organization,
    "subjects": Subject,
    "skills": Skill,
    "content_items": ContentItem,
    "config": ConfigEntry,
    "admin_audit": AdminAudit,
}


class _Rows:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)

    def __iter__(self):
        return iter(self._rows)


class _Single:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _Count:
    """Result shape for DELETE/`text()` executions — exposes `.rowcount`."""

    def __init__(self, rowcount):
        self.rowcount = rowcount


class FakeDB:
    """List-backed fake AsyncSession covering the query shapes delete_account
    issues: scalar/scalars selects (eq/is_/in_/like), ORM cascade delete, and
    the rate-limit / story-embedding deletes via delete()/text()."""

    def __init__(self):
        self._stores = {m: [] for m in _TABLES.values()}
        if HAVE_VECTOR and StoryEmbedding is not None:
            self._stores.setdefault(StoryEmbedding, [])
        self.deleted = []
        self.commits = 0

    # -- select introspection -------------------------------------------------

    def _model_of(self, stmt):
        cols = list(stmt.selected_columns)
        if not cols:
            return None
        if isinstance(cols[0], count_fn):
            for f in stmt.get_final_froms():
                name = getattr(f, "name", None)
                if name and name in _TABLES:
                    return _TABLES[name]
            return None
        tbl = getattr(cols[0], "table", None)
        if tbl is None:
            return None
        return _TABLES.get(tbl.name)

    def _conds(self, stmt):
        wc = stmt.whereclause
        if wc is None:
            return []
        clauses = list(wc.clauses) if isinstance(wc, BooleanClauseList) else [wc]
        out = []
        for c in clauses:
            if not isinstance(c, BinaryExpression):
                continue
            col = c.left.key if hasattr(c.left, "key") else None
            right = c.right
            if isinstance(right, BindParameter):
                val = right.value
            elif isinstance(right, Null):
                val = None
            elif isinstance(right, (tuple, list)):
                val = right
            else:
                val = right
            # SQLAlchemy names the operator `in_op`/`like_op`; normalize to the
            # plain comparison names the matcher switches on.
            out.append((col, c.operator.__name__.removesuffix("_op"), val))
        return out

    def _matches(self, obj, conds):
        for col, op, val in conds:
            actual = getattr(obj, col, None)
            if op == "is_":
                if actual is not None:
                    return False
            elif op == "is_not":
                if actual is None:
                    return False
            elif op == "eq":
                if actual != val:
                    return False
            elif op == "in":
                if actual not in val:
                    return False
            elif op == "like":
                prefix = val[:-1] if isinstance(val, str) and val.endswith("%") else val
                if not str(actual).startswith(prefix):
                    return False
            else:
                raise NotImplementedError(f"FakeDB op {op!r}")
        return True

    # -- AsyncSession surface used by the handler ----------------------------

    def _apply_defaults(self, obj):
        """Fill Python-side column defaults (uuid4 PKs, datetimes) so the
        handler can read `.id` etc. without a real flush."""
        from sqlalchemy import DateTime as _DT

        for col in obj.__table__.columns:
            name = col.name
            if getattr(obj, name, None) is not None:
                continue
            d = col.default
            if d is not None:
                if d.is_callable:
                    try:
                        val = d.arg(None)
                    except TypeError:
                        val = d.arg()
                elif d.is_scalar:
                    val = d.arg
                else:
                    val = None
                if val is not None:
                    setattr(obj, name, val)
                    continue
            if col.server_default is not None and isinstance(col.type, _DT):
                setattr(obj, name, datetime.now())

    def add(self, obj):
        self._apply_defaults(obj)
        self._stores[type(obj)].append(obj)

    async def flush(self):
        return None

    async def commit(self):
        self.commits += 1

    async def get(self, model, pk):
        return next((o for o in self._stores.get(model, []) if getattr(o, "id", None) == pk), None)

    async def refresh(self, obj):
        return None

    async def scalar(self, stmt):
        model = self._model_of(stmt)
        if model is None:
            return None
        conds = self._conds(stmt)
        if isinstance(stmt.selected_columns[0], count_fn):
            return sum(1 for o in self._stores[model] if self._matches(o, conds))
        for o in self._stores[model]:
            if self._matches(o, conds):
                return o
        return None

    async def scalars(self, stmt):
        model = self._model_of(stmt)
        if model is None:
            return _Rows([])
        conds = self._conds(stmt)
        return _Rows(o for o in self._stores[model] if self._matches(o, conds))

    async def delete(self, obj):
        self.deleted.append(obj)
        if isinstance(obj, Profile):
            self._cascade_profile(obj.id)
        else:
            self._stores[type(obj)] = [o for o in self._stores[type(obj)] if o is not obj]

    async def execute(self, stmt):
        if isinstance(stmt, Delete):
            table = getattr(stmt, "table", None)
            model = _TABLES.get(getattr(table, "name", None)) if table is not None else None
            if model is None:
                return _Count(0)
            conds = self._conds(stmt)
            kept = [o for o in self._stores[model] if not self._matches(o, conds)]
            removed = len(self._stores[model]) - len(kept)
            self._stores[model] = kept
            return _Count(removed)
        if isinstance(stmt, TextClause):
            # #1682 — the story_embeddings orphan sweep the handler runs.
            return _Count(self._sweep_story_embeddings())
        return _Single(await self.scalar(stmt))

    # -- cascade / orphan helpers -------------------------------------------

    def _cascade_profile(self, profile_id):
        kid_ids = [k.id for k in self._stores[Kid] if k.profile_id == profile_id]
        self._stores[Profile] = [o for o in self._stores[Profile] if o.id != profile_id]
        self._stores[Kid] = [o for o in self._stores[Kid] if o.profile_id != profile_id]
        for m in _PROFILE_LINKED:
            self._stores[m] = [o for o in self._stores[m] if getattr(o, "profile_id", None) != profile_id]
        for m in _KID_LINKED:
            self._stores[m] = [o for o in self._stores[m] if getattr(o, "kid_id", None) not in kid_ids]

    def _sweep_story_embeddings(self):
        if not (HAVE_VECTOR and StoryEmbedding is not None):
            return 0
        story_ids = {s.id for s in self._stores[LearningStory]}
        kept = [e for e in self._stores[StoryEmbedding] if e.story_id in story_ids]
        removed = len(self._stores[StoryEmbedding]) - len(kept)
        self._stores[StoryEmbedding] = kept
        return removed


def make_request(ip="1.2.3.4"):
    return SimpleNamespace(
        client=SimpleNamespace(host=ip),
        headers={},
        state=SimpleNamespace(session=None),
    )


def add_profile(db, email="del-cascade@test.com", password="password123"):
    p = Profile(
        email=email,
        password_hash=hash_password(password),
        display_name="Cascade Parent",
    )
    db.add(p)
    return p


def _seed(db):
    """Build the full cascade fixture. Also returns the objects the assertions
    need (profile, org, kid id, story id)."""
    profile = add_profile(db)
    org = Organization(name="Test Org")
    db.add(org)

    kid = Kid(profile_id=profile.id, name="Ari", birth_year=2021)
    db.add(kid)

    db.add(KidSettings(kid_id=kid.id, max_band=3, daily_limit_min=45))
    db.add(Session(profile_id=profile.id, token_hash=f"hash-{uuid.uuid4().hex}"))
    db.add(Session(profile_id=profile.id, token_hash=f"hash-{uuid.uuid4().hex}"))
    db.add(Subscription(profile_id=profile.id, plan="plus", store="web", status="active"))
    db.add(PushSubscription(profile_id=profile.id, endpoint=f"https://push/{uuid.uuid4()}", p256dh="k", auth="a"))
    db.add(OrgMember(org_id=org.id, profile_id=profile.id, role="owner"))

    skill_id = "b1.count.0"
    db.add(SkillMastery(kid_id=kid.id, skill_id=skill_id, mastery=0.9, attempts=10, correct=8))
    db.add(ProgressEvent(kid_id=kid.id, skill_id=skill_id, game_id="counting", correct=True))
    story = LearningStory(
        kid_id=kid.id, skill_id=skill_id, game_id="counting", outcome=True,
        uid=f"story-{uuid.uuid4()}",
    )
    db.add(story)
    db.add(AccelerationLog(kid_id=kid.id, skill_id=skill_id, reason="know", band_from=1, band_to=3))

    # rate-limit buckets keyed to THIS account (must be purged)…
    db.add(RateLimitBucket(key=f"login:email:{profile.email.lower()}", window_start=datetime.now(), count=3))
    db.add(RateLimitBucket(key=f"pw:profile:{profile.id}", window_start=datetime.now(), count=1))
    db.add(RateLimitBucket(key=f"{profile.id}:1.2.3.4:kids", window_start=datetime.now(), count=2))
    db.add(RateLimitBucket(key=f"{profile.id}:1.2.3.4:export:read", window_start=datetime.now(), count=5))
    # …and one for a DIFFERENT account (must survive).
    db.add(RateLimitBucket(key="login:email:other@test.com", window_start=datetime.now(), count=1))

    # AdminAudit — no FK, must survive with a ROTATED admin_id.
    db.add(AdminAudit(admin_id=profile.id, action="create", resource="config",
                      item_id="locale", detail={"k": "v"}))

    # Tenant-owned org curriculum — must SURVIVE the profile delete (#1686).
    db.add(Subject(id="sub-b1", tenant_id=profile.id, title_en="Numbers", title_bn="সংখ্যা"))
    db.add(Skill(id=skill_id, tenant_id=profile.id, band=1, subject="sub-b1", title="Count"))
    db.add(ContentItem(id="c-1", tenant_id=profile.id, kind="game", title="Counting", config={}))
    db.add(ConfigEntry(key="org_locale", tenant_id=profile.id, value={"locale": "bn"}))

    # story embedding pointing at the story (orphaned once the story dies).
    # Seeded as a lightweight row (the ORM constructor would trigger mapper
    # config for a cross-metadata relationship that production never uses).
    if HAVE_VECTOR and StoryEmbedding is not None:
        db._stores[StoryEmbedding].append(SimpleNamespace(story_id=story.id))

    return SimpleNamespace(
        profile=profile, org=org, kid=kid, story_id=story.id,
    )


async def _run():
    global passes, fails
    passes = 0
    fails = 0

    print("①  delete_account empties every profile/kid-linked table…")
    db = FakeDB()
    fx = _seed(db)
    profile = fx.profile
    kid = fx.kid
    kid_ids = [kid.id]
    profile_id = profile.id

    res = await auth.delete_account(
        DeleteAccountIn(confirmation="delete my account", password="password123"),
        make_request(),
        profile,
        db,
    )
    check("summary deleted=true", res["deleted"], True)
    check("summary kids_removed", res["kids_removed"], 1)
    check("summary sessions_removed", res["sessions_removed"], 2)
    check("summary mastery_removed", res["mastery_removed"], 1)
    check("summary events_removed", res["events_removed"], 1)
    check("summary stories_removed", res["stories_removed"], 1)
    check("summary acceleration_removed", res["acceleration_removed"], 1)
    check("summary rate_limit_buckets_removed", res["rate_limit_buckets_removed"], 4)
    check("summary story_embeddings_pruned", res["story_embeddings_pruned"], 1)

    # ① every profile/kid-linked table empty for this id set.
    check("profiles empty", [o for o in db._stores[Profile] if o.id == profile_id], [])
    for m in _PROFILE_LINKED:
        check(
            f"{m.__tablename__} empty for profile",
            [o for o in db._stores[m] if getattr(o, "profile_id", None) == profile_id],
            [],
        )
    check("kids empty for profile", [o for o in db._stores[Kid] if o.profile_id == profile_id], [])
    for m in _KID_LINKED:
        check(
            f"{m.__tablename__} empty for kid",
            [o for o in db._stores[m] if getattr(o, "kid_id", None) in kid_ids],
            [],
        )
    if HAVE_VECTOR and StoryEmbedding is not None:
        check("story_embeddings empty (orphans swept)", db._stores[StoryEmbedding], [])

    # ② rate-limit buckets for THIS account purged; ANOTHER account's survive.
    remaining_keys = [r.key for r in db._stores[RateLimitBucket]]
    check("account email bucket gone", any("login:email:del-cascade@test.com" == k for k in remaining_keys), False)
    check("pw:profile bucket gone", any(f"pw:profile:{profile_id}" == k for k in remaining_keys), False)
    check("profile-id: prefix buckets gone", any(k.startswith(f"{profile_id}:") for k in remaining_keys), False)
    check("other account's bucket survives", "login:email:other@test.com" in remaining_keys, True)

    print("③  Organization + tenant curriculum survive; AdminAudit rotated…")
    check("organization survives", any(o.id == fx.org.id for o in db._stores[Organization]), True)
    for m in _TENANT_MODELS:
        check(f"{m.__tablename__} tenant rows survive the profile delete", len(db._stores[m]), 1)
    # The SET NULL disownership (#1686) is a DB-level effect on the FK; in the
    # fake store the row survives with its tenant_id, which is exactly the
    # property this test can prove: deleting the owner never CASCADES the rows.
    check("subject row present", any(s.id == "sub-b1" for s in db._stores[Subject]), True)

    audits = db._stores[AdminAudit]
    check("AdminAudit row survives", len(audits), 1)
    check("AdminAudit admin_id rotated", audits[0].admin_id != profile_id, True)
    check("AdminAudit no longer references deleted profile", [a for a in audits if a.admin_id == profile_id], [])

    print("④  #1690 — the log scrubber covers the auth-flow email format…")
    raw = f"auth 401 route=login account_key=login:email:del-cascade@test.com"
    check("scrubber redacts auth-style email", "del-cascade@test.com" in redact_text(raw), False)

    print()
    print(f"✓ {passes} checks passed")
    if fails:
        print(f"✖ {fails} FAILED")
        sys.exit(1)


if __name__ == "__main__":
    import asyncio

    asyncio.run(_run())