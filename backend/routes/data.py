"""
GET /data/{filename}
Serves the four static JSON outputs. Allowlist prevents arbitrary file reads.
"""

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

import backend.state as state

router = APIRouter()

ALLOWED = {
    "plexus_overview_layout.json",
    "plexus_pathfinder.json",
    "plexus_drawer_data.json",
    "plexus_graph.json",
}


@router.get("/data/{filename}")
def serve_json(filename: str):
    if filename not in ALLOWED:
        raise HTTPException(status_code=404, detail="File not found")

    path = os.path.join(state.OUTPUT_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"{filename} not found in output directory")

    return FileResponse(path, media_type="application/json")
