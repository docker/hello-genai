"""Realtime chat over WebSockets.

The client sends a ChatIn JSON frame; the server streams event frames back
(start/token/tool/notice/done/error). Each event is also published to a Redis
channel for the session so other connected clients/devices stay in sync.
"""
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from genai.api.deps import user_from_token
from genai.core.db import SessionLocal
from genai.core.redis import publish, session_channel
from genai.domain.schemas import ChatIn
from genai.services.chat import stream_chat

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/chat")
async def ws_chat(ws: WebSocket, token: str = ""):
    async with SessionLocal() as db:
        user = await user_from_token(token, db)
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                payload = ChatIn(**json.loads(raw))
            except (ValidationError, json.JSONDecodeError) as e:
                await ws.send_text(json.dumps({"error": f"Invalid request: {e}"}))
                continue

            channel = None
            async with SessionLocal() as db:
                async for event in stream_chat(db, user, payload):
                    frame = json.dumps(event)
                    await ws.send_text(frame)
                    if event.get("start") and event.get("session_id"):
                        channel = session_channel(event["session_id"])
                    if channel:
                        await publish(channel, frame)
    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected")
    except Exception:
        logger.exception("WebSocket chat error")
        try:
            await ws.send_text(json.dumps({"error": "Server error"}))
        except Exception:
            pass
