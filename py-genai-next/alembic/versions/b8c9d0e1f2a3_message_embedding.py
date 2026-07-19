"""Message embeddings for semantic search (B16).

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
"""
import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

from genai.core.config import settings

revision: str = "b8c9d0e1f2a3"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("embedding", Vector(settings.EMBED_DIM), nullable=True))
    # Partial index: only rows that actually have a vector are searchable, which
    # keeps the index small while most historical messages are still un-embedded.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_messages_embedding "
        "ON messages USING hnsw (embedding vector_cosine_ops) "
        "WHERE embedding IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_messages_embedding")
    op.drop_column("messages", "embedding")
