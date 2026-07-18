"""Chat over Server-Sent Events (SSE) and a non-streaming variant."""
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import User
from genai.domain.schemas import ChatIn
from genai.services.chat import stream_chat

router = APIRouter(prefix="/api", tags=["Chat"])


@router.post("/chat/stream")
async def chat_stream(body: ChatIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    async def gen():
        async for event in stream_chat(db, user, body):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/chat")
async def chat(body: ChatIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    parts, usage, model, msg_id = [], {}, None, None
    async for event in stream_chat(db, user, body):
        if "token" in event:
            parts.append(event["token"])
        if event.get("done"):
            usage, model, msg_id = event.get("usage", {}), event.get("model"), event.get("message_id")
    return {"response": "".join(parts), "usage": usage, "model": model, "message_id": msg_id}
