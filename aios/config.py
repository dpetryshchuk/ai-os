from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    jobsearch_database_url: str = "postgresql://jobsearch:jobsearch@localhost:5432/jobsearch"
    daily_log_database_url: str = "postgresql://daily_log:daily_log@localhost:5432/daily_log"
    redis_url: str = "redis://redis:6379/0"
    deepseek_api_key: str = ""
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    uploads_dir: str = "/app/uploads"
    github_token: str = ""
    github_repo: str = ""
    writing_dir: str = "/repo"
    freewrite_dir: str = "/freewrite"
    port: int = 4116
    notify_email: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
