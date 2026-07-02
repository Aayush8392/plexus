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
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

import backend.state as state
from backend.routes.cv import router as cv_router
from backend.routes.data import router as data_router
from backend.routes.jd import router as jd_router
from backend.services.vectoriser import RoleVectoriser

load_dotenv()

app = FastAPI(title="Plexus API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class CacheControlMiddleware(BaseHTTPMiddleware):
    """
    Vite hashes /assets/*.js and /assets/*.css per build, so those are safe
    to cache forever. index.html (and the SPA fallback for client routes)
    is not hashed — without an explicit no-cache header, browsers/CDN can
    hold a stale copy after a redeploy, which then references the PREVIOUS
    build's now-deleted hashed asset filenames and fails silently until a
    hard refresh forces revalidation.
    """
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response


app.add_middleware(CacheControlMiddleware)


@app.on_event("startup")
def _startup():
    state.OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./output")
    state.vectoriser = RoleVectoriser(state.OUTPUT_DIR)
    print(f"[plexus] vectoriser ready — {len(state.vectoriser._node_ids)} nodes")


app.include_router(cv_router)
app.include_router(data_router)
app.include_router(jd_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "nodes": len(state.vectoriser._node_ids) if state.vectoriser else 0,
    }


# Static files — mounted last so API routes take priority.
# In production (Vercel), FastAPI handles all requests; this serves the
# built frontend. html=True enables SPA fallback to index.html.
_static_dir = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "dist",
)
if os.path.isdir(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
