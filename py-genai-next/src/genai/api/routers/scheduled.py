"""Scheduled / recurring prompts — run automatically by a Celery beat job."""
import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import ScheduledPrompt, User

router = APIRouter(prefix="/api/schedules", tags=["Scheduled prompts"])


def _now():
    return datetime.datetime.now(datetime.UTC)


def _out(s: ScheduledPrompt) -> dict:
    return {"id": s.id, "name": s.name, "prompt": s.prompt, "model": s.model,
            "interval_hours": s.interval_hours, "enabled": s.enabled,
            "next_run": s.next_run.isoformat() if s.next_run else None,
            "last_run": s.last_run.isoformat() if s.last_run else None,
            "last_session_id": str(s.last_session_id) if s.last_session_id else None}


@router.get("")
async def list_schedules(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(ScheduledPrompt).where(ScheduledPrompt.user_id == user.id).order_by(ScheduledPrompt.id.desc())
    )).scalars().all()
    return [_out(s) for s in rows]


@router.post("", status_code=201)
async def create_schedule(body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not str(body.get("prompt", "")).strip():
        raise HTTPException(400, "prompt is required")
    interval = max(1, int(body.get("interval_hours") or 24))
    s = ScheduledPrompt(
        user_id=user.id, name=str(body.get("name") or "Scheduled prompt")[:120],
        prompt=str(body["prompt"])[:4000], model=body.get("model"),
        interval_hours=interval, enabled=bool(body.get("enabled", True)),
        next_run=_now() + datetime.timedelta(hours=interval),
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _out(s)


async def _owned(db, user, sid) -> ScheduledPrompt:
    s = (await db.execute(
        select(ScheduledPrompt).where(ScheduledPrompt.id == sid, ScheduledPrompt.user_id == user.id)
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Schedule not found")
    return s


@router.patch("/{sid}")
async def patch_schedule(sid: int, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(db, user, sid)
    for k in ("name", "prompt", "model", "enabled"):
        if k in body and body[k] is not None:
            setattr(s, k, body[k])
    if body.get("interval_hours"):
        s.interval_hours = max(1, int(body["interval_hours"]))
    await db.commit()
    return _out(s)


@router.delete("/{sid}")
async def delete_schedule(sid: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, user, sid))
    await db.commit()
    return {"ok": True}


@router.post("/{sid}/run", summary="Run this scheduled prompt now")
async def run_now(sid: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(db, user, sid)
    from genai.tasks import run_scheduled_prompt_task
    run_scheduled_prompt_task.delay(s.id)
    return {"queued": True}
