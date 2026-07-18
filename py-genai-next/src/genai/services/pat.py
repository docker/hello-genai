"""Personal Access Tokens: opaque, hash-at-rest, DB-backed lifecycle.

A token looks like ``genai_pat_<43 url-safe chars>``. Only its SHA-256 hash
(peppered) is stored; the plaintext is returned once at creation. Validation,
the active-token limit, expiry and revocation are all enforced against the DB.
"""
import datetime
import hashlib
import hmac
import secrets

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from genai.core.config import settings
from genai.domain.models import AccessToken, User

PREFIX = "genai_pat_"
_TOUCH_THROTTLE = datetime.timedelta(seconds=60)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def hash_token(plaintext: str) -> str:
    """Peppered SHA-256. Fast (per-request) and fine for a high-entropy secret."""
    return hashlib.sha256((plaintext + settings.PAT_PEPPER).encode("utf-8")).hexdigest()


def generate() -> tuple[str, str, str]:
    """Return (plaintext, display_hint, token_hash)."""
    plaintext = PREFIX + secrets.token_urlsafe(32)
    hint = f"{plaintext[:14]}…{plaintext[-4:]}"
    return plaintext, hint, hash_token(plaintext)


def status_of(tok: AccessToken, now: datetime.datetime | None = None) -> str:
    now = now or _now()
    if tok.revoked_at is not None:
        return "revoked"
    if tok.expires_at <= now:
        return "expired"
    return "active"


def clamp_expiry_days(days: int | None) -> int:
    if not days or days < 1:
        return settings.PAT_DEFAULT_EXPIRY_DAYS
    return min(days, settings.PAT_MAX_EXPIRY_DAYS)


def _lock_key(user_id) -> int:
    # Stable signed 64-bit key for a per-user Postgres advisory lock.
    return int.from_bytes(hashlib.blake2b(str(user_id).encode(), digest_size=8).digest(), "big", signed=True)


async def active_count(db: AsyncSession, user_id) -> int:
    return (await db.execute(
        select(func.count(AccessToken.id)).where(
            AccessToken.user_id == user_id,
            AccessToken.revoked_at.is_(None),
            AccessToken.expires_at > _now(),
        )
    )).scalar() or 0


async def create(db: AsyncSession, user: User, name: str, expires_in_days: int | None) -> tuple[AccessToken, str]:
    """Create a token, enforcing the per-user active limit under an advisory lock
    (so two concurrent requests can't both slip past the cap). Raises ValueError
    when the limit is reached."""
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _lock_key(user.id)})
    if await active_count(db, user.id) >= settings.PAT_MAX_ACTIVE:
        raise ValueError(f"Token limit reached (max {settings.PAT_MAX_ACTIVE} active)")

    plaintext, hint, token_hash = generate()
    days = clamp_expiry_days(expires_in_days)
    tok = AccessToken(
        user_id=user.id, name=(name or "Access token").strip()[:80] or "Access token",
        token_hint=hint, token_hash=token_hash,
        expires_at=_now() + datetime.timedelta(days=days),
    )
    db.add(tok)
    await db.commit()
    await db.refresh(tok)
    return tok, plaintext


async def list_for(db: AsyncSession, user_id) -> list[AccessToken]:
    return list((await db.execute(
        select(AccessToken).where(AccessToken.user_id == user_id).order_by(AccessToken.id.desc())
    )).scalars().all())


async def rename(db: AsyncSession, user_id, token_id: int, name: str) -> bool:
    tok = (await db.execute(
        select(AccessToken).where(AccessToken.id == token_id, AccessToken.user_id == user_id)
    )).scalar_one_or_none()
    if not tok:
        return False
    tok.name = (name or "").strip()[:80] or tok.name
    await db.commit()
    return True


async def delete_token(db: AsyncSession, user_id, token_id: int) -> bool:
    """Hard-delete a token row (irreversible; removes it from storage)."""
    res = await db.execute(
        delete(AccessToken).where(AccessToken.id == token_id, AccessToken.user_id == user_id)
    )
    await db.commit()
    return (res.rowcount or 0) > 0


async def revoke(db: AsyncSession, user_id, token_id: int) -> bool:
    tok = (await db.execute(
        select(AccessToken).where(AccessToken.id == token_id, AccessToken.user_id == user_id)
    )).scalar_one_or_none()
    if not tok or tok.revoked_at is not None:
        return False
    tok.revoked_at = _now()
    await db.commit()
    return True


async def revoke_all(db: AsyncSession, user_id) -> int:
    toks = (await db.execute(
        select(AccessToken).where(AccessToken.user_id == user_id, AccessToken.revoked_at.is_(None))
    )).scalars().all()
    now = _now()
    for t in toks:
        t.revoked_at = now
    await db.commit()
    return len(toks)


async def resolve(db: AsyncSession, plaintext: str, ip: str | None = None) -> User | None:
    """Validate a presented PAT and return its owner, or None. Touches last-used
    (throttled) so we don't write on every single request."""
    if not plaintext.startswith(PREFIX):
        return None
    token_hash = hash_token(plaintext)
    tok = (await db.execute(select(AccessToken).where(AccessToken.token_hash == token_hash))).scalar_one_or_none()
    if not tok:
        return None
    now = _now()
    # constant-time compare as belt-and-suspenders against hash-string leaks
    if not hmac.compare_digest(tok.token_hash, token_hash):
        return None
    if tok.revoked_at is not None or tok.expires_at <= now:
        return None
    user = (await db.execute(select(User).where(User.id == tok.user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        return None
    if tok.last_used_at is None or (now - tok.last_used_at) > _TOUCH_THROTTLE:
        tok.last_used_at = now
        tok.last_used_ip = (ip or "")[:64] or None
        await db.commit()
    return user


async def purge_expired(db: AsyncSession) -> int:
    """Hard-delete tokens whose expiry or revocation is older than the retention
    window. Expired-but-recent rows are kept (shown as EXPIRED) for audit."""
    cutoff = _now() - datetime.timedelta(days=settings.PAT_RETENTION_DAYS)
    res = await db.execute(
        delete(AccessToken).where(or_(
            AccessToken.expires_at < cutoff,
            AccessToken.revoked_at < cutoff,
        ))
    )
    await db.commit()
    return res.rowcount or 0
