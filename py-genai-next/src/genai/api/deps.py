"""FastAPI dependencies: DB session and the authenticated user.

Two auth surfaces:
- ``current_user`` accepts either a login JWT or a Personal Access Token (PAT).
- ``login_user`` accepts a login JWT only — used to guard sensitive actions
  (managing tokens, editing the profile) so a leaked PAT can't entrench itself.
"""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.core.db import get_db
from genai.core.security import decode_token
from genai.domain.models import User
from genai.repositories import to_uuid
from genai.services import pat

_bearer = HTTPBearer(auto_error=True, description="Login JWT or a genai_pat_ personal access token")


async def _user_from_jwt(token: str, db: AsyncSession) -> User | None:
    payload = decode_token(token)
    user_id = to_uuid(payload.get("sub")) if payload else None
    if not user_id:
        return None
    return (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = creds.credentials
    if token.startswith(pat.PREFIX):
        ip = request.client.host if request.client else None
        user = await pat.resolve(db, token, ip)
    else:
        user = await _user_from_jwt(token, db)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user


async def login_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Reject personal access tokens — this action needs an interactive login."""
    if creds.credentials.startswith(pat.PREFIX):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This action requires an interactive login, not a personal access token")
    user = await _user_from_jwt(creds.credentials, db)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


async def user_from_token(token: str, db: AsyncSession) -> User | None:
    """Auth for WebSocket connections (token passed as a query param). Accepts a
    login JWT or a PAT."""
    if token.startswith(pat.PREFIX):
        return await pat.resolve(db, token)
    return await _user_from_jwt(token, db)
