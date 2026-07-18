"""Persistent memory: relevance-ranked recall (pgvector) + fact extraction."""
import logging
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.core.config import settings
from genai.domain.models import Memory, User
from genai.services import embeddings
from genai.services.llm import call_llm, strip_think

logger = logging.getLogger(__name__)


async def _mem_cfg(db: AsyncSession, user_id: uuid.UUID) -> tuple[bool, int, int, int, str]:
    """(enabled, max_items, recall_k, per_message, extraction_prompt) — per-user,
    gated by the global master switch, with sane fallbacks."""
    row = (await db.execute(
        select(User.memory_enabled, User.memory_max_items, User.memory_recall_k,
               User.memory_per_message, User.memory_prompt)
        .where(User.id == user_id)
    )).first()
    if not row:
        return settings.MEMORY_ENABLED, settings.MEMORY_MAX_ITEMS, settings.MEMORY_RECALL_K, 3, EXTRACTION_PROMPT
    return (settings.MEMORY_ENABLED and bool(row.memory_enabled),
            row.memory_max_items or settings.MEMORY_MAX_ITEMS,
            row.memory_recall_k or settings.MEMORY_RECALL_K,
            row.memory_per_message or 3,
            (row.memory_prompt or "").strip() or EXTRACTION_PROMPT)

EXTRACTION_PROMPT = (
    "You maintain long-term memory for an AI assistant. From the user message below, "
    "extract up to 3 durable facts about the user worth remembering across future "
    "conversations — name, role, preferences, projects, goals, or constraints.\n"
    "Rules:\n"
    "- One fact per line, plain text, third person (e.g. \"User prefers Python\").\n"
    "- Under 120 characters each. No bullets, numbering, or commentary.\n"
    "- Ignore one-off requests, questions, and anything ephemeral.\n"
    "- If nothing is worth remembering, reply with exactly: NONE\n\n"
    "User message:\n"
)


async def recall(db: AsyncSession, user_id: uuid.UUID, query: str,
                 project_id: int | None = None) -> list[str]:
    enabled, _max, recall_k, _pm, _prompt = await _mem_cfg(db, user_id)
    if not enabled:
        return []
    scope = or_(Memory.project_id == project_id, Memory.project_id.is_(None)) if project_id is not None else True

    if embeddings.available():
        qvec = await embeddings.embed(query)
        if qvec:
            dist = Memory.embedding.cosine_distance(qvec).label("dist")
            stmt = (
                select(Memory.content, dist)
                .where(Memory.user_id == user_id, Memory.enabled.is_(True),
                       Memory.embedding.isnot(None), scope)
                .order_by(dist).limit(recall_k)
            )
            rows = (await db.execute(stmt)).all()
            ranked = [r.content for r in rows if (1 - r.dist) > 0.15]
            if ranked:
                return ranked

    stmt = select(Memory.content).where(
        Memory.user_id == user_id, Memory.enabled.is_(True), scope
    ).order_by(Memory.id)
    return list((await db.execute(stmt)).scalars().all())


async def extract_and_store(db: AsyncSession, user_id: uuid.UUID, user_message: str,
                            session_id: uuid.UUID | None = None, project_id: int | None = None) -> list[str]:
    enabled, max_items, _k, per_message, extraction_prompt = await _mem_cfg(db, user_id)
    if not enabled:
        return []
    count = (await db.execute(select(Memory).where(Memory.user_id == user_id))).scalars().all()
    if len(count) >= max_items:
        return []
    reply, _ = await call_llm([{"role": "user", "content": extraction_prompt + "\n\n" + user_message[:2000]}], max_tokens=300)
    reply = strip_think(reply)

    existing = {m.content.strip().lower() for m in count}
    stored: list[str] = []
    for line in reply.splitlines():
        fact = line.strip().lstrip("-•*0123456789. ").strip()
        if not fact or fact.upper() == "NONE" or len(fact) > 200 or fact.lower() in existing:
            continue
        vec = await embeddings.embed(fact)
        db.add(Memory(user_id=user_id, content=fact, source_session_id=session_id,
                      project_id=project_id, embedding=vec))
        existing.add(fact.lower())
        stored.append(fact)
        if len(stored) >= per_message:
            break
    if stored:
        await db.commit()
        logger.info("Remembered %d new fact(s) for user %s", len(stored), user_id)
    return stored
