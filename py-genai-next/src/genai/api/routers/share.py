"""Public read-only conversation sharing via an unguessable token."""
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import Session, User

router = APIRouter(prefix="/api", tags=["Sharing"])


@router.post("/sessions/{session_id}/share", summary="Create/return a public share link")
async def share(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await repo.get_session(db, user.id, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    if not s.share_token:
        s.share_token = "shr_" + secrets.token_urlsafe(16)
        await db.commit()
    return {"share_token": s.share_token}


@router.delete("/sessions/{session_id}/share", summary="Disable sharing")
async def unshare(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await repo.get_session(db, user.id, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    s.share_token = None
    await db.commit()
    return {"ok": True}


@router.get("/shared/{token}", summary="Public read-only view of a shared conversation")
async def view_shared(token: str, db: AsyncSession = Depends(get_db)):
    s = (await db.execute(select(Session).where(Session.share_token == token))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "This shared link is not available")
    msgs = await repo.active_messages(db, s.id)
    return {
        "title": s.title,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "messages": [{"role": m["role"], "content": m["content"], "model": m.get("model")} for m in msgs],
    }
