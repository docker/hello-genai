"""Embeddings via the OpenAI-compatible /embeddings endpoint."""
import logging

from genai.core.config import settings
from genai.services.llm import client

logger = logging.getLogger(__name__)


def available() -> bool:
    return settings.embeddings_enabled


async def embed_many(texts: list[str]) -> list[list[float]] | None:
    if not available() or not texts:
        return None
    try:
        resp = await client().post(
            f"{settings.embed_url}/embeddings",
            json={"model": settings.EMBED_MODEL, "input": texts},
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        data.sort(key=lambda d: d.get("index", 0))
        return [d["embedding"] for d in data]
    except Exception as e:
        logger.info("Embedding request failed (%s); semantic features degraded", e)
        return None


async def embed(text: str) -> list[float] | None:
    vecs = await embed_many([text])
    return vecs[0] if vecs else None
