"""per-user memory settings

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-06 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd4e5f6a7b8c9'
down_revision: str | None = 'c3d4e5f6a7b8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('memory_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('users', sa.Column('memory_max_items', sa.Integer(), nullable=False, server_default='100'))
    op.add_column('users', sa.Column('memory_recall_k', sa.Integer(), nullable=False, server_default='8'))
    op.add_column('users', sa.Column('memory_per_message', sa.Integer(), nullable=False, server_default='3'))


def downgrade() -> None:
    op.drop_column('users', 'memory_per_message')
    op.drop_column('users', 'memory_recall_k')
    op.drop_column('users', 'memory_max_items')
    op.drop_column('users', 'memory_enabled')
