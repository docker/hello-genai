"""FastAPI application factory."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from genai.api.routers import (
    admin,
    arena,
    auth,
    avatars,
    chat,
    data,
    documents,
    library,
    memories,
    misc,
    models,
    openai,
    projects,
    scheduled,
    sessions,
    share,
    tokens,
)
from genai.core.config import settings
from genai.core.db import init_db
from genai.core.logging import configure_logging
from genai.services.llm import aclose
from genai.ws import chat as ws_chat

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # Postgres may still be starting in compose — retry the schema bootstrap
    for attempt in range(30):
        try:
            await init_db()
            logger.info("Database ready")
            break
        except Exception as e:
            logger.warning("DB not ready (%s); retry %d/30", e, attempt + 1)
            await asyncio.sleep(2)
    yield
    await aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        version="0.1.0",
        description="Modern async backend for local LLM chat — FastAPI · Postgres · Redis · Celery.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for module in (auth, sessions, projects, documents, memories, library, models, misc, chat, data,
                   tokens, share, scheduled, admin, openai, avatars, arena):
        app.include_router(module.router)
    app.include_router(misc.health_router)
    app.include_router(ws_chat.router)

    @app.get("/", tags=["System"])
    async def root():
        return {"app": settings.APP_NAME, "docs": "/docs", "health": "/health"}

    return app


app = create_app()
