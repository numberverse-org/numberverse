from pydantic_settings import BaseSettings, SettingsConfigDict

# #842 — built-in dev credentials. Outside of NV_ENVIRONMENT=dev these MUST be
# overridden via NV_JWT_SECRET / NV_ADMIN_PASSWORD; the startup guard at the
# bottom of this module refuses to boot with the defaults still in effect.
DEFAULT_JWT_SECRET = "dev-secret"
DEFAULT_ADMIN_PASSWORD = "change-me-admin"
DEV_ENVIRONMENT = "dev"


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

# #842 — fail fast before any tables are created or routers are served. A
# non-dev deploy with the built-in dev JWT secret (forgeable tokens) or admin
# password (public, guessable console login) is wide open; make the operator
# set explicit values instead of booting with a security hole.
if settings.environment.strip().lower() != DEV_ENVIRONMENT:
    _defaulted = []
    if settings.jwt_secret == DEFAULT_JWT_SECRET:
        _defaulted.append("NV_JWT_SECRET")
    if settings.admin_password == DEFAULT_ADMIN_PASSWORD:
        _defaulted.append("NV_ADMIN_PASSWORD")
    if _defaulted:
        raise RuntimeError(
            f"Refusing to start: NV_ENVIRONMENT={settings.environment!r} is not a "
            "dev environment, but the built-in dev credentials are still in "
            "effect. Set NV_JWT_SECRET and NV_ADMIN_PASSWORD to strong, "
            f"non-default values (currently unchanged: {', '.join(_defaulted)}). "
            "Local dev/test runs only: set NV_ENVIRONMENT=dev to keep the "
            "built-in defaults."
        )
