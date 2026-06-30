"""Shared mutable state — avoids circular imports between main and routes."""

from backend.services.vectoriser import RoleVectoriser

vectoriser: RoleVectoriser | None = None
OUTPUT_DIR: str = "./output"
