"""Background jobs. Each Celery task runs a short async unit against its own
NullPool engine (safe across Celery's process/loop model)."""
import asyncio
import datetime
import logging
import uuid
from contextlib import asynccontextmanager

from sqlalchemy import delete as sa_delete
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from genai import repositories as repo
from genai.core.config import settings
from genai.domain.models import DailyStat, Document, DocumentChunk, Memory, Message, ScheduledPrompt, Session
from genai.repositories import create_memory
from genai.services import embeddings, rag
from genai.services.cost import cost_usd
from genai.services.llm import aclose as llm_aclose
from genai.services.llm import call_llm, strip_think
from genai.services.memory import extract_and_store
from genai.tasks.app import celery_app

logger = logging.getLogger(__name__)


@asynccontextmanager
async def task_session():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            yield s
    finally:
        await engine.dispose()


def _run(coro):
    """Run a task coroutine on a fresh event loop and tear down the loop-scoped
    httpx client before that loop is destroyed (prevents "Event loop is closed")."""
    async def _wrapped():
        try:
            return await coro
        finally:
            await llm_aclose()
    return asyncio.run(_wrapped())


# ── Memory extraction ─────────────────────────────────────────────────────────
@celery_app.task(name="genai.tasks.jobs.extract_memory_task")
def extract_memory_task(user_id: str, session_id: str, message: str, project_id=None):
    async def _impl():
        async with task_session() as db:
            await extract_and_store(db, uuid.UUID(user_id), message, uuid.UUID(session_id), project_id)
    _run(_impl())


@celery_app.task(name="genai.tasks.jobs.add_to_memory_task")
def add_to_memory_task(user_id: str, content: str, project_id=None):
    """Store a user-selected snippet as a memory (embedding it if available).
    Runs on the dedicated `memory` worker."""
    async def _impl():
        text = content.strip()[:300]
        if not text:
            return
        vec = await embeddings.embed(text) if embeddings.available() else None
        async with task_session() as db:
            await create_memory(db, uuid.UUID(user_id), text, project_id=project_id, embedding=vec)
    _run(_impl())


@celery_app.task(name="genai.tasks.jobs.embed_memory_task")
def embed_memory_task(memory_id: int, content: str):
    async def _impl():
        vec = await embeddings.embed(content)
        if not vec:
            return
        async with task_session() as db:
            await db.execute(update(Memory).where(Memory.id == memory_id).values(embedding=vec))
            await db.commit()
    _run(_impl())


# ── Auto-title ────────────────────────────────────────────────────────────────
@celery_app.task(name="genai.tasks.jobs.generate_title_task")
def generate_title_task(user_id: str, session_id: str, message: str):
    async def _impl():
        prompt = (f"Write a 4-6 word title for a chat that starts with: {message[:200]}. "
                  "Reply with only the title, no quotes or punctuation.")
        title, _ = await call_llm([{"role": "user", "content": prompt}], max_tokens=40)
        title = strip_think(title).strip().strip('"')[:120]
        if title:
            async with task_session() as db:
                await db.execute(update(Session).where(Session.id == uuid.UUID(session_id)).values(title=title))
                await db.commit()
    _run(_impl())


# ── Document ingestion ────────────────────────────────────────────────────────
async def ingest_document_inline(db, document_id: int, text: str):
    """Chunk + embed a document into the given session (used as a fallback when
    Celery is unavailable)."""
    chunks = rag.chunk_text(text)
    vectors = await embeddings.embed_many(chunks) if chunks else None
    for i, chunk in enumerate(chunks):
        vec = vectors[i] if vectors and i < len(vectors) else None
        db.add(DocumentChunk(document_id=document_id, chunk_index=i, content=chunk, embedding=vec))
    await db.execute(update(Document).where(Document.id == document_id).values(status="ready"))
    await db.commit()


@celery_app.task(name="genai.tasks.jobs.ingest_document_task")
def ingest_document_task(document_id: int, text: str):
    async def _impl():
        async with task_session() as db:
            await db.execute(update(Document).where(Document.id == document_id).values(status="processing"))
            await db.commit()
            try:
                await ingest_document_inline(db, document_id, text)
            except Exception:
                logger.exception("Ingestion failed for document %s", document_id)
                await db.execute(update(Document).where(Document.id == document_id).values(status="failed"))
                await db.commit()
    _run(_impl())


# ── Scheduled prompts ─────────────────────────────────────────────────────────
@celery_app.task(name="genai.tasks.jobs.run_scheduled_prompt_task")
def run_scheduled_prompt_task(schedule_id: int):
    async def _impl():
        async with task_session() as db:
            s = (await db.execute(select(ScheduledPrompt).where(ScheduledPrompt.id == schedule_id))).scalar_one_or_none()
            if not s:
                return
            try:
                reply, usage = await call_llm([{"role": "user", "content": s.prompt}], model=s.model, max_tokens=1200)
                reply = strip_think(reply) or "(no response)"
            except Exception:
                logger.exception("Scheduled prompt %s failed", schedule_id)
                reply, usage = "The model was unavailable for this scheduled run.", None
            sess = await repo.create_session(db, s.user_id, title=f"⏰ {s.name}"[:120], model=s.model)
            await repo.add_message(db, sess.id, "user", s.prompt)
            await repo.add_message(db, sess.id, "assistant", reply, token_usage=usage or None, model=s.model)
            now = datetime.datetime.now(datetime.UTC)
            s.last_run = now
            s.next_run = now + datetime.timedelta(hours=s.interval_hours)
            s.last_session_id = sess.id
            await db.commit()
    _run(_impl())


@celery_app.task(name="genai.tasks.jobs.run_due_schedules_task")
def run_due_schedules_task():
    async def _impl():
        async with task_session() as db:
            now = datetime.datetime.now(datetime.UTC)
            due = (await db.execute(
                select(ScheduledPrompt.id).where(ScheduledPrompt.enabled.is_(True), ScheduledPrompt.next_run <= now)
            )).scalars().all()
        for sid in due:
            run_scheduled_prompt_task.delay(sid)
    _run(_impl())


# ── Scheduled: roll up per-user daily usage (time-series) ─────────────────────
@celery_app.task(name="genai.tasks.jobs.aggregate_daily_stats_task")
def aggregate_daily_stats_task():
    async def _impl():
        async with task_session() as db:
            now = datetime.datetime.now(datetime.UTC)
            day = now.replace(hour=0, minute=0, second=0, microsecond=0)
            rows = (await db.execute(
                select(Session.user_id, Message.token_usage, Message.latency_ms)
                .join(Session, Session.id == Message.session_id)
                .where(Message.role == "assistant", Message.created_at >= day)
            )).all()
            agg: dict = {}
            for uid, usage, latency in rows:
                a = agg.setdefault(uid, {"messages": 0, "tokens": 0, "cost": 0.0, "lat": 0, "lat_n": 0})
                a["messages"] += 1
                a["tokens"] += (usage or {}).get("total_tokens", 0)
                a["cost"] += cost_usd(usage)
                if latency:
                    a["lat"] += latency
                    a["lat_n"] += 1
            for uid, a in agg.items():
                await db.execute(sa_delete(DailyStat).where(DailyStat.user_id == uid, DailyStat.day == day))
                db.add(DailyStat(user_id=uid, day=day, messages=a["messages"], total_tokens=a["tokens"],
                                 cost_usd=round(a["cost"], 6),
                                 avg_latency_ms=round(a["lat"] / a["lat_n"]) if a["lat_n"] else 0))
            await db.commit()
    _run(_impl())


# ── Scheduled: purge expired/revoked access tokens past retention ─────────────
@celery_app.task(name="genai.tasks.jobs.cleanup_tokens_task")
def cleanup_tokens_task():
    async def _impl():
        from genai.services import pat
        async with task_session() as db:
            removed = await pat.purge_expired(db)
            if removed:
                logger.info("Purged %d expired/revoked access token(s)", removed)
    _run(_impl())


# ── Scheduled: backfill missing memory embeddings ─────────────────────────────
@celery_app.task(name="genai.tasks.jobs.backfill_embeddings_task")
def backfill_embeddings_task():
    async def _impl():
        if not embeddings.available():
            return
        async with task_session() as db:
            rows = (await db.execute(
                select(Memory.id, Memory.content).where(Memory.embedding.is_(None)).limit(50)
            )).all()
            for mid, content in rows:
                vec = await embeddings.embed(content)
                if vec:
                    await db.execute(update(Memory).where(Memory.id == mid).values(embedding=vec))
            await db.commit()
    _run(_impl())


# convenience for create_memory usage elsewhere
__all__ = ["celery_app", "extract_memory_task", "embed_memory_task", "add_to_memory_task",
           "generate_title_task", "ingest_document_task", "ingest_document_inline",
           "backfill_embeddings_task", "create_memory"]
