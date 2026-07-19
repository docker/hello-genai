"""Async data-access layer (repositories) shared by the API, WS, tasks, and CLI."""
import datetime
import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from genai.domain.models import (
    DailyStat,
    Document,
    DocumentChunk,
    Memory,
    Message,
    Preset,
    Project,
    Session,
    Template,
)

# ── Sessions ──────────────────────────────────────────────────────────────────

async def list_sessions(db: AsyncSession, user_id, project_id=None) -> list[Session]:
    stmt = select(Session).where(Session.user_id == user_id)
    if project_id is not None:
        stmt = stmt.where(Session.project_id == project_id)
    stmt = stmt.order_by(Session.pinned.desc(), Session.updated_at.desc())
    return list((await db.execute(stmt)).scalars().all())


async def get_session(db: AsyncSession, user_id, session_id) -> Session | None:
    return (await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )).scalar_one_or_none()


async def create_session(db: AsyncSession, user_id, **kw) -> Session:
    s = Session(user_id=user_id, **kw)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


async def update_session(db: AsyncSession, session: Session, **kw) -> Session:
    for k, v in kw.items():
        if v is not None:
            setattr(session, k, v)
    await db.commit()
    await db.refresh(session)
    return session


async def delete_session(db: AsyncSession, session: Session) -> None:
    await db.delete(session)
    await db.commit()


# ── Messages (with branching) ─────────────────────────────────────────────────

async def active_messages(db: AsyncSession, session_id) -> list[dict]:
    rows = (await db.execute(
        select(Message).where(Message.session_id == session_id, Message.active.is_(True)).order_by(Message.id)
    )).scalars().all()
    sibs = (await db.execute(
        select(Message.parent_id, func.count().label("c"))
        .where(Message.session_id == session_id, Message.role == "assistant", Message.parent_id.isnot(None))
        .group_by(Message.parent_id)
    )).all()
    counts = dict(sibs)
    out = []
    for m in rows:
        d = {c.name: getattr(m, c.name) for c in Message.__table__.columns}
        if m.role == "assistant" and m.parent_id is not None:
            d["branch_count"] = counts.get(m.parent_id, 1)
        out.append(d)
    return out


async def history_before(db: AsyncSession, session_id, message_id) -> list[dict]:
    return [m for m in await active_messages(db, session_id) if m["id"] < message_id]


async def add_message(db: AsyncSession, session_id, role, content, *, token_usage=None,
                      complete=True, model=None, parent_id=None, latency_ms=None, images=None) -> Message:
    if role == "assistant" and parent_id is not None:
        await db.execute(update(Message).where(
            Message.parent_id == parent_id, Message.role == "assistant"
        ).values(active=False))
    m = Message(session_id=session_id, role=role, content=content, token_usage=token_usage,
                complete=complete, model=model, parent_id=parent_id, active=True, latency_ms=latency_ms,
                images=images or None)
    db.add(m)
    await db.execute(update(Session).where(Session.id == session_id).values(updated_at=func.now()))
    await db.commit()
    await db.refresh(m)
    return m


async def set_feedback(db: AsyncSession, message_id, feedback) -> None:
    await db.execute(update(Message).where(Message.id == message_id).values(feedback=feedback))
    await db.commit()


async def toggle_bookmark(db: AsyncSession, message_id) -> bool:
    m = (await db.execute(select(Message).where(Message.id == message_id))).scalar_one_or_none()
    if not m:
        return False
    m.bookmarked = not m.bookmarked
    await db.commit()
    return m.bookmarked


async def cycle_branch(db: AsyncSession, message_id, direction) -> bool:
    m = (await db.execute(select(Message).where(Message.id == message_id))).scalar_one_or_none()
    if not m or m.parent_id is None:
        return False
    sibs = list((await db.execute(
        select(Message.id).where(Message.parent_id == m.parent_id, Message.role == "assistant").order_by(Message.id)
    )).scalars().all())
    if message_id not in sibs or len(sibs) < 2:
        return False
    idx = (sibs.index(message_id) + (1 if direction == "next" else -1)) % len(sibs)
    await db.execute(update(Message).where(Message.parent_id == m.parent_id, Message.role == "assistant").values(active=False))
    await db.execute(update(Message).where(Message.id == sibs[idx]).values(active=True))
    await db.commit()
    return True


async def delete_messages_from(db: AsyncSession, session_id, message_id) -> None:
    await db.execute(delete(Message).where(Message.session_id == session_id, Message.id >= message_id))
    await db.commit()


async def delete_turn(db: AsyncSession, session_id, message_id) -> None:
    """Delete a single user message and every assistant reply parented to it."""
    await db.execute(delete(Message).where(Message.session_id == session_id, Message.parent_id == message_id))
    await db.execute(delete(Message).where(Message.session_id == session_id, Message.id == message_id))
    await db.commit()


async def edit_message(db: AsyncSession, user_id, message_id, content) -> bool:
    m = (await db.execute(
        select(Message).join(Session, Session.id == Message.session_id)
        .where(Message.id == message_id, Session.user_id == user_id)
    )).scalar_one_or_none()
    if not m:
        return False
    m.content = content
    await db.commit()
    return True


async def list_bookmarks(db: AsyncSession, user_id) -> list[dict]:
    rows = (await db.execute(
        select(Message.id, Message.session_id, Message.role, Message.content, Message.created_at, Session.title)
        .join(Session, Session.id == Message.session_id)
        .where(Session.user_id == user_id, Message.bookmarked.is_(True))
        .order_by(Message.id.desc())
    )).all()
    return [{"id": r.id, "session_id": r.session_id, "role": r.role, "content": r.content,
             "created_at": r.created_at, "session_title": r.title} for r in rows]


# ── Projects ──────────────────────────────────────────────────────────────────

async def list_projects(db: AsyncSession, user_id) -> list[dict]:
    rows = (await db.execute(
        select(Project, func.count(Session.id))
        .outerjoin(Session, Session.project_id == Project.id)
        .where(Project.user_id == user_id).group_by(Project.id).order_by(Project.name)
    )).all()
    out = []
    for proj, cnt in rows:
        d = {c.name: getattr(proj, c.name) for c in Project.__table__.columns}
        d["session_count"] = cnt
        out.append(d)
    return out


async def get_project(db: AsyncSession, user_id, project_id) -> Project | None:
    return (await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )).scalar_one_or_none()


# ── Documents ─────────────────────────────────────────────────────────────────

async def list_documents(db: AsyncSession, user_id, project_id=None) -> list[dict]:
    stmt = (
        select(Document, func.count(DocumentChunk.id))
        .outerjoin(DocumentChunk, DocumentChunk.document_id == Document.id)
        .where(Document.user_id == user_id)
    )
    if project_id is not None:
        stmt = stmt.where(Document.project_id == project_id)
    stmt = stmt.group_by(Document.id).order_by(Document.id.desc())
    rows = (await db.execute(stmt)).all()
    out = []
    for doc, cnt in rows:
        d = {c.name: getattr(doc, c.name) for c in Document.__table__.columns}
        d["chunk_count"] = cnt
        out.append(d)
    return out


async def has_documents(db: AsyncSession, user_id, project_id=None) -> bool:
    stmt = select(func.count(Document.id)).where(Document.user_id == user_id)
    if project_id is not None:
        stmt = stmt.where(Document.project_id == project_id)
    return ((await db.execute(stmt)).scalar() or 0) > 0


# ── Memories ──────────────────────────────────────────────────────────────────

async def list_memories(db: AsyncSession, user_id) -> list[Memory]:
    return list((await db.execute(
        select(Memory).where(Memory.user_id == user_id).order_by(Memory.id)
    )).scalars().all())


async def create_memory(db: AsyncSession, user_id, content, project_id=None, embedding=None) -> Memory:
    content = content.strip()
    existing = (await db.execute(
        select(Memory).where(Memory.user_id == user_id, func.lower(Memory.content) == content.lower())
    )).scalar_one_or_none()
    if existing:
        return existing
    m = Memory(user_id=user_id, content=content, project_id=project_id, embedding=embedding)
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return m


# ── Presets & templates ───────────────────────────────────────────────────────

async def list_presets(db: AsyncSession, user_id) -> list[Preset]:
    return list((await db.execute(
        select(Preset).where(Preset.user_id == user_id).order_by(func.lower(Preset.name))
    )).scalars().all())


async def list_templates(db: AsyncSession, user_id) -> list[Template]:
    return list((await db.execute(
        select(Template).where(Template.user_id == user_id).order_by(Template.trigger)
    )).scalars().all())


DEFAULT_TEMPLATES = [
    ("summarize", "Summarize", "Summarize the following clearly and concisely:\n\n"),
    ("explain", "Explain simply", "Explain the following in simple terms:\n\n"),
    ("improve", "Improve writing", "Improve the writing below for clarity and tone:\n\n"),
    ("code-review", "Review code", "Review the following code for bugs and best practices:\n\n"),
    ("translate", "Translate", "Translate the following into English:\n\n"),
]


async def seed_defaults(db: AsyncSession, user_id) -> None:
    """Seed default slash-command templates for a new user."""
    for trig, title, content in DEFAULT_TEMPLATES:
        db.add(Template(user_id=user_id, trigger=trig, title=title, content=content))
    await db.commit()


async def get_stats(db: AsyncSession, user_id) -> dict:
    total_sessions = (await db.execute(
        select(func.count(Session.id)).where(Session.user_id == user_id))).scalar() or 0
    from genai.services.cost import cost_usd
    rows = (await db.execute(
        select(Message.token_usage, Message.model, Message.feedback, Message.latency_ms)
        .join(Session, Session.id == Message.session_id)
        .where(Session.user_id == user_id, Message.role == "assistant")
    )).all()
    prompt = completion = total = 0
    total_cost = 0.0
    by_model: dict = {}
    for usage, model, feedback, latency in rows:
        model = model or "unknown"
        m = by_model.setdefault(model, {"model": model, "messages": 0, "prompt_tokens": 0,
                                        "completion_tokens": 0, "total_tokens": 0, "up": 0, "down": 0,
                                        "cost_usd": 0.0, "_lat_sum": 0, "_lat_n": 0})
        m["messages"] += 1
        if feedback == "up":
            m["up"] += 1
        elif feedback == "down":
            m["down"] += 1
        if latency:
            m["_lat_sum"] += latency
            m["_lat_n"] += 1
        if usage:
            pt, ct, tt = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), usage.get("total_tokens", 0)
            prompt += pt
            completion += ct
            total += tt
            c = cost_usd(usage)
            total_cost += c
            m["prompt_tokens"] += pt
            m["completion_tokens"] += ct
            m["total_tokens"] += tt
            m["cost_usd"] += c
    for m in by_model.values():
        m["avg_latency_ms"] = round(m["_lat_sum"] / m["_lat_n"]) if m["_lat_n"] else 0
        m.pop("_lat_sum")
        m.pop("_lat_n")
    total_messages = (await db.execute(
        select(func.count(Message.id)).join(Session, Session.id == Message.session_id)
        .where(Session.user_id == user_id))).scalar() or 0
    return {
        "total_sessions": total_sessions, "total_messages": total_messages,
        "prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": total,
        "cost_usd": round(total_cost, 4),
        "by_model": sorted(by_model.values(), key=lambda x: -x["total_tokens"]),
    }


async def timeseries(db: AsyncSession, user_id, days: int = 30) -> list[dict]:
    since = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=days)
    rows = (await db.execute(
        select(DailyStat).where(DailyStat.user_id == user_id, DailyStat.day >= since).order_by(DailyStat.day)
    )).scalars().all()
    return [{"day": r.day.date().isoformat(), "messages": r.messages, "total_tokens": r.total_tokens,
             "cost_usd": round(r.cost_usd, 4), "avg_latency_ms": r.avg_latency_ms} for r in rows]


async def live_metrics(db: AsyncSession, user_id) -> dict:
    """Live snapshot: memory-creation activity + per-model performance."""
    now = datetime.datetime.now(datetime.UTC)
    hour_ago = now - datetime.timedelta(hours=1)
    day_ago = now - datetime.timedelta(days=1)

    async def _count(*conds):
        return (await db.execute(select(func.count(Memory.id)).where(Memory.user_id == user_id, *conds))).scalar() or 0

    total_mem = await _count()
    mem_hour = await _count(Memory.created_at >= hour_ago)
    mem_day = await _count(Memory.created_at >= day_ago)
    embedded = await _count(Memory.embedding.isnot(None))
    recent_rows = (await db.execute(
        select(Memory.content, Memory.created_at).where(Memory.user_id == user_id)
        .order_by(Memory.id.desc()).limit(6)
    )).all()

    msgs_hour = (await db.execute(
        select(func.count(Message.id)).join(Session, Session.id == Message.session_id)
        .where(Session.user_id == user_id, Message.role == "assistant", Message.created_at >= hour_ago)
    )).scalar() or 0

    stats = await get_stats(db, user_id)
    for m in stats["by_model"]:
        m["avg_tokens"] = round(m["total_tokens"] / m["messages"]) if m["messages"] else 0

    return {
        "timestamp": now.isoformat(),
        "memory": {
            "total": total_mem, "embedded": embedded, "last_hour": mem_hour, "last_24h": mem_day,
            "recent": [{"content": c, "created_at": ts.isoformat() if ts else None} for c, ts in recent_rows],
        },
        "activity": {"assistant_messages_last_hour": msgs_hour},
        "by_model": stats["by_model"],
        "totals": {"total_tokens": stats["total_tokens"], "total_messages": stats["total_messages"],
                   "total_sessions": stats["total_sessions"]},
    }


# Measured against mxbai-embed-large: genuine topical matches score ~0.60–0.69
# ("authentication" -> a JWT/password message = 0.69), while a nonsense query
# still reaches ~0.36–0.46 against unrelated rows. 0.55 sits in that gap, so an
# unrelated search returns nothing instead of the least-bad row in the table.
SEMANTIC_FLOOR = 0.55


async def semantic_search_messages(db: AsyncSession, user_id, vector, limit: int = 20,
                                   min_similarity: float = SEMANTIC_FLOOR) -> list[dict]:
    """B16 — meaning-based search over message embeddings (pgvector).

    Complements rather than replaces the ILIKE search: keyword wins for exact
    strings and identifiers, this wins for "where did I discuss auth". Anything
    below `min_similarity` is dropped so an unrelated query returns nothing
    instead of the least-bad row in the table.
    """
    dist = Message.embedding.cosine_distance(vector).label("dist")
    rows = (await db.execute(
        select(Message.id, Message.session_id, Message.role, Message.content, Session.title, dist)
        .join(Session, Session.id == Message.session_id)
        .where(Session.user_id == user_id, Message.embedding.is_not(None))
        .order_by(dist).limit(limit)
    )).all()
    out = []
    for r in rows:
        similarity = 1.0 - float(r.dist)
        if similarity < min_similarity:
            continue
        content = r.content or ""
        out.append({"id": r.id, "session_id": str(r.session_id), "role": r.role,
                    "session_title": r.title, "similarity": round(similarity, 4),
                    "snippet": content[:200] + ("…" if len(content) > 200 else "")})
    return out


async def related_sessions(db: AsyncSession, user_id, session_id, limit: int = 5,
                           min_similarity: float = 0.4) -> list[dict]:
    """B17 — conversations that are semantically close to this one.

    A session is represented by the average of its message vectors (a cheap
    centroid), then compared against every *other* session's centroid. Sessions
    with no embedded messages yet are simply absent rather than mis-ranked.
    """
    centroid = (await db.execute(
        select(func.avg(Message.embedding))
        .where(Message.session_id == session_id, Message.embedding.is_not(None))
    )).scalar()
    if centroid is None:
        return []

    dist = func.avg(Message.embedding).cosine_distance(centroid).label("dist")
    rows = (await db.execute(
        select(Session.id, Session.title, dist)
        .join(Message, Message.session_id == Session.id)
        .where(Session.user_id == user_id, Session.id != session_id, Message.embedding.is_not(None))
        .group_by(Session.id, Session.title)
        .order_by(dist).limit(limit)
    )).all()
    out = []
    for r in rows:
        similarity = 1.0 - float(r.dist)
        if similarity < min_similarity:
            continue
        out.append({"id": str(r.id), "title": r.title, "similarity": round(similarity, 4)})
    return out


async def search_messages(db: AsyncSession, user_id, query: str, limit: int = 30) -> list[dict]:
    q = query.strip()
    if not q:
        return []
    rows = (await db.execute(
        select(Message.id, Message.session_id, Message.role, Message.content, Session.title)
        .join(Session, Session.id == Message.session_id)
        .where(Session.user_id == user_id, Message.content.ilike(f"%{q}%"))
        .order_by(Message.id.desc()).limit(limit)
    )).all()
    results = []
    for r in rows:
        idx = r.content.lower().find(q.lower())
        start = max(0, idx - 40)
        snippet = ("… " if start else "") + r.content[start:idx + len(q) + 60]
        snippet = snippet.replace(r.content[idx:idx + len(q)], f"[MARK]{r.content[idx:idx + len(q)]}[/MARK]", 1)
        results.append({"message_id": r.id, "session_id": r.session_id, "role": r.role,
                        "title": r.title, "snippet": snippet})
    return results


def to_uuid(value) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None
