"""
Plexus FastAPI backend — Phase 2.

Run from the repo root:
    uvicorn backend.main:app --reload --port 8000

Environment variables (set in shell or .env):
    OUTPUT_DIR   path to pipeline output/ folder   default: ./output
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import backend.state as state
from backend.routes.cv import router as cv_router
from backend.routes.data import router as data_router
from backend.routes.jd import router as jd_router
from backend.services.vectoriser import RoleVectoriser

load_dotenv()

app = FastAPI(title="Plexus API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.on_event("startup")
def _startup():
    state.OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./output")
    state.vectoriser = RoleVectoriser(state.OUTPUT_DIR)
    print(f"[plexus] vectoriser ready — {len(state.vectoriser._node_ids)} nodes, output: {state.OUTPUT_DIR}")


app.include_router(cv_router)
app.include_router(data_router)
app.include_router(jd_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "nodes": len(state.vectoriser._node_ids) if state.vectoriser else 0,
    }
