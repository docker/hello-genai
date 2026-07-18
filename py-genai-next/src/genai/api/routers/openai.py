"""OpenAI-compatible API: point any OpenAI SDK / tool at this server, authenticated
with a genai_pat_ personal access token (or a login JWT).

    POST /v1/chat/completions      (stream + non-stream)
    GET  /v1/models
"""
import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from genai.api.deps import current_user
from genai.core.config import settings
from genai.domain.models import User
from genai.services.llm import call_llm_raw, client, stream_llm

router = APIRouter(prefix="/v1", tags=["OpenAI-compatible"])


@router.get("/models")
async def list_models(user: User = Depends(current_user)):
    try:
        resp = await client().get(f"{settings.LLAMA_URL}/models")
        resp.raise_for_status()
        data = resp.json().get("data", [])
    except Exception:
        data = [{"id": m} for m in [settings.LLAMA_MODEL, *settings.AVAILABLE_MODELS.split(",")] if m]
    return {"object": "list", "data": [
        {"id": m.get("id") if isinstance(m, dict) else m, "object": "model", "owned_by": "genai"} for m in data
    ]}


@router.post("/chat/completions")
async def chat_completions(body: dict, user: User = Depends(current_user)):
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise HTTPException(400, "messages is required")
    model = body.get("model") or settings.LLAMA_MODEL
    temperature = body.get("temperature")
    max_tokens = body.get("max_tokens")
    rid = "chatcmpl-" + uuid.uuid4().hex[:24]
    created = int(time.time())

    if body.get("stream"):
        async def gen():
            async for chunk in stream_llm(messages, model=model, temperature=temperature, max_tokens=max_tokens):
                delta = ((chunk.get("choices") or [{}])[0].get("delta") or {})
                content = delta.get("content")
                if content:
                    out = {"id": rid, "object": "chat.completion.chunk", "created": created, "model": model,
                           "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}]}
                    yield f"data: {json.dumps(out)}\n\n"
            done = {"id": rid, "object": "chat.completion.chunk", "created": created, "model": model,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
            yield f"data: {json.dumps(done)}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    result = await call_llm_raw(messages, model=model, temperature=temperature, max_tokens=max_tokens)
    msg = result["message"]
    return {
        "id": rid, "object": "chat.completion", "created": created, "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": msg.get("content") or ""},
                     "finish_reason": "stop"}],
        "usage": result.get("usage", {}),
    }
