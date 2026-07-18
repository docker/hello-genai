"""Stats, public config, and health."""
import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.config import settings
from genai.core.db import get_db
from genai.core.redis import redis_client
from genai.domain.models import User
from genai.services import embeddings
from genai.services.llm import client
from genai.services.memory import EXTRACTION_PROMPT

router = APIRouter(prefix="/api", tags=["System"])


@router.get("/stats")
async def stats(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.get_stats(db, user.id)


@router.get("/metrics/live", summary="Live memory-creation + per-model performance snapshot")
async def live_metrics(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.live_metrics(db, user.id)


@router.get("/stats/timeseries", summary="Daily usage time-series (tokens, messages, cost, latency)")
async def stats_timeseries(days: int = 30, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {"days": await repo.timeseries(db, user.id, min(max(days, 1), 90))}


@router.get("/config")
async def config():
    return {
        "context_max_tokens": settings.LLM_CONTEXT_MAX_TOKENS,
        "max_message_len": settings.MAX_MESSAGE_LEN,
        "memory_enabled": settings.MEMORY_ENABLED,
        "memory_max_items": settings.MEMORY_MAX_ITEMS,
        "tools_enabled": settings.TOOLS_ENABLED,
        "web_search_enabled": settings.WEB_SEARCH_ENABLED,
        "embeddings_enabled": embeddings.available(),
        "allow_registration": settings.ALLOW_REGISTRATION,
        "default_memory_prompt": EXTRACTION_PROMPT,
    }


health_router = APIRouter(tags=["System"])


@health_router.get("/health")
async def health(deep: int = 0, db: AsyncSession = Depends(get_db)):
    body: dict = {"status": "healthy", "timestamp": datetime.datetime.now(datetime.UTC).isoformat()}
    # DB + Redis liveness
    try:
        await db.execute(text("SELECT 1"))
        body["database"] = "ok"
    except Exception:
        body["database"] = "unreachable"
        body["status"] = "degraded"
    try:
        await redis_client.ping()
        body["redis"] = "ok"
    except Exception:
        body["redis"] = "unreachable"
        body["status"] = "degraded"

    if deep:
        try:
            resp = await client().get(f"{settings.LLAMA_URL}/models")
            resp.raise_for_status()
            ids = [m.get("id") for m in resp.json().get("data", [])]
            body["llm_api"] = "ok"
            body["model_loaded"] = settings.LLAMA_MODEL in ids
            if not body["model_loaded"]:
                body["status"] = "degraded"
        except Exception:
            body["llm_api"] = "unreachable"
            body["model_loaded"] = False
            body["status"] = "degraded"

    return body
