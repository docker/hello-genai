"""Live model discovery from the backend (Redis-cached)."""
import json

from fastapi import APIRouter, Depends

from genai.api.deps import current_user
from genai.core.config import settings
from genai.core.redis import redis_client
from genai.domain.models import User
from genai.services.llm import client

router = APIRouter(prefix="/api", tags=["Models"])
_CACHE_KEY = "models:list"
_CACHE_TTL = 30


async def _discover() -> list[str]:
    resp = await client().get(f"{settings.LLAMA_URL}/models")
    resp.raise_for_status()
    return [m["id"] for m in resp.json().get("data", []) if m.get("id")]


@router.get("/models")
async def list_models(refresh: str | None = None, user: User = Depends(current_user)):
    if not refresh:
        cached = await redis_client.get(_CACHE_KEY)
        if cached:
            return json.loads(cached)

    source = "live"
    try:
        models = await _discover()
        if not models:
            raise ValueError("empty")
    except Exception:
        source = "fallback"
        pinned = settings.AVAILABLE_MODELS.strip()
        models = [m.strip() for m in pinned.split(",") if m.strip()] or ([settings.LLAMA_MODEL] if settings.LLAMA_MODEL else [])

    current = settings.LLAMA_MODEL if settings.LLAMA_MODEL in models else (models[0] if models else "")
    result = {"models": models, "current": current, "source": source}
    if source == "live":
        await redis_client.set(_CACHE_KEY, json.dumps(result), ex=_CACHE_TTL)
    return result


@router.get("/models/info")
async def models_info(user: User = Depends(current_user)):
    """Rich per-model metadata (architecture, params, quantization, size) from the
    model runner, plus this app's runtime settings for the model."""
    models: list[dict] = []
    try:
        resp = await client().get(f"{settings.LLAMA_URL}/models")
        resp.raise_for_status()
        for m in resp.json().get("data", []):
            dmr = m.get("dmr") or {}
            models.append({
                "id": m.get("id"),
                "owned_by": m.get("owned_by"),
                "created": m.get("created"),
                "architecture": dmr.get("architecture"),
                "parameters": dmr.get("parameters"),
                "quantization": dmr.get("quantization"),
                "size": dmr.get("size"),
                "is_current": m.get("id") == settings.LLAMA_MODEL,
                "is_embedding": m.get("id") == settings.EMBED_MODEL,
            })
    except Exception:
        pass
    return {
        "models": models,
        "current": settings.LLAMA_MODEL,
        "embed_model": settings.EMBED_MODEL,
        "runtime": {
            "context_max_tokens": settings.LLM_CONTEXT_MAX_TOKENS,
            "max_output_tokens": settings.MAX_MAX_TOKENS,
            "temperature_range": [settings.MIN_TEMPERATURE, settings.MAX_TEMPERATURE],
            "tools_enabled": settings.TOOLS_ENABLED,
            "web_search_enabled": settings.WEB_SEARCH_ENABLED,
            "embeddings_enabled": bool(settings.EMBED_MODEL),
        },
    }
