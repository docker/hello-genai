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
