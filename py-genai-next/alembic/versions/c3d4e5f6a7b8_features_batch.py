"""features batch: custom instructions, per-convo settings, sharing, latency,
admin, scheduled prompts, daily stats

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-06 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: str | None = 'b2c3d4e5f6a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # users: custom instructions + admin
    op.add_column('users', sa.Column('custom_instructions', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('custom_about', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), server_default=sa.text('false'), nullable=False))

    # sessions: per-conversation settings + share token
    op.add_column('sessions', sa.Column('temperature', sa.Float(), nullable=True))
    op.add_column('sessions', sa.Column('max_tokens', sa.Integer(), nullable=True))
    op.add_column('sessions', sa.Column('response_format', sa.String(length=20), nullable=True))
    op.add_column('sessions', sa.Column('share_token', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_sessions_share_token'), 'sessions', ['share_token'], unique=True)

    # messages: latency
    op.add_column('messages', sa.Column('latency_ms', sa.Integer(), nullable=True))

    # scheduled prompts
    op.create_table(
        'scheduled_prompts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('model', sa.String(length=200), nullable=True),
        sa.Column('interval_hours', sa.Integer(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('next_run', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_run', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_session_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_scheduled_prompts_user_id'), 'scheduled_prompts', ['user_id'], unique=False)
    op.create_index(op.f('ix_scheduled_prompts_next_run'), 'scheduled_prompts', ['next_run'], unique=False)

    # daily stats (time-series)
    op.create_table(
        'daily_stats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('day', sa.DateTime(timezone=True), nullable=False),
        sa.Column('messages', sa.Integer(), nullable=False),
        sa.Column('total_tokens', sa.Integer(), nullable=False),
        sa.Column('cost_usd', sa.Float(), nullable=False),
        sa.Column('avg_latency_ms', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_daily_stats_user_id'), 'daily_stats', ['user_id'], unique=False)
    op.create_index(op.f('ix_daily_stats_day'), 'daily_stats', ['day'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_daily_stats_day'), table_name='daily_stats')
    op.drop_index(op.f('ix_daily_stats_user_id'), table_name='daily_stats')
    op.drop_table('daily_stats')
    op.drop_index(op.f('ix_scheduled_prompts_next_run'), table_name='scheduled_prompts')
    op.drop_index(op.f('ix_scheduled_prompts_user_id'), table_name='scheduled_prompts')
    op.drop_table('scheduled_prompts')
    op.drop_column('messages', 'latency_ms')
    op.drop_index(op.f('ix_sessions_share_token'), table_name='sessions')
    op.drop_column('sessions', 'share_token')
    op.drop_column('sessions', 'response_format')
    op.drop_column('sessions', 'max_tokens')
    op.drop_column('sessions', 'temperature')
    op.drop_column('users', 'is_admin')
    op.drop_column('users', 'custom_about')
    op.drop_column('users', 'custom_instructions')
