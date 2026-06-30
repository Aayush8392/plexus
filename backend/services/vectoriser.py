"""
Loads the stratified TF-IDF corpus from employer_tagged.parquet and
plexus_overview_layout.json on startup. Exposes snap(skills) for the
/cv/snap endpoint.

Same vectoriser parameters as Module 05 (sublinear_tf, pipe tokeniser,
min_df=2) so cosines are comparable to the graph edges.
"""

import json
import os

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class RoleVectoriser:
    def __init__(self, output_dir: str):
        self._output_dir = output_dir
        self._vectorizer: TfidfVectorizer | None = None
        self._node_matrix = None
        self._node_ids: list[str] = []
        self._node_labels: dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        df = pd.read_parquet(os.path.join(self._output_dir, "employer_tagged.parquet"))

        # Keep only rows with a valid employer_type and classified role
        df = df[
            df["employer_type"].isin(["services", "gcc"])
            & df["role"].notna()
            & (df["role"] != "unclassified")
        ].copy()

        # Build slugified node_id matching the graph JSON keys
        def _slugify(role: str, stratum: str) -> str:
            import re
            slug = role.lower().strip()
            slug = re.sub(r"[^a-z0-9]+", "_", slug).strip("_")
            return f"{slug}_{stratum}"

        df["node_id"] = df.apply(lambda r: _slugify(r["role"], r["employer_type"]), axis=1)

        # Build one pipe-joined skill document per node (mirrors Module 05)
        # normalised_skills cells are numpy arrays from parquet — handle both list and ndarray
        def _join_skills(group):
            parts = []
            for cell in group["normalised_skills"]:
                if cell is not None and hasattr(cell, "__iter__") and not isinstance(cell, str):
                    parts.extend(str(s) for s in cell)
            return "|".join(parts)

        docs = df.groupby("node_id")["normalised_skills"].apply(
            lambda g: "|".join(
                str(s)
                for cell in g
                if cell is not None and hasattr(cell, "__iter__") and not isinstance(cell, str)
                for s in cell
            )
        )
        # Drop nodes that produced empty documents
        docs = docs[docs.str.len() > 0]

        self._vectorizer = TfidfVectorizer(
            tokenizer=lambda x: x.split("|"),
            token_pattern=None,
            min_df=2,
            sublinear_tf=True,
        )
        self._node_matrix = self._vectorizer.fit_transform(docs.values)
        self._node_ids = docs.index.tolist()

        # Load display labels from overview layout
        layout_path = os.path.join(self._output_dir, "plexus_overview_layout.json")
        with open(layout_path, encoding="utf-8") as f:
            layout = json.load(f)
        self._node_labels = {n["id"]: n["label"] for n in layout.get("nodes", [])}

    def classify_jd(self, text: str) -> dict:
        """
        Extracts known skill terms from raw JD text, snaps against all nodes,
        and predicts stratum from the top results.

        Returns:
          { top_roles: [{node_id, label, cosine, stratum}],
            predicted_stratum: "services"|"gcc"|"mixed",
            matched_skills: [str] }
        """
        if not text.strip() or self._vectorizer is None:
            return {"top_roles": [], "predicted_stratum": None, "matched_skills": []}

        import re as _re
        # Build lowercase vocab lookup (vocab keys are pipe-split skill tokens)
        vocab_lower = {k.lower(): k for k in self._vectorizer.vocabulary_}
        text_lower = text.lower()

        # Word-boundary match only; skip terms shorter than 3 chars to avoid noise
        found = [
            original for lower, original in vocab_lower.items()
            if len(lower) >= 3 and _re.search(r'\b' + _re.escape(lower) + r'\b', text_lower)
        ]
        if not found:
            return {"top_roles": [], "predicted_stratum": None, "matched_skills": []}

        ranked = self.snap(found)
        top = ranked[:10]

        # Predict stratum by majority vote among top 5
        svc_count = sum(1 for r in top[:5] if r["node_id"].endswith("_services"))
        gcc_count = sum(1 for r in top[:5] if r["node_id"].endswith("_gcc"))
        if svc_count > gcc_count:
            predicted_stratum = "services"
        elif gcc_count > svc_count:
            predicted_stratum = "gcc"
        else:
            predicted_stratum = "mixed"

        return {
            "top_roles": top[:5],
            "predicted_stratum": predicted_stratum,
            "matched_skills": found[:20],
        }

    def snap(self, skills: list[str]) -> list[dict]:
        """
        Returns all nodes with a non-zero cosine to the given skill list,
        sorted descending by score.

        Each entry: { node_id, label, cosine }
        """
        if not skills or self._vectorizer is None:
            return []

        cv_doc = "|".join(skills)
        cv_vec = self._vectorizer.transform([cv_doc])
        scores = cosine_similarity(cv_vec, self._node_matrix)[0]

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
