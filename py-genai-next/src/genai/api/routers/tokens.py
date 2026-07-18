"""Personal Access Tokens — create / list / revoke.

All routes require an interactive login (``login_user``): a PAT cannot mint or
revoke tokens. The plaintext token is returned exactly once, at creation.
"""
import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from genai.api.deps import login_user
from genai.core.config import settings
from genai.core.db import get_db
from genai.core.redis import redis_client
from genai.domain.models import AccessToken, User
from genai.domain.schemas import AccessTokenOut, TokenCreatedOut, TokenGenerateIn
from genai.services import pat

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/user/tokens", tags=["Access Tokens"])


def _out(tok: AccessToken, now: datetime.datetime | None = None) -> dict:
    return {
        "id": tok.id, "name": tok.name, "token_hint": tok.token_hint,
        "status": pat.status_of(tok, now), "created_at": tok.created_at,
        "expires_at": tok.expires_at, "last_used_at": tok.last_used_at,
    }


async def _rate_limit(user_id) -> None:
    """Light per-user throttle on token creation (best-effort; ignores Redis errors)."""
    try:
        key = f"pat:rate:{user_id}:{datetime.datetime.now(datetime.UTC):%Y%m%d%H%M}"
        n = await redis_client.incr(key)
        if n == 1:
            await redis_client.expire(key, 60)
        if n > settings.PAT_RATE_PER_MINUTE:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many tokens created — try again in a minute")
    except HTTPException:
        raise
    except Exception:
        logger.debug("PAT rate-limit check skipped (redis unavailable)", exc_info=True)


@router.post("", response_model=TokenCreatedOut, status_code=201,
             summary="Generate a personal access token (plaintext returned once)")
async def create_token(body: TokenGenerateIn, user: User = Depends(login_user), db: AsyncSession = Depends(get_db)):
    await _rate_limit(user.id)
    try:
        tok, plaintext = await pat.create(db, user, body.name, body.expires_in_days)
    except ValueError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    return {**_out(tok), "token": plaintext}


@router.get("", response_model=list[AccessTokenOut], summary="List your access tokens (no secrets)")
async def list_tokens(user: User = Depends(login_user), db: AsyncSession = Depends(get_db)):
    now = datetime.datetime.now(datetime.UTC)
    return [_out(t, now) for t in await pat.list_for(db, user.id)]


@router.patch("/{token_id}", response_model=AccessTokenOut, summary="Rename or revoke a token")
async def update_token(token_id: int, body: dict, user: User = Depends(login_user), db: AsyncSession = Depends(get_db)):
    if body.get("name") is not None:
        await pat.rename(db, user.id, token_id, str(body["name"]))
    if body.get("revoked") is True:
        await pat.revoke(db, user.id, token_id)
    tok = next((t for t in await pat.list_for(db, user.id) if t.id == token_id), None)
    if not tok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return _out(tok)


@router.post("/{token_id}/revoke", summary="Revoke a token (keeps the row for audit)")
async def revoke_token(token_id: int, user: User = Depends(login_user), db: AsyncSession = Depends(get_db)):
    if not await pat.revoke(db, user.id, token_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found or already revoked")
    return {"ok": True}


@router.delete("/{token_id}", summary="Permanently delete a token (removes it from storage)")
async def delete_token(token_id: int, user: User = Depends(login_user), db: AsyncSession = Depends(get_db)):
    if not await pat.delete_token(db, user.id, token_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    return {"deleted": True}


@router.delete("", summary="Delete all of your tokens")
async def delete_all_tokens(user: User = Depends(login_user), db: AsyncSession = Depends(get_db)):
    toks = await pat.list_for(db, user.id)
    for t in toks:
        await pat.delete_token(db, user.id, t.id)
    return {"deleted": len(toks)}
