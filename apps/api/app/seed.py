"""Create tables + seed admin and demo accounts. Runs on API startup."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import Base, engine, SessionLocal
from .models import Kid, KidSettings, Profile, Skill, Subject, Subscription
from .security import hash_password

log = logging.getLogger("numberverse.seed")

# ── Content catalog (mirrors @numberverse/core SKILLS) ──────────────────────
# The kid app's rounds carry these skill ids. Progress recording enforces a FK
# to `skills`, so the catalog MUST exist or every sync 500s. Idempotent insert:
# nothing is overwritten, entries are only added when missing.
SUBJECTS_SEED = [
    ("math", "Math", "গণিত", 1),
    ("bangla", "Bangla", "বাংলা", 2),
    ("english", "English", "ইংরেজি", 3),
    ("science", "Science", "বিজ্ঞান", 4),
    ("bgs", "Bangladesh & Global Studies", "বাংলাদেশ ও বিশ্বপরিচয়", 5),
]

# BRAIN-ALIGNED COURSE INDEX (issue #61) — mirrors @numberverse/core SKILLS.
# Order = sort_order = the kid's learning path. Numbers first (count 1→10→20→
# →50→100), then concrete games, then abstract drills. EN/BN tracks mirrored at
# the same stages (letters → sounds → words → decode → sentences).
SKILLS_SEED: list[tuple[str, int, str, str, str]] = [
    # Band 1 — number sense
    ("count-1-10", 1, "math", "Count to 10", "১ থেকে ১০ গুনি"),
    ("number-song", 1, "math", "Number song", "সংখ্যার গান"),
    ("grow-count", 1, "math", "Plant & count", "বপন ও গণনা"),
    ("quantity-match", 1, "math", "Match numbers", "সংখ্যা মেলানো"),
    ("count-1-20", 1, "math", "Count to 20", "১ থেকে ২০ গুনি"),
    ("number-line", 1, "math", "Number line hops", "সংখ্যা রেখা"),
    ("shapes", 1, "math", "Recognize shapes", "আকার চিনি"),
    # Language stage 1 — letters
    ("bn-swaroborno", 1, "bangla", "Bangla vowels", "স্বরবর্ণ"),
    ("en-abcs", 1, "english", "ABCs", "ইংরেজি বর্ণমালা"),
    ("bn-numbers", 1, "bangla", "Bangla numbers", "বাংলা সংখ্যা"),
    ("en-shapes", 1, "english", "Shape names", "আকৃতির নাম"),
    # Band 2 — finish numbers, then concrete arithmetic
    ("count-to-50", 2, "math", "Count to 50", "৫০ পর্যন্ত গুনি"),
    ("count-to-100", 2, "math", "Count to 100", "১০০ পর্যন্ত গুনি"),
    ("fruit-tree-add", 2, "math", "Fruit tree addition", "ফলের গাছ যোগ"),
    ("add-within-10", 2, "math", "Add within 10", "১০-এর মধ্যে যোগ"),
    ("sub-within-10", 2, "math", "Subtract within 10", "১০-এর মধ্যে বিয়োগ"),
    ("number-bonds-10", 2, "math", "Number bonds to 10", "১০-এর জোড়া সংখ্যা"),
    ("add-within-20", 2, "math", "Add within 20", "২০-এর মধ্যে যোগ"),
    ("sub-within-20", 2, "math", "Subtract within 20", "২০-এর মধ্যে বিয়োগ"),
    ("add-to-20", 2, "math", "Add to 20", "২০-এর মধ্যে যোগ"),
    ("bd-taka", 2, "math", "Bangla money", "টাকা চিনি"),
    # Language stage 2 — more letters + sounds
    ("bn-benjonborno", 2, "bangla", "Bangla consonants", "ব্যঞ্জনবর্ণ"),
    ("bn-colors", 2, "bangla", "Bangla colors", "রঙ চিনি"),
    ("en-phonics", 2, "english", "Letter sounds", "বর্ণের উচ্চারণ"),
    ("heavy-light", 2, "science", "Heavy or light", "ভারী না হালকা"),
    # Band 3 — extend arithmetic: two-digit → mult → div (share then facts) → place value → regroup
    ("add-sub-100", 3, "math", "Add & subtract to 100", "১০০-এর মধ্যে যোগ-বিয়োগ"),
    ("mult-facts-2-5-10", 3, "math", "Times tables 2, 5, 10", "২, ৫, ১০ এর নামতা"),
    ("mult-facts-2-10", 3, "math", "Times tables 2–10", "২–১০ এর নামতা"),
    ("div-facts-fair-share", 3, "math", "Fair shares", "সমান ভাগ"),
    ("div-facts-by-2-3", 3, "math", "Divide by 2 and 3", "২ ও ৩ দিয়ে ভাগ"),
    ("fractions-intro", 3, "math", "Halves and quarters", "অর্ধেক ও চতুর্থাংশ"),
    ("tell-time", 3, "math", "Tell time", "ঘড়ি পড়া"),
    ("place-value-1000", 3, "math", "Place value to 9,999", "স্থানীয় মান"),
    ("add-sub-regroup", 3, "math", "Carry & Borrow", "ক্যারি ও ধার"),
    # Language stage 3 — first words
    ("bn-words", 3, "bangla", "Bangla words", "শব্দ পড়ি"),
    ("bn-family-words", 3, "bangla", "Family words", "পরিবারের শব্দ"),
    ("en-cvc", 3, "english", "CVC words", "ইংরেজি শব্দ"),
    # Band 4 — advanced operations
    ("division-facts", 4, "math", "Division facts", "ভাগ করা"),
    ("fractions-equiv", 4, "math", "Equivalent fractions", "সমান ভগ্নাংশ"),
    ("bn-matras", 4, "bangla", "Bangla matras", "কার"),
    ("en-sightwords", 4, "english", "Sight words", "দেখা-শব্দ"),
    ("science-animals", 4, "science", "Animal homes", "প্রাণী ও আবাস"),
    # Band 5
    ("decimals-intro", 5, "math", "Decimals", "দশমিক"),
    ("percent-intro", 5, "math", "Percent of a number", "শতকরা"),
    ("area-perimeter", 5, "math", "Area & perimeter", "ক্ষেত্রফল ও পরিসীমা"),
    ("bn-sentences", 5, "bangla", "Bangla sentences", "বাক্য গঠন"),
    ("en-grammar", 5, "english", "Nouns & verbs", "বিশেষ্য ও ক্রিয়া"),
    ("bgs-bangladesh", 5, "bgs", "Bangladesh facts", "বাংলাদেশ পরিচিতি"),
]


async def seed_content(db: AsyncSession) -> None:
    for sid, title_en, title_bn, order in SUBJECTS_SEED:
        if not await db.get(Subject, sid):
            db.add(Subject(id=sid, title_en=title_en, title_bn=title_bn, sort_order=order))
    for order, (sid, band, subject, title, title_bn) in enumerate(SKILLS_SEED, start=1):
        if not await db.get(Skill, sid):
            db.add(
                Skill(
                    id=sid,
                    band=band,
                    subject=subject,
                    title=title,
                    title_bn=title_bn,
                    sort_order=order,
                )
            )
    await db.flush()
    log.info("Content catalog seeded (%d subjects, %d skills)", len(SUBJECTS_SEED), len(SKILLS_SEED))


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _ensure_profile(db: AsyncSession, email: str, password: str, display_name: str, is_admin: bool) -> Profile:
    existing = await db.scalar(select(Profile).where(Profile.email == email))
    if existing:
        return existing
    profile = Profile(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        is_admin=is_admin,
    )
    db.add(profile)
    await db.flush()
    log.info("Created profile %s (admin=%s)", email, is_admin)
    return profile


async def seed() -> None:
    async with SessionLocal() as db:
        await seed_content(db)

        admin = await _ensure_profile(
            db, settings.admin_email, settings.admin_password, "Numberverse Admin", True
        )
        demo = await _ensure_profile(db, "demo@numberverse.dev", "demo1234", "Demo Parent", False)

        # Demo kid for the parent portal
        kids = await db.scalars(select(Kid).where(Kid.profile_id == demo.id))
        if not kids.first():
            kid = Kid(profile_id=demo.id, name="Aria", avatar="🦊", birth_year=2021)
            db.add(kid)
            await db.flush()
            log.info("Created demo kid Aria")

        # Demo parent controls — everything on, 30-min daily cap so the portal's
        # settings panel has something real to show.
        demo_kid = await db.scalar(select(Kid).where(Kid.profile_id == demo.id))
        if demo_kid and not await db.get(KidSettings, demo_kid.id):
            db.add(
                KidSettings(
                    kid_id=demo_kid.id,
                    enabled_subjects=None,  # all subjects
                    max_band=None,  # no cap
                    daily_limit_min=30,
                    tts_enabled=True,
                    music_enabled=True,
                )
            )
            log.info("Created demo kid settings (30-min daily cap)")

        # Demo subscription for the demo parent
        subs = await db.scalars(select(Subscription).where(Subscription.profile_id == demo.id))
        if not subs.first():
            db.add(Subscription(profile_id=demo.id, plan="plus", store="web", status="active"))
            log.info("Created demo plus subscription")

        await db.commit()
