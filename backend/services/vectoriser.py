"""
Loads TF-IDF vectoriser state and exposes snap() / classify_jd().

Load order:
  1. backend/vectoriser_state.json  — pre-computed, used in production (Vercel)
  2. output/employer_tagged.parquet — fitted at startup, used in local dev

Run pipeline/precompute_vectoriser.py once to generate vectoriser_state.json.
"""

import json
import os
from typing import Optional

import numpy as np

_STATE_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "vectoriser_state.json")
)


class RoleVectoriser:
    def __init__(self, output_dir: str):
        self._output_dir = output_dir
        self._vocabulary: dict = {}
        self._idf: Optional[np.ndarray] = None
        self._node_matrix: Optional[np.ndarray] = None
        self._node_ids: list = []
        self._node_labels: dict = {}
        self._load()

    # ── Loaders ───────────────────────────────────────────────────────────────

    def _load(self) -> None:
        if os.path.exists(_STATE_PATH):
            print(f"[vectoriser] loading pre-computed state from {_STATE_PATH}")
            self._load_from_state(_STATE_PATH)
        else:
            print("[vectoriser] vectoriser_state.json not found — fitting from parquet")
            self._load_from_parquet()

    def _load_from_state(self, path: str) -> None:
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
        self._vocabulary = state["vocabulary"]
        self._vocab_lower = {k.lower(): v for k, v in self._vocabulary.items()}
        self._idf = np.array(state["idf"], dtype=np.float64)
        self._node_ids = state["node_ids"]
        self._node_matrix = np.array(state["node_matrix"], dtype=np.float64)
        self._node_labels = state["node_labels"]
        print(f"[vectoriser] ready — {len(self._node_ids)} nodes, {len(self._vocabulary)} terms")

    def _build_vocab_lower(self) -> None:
        self._vocab_lower = {k.lower(): v for k, v in self._vocabulary.items()}

    def _load_from_parquet(self) -> None:
        import re

        import pandas as pd
        from sklearn.feature_extraction.text import TfidfVectorizer

        df = pd.read_parquet(os.path.join(self._output_dir, "employer_tagged.parquet"))
        df = df[
            df["employer_type"].isin(["services", "gcc"])
            & df["role"].notna()
            & (df["role"] != "unclassified")
        ].copy()

        def _slugify(role: str, stratum: str) -> str:
            slug = role.lower().strip()
            slug = re.sub(r"[^a-z0-9]+", "_", slug).strip("_")
            return f"{slug}_{stratum}"

        df["node_id"] = df.apply(lambda r: _slugify(r["role"], r["employer_type"]), axis=1)

        docs = df.groupby("node_id")["normalised_skills"].apply(
            lambda g: "|".join(
                str(s)
                for cell in g
                if cell is not None and hasattr(cell, "__iter__") and not isinstance(cell, str)
                for s in cell
            )
        )
        docs = docs[docs.str.len() > 0]

        vectorizer = TfidfVectorizer(
            tokenizer=lambda x: x.split("|"),
            token_pattern=None,
            min_df=2,
            sublinear_tf=True,
        )
        matrix = vectorizer.fit_transform(docs.values)

        self._vocabulary = vectorizer.vocabulary_
        self._build_vocab_lower()
        self._idf = vectorizer.idf_
        self._node_ids = docs.index.tolist()
        self._node_matrix = matrix.toarray()

        layout_path = os.path.join(self._output_dir, "plexus_overview_layout.json")
        with open(layout_path, encoding="utf-8") as f:
            layout = json.load(f)
        self._node_labels = {n["id"]: n["label"] for n in layout.get("nodes", [])}
        print(f"[vectoriser] ready — {len(self._node_ids)} nodes, {len(self._vocabulary)} terms")

    # ── Query ─────────────────────────────────────────────────────────────────

    def _query_vector(self, skills: list) -> np.ndarray:
        """Build a sublinear-TF, IDF-weighted, L2-normalised query vector.
        Lookup is case-insensitive so browser Title Case matches pipeline casing."""
        vec = np.zeros(len(self._vocabulary), dtype=np.float64)
        counts: dict = {}
        for s in skills:
            counts[s.lower()] = counts.get(s.lower(), 0) + 1
        for term_lower, count in counts.items():
            idx = self._vocab_lower.get(term_lower)
            if idx is not None:
                vec[idx] = (1.0 + np.log(count)) * self._idf[idx]
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    # ── Public API ────────────────────────────────────────────────────────────

    def snap(self, skills: list) -> list:
        """
        Returns all nodes with non-zero cosine to the skill list,
        sorted descending. Each entry: { node_id, label, cosine }.
        """
        if not skills or self._node_matrix is None:
            return []
        cv_vec = self._query_vector(skills)
        scores = self._node_matrix @ cv_vec
        results = [
            {
                "node_id": self._node_ids[i],
                "label": self._node_labels.get(self._node_ids[i], self._node_ids[i]),
                "cosine": round(float(scores[i]), 4),
            }
            for i in range(len(self._node_ids))
            if scores[i] > 0
        ]
        results.sort(key=lambda x: x["cosine"], reverse=True)
        return results

    def classify_jd(self, text: str) -> dict:
        """
        Word-boundary skill extraction from raw JD text → TF-IDF snap →
        predicted stratum + top 5 roles.

        Returns:
          { top_roles: [{node_id, label, cosine}],
            predicted_stratum: "services"|"gcc"|"mixed",
            matched_skills: [str] }
        """
        if not text.strip() or self._node_matrix is None:
            return {"top_roles": [], "predicted_stratum": None, "matched_skills": []}

        import re as _re

        vocab_lower = {k.lower(): k for k in self._vocabulary}
        text_lower = text.lower()

        found = [
            original
            for lower, original in vocab_lower.items()
            if len(lower) >= 3
            and _re.search(r"\b" + _re.escape(lower) + r"\b", text_lower)
        ]
        if not found:
            return {"top_roles": [], "predicted_stratum": None, "matched_skills": []}

        ranked = self.snap(found)
        top = ranked[:10]

        svc = sum(1 for r in top[:5] if r["node_id"].endswith("_services"))
        gcc = sum(1 for r in top[:5] if r["node_id"].endswith("_gcc"))
        if svc > gcc:
            predicted_stratum = "services"
        elif gcc > svc:
            predicted_stratum = "gcc"
        else:
            predicted_stratum = "mixed"

        return {
            "top_roles": top[:5],
            "predicted_stratum": predicted_stratum,
            "matched_skills": found[:20],
        }
