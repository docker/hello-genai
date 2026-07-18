"""Registration, login (JWT), and current-user."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.api.deps import current_user, login_user
from genai.core.config import settings
from genai.core.db import get_db
from genai.core.security import create_access_token, hash_password, verify_password
from genai.domain.models import User
from genai.domain.schemas import LoginIn, PasswordChange, ProfileUpdate, RegisterIn, TokenOut, UserOut
from genai.repositories import seed_defaults

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
    if not settings.ALLOW_REGISTRATION:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is disabled")
    exists = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=body.email.lower(), hashed_password=hash_password(body.password),
                display_name=body.display_name, is_admin=body.email.lower() in settings.admin_email_set)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await seed_defaults(db, user.id)
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return user


@router.post("/change-password", summary="Change your password (interactive login required)")
async def change_password(body: PasswordChange, user: User = Depends(login_user),
                          db: AsyncSession = Depends(get_db)):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


@router.patch("/me", response_model=UserOut)
async def update_profile(body: ProfileUpdate, user: User = Depends(login_user),
                         db: AsyncSession = Depends(get_db)):
    if body.display_name is not None:
        user.display_name = body.display_name.strip()[:80] or None
    if body.avatar is not None:
        user.avatar = body.avatar or None
    if body.custom_instructions is not None:
        user.custom_instructions = body.custom_instructions.strip()[:4000] or None
    if body.custom_about is not None:
        user.custom_about = body.custom_about.strip()[:2000] or None
    if body.memory_enabled is not None:
        user.memory_enabled = body.memory_enabled
    if body.memory_max_items is not None:
        user.memory_max_items = body.memory_max_items
    if body.memory_recall_k is not None:
        user.memory_recall_k = body.memory_recall_k
    if body.memory_per_message is not None:
        user.memory_per_message = body.memory_per_message
    if body.memory_prompt is not None:  # empty string resets to the default prompt
        user.memory_prompt = body.memory_prompt.strip()[:4000] or None
    if body.ui_prefs is not None:  # validated closed set — stored whole
        user.ui_prefs = body.ui_prefs.model_dump()
    await db.commit()
    await db.refresh(user)
    return user
