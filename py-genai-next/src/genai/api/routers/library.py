"""Presets and slash-command templates."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import Preset, Template, User
from genai.domain.schemas import PresetIn, PresetOut, TemplateIn, TemplateOut

router = APIRouter(prefix="/api", tags=["Library"])


@router.get("/presets", response_model=list[PresetOut])
async def list_presets(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.list_presets(db, user.id)


@router.post("/presets", response_model=PresetOut, status_code=201)
async def create_preset(body: PresetIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = Preset(user_id=user.id, name=body.name[:80], text=body.text[:2000])
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Preset).where(Preset.id == preset_id, Preset.user_id == user.id))
    await db.commit()
    return {"ok": True}


@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await repo.list_templates(db, user.id)


@router.post("/templates", response_model=TemplateOut, status_code=201)
async def create_template(body: TemplateIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    trigger = body.trigger.strip().lstrip("/").replace(" ", "-").lower()
    if not trigger or not body.content:
        raise HTTPException(400, "trigger and content are required")
    t = Template(user_id=user.id, trigger=trigger, title=(body.title or trigger)[:80], content=body.content[:2000])
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/templates/{template_id}")
async def delete_template(template_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Template).where(Template.id == template_id, Template.user_id == user.id))
    await db.commit()
    return {"ok": True}
