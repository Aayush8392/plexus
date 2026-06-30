"""
POST /jd/classify
Takes raw job description text.
Returns predicted stratum + top matching roles.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import backend.state as state

router = APIRouter()


class JdRequest(BaseModel):
    text: str


class JdRole(BaseModel):
    node_id: str
    label: str
    cosine: float


class JdResponse(BaseModel):
    top_roles: list[JdRole]
    predicted_stratum: str | None
    matched_skills: list[str]


@router.post("/jd/classify", response_model=JdResponse)
def jd_classify(body: JdRequest):
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="text is empty")

    if state.vectoriser is None:
        raise HTTPException(status_code=503, detail="Vectoriser not loaded")

    result = state.vectoriser.classify_jd(body.text)
    return JdResponse(
        top_roles=[JdRole(**r) for r in result["top_roles"]],
        predicted_stratum=result["predicted_stratum"],
        matched_skills=result["matched_skills"],
    )
