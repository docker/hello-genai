"""Shared async Redis client (cache, rate limiting, and pub/sub for realtime)."""
import redis.asyncio as aioredis

from genai.core.config import settings

redis_client: aioredis.Redis = aioredis.from_url(
    settings.REDIS_URL, encoding="utf-8", decode_responses=True
)

# Channel prefix for per-session realtime fan-out
CHANNEL_SESSION = "session:{session_id}"


def session_channel(session_id: str) -> str:
    return CHANNEL_SESSION.format(session_id=session_id)


async def publish(channel: str, message: str) -> None:
    await redis_client.publish(channel, message)
