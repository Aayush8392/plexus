"""
POST /cv/snap
Takes a list of skill strings extracted by the browser CV parser.
Returns nodes ranked by true TF-IDF cosine (all stratified nodes, non-zero only).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import backend.state as state

router = APIRouter()


class SnapRequest(BaseModel):
    skills: list[str]


class SnapResult(BaseModel):
    node_id: str
    label: str
    cosine: float


class SnapResponse(BaseModel):
    results: list[SnapResult]
    skill_count: int


@router.post("/cv/snap", response_model=SnapResponse)
def cv_snap(body: SnapRequest):
    if not body.skills:
        raise HTTPException(status_code=422, detail="skills list is empty")

    if state.vectoriser is None:
        raise HTTPException(status_code=503, detail="Vectoriser not loaded")

    ranked = state.vectoriser.snap(body.skills)
    return SnapResponse(
        results=[SnapResult(**r) for r in ranked],
        skill_count=len(body.skills),
    )
