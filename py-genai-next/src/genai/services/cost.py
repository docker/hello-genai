"""Token cost estimation. Local models are free by default; set COST_PER_MTOK_*
to meter a paid backend."""
from genai.core.config import settings


def cost_usd(usage: dict | None) -> float:
    if not usage:
        return 0.0
    p = usage.get("prompt_tokens", 0) or 0
    c = usage.get("completion_tokens", 0) or 0
    return (p / 1_000_000) * settings.COST_PER_MTOK_PROMPT + (c / 1_000_000) * settings.COST_PER_MTOK_COMPLETION
