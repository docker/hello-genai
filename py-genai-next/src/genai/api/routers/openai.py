"""OpenAI-compatible API: point any OpenAI SDK / tool at this server, authenticated
with a genai_pat_ personal access token (or a login JWT).

    POST /v1/chat/completions      (stream + non-stream)
    GET  /v1/models
    GET  /v1/models/{model}
    POST /v1/embeddings
"""
import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from genai.api.deps import current_user
from genai.core.config import settings
from genai.domain.models import User
from genai.services import embeddings as embed_svc
from genai.services.llm import call_llm_raw, client, stream_llm

router = APIRouter(prefix="/v1", tags=["OpenAI-compatible"])


async def _upstream_models() -> list[dict]:
    """Model list from the runner, falling back to configuration if it is down."""
    try:
        resp = await client().get(f"{settings.LLAMA_URL}/models")
        resp.raise_for_status()
        data = resp.json().get("data", [])
    except Exception:
        data = [{"id": m} for m in [settings.LLAMA_MODEL, *settings.AVAILABLE_MODELS.split(",")] if m]
    return [d if isinstance(d, dict) else {"id": d} for d in data]


def _model_obj(d: dict) -> dict:
    """Shape an upstream entry as an OpenAI `model` object, preserving extras."""
    out = {"id": d.get("id"), "object": "model", "owned_by": d.get("owned_by") or "genai"}
    if d.get("created"):
        out["created"] = d["created"]
    return out


@router.get("/models", summary="List models (OpenAI-compatible)")
async def list_models(user: User = Depends(current_user)):
    return {"object": "list", "data": [_model_obj(d) for d in await _upstream_models()]}


@router.get("/models/{model:path}", summary="Retrieve a single model (OpenAI-compatible)")
async def retrieve_model(model: str, user: User = Depends(current_user)):
    # `:path` because model ids legitimately contain slashes (e.g. "ai/gemma3").
    for d in await _upstream_models():
        if d.get("id") == model:
            return _model_obj(d)
    raise HTTPException(404, f"Model '{model}' not found")


@router.post("/embeddings", summary="Create embeddings (OpenAI-compatible)")
async def create_embeddings(body: dict, user: User = Depends(current_user)):
    """Exposes the same embedding backend that powers RAG and semantic memory."""
    if not embed_svc.available():
        raise HTTPException(503, "Embeddings are not configured (set EMBED_MODEL)")

    raw = body.get("input")
    if raw is None or raw == "" or raw == []:
        raise HTTPException(400, "input is required")
    # OpenAI accepts a string or an array of strings.
    texts = [raw] if isinstance(raw, str) else raw
    if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
        raise HTTPException(400, "input must be a string or an array of strings")
    if len(texts) > 256:
        raise HTTPException(400, "input is limited to 256 items per request")

    vectors = await embed_svc.embed_many(texts)
    if vectors is None:
        raise HTTPException(502, "Embedding backend request failed")

    # The runner does not report embedding token usage; report a stable estimate
    # rather than inventing exact counts.
    approx = sum(len(t) // 4 for t in texts)
    return {
        "object": "list",
        "model": body.get("model") or settings.EMBED_MODEL,
        "data": [{"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(vectors)],
        "usage": {"prompt_tokens": approx, "total_tokens": approx},
    }


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
