"""add user avatar

Revision ID: a1b2c3d4e5f6
Revises: df05b9621f0a
Create Date: 2026-07-05 20:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | None = 'df05b9621f0a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar')
