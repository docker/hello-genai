"""Embeddings via an OpenAI-compatible /embeddings endpoint.

Powers RAG retrieval, semantic search, and relevance-ranked memory recall.
Everything degrades gracefully: when EMBED_MODEL is unset or the endpoint is
unreachable, embed() returns None and callers fall back to non-semantic paths.
"""
import json
import logging
import math

from config import Config
from services.llm import _session

logger = logging.getLogger(__name__)


def available() -> bool:
    return Config.embeddings_enabled()


def embed(text: str) -> list[float] | None:
    """Return an embedding vector for text, or None if embeddings are unavailable."""
    vecs = embed_many([text])
    return vecs[0] if vecs else None


def embed_many(texts: list[str]) -> list[list[float]] | None:
    """Batch-embed. Returns None (not a partial list) if embeddings are unavailable."""
    if not available() or not texts:
        return None
    try:
        resp = _session().post(
            f"{Config.EMBED_URL}/embeddings",
            json={"model": Config.EMBED_MODEL, "input": texts},
            headers={"Content-Type": "application/json"},
            timeout=Config.LLM_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        # Preserve request order via the index field when present
        data.sort(key=lambda d: d.get("index", 0))
        return [d["embedding"] for d in data]
    except Exception as e:
        logger.info("Embedding request failed (%s); semantic features disabled for this call", e)
        return None


def to_json(vec: list[float]) -> str:
    return json.dumps(vec)


def from_json(blob: str | None) -> list[float] | None:
    if not blob:
        return None
    try:
        return json.loads(blob)
    except (json.JSONDecodeError, TypeError):
        return None


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def top_k(query_vec: list[float], candidates: list[dict], k: int, key: str = "embedding") -> list[dict]:
    """Rank candidates (each a dict with an embedding-JSON field named `key`) by
    cosine similarity to query_vec; returns the top k with a `score` added."""
    scored = []
    for c in candidates:
        vec = from_json(c.get(key))
        if not vec:
            continue
        score = cosine(query_vec, vec)
        scored.append({**c, "score": score})
    scored.sort(key=lambda c: c["score"], reverse=True)
    return scored[:k]
