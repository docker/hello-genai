"""Blind model arena votes (B10).

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
"""
import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "arena_votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), index=True),
        sa.Column("winner", sa.String(200), index=True),
        sa.Column("loser", sa.String(200), index=True),
        sa.Column("tie", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("arena_votes")
