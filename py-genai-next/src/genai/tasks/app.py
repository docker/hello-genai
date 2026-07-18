"""Celery application."""
from celery import Celery

from genai.core.config import settings

celery_app = Celery(
    "genai",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["genai.tasks.jobs"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_track_started=True,
    task_time_limit=300,
    worker_max_tasks_per_child=200,
    task_default_queue="default",
    # Memory work (extraction, embedding, user "remember this", backfill) runs on a
    # dedicated `memory` queue served by its own worker; everything else stays on
    # `default`. This isolates the LLM/embedding-heavy memory pipeline.
    task_routes={
        "genai.tasks.jobs.extract_memory_task": {"queue": "memory"},
        "genai.tasks.jobs.embed_memory_task": {"queue": "memory"},
        "genai.tasks.jobs.add_to_memory_task": {"queue": "memory"},
        "genai.tasks.jobs.backfill_embeddings_task": {"queue": "memory"},
    },
    beat_schedule={
        # Example scheduled job: re-embed any memories missing a vector every 10 min
        "backfill-memory-embeddings": {
            "task": "genai.tasks.jobs.backfill_embeddings_task",
            "schedule": 600.0,
        },
        # Purge expired/revoked access tokens past the retention window, daily
        "cleanup-access-tokens": {
            "task": "genai.tasks.jobs.cleanup_tokens_task",
            "schedule": 86400.0,
        },
        # Run any scheduled prompts that are due, every 10 minutes
        "run-due-schedules": {
            "task": "genai.tasks.jobs.run_due_schedules_task",
            "schedule": 600.0,
        },
        # Roll up per-user daily usage for time-series analytics, hourly
        "aggregate-daily-stats": {
            "task": "genai.tasks.jobs.aggregate_daily_stats_task",
            "schedule": 3600.0,
        },
    },
)
