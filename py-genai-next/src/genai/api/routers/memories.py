"""Persistent memory CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.config import settings
from genai.core.db import get_db
from genai.domain.models import Memory, User
from genai.domain.schemas import MemoryIn, MemoryOut

router = APIRouter(prefix="/api/memories", tags=["Memory"])


@router.get("", response_model=list[MemoryOut])
async def list_memories(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.list_memories(db, user.id)


@router.post("", response_model=MemoryOut, status_code=201)
async def add_memory(body: MemoryIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cap = user.memory_max_items or settings.MEMORY_MAX_ITEMS
    if len(await repo.list_memories(db, user.id)) >= cap:
        raise HTTPException(409, f"Memory is full (max {cap} items)")
    m = await repo.create_memory(db, user.id, body.content, body.project_id)
    try:
        from genai.tasks import embed_memory_task
        embed_memory_task.delay(m.id, m.content)
    except Exception:
        pass
    return m


@router.post("/remember", status_code=202)
async def remember(body: MemoryIn, user: User = Depends(current_user)):
    """Queue a user-selected snippet to be stored as memory on the dedicated
    memory worker (store + embed happen off the request path)."""
    from genai.tasks import add_to_memory_task
    add_to_memory_task.delay(str(user.id), body.content, body.project_id)
    return {"queued": True}


@router.patch("/{memory_id}")
async def patch_memory(memory_id: int, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    m = (await db.execute(select(Memory).where(Memory.id == memory_id, Memory.user_id == user.id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Memory not found")
    if body.get("content"):
        m.content = str(body["content"]).strip()[:300]
    if "enabled" in body:
        m.enabled = bool(body["enabled"])
    await db.commit()
    return {"ok": True}


@router.delete("/{memory_id}")
async def delete_memory(memory_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Memory).where(Memory.id == memory_id, Memory.user_id == user.id))
    await db.commit()
    return {"ok": True}


@router.delete("")
async def clear_memories(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(delete(Memory).where(Memory.user_id == user.id))
    await db.commit()
    return {"ok": True, "deleted": res.rowcount}
