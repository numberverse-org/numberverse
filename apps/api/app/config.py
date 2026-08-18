import sys
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# #842 — built-in dev credentials. Outside of NV_ENVIRONMENT=dev these MUST be
# overridden via NV_JWT_SECRET / NV_ADMIN_PASSWORD; the startup guard at the
# bottom of this module refuses to boot with the defaults still in effect.
DEFAULT_JWT_SECRET = "dev-secret"
DEFAULT_ADMIN_PASSWORD = "change-me-admin"
# #800 — the demo parent is a real seeded account, so its password must be
# operator-owned in non-dev environments exactly like the admin password.
DEFAULT_DEMO_PASSWORD = "demo1234"
DEV_ENVIRONMENT = "dev"

# #1771 — the dev .env ships with this value; it is the single source of truth
# so the guard and the dev env can never drift apart.  Both the placeholder
# set and .env.example reference the same constant.
DEV_JWT_SECRET = "numberverse-dev-secret-change-me"

# #921 — placeholder secrets that used to ship in the example env files must
# never be accepted on a non-dev boot (they are public and forgeable).
_JWT_SECRET_PLACEHOLDERS = {
    DEFAULT_JWT_SECRET,
    DEV_JWT_SECRET,
    "change-me",
    "change-me-32-chars-minimum-random-secret",
}
_ADMIN_PASSWORD_PLACEHOLDERS = {DEFAULT_ADMIN_PASSWORD, "change-me"}
# #800 — the demo parent is a real seeded account, so its password must be
# operator-owned in non-dev environments exactly like the admin password.
_DEMO_PASSWORD_PLACEHOLDERS = {DEFAULT_DEMO_PASSWORD, "demo", "demo-password"}
# #1780 — the dev DB password (shipped in the built-in dev database_url and in
# the gitignored infra/.env as NV_DEV_DB_PASSWORD) is a local-only secret. A
# non-dev boot with it in the URL would reach a live DB with a publicly-known
# password, so the guard refuses it outside dev.
DEFAULT_DB_PASSWORD = "numberverse_dev"
_DB_PASSWORD_PLACEHOLDERS = {DEFAULT_DB_PASSWORD}

# #1771 — minimum acceptable entropy for non-dev secrets.
_JWT_SECRET_MIN_LENGTH = 32
_PASSWORD_MIN_LENGTH = 12
# Estimated bits of entropy a secret must carry (lower than the length floor
# for the JWT key, higher bar on the wallet-adjacent passwords). These accept
# cryptographically strong hex/Base32/Base64 secrets (2 classes) while still
# rejecting short or repeated-character values.
_JWT_SECRET_MIN_BITS = 64
_PASSWORD_MIN_BITS = 48


def _entropy_bits(value: str) -> float:
    """Shannon-style estimate: `len * log2(alphabet_size)` where alphabet_size
    is the number of DISTINCT characters present (the effective per-char
    alphabet). A 48-char hex secret → 48·log2(16) = 192 bits; a 32×'a' string
    → 0 bits. Character CLASS count alone was wrong here: it rejected strong
    hex/Base32 keys that legitimately use only 2 classes (#1771 regression)."""
    distinct = len(set(value))
    if distinct < 2:
        return 0.0
    return len(value) * __import__("math").log2(distinct)


class Settings(BaseSettings):
    # nv_ prefix avoids clashing with host env vars (e.g. DATABASE_URL from other infra)
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", env_prefix="nv_"
    )

    database_url: str = "postgresql+psycopg://numberverse:numberverse_dev@localhost:5434/numberverse"
    jwt_secret: str = DEFAULT_JWT_SECRET
    # #1774 — JWT signing-key rotation. `jwt_secret` is the CURRENT key; tokens
    # carry a `kid` claim naming it. When you rotate, keep the OLD secret in
    # `jwt_secret_old` (with its own kid) for one rollout so outstanding tokens
    # keep verifying, then clear it. Without this, a key change force-logs-out
    # every client at once.
    jwt_kid: str = "v1"
    jwt_secret_old: str | None = None
    jwt_kid_old: str = "v0"
    # #1773 — short-lived access tokens (minutes) + a long-lived ROTATING
    # refresh cookie (days). The old single week-long JWT in localStorage is
    # gone: the access token is now short-lived, and the week-long credential
    # lives only in an httpOnly+Secure+SameSite=strict cookie.
    jwt_access_minutes: int = 15  # short-lived parent access token
    admin_access_minutes: int = 10  # admin console shortest window
    jwt_refresh_days: int = 7  # refresh cookie lifetime (rotating)
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175"
    admin_email: str = "admin@numberverse.dev"
    admin_password: str = DEFAULT_ADMIN_PASSWORD
    demo_email: str = "demo@numberverse.dev"
    demo_password: str = DEFAULT_DEMO_PASSWORD
    # #842 — deployment environment flag (NV_ENVIRONMENT). "dev" permits the
    # built-in dev secret/password above; any other value is treated as a real
    # deployment and requires NV_JWT_SECRET and NV_ADMIN_PASSWORD to be set.
    environment: str = DEV_ENVIRONMENT
    # #1778 — interface uvicorn binds (NV_BIND_HOST). Loopback-only by default;
    # a non-loopback bind in dev is a loud warning (not a refusal) because the
    # dev compose container legitimately binds 0.0.0.0 on a local box.
    bind_host: str = "127.0.0.1"
    # Google sign-in (optional): the OAuth 2.0 Client ID for this origin
    # (Google Cloud Console → Credentials → Web application). When set, the
    # kid app shows "Continue with Google" and /auth/google verifies the ID
    # token server-side. Leave empty to hide Google sign-in entirely.
    google_client_id: str | None = None
    # 📚 KOTHA retention policy (#331). Stories older than `kotha_retention_days`
    # are pruned by the admin prune job — but never from a skill practiced in
    # the last `kotha_active_skill_days` (active skills keep their full story
    # history), and each kid always keeps its most recent
    # `kotha_max_stories_per_kid` stories.
    kotha_retention_days: int = 90
    kotha_active_skill_days: int = 7
    kotha_max_stories_per_kid: int = 1000
    # #329 — how often the background batch-embed job runs (minutes).
    kotha_embed_interval_minutes: int = 15
    # #948 — single source of truth for the embedding model name and
    # dimensionality. Both embeddings.py and story_embedding_model.py import
    # these values so an encoder upgrade never silently drifts.
    kotha_embed_model: str = "thenlper/gte-small"
    kotha_embed_dim: int = 384
    # #983 — progress_events retention: prune rounds older than this many days.
    progress_retention_days: int = 90
    # #983 — max progress_events per kid (volume guard, like kotha_max_stories_per_kid).
    max_progress_events_per_kid: int = 5000
    # #984 — hard-delete revoked sessions older than this many days.
    session_purge_days: int = 30
    # #1755 — operator token for /metrics (NV_METRICS_TOKEN). Empty in dev: the
    # /metrics gate then falls back to an admin/super_admin JWT. Set a strong
    # token on any reachable deployment so traffic shape isn't public.
    metrics_token: str | None = None

    # ── DB connection pool (#1759) ───────────────────────────────────────────
    # Async connections are lazy — queues hold pooled connections cheaply, and
    # `max_overflow` absorbs bursts without growing the base pool forever.
    # `pool_timeout` bounds how long a checkout may wait before SQLAlchemy
    # raises TimeoutError (a saturated pool surfaces fast instead of hanging).
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    # #1759 — a checkout that waited longer than this (seconds) logs a WARNING,
    # so an exhausted pool is visible in the error log, not just in the
    # db_checkout_wait_seconds histogram.
    db_checkout_warn_seconds: float = 1.0

    # ── Freemium billing (Parent Plus) ────────────────────────────────────────
    # bKash Tokenized Checkout merchant credentials. All empty by default so the
    # API boots WITHOUT bKash configured (the billing routes return 501 until
    # they're set) — mirrors the google_client_id "disabled until configured"
    # pattern. Never forgeable defaults, so no startup guard needed.
    bkash_base_url: str = "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout"
    bkash_username: str = ""
    bkash_password: str = ""
    bkash_app_key: str = ""
    bkash_app_secret: str = ""
    # Optional SOCKS5/HTTP proxy so bKash sees a stable whitelisted IP. The
    # Numberverse deploy runs its OWN bkash-tunnel container (autossh -D) for
    # this — see infra/deploy/docker-compose.prod.yml.
    bkash_proxy_url: str | None = None
    # Parent Plus pricing. Config, not code — the launch price is chosen later
    # ("decide later — just build the rails", 17 Aug 2026).
    plus_annual_bdt: int = 1499
    plus_annual_days: int = 365

    @property
    def bkash_configured(self) -> bool:
        """True when all four bKash merchant credentials are present."""
        return bool(self.bkash_username and self.bkash_password and self.bkash_app_key and self.bkash_app_secret)

    @model_validator(mode="before")
    @classmethod
    def _drop_legacy_jwt_expiry_env(cls, data):
        """#1773 — the old single-lifetime `NV_JWT_EXPIRES_MINUTES` env var no
        longer maps to a field. Pop it so pydantic-settings' extra-forbid can't
        reject a .env/.env.example that still ships it; the new short-lived
        access + rotating-refresh defaults apply instead. The dotenv source
        passes the key WITH the nv_ prefix (lowercased), so both forms are
        dropped."""
        if isinstance(data, dict):
            data.pop("nv_jwt_expires_minutes", None)
            data.pop("jwt_expires_minutes", None)
        return data

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def jwt_expires_minutes(self) -> int:
        """#1773 — backward-compat alias for the REMOVED single-lifetime
        setting. Legacy callers (e.g. the pre-#1773 test helper in
        test_auth.py) that still read the old name now get the short-lived
        parent access window instead of the old week-long lifetime."""
        return self.jwt_access_minutes


settings = Settings()


def _is_local_origin(origin: str) -> bool:
    """#1778 — True when a CORS origin only ever reaches this machine.

    `0.0.0.0` is included because dev tooling commonly uses it as a
    single-host CORS origin; it is not a real non-local origin.
    """
    return (
        "localhost" in origin
        or "127.0.0.1" in origin
        or "::1" in origin
        or origin == "http://0.0.0.0"
    )


# #842/#800/#921/#1778 — fail fast before any tables are created or routers are
# served. A non-dev deploy with the built-in dev JWT secret (forgeable tokens),
# a public admin or demo password (guessable seeded logins), wildcard CORS, or
# the dev DB password is wide open; make the operator set explicit values
# instead of booting with a security hole. A dev boot with a non-loopback CORS
# origin is equally exposed (the built-in dev credentials are public), so it is
# refused too.
if settings.environment.strip().lower() != DEV_ENVIRONMENT:
    _problems = []
    _jwt = settings.jwt_secret
    if (
        not _jwt
        or not _jwt.strip()
        or _jwt in _JWT_SECRET_PLACEHOLDERS
        or len(_jwt) < _JWT_SECRET_MIN_LENGTH
        or _entropy_bits(_jwt) < _JWT_SECRET_MIN_BITS
    ):
        _problems.append("NV_JWT_SECRET (set a strong, non-default value)")
    _admin = settings.admin_password
    if (
        not _admin
        or not _admin.strip()
        or _admin in _ADMIN_PASSWORD_PLACEHOLDERS
        or len(_admin) < _PASSWORD_MIN_LENGTH
        or _entropy_bits(_admin) < _PASSWORD_MIN_BITS
    ):
        _problems.append("NV_ADMIN_PASSWORD (set a strong, non-default value)")
    _demo = settings.demo_password
    if (
        not _demo
        or not _demo.strip()
        or _demo in _DEMO_PASSWORD_PLACEHOLDERS
        or len(_demo) < _PASSWORD_MIN_LENGTH
        or _entropy_bits(_demo) < _PASSWORD_MIN_BITS
    ):
        _problems.append("NV_DEMO_PASSWORD (set a strong, non-default value)")
    if "*" in settings.origins:
        _problems.append("NV_CORS_ORIGINS (wildcard '*' is not allowed outside dev)")
    # #1780 — the dev DB password is local-only; a non-dev boot with it in the
    # URL would connect to a reachable DB with a publicly-known password.
    _db_password = urlsplit(settings.database_url).password
    if _db_password in _DB_PASSWORD_PLACEHOLDERS:
        _problems.append("NV_DATABASE_URL (dev DB password in a non-dev boot)")
    if _problems:
        raise RuntimeError(
            f"Refusing to start: NV_ENVIRONMENT={settings.environment!r} is not a "
            "dev environment, but these production settings are still unsafe: "
            f"{', '.join(_problems)}. Set them to strong, non-default values. "
            "Local dev/test runs only: set NV_ENVIRONMENT=dev to keep the "
            "built-in defaults."
        )
else:
    # #1778 — dev is only safe when the box is loopback-only: the built-in dev
    # JWT secret and admin/demo passwords ship in the code and are public, so a
    # non-loopback CORS origin means the API is meant to be reached from outside
    # → refuse to boot with the known credentials live.
    _problems = []
    if any(not _is_local_origin(origin) for origin in settings.origins):
        _problems.append(
            "NV_CORS_ORIGINS (dev default secrets exposed to a non-loopback origin)"
        )
    if _problems:
        raise RuntimeError(
            f"Refusing to start: NV_ENVIRONMENT={settings.environment!r} is a dev "
            "environment, but it is reachable from a non-loopback origin: "
            f"{', '.join(_problems)}. Bind the API to a loopback host, or set "
            "NV_ENVIRONMENT=production with strong secrets on any reachable box."
        )
    # #1778 — a non-loopback bind in dev is a warn, not a refuse: the dev
    # compose container binds 0.0.0.0 and is reachable only from the host. Make
    # the exposure loud for anyone who copies that into a real deployment.
    if settings.bind_host not in {"127.0.0.1", "localhost", "::1"}:
        print(
            "WARNING: NV_ENVIRONMENT=dev with a non-loopback bind (%s) — dev JWT "
            "secret and default admin/demo passwords are LIVE. Use strong secrets "
            "+ NV_ENVIRONMENT=production on any reachable box."
            % settings.bind_host,
            file=sys.stderr,
        )
