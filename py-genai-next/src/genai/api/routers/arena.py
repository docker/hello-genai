"""B10 — blind model arena: vote on anonymised replies, then see a leaderboard."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.api.deps import current_user
from genai.core.db import get_db
from genai.domain.models import ArenaVote, User

router = APIRouter(prefix="/api/arena", tags=["Arena"])


class VoteIn(BaseModel):
    winner: str = Field(max_length=200)
    loser: str = Field(max_length=200)
    tie: bool = False
    prompt: str | None = Field(default=None, max_length=4000)


@router.post("/vote", status_code=201, summary="Record a blind head-to-head result")
async def vote(body: VoteIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.winner == body.loser:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "winner and loser must differ")
    v = ArenaVote(user_id=user.id, winner=body.winner, loser=body.loser,
                  tie=body.tie, prompt=(body.prompt or "")[:4000] or None)
    db.add(v)
    await db.commit()
    return {"ok": True}


@router.get("/leaderboard", summary="Personal model leaderboard from arena votes")
async def leaderboard(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Win rate per model across every head-to-head this user has voted on.

    A tie counts as half a win to both sides — the standard convention, and it keeps
    a model that draws constantly from looking identical to one that always loses.
    """
    rows = (await db.execute(
        select(ArenaVote.winner, ArenaVote.loser, ArenaVote.tie)
        .where(ArenaVote.user_id == user.id)
    )).all()

    stats: dict[str, dict] = {}
    def slot(m: str) -> dict:
        return stats.setdefault(m, {"model": m, "wins": 0, "losses": 0, "ties": 0, "matches": 0})

    for winner, loser, tie in rows:
        w, l = slot(winner), slot(loser)
        w["matches"] += 1
        l["matches"] += 1
        if tie:
            w["ties"] += 1
            l["ties"] += 1
        else:
            w["wins"] += 1
            l["losses"] += 1

    out = []
    for s in stats.values():
        score = s["wins"] + 0.5 * s["ties"]
        s["win_rate"] = round(score / s["matches"], 4) if s["matches"] else 0.0
        out.append(s)
    # Most-played first among equals, so a 1-0 model does not outrank a 20-5 one.
    out.sort(key=lambda s: (-s["win_rate"], -s["matches"]))
    return {"results": out, "total_votes": len(rows)}
