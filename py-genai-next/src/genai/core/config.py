"""Centralised, environment-driven configuration (pydantic-settings)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ───────────────────────────────────────────────────────────────────
    APP_NAME: str = "Hello-GenAI"
    ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:8080"]

    # ── LLM backend (OpenAI-compatible, e.g. Docker Model Runner) ─────────────
    LLAMA_URL: str = "http://host.docker.internal:12434/engines/llama.cpp/v1"
    LLAMA_MODEL: str = "docker.io/ai/gemma4:latest"
    LLM_TIMEOUT: int = 60
    LLM_MAX_RETRIES: int = 2
    LLM_CONTEXT_MAX_TOKENS: int = 3000
    AVAILABLE_MODELS: str = ""

    # ── Embeddings (RAG + semantic memory via pgvector) ───────────────────────
    EMBED_MODEL: str = ""
    EMBED_URL: str = ""
    EMBED_DIM: int = 1024
    MEMORY_RECALL_K: int = 8
    RAG_RETRIEVE_K: int = 4
    RAG_CHUNK_CHARS: int = 1200
    RAG_CHUNK_OVERLAP: int = 150

    # ── Tools / memory ────────────────────────────────────────────────────────
    TOOLS_ENABLED: bool = True
    WEB_SEARCH_ENABLED: bool = True
    TOOLS_MAX_STEPS: int = 4
    MEMORY_ENABLED: bool = True
    MEMORY_MAX_ITEMS: int = 100

    # ── Limits ────────────────────────────────────────────────────────────────
    MAX_MESSAGE_LEN: int = 32000
    MAX_SYSTEM_PROMPT_LEN: int = 2000
    MIN_TEMPERATURE: float = 0.0
    MAX_TEMPERATURE: float = 2.0
    MAX_MAX_TOKENS: int = 32768

    # ── Postgres ──────────────────────────────────────────────────────────────
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "genai"
    POSTGRES_PASSWORD: str = "genai"
    POSTGRES_DB: str = "genai"

    # ── Redis / Celery ────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # ── Auth ──────────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production-please-set-a-long-random-value"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL_MINUTES: int = 60 * 24 * 7  # 1 week
    ALLOW_REGISTRATION: bool = True

    # ── Personal access tokens (PAT) ──────────────────────────────────────────
    PAT_PEPPER: str = "change-me-set-a-long-random-pat-pepper"
    PAT_MAX_ACTIVE: int = 3
    PAT_DEFAULT_EXPIRY_DAYS: int = 90
    PAT_MAX_EXPIRY_DAYS: int = 365
    PAT_RETENTION_DAYS: int = 30       # keep expired/revoked rows this long for audit, then purge
    PAT_RATE_PER_MINUTE: int = 5       # light throttle on token creation

    # ── Admin & cost ──────────────────────────────────────────────────────────
    # Email(s) auto-promoted to admin on registration/startup (comma-separated).
    ADMIN_EMAILS: str = ""
    # USD per 1M tokens (prompt, completion) by model substring; "default" applies otherwise.
    COST_PER_MTOK_PROMPT: float = 0.0    # local models are free; set if you meter a paid backend
    COST_PER_MTOK_COMPLETION: float = 0.0

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def embed_url(self) -> str:
        return self.EMBED_URL or self.LLAMA_URL

    @property
    def embeddings_enabled(self) -> bool:
        return bool(self.EMBED_MODEL)

    @property
    def default_system_prompt(self) -> str:
        return (
            "You are a helpful assistant. Provide clear, well-structured responses using markdown — "
            "headers, bullet points, bold for emphasis, and fenced code blocks for code."
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
