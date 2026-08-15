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

# #921 — placeholder secrets that used to ship in the example env files must
# never be accepted on a non-dev boot (they are public and forgeable).
_JWT_SECRET_PLACEHOLDERS = {
    DEFAULT_JWT_SECRET,
    "change-me",
    "change-me-32-chars-minimum-random-secret",
}
_ADMIN_PASSWORD_PLACEHOLDERS = {DEFAULT_ADMIN_PASSWORD, "change-me"}
# #800 — the demo parent is a real seeded account, so its password must be
# operator-owned in non-dev environments exactly like the admin password.
_DEMO_PASSWORD_PLACEHOLDERS = {DEFAULT_DEMO_PASSWORD, "demo", "demo-password"}


class Settings(BaseSettings):
    # nv_ prefix avoids clashing with host env vars (e.g. DATABASE_URL from other infra)
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", env_prefix="nv_"
    )

    database_url: str = "postgresql+psycopg://numberverse:numberverse_dev@localhost:5434/numberverse"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_expires_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175"
    admin_email: str = "admin@numberverse.dev"
    admin_password: str = DEFAULT_ADMIN_PASSWORD
    demo_email: str = "demo@numberverse.dev"
    demo_password: str = DEFAULT_DEMO_PASSWORD
    # #842 — deployment environment flag (NV_ENVIRONMENT). "dev" permits the
    # built-in dev secret/password above; any other value is treated as a real
    # deployment and requires NV_JWT_SECRET and NV_ADMIN_PASSWORD to be set.
    environment: str = DEV_ENVIRONMENT
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

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

# #842/#800/#921 — fail fast before any tables are created or routers are
# served. A non-dev deploy with the built-in dev JWT secret (forgeable tokens),
# a public admin or demo password (guessable seeded logins), or wildcard CORS
# is wide open; make the operator set explicit values instead of booting with a
# security hole.
if settings.environment.strip().lower() != DEV_ENVIRONMENT:
    _problems = []
    if (
        not settings.jwt_secret
        or not settings.jwt_secret.strip()
        or settings.jwt_secret in _JWT_SECRET_PLACEHOLDERS
    ):
        _problems.append("NV_JWT_SECRET (set a strong, non-default value)")
    if (
        not settings.admin_password
        or not settings.admin_password.strip()
        or settings.admin_password in _ADMIN_PASSWORD_PLACEHOLDERS
    ):
        _problems.append("NV_ADMIN_PASSWORD (set a strong, non-default value)")
    if (
        not settings.demo_password
        or not settings.demo_password.strip()
        or settings.demo_password in _DEMO_PASSWORD_PLACEHOLDERS
    ):
        _problems.append("NV_DEMO_PASSWORD (set a strong, non-default value)")
    if "*" in settings.origins:
        _problems.append("NV_CORS_ORIGINS (wildcard '*' is not allowed outside dev)")
    if _problems:
        raise RuntimeError(
            f"Refusing to start: NV_ENVIRONMENT={settings.environment!r} is not a "
            "dev environment, but these production settings are still unsafe: "
            f"{', '.join(_problems)}. Set them to strong, non-default values. "
            "Local dev/test runs only: set NV_ENVIRONMENT=dev to keep the "
            "built-in defaults."
        )
