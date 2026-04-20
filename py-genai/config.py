import os

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
    RATE_LIMIT_DEFAULT: list[str] = ["200 per day", "50 per hour"]
    RATE_LIMIT_CHAT: str = "10 per minute"
    DEFAULT_SYSTEM_PROMPT: str = (
        "You are a helpful assistant. Please provide structured responses using markdown formatting. "
        "Use headers (# for main points), bullet points (- for lists), bold (**text**) for emphasis, "
        "and code blocks (```code```) for code examples. Organize your responses with clear sections "
        "and concise explanations."
    )
