"""Admin panel — global overview and user management (admin-only)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.api.deps import admin_user
from genai.core.db import get_db
from genai.domain.models import Message, Session, User

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/overview")
async def overview(admin: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active = (await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))).scalar() or 0
    sessions = (await db.execute(select(func.count(Session.id)))).scalar() or 0
    messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0
    tokens = 0
    for (usage,) in (await db.execute(
        select(Message.token_usage).where(Message.role == "assistant", Message.token_usage.isnot(None))
    )).all():
        tokens += (usage or {}).get("total_tokens", 0)
    return {"users": users, "active_users": active, "sessions": sessions,
            "messages": messages, "total_tokens": tokens}


@router.get("/users")
async def list_users(admin: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    users = (await db.execute(select(User).order_by(User.created_at))).scalars().all()
    counts = dict((await db.execute(
        select(Session.user_id, func.count(Message.id))
        .join(Message, Message.session_id == Session.id).group_by(Session.user_id)
    )).all())
    return [{
        "id": str(u.id), "email": u.email, "display_name": u.display_name,
        "is_admin": u.is_admin, "is_active": u.is_active,
        "messages": counts.get(u.id, 0),
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users]


async def _get(db, user_id) -> User:
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "User not found")
    return u


@router.post("/users/{user_id}/admin")
async def set_admin(user_id: str, body: dict, admin: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    u = await _get(db, user_id)
    u.is_admin = bool(body.get("is_admin"))
    await db.commit()
    return {"ok": True, "is_admin": u.is_admin}


@router.post("/users/{user_id}/active")
async def set_active(user_id: str, body: dict, admin: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    u = await _get(db, user_id)
    if u.id == admin.id:
        raise HTTPException(400, "You can't deactivate yourself")
    u.is_active = bool(body.get("is_active"))
    await db.commit()
    return {"ok": True, "is_active": u.is_active}
