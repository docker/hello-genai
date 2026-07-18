import os
import sys

from dotenv import load_dotenv

load_dotenv()


class Config:
    MODEL_URL: str = os.getenv("LLAMA_URL", "")
    MODEL_NAME: str = os.getenv("LLAMA_MODEL", "")
    PORT: int = int(os.getenv("PORT", 8081))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
    DATABASE_PATH: str = os.getenv("DATABASE_PATH", "chat_history.db")
    CACHE_TIMEOUT: int = 300
    RATE_LIMIT_DEFAULT: tuple[str, ...] = ("200 per day", "50 per hour")
    RATE_LIMIT_CHAT: str = "10 per minute"
    LLM_TIMEOUT: int = int(os.getenv("LLM_TIMEOUT", 60))
    LLM_MAX_RETRIES: int = int(os.getenv("LLM_MAX_RETRIES", 2))
    # Approximate token budget for the conversation sent to the model
    # (system prompt + history + new message). Oldest turns are dropped first.
    LLM_CONTEXT_MAX_TOKENS: int = int(os.getenv("LLM_CONTEXT_MAX_TOKENS", 3000))
    RATE_LIMIT_STORAGE_URI: str = os.getenv("RATE_LIMIT_STORAGE_URI", "memory://")
    MAX_MESSAGE_LEN: int = int(os.getenv("MAX_MESSAGE_LEN", 32000))
    MAX_SYSTEM_PROMPT_LEN: int = 2000
    MAX_SESSION_TITLE_LEN: int = 80
    MAX_PRESET_NAME_LEN: int = 60
    MIN_TEMPERATURE: float = 0.0
    MAX_TEMPERATURE: float = 2.0
    MIN_MAX_TOKENS: int = 1
    MAX_MAX_TOKENS: int = 32768

    # Optional authentication. When APP_API_KEY is set, the UI requires login and
    # the API requires an "Authorization: Bearer <key>" / "X-API-Key" header.
    # Left blank (default), the app is open — unchanged behaviour.
    APP_API_KEY: str = os.getenv("APP_API_KEY", "")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "") or os.urandom(32).hex()

    # Attachments (#9). Images are sent to vision-capable models; PDFs are
    # extracted to text server-side. Both are bounded to keep requests sane.
    MAX_IMAGES_PER_MESSAGE: int = int(os.getenv("MAX_IMAGES_PER_MESSAGE", 4))
    MAX_IMAGE_BYTES: int = int(os.getenv("MAX_IMAGE_BYTES", 4 * 1024 * 1024))
    MAX_UPLOAD_BYTES: int = int(os.getenv("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))

    # Persistent chat memory: durable facts about the user are extracted by the
    # LLM after each exchange and injected into future conversations.
    MEMORY_ENABLED: bool = os.getenv("MEMORY_ENABLED", "true").lower() != "false"
    MEMORY_MAX_ITEMS: int = int(os.getenv("MEMORY_MAX_ITEMS", 100))

    # Embeddings power RAG, semantic search, and relevance-ranked memory recall.
    # Point EMBED_MODEL at an embedding model served by the backend (e.g. an
    # OpenAI-compatible /embeddings endpoint). Blank = embeddings disabled, and
    # dependent features degrade gracefully (memory falls back to inject-all).
    EMBED_MODEL: str = os.getenv("EMBED_MODEL", "")
    EMBED_URL: str = os.getenv("EMBED_URL", "") or MODEL_URL
    # How many top-ranked items to retrieve
    MEMORY_RECALL_K: int = int(os.getenv("MEMORY_RECALL_K", 8))
    RAG_RETRIEVE_K: int = int(os.getenv("RAG_RETRIEVE_K", 4))
    RAG_CHUNK_CHARS: int = int(os.getenv("RAG_CHUNK_CHARS", 1200))
    RAG_CHUNK_OVERLAP: int = int(os.getenv("RAG_CHUNK_OVERLAP", 150))

    # Tool / function calling. When enabled, the model may call a small allowlist
    # of safe built-in tools (calculator, conversation search, current time,
    # document retrieval). Bounded to avoid runaway loops.
    TOOLS_ENABLED: bool = os.getenv("TOOLS_ENABLED", "true").lower() != "false"
    TOOLS_MAX_STEPS: int = int(os.getenv("TOOLS_MAX_STEPS", 4))

    @classmethod
    def auth_enabled(cls) -> bool:
        return bool(cls.APP_API_KEY)

    @classmethod
    def embeddings_enabled(cls) -> bool:
        return bool(cls.EMBED_MODEL and cls.EMBED_URL)
    DEFAULT_SYSTEM_PROMPT: str = (
        "You are a helpful assistant. Please provide structured responses using markdown formatting. "
        "Use headers (# for main points), bullet points (- for lists), bold (**text**) for emphasis, "
        "and code blocks (```code```) for code examples. Organize your responses with clear sections "
        "and concise explanations."
    )

    @classmethod
    def validate(cls) -> None:
        missing = [v for v, val in [("LLAMA_URL", cls.MODEL_URL), ("LLAMA_MODEL", cls.MODEL_NAME)] if not val]
        if missing:
            print(f"ERROR: Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
            sys.exit(1)
