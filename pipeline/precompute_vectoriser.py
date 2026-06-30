"""
Pre-compute TF-IDF vectoriser state for deployment.

Run from repo root:
    python pipeline/precompute_vectoriser.py

Reads:  output/employer_tagged.parquet  (local only, gitignored)
Writes: backend/vectoriser_state.json   (committable, ~1-2 MB)
"""

import json
import os
import re

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(REPO_ROOT, "output")
STATE_PATH = os.path.join(REPO_ROOT, "backend", "vectoriser_state.json")
LAYOUT_PATH = os.path.join(OUTPUT_DIR, "plexus_overview_layout.json")


def slugify(role: str, stratum: str) -> str:
    slug = role.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug).strip("_")
    return f"{slug}_{stratum}"


def main():
    print("Loading employer_tagged.parquet ...")
    df = pd.read_parquet(os.path.join(OUTPUT_DIR, "employer_tagged.parquet"))
    df = df[
        df["employer_type"].isin(["services", "gcc"])
        & df["role"].notna()
        & (df["role"] != "unclassified")
    ].copy()

    df["node_id"] = df.apply(lambda r: slugify(r["role"], r["employer_type"]), axis=1)

    docs = df.groupby("node_id")["normalised_skills"].apply(
        lambda g: "|".join(
            str(s)
            for cell in g
            if cell is not None and hasattr(cell, "__iter__") and not isinstance(cell, str)
            for s in cell
        )
    )
    docs = docs[docs.str.len() > 0]
    print(f"  {len(docs)} nodes with skill documents")

    print("Fitting TF-IDF ...")
    vectorizer = TfidfVectorizer(
        tokenizer=lambda x: x.split("|"),
        token_pattern=None,
        min_df=2,
        sublinear_tf=True,
    )
    matrix = vectorizer.fit_transform(docs.values)
    print(f"  vocabulary: {len(vectorizer.vocabulary_)} terms")

    print("Loading node labels from overview layout ...")
    with open(LAYOUT_PATH, encoding="utf-8") as f:
        layout = json.load(f)
    node_labels = {n["id"]: n["label"] for n in layout.get("nodes", [])}

    state = {
        "vocabulary": vectorizer.vocabulary_,
        "idf": vectorizer.idf_.tolist(),
        "node_ids": docs.index.tolist(),
        "node_matrix": matrix.toarray().tolist(),
        "node_labels": node_labels,
    }

    print(f"Writing {STATE_PATH} ...")
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, separators=(",", ":"))

    size_kb = os.path.getsize(STATE_PATH) / 1024
    print(f"Done. {len(docs)} nodes · {len(vectorizer.vocabulary_)} terms · {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
