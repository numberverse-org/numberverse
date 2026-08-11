from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # nv_ prefix avoids clashing with host env vars (e.g. DATABASE_URL from other infra)
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", env_prefix="nv_"
    )

    database_url: str = "postgresql+psycopg://numberverse:numberverse_dev@localhost:5434/numberverse"
    jwt_secret: str = "dev-secret"
    jwt_expires_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175"
    admin_email: str = "admin@numberverse.dev"
    admin_password: str = "change-me-admin"
    # Google sign-in (optional): the OAuth 2.0 Client ID for this origin
    # (Google Cloud Console → Credentials → Web application). When set, the
    # kid app shows "Continue with Google" and /auth/google verifies the ID
    # token server-side. Leave empty to hide Google sign-in entirely.
    google_client_id: str | None = None

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
