"""
05_build_graph.py
Input:  ../output/employer_tagged.parquet
Output: ../output/plexus_graph.json
        ../output/plexus_overview_layout.json
        ../output/05_graph_preview.png
        ../output/05_build_graph_log.txt

Builds the stratified skill-overlap graph:
  - Role@Services and Role@GCC as separate nodes
  - TF-IDF cosine edges at GRAPH_THRESHOLD=0.20
  - Classical MDS 2D layout + minimum-distance nudge
  - Diagnostic PNG render

Run from: pipeline/ directory
"""

import ast
import os
import sys
import json
import re
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.manifold import MDS
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

assert os.path.basename(os.getcwd()) == "pipeline", \
    "Run from pipeline/ directory: python 05_build_graph.py"


# ── Tee ──────────────────────────────────────────────────────────────────────

class _Tee:
    def __init__(self, *streams):
        self.streams = streams
    def write(self, data):
        for s in self.streams:
            s.write(data)
            s.flush()
    def flush(self):
        for s in self.streams:
            s.flush()

_log = open("../output/05_build_graph_log.txt", "w", encoding="utf-8")
sys.stdout = _Tee(sys.__stdout__, _log)


# ── Constants ─────────────────────────────────────────────────────────────────

GRAPH_THRESHOLD  = 0.20
MIN_STRATUM      = 25
CANVAS_W         = 1200
CANVAS_H         = 800
PADDING          = 80
MIN_DIST         = 55       # px — minimum node separation after nudge
MAX_NUDGE_ITER   = 300
NODE_COUNT_RANGE = (31, 35) # soft warning bounds

# Fixed thresholds: (lower_bound_inclusive, bucket_label)
VOLUME_BUCKETS = [(1500, "v4"), (501, "v3"), (151, "v2"), (0, "v1")]
VOLUME_PX      = {"v1": 8,  "v2": 12,  "v3": 17,  "v4": 22}
VOLUME_MPL     = {"v1": 60, "v2": 130, "v3": 260, "v4": 450}


# ── Helpers ───────────────────────────────────────────────────────────────────

def slugify(text):
    """Lowercase, replace non-alphanumeric runs with underscore."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")

def assign_bucket(count):
    for threshold, label in VOLUME_BUCKETS:
        if count >= threshold:
            return label
    return "v1"

def rescale(arr, lo, hi):
    a, b = arr.min(), arr.max()
    if b - a < 1e-9:
        return np.full_like(arr, (lo + hi) / 2.0)
    return (arr - a) / (b - a) * (hi - lo) + lo


# ── Load ──────────────────────────────────────────────────────────────────────

print("=== Module 05: Build Graph ===\n")
df = pd.read_parquet("../output/employer_tagged.parquet")
print(f"Loaded: {len(df):,} rows")

df_graph = df[
    (df["role"] != "unclassified") &
    (df["employer_type"].isin(["services", "gcc"]))
].copy()
print(f"Classified + services/gcc rows: {len(df_graph):,}")


# ── Stratified nodes ──────────────────────────────────────────────────────────

print(f"\n--- Stratified nodes (MIN_STRATUM={MIN_STRATUM}) ---")
pair_counts = df_graph.groupby(["role", "employer_type"]).size()
valid_pairs  = pair_counts[pair_counts >= MIN_STRATUM]

nodes        = {}   # node_id → metadata dict
role_to_nodes = {}  # role_slug → {stratum: node_id}

for (role, stratum), count in valid_pairs.items():
    role_slug = slugify(role)
    node_id   = f"{role_slug}_{stratum}"
    nodes[node_id] = {
        "id":            node_id,
        "label":         role,
        "role":          role,
        "role_slug":     role_slug,
        "stratum":       stratum,
        "posting_count": int(count),
        "volume_bucket": assign_bucket(count),
    }
    role_to_nodes.setdefault(role_slug, {})[stratum] = node_id
    print(f"  {node_id:<45}  {count:>5} postings")

node_ids = sorted(nodes.keys())
n_nodes  = len(node_ids)
print(f"\nTotal nodes: {n_nodes}")

if not (NODE_COUNT_RANGE[0] <= n_nodes <= NODE_COUNT_RANGE[1]):
    print(f"WARNING: node count {n_nodes} outside expected range {NODE_COUNT_RANGE}")

# twin_id + has_gcc_twin
for node_id, meta in nodes.items():
    other_stratum      = "gcc" if meta["stratum"] == "services" else "services"
    twin_id            = role_to_nodes.get(meta["role_slug"], {}).get(other_stratum)
    meta["twin_id"]    = twin_id
    meta["has_gcc_twin"] = role_to_nodes.get(meta["role_slug"], {}).get("gcc") is not None


# ── TF-IDF corpus ─────────────────────────────────────────────────────────────

print("\n--- TF-IDF ---")

def extract_skills(cell):
    """Return a flat list of skill strings regardless of how parquet stored the column."""
    if isinstance(cell, list):
        return [s for s in cell if isinstance(s, str)]
    if isinstance(cell, np.ndarray):
        return [s for s in cell.tolist() if isinstance(s, str)]
    if isinstance(cell, str) and cell.startswith("["):
        try:
            parsed = ast.literal_eval(cell)
            return [s for s in parsed if isinstance(s, str)]
        except Exception:
            pass
    return []

# Build corpus as lists of skill tokens (preserves multi-word skills as single tokens)
corpus = []
for node_id in node_ids:
    meta   = nodes[node_id]
    subset = df_graph[
        (df_graph["role"] == meta["role"]) &
        (df_graph["employer_type"] == meta["stratum"])
    ]
    all_skills = []
    for cell in subset["normalised_skills"]:
        all_skills.extend(extract_skills(cell))
    corpus.append(all_skills)
    print(f"  {node_id:<45}  {len(all_skills):>6} skill tokens")

# analyzer=lambda x: x tells sklearn the corpus is already tokenized
vectorizer = TfidfVectorizer(
    analyzer=lambda x: x,
    min_df=2,
    norm="l2",
    sublinear_tf=True,
)
tfidf_matrix  = vectorizer.fit_transform(corpus)
feature_names = vectorizer.get_feature_names_out()
print(f"Vocabulary: {len(feature_names)} skills (min_df=2 across {n_nodes} role-documents)")
print(f"TF-IDF matrix: {tfidf_matrix.shape}")

# Top 5 skills per node by TF-IDF weight
dense = tfidf_matrix.toarray()
for i, node_id in enumerate(node_ids):
    row      = dense[i]
    top_idx  = row.argsort()[-5:][::-1]
    top_skills = [feature_names[j] for j in top_idx if row[j] > 0]
    nodes[node_id]["top_skills"] = top_skills


# ── Cosine similarity + edges ─────────────────────────────────────────────────

print("\n--- Cosine similarity ---")
cos_sim_full = cosine_similarity(tfidf_matrix)   # keep intact for distance matrix
dist_matrix  = 1.0 - cos_sim_full
np.fill_diagonal(dist_matrix, 0.0)               # MDS requires exact zero diagonal

cos_sim = cos_sim_full.copy()
np.fill_diagonal(cos_sim, 0.0)                   # zero self-similarity for edge loop

node_strata = [nodes[nid]["stratum"] for nid in node_ids]
edges = []

for i in range(n_nodes):
    for j in range(i + 1, n_nodes):
        w = float(cos_sim[i][j])
        if w >= GRAPH_THRESHOLD:
            edges.append({
                "source":           node_ids[i],
                "target":           node_ids[j],
                "cosine":           round(w, 4),
                "is_cross_stratum": node_strata[i] != node_strata[j],
            })

within = sum(1 for e in edges if not e["is_cross_stratum"])
cross  = sum(1 for e in edges if     e["is_cross_stratum"])
print(f"Edges at threshold={GRAPH_THRESHOLD}: {len(edges)}  (within={within}  cross={cross})")
print(f"Probe target: ~87 within-stratum")


# ── Structural integrity checks ───────────────────────────────────────────────

print("\n--- Structural checks ---")
connected = set()
for e in edges:
    connected.add(e["source"])
    connected.add(e["target"])
isolated = [nid for nid in node_ids if nid not in connected]

if isolated:
    print(f"NOTE: {len(isolated)} structurally isolated node(s) — flagged low_connectivity=True:")
    for nid in isolated:
        idx     = node_ids.index(nid)
        max_cos = max(float(cos_sim[idx][j]) for j in range(n_nodes) if j != idx)
        best_j  = int(np.argmax([cos_sim[idx][j] if j != idx else 0 for j in range(n_nodes)]))
        print(f"  {nid:<45}  max_cos={max_cos:.4f}  nearest={node_ids[best_j]}")
else:
    print(f"Zero isolated nodes ✓")

assert all(e["cosine"] >= GRAPH_THRESHOLD for e in edges)
print(f"All edges >= {GRAPH_THRESHOLD} ✓")

cosines = [e["cosine"] for e in edges]
print(f"Cosine range: {min(cosines):.4f} – {max(cosines):.4f}")

# Degree (all edges, including cross-stratum — used for glow intensity)
degree = {nid: 0 for nid in node_ids}
for e in edges:
    degree[e["source"]] += 1
    degree[e["target"]] += 1
for nid in node_ids:
    nodes[nid]["degree"] = degree[nid]

print("\nDegree per node:")
for nid in node_ids:
    nodes[nid]["low_connectivity"] = (nodes[nid]["degree"] == 0)
    flag = "  ← ISOLATED" if nodes[nid]["low_connectivity"] else ""
    print(f"  {nid:<45}  degree={nodes[nid]['degree']}{flag}")


# ── MDS layout ────────────────────────────────────────────────────────────────

print("\n--- MDS ---")
mds = MDS(
    n_components=2,
    dissimilarity="precomputed",
    random_state=42,
    n_init=4,
    max_iter=500,
    normalized_stress=False,
)
coords = mds.fit_transform(dist_matrix)
print(f"MDS stress: {mds.stress_:.4f}  (probe variance explained: 24.8%)")

# Rescale connected nodes into upper portion of canvas; reserve bottom strip for isolates
isolated_idx   = [node_ids.index(nid) for nid in node_ids if nodes[nid]["low_connectivity"]]
connected_idx  = [i for i in range(n_nodes) if i not in isolated_idx]

ISOLATE_STRIP  = 100   # px reserved at bottom for isolated nodes
x_scaled = rescale(coords[:, 0], PADDING, CANVAS_W - PADDING)
y_scaled = rescale(coords[:, 1], PADDING, CANVAS_H - PADDING - ISOLATE_STRIP)

# Place isolated nodes in a spaced row in the bottom strip
if isolated_idx:
    n_iso   = len(isolated_idx)
    iso_y   = CANVAS_H - ISOLATE_STRIP / 2
    iso_xs  = np.linspace(PADDING + 80, CANVAS_W - PADDING - 80, n_iso)
    for k, i in enumerate(isolated_idx):
        x_scaled[i] = iso_xs[k]
        y_scaled[i] = iso_y
    print(f"Isolated nodes pre-placed in bottom strip (y={iso_y:.0f}px)")


# ── Minimum distance nudge — connected nodes only ────────────────────────────

print(f"\n--- Nudge (MIN_DIST={MIN_DIST}px, connected nodes only) ---")
positions   = np.column_stack([x_scaled, y_scaled])
nudge_iters = 0

for it in range(MAX_NUDGE_ITER):
    diff    = positions[:, np.newaxis, :] - positions[np.newaxis, :, :]  # N×N×2
    dists2d = np.sqrt((diff ** 2).sum(axis=2))                           # N×N
    np.fill_diagonal(dists2d, np.inf)

    # only check violations among connected nodes
    violations = [
        (i, j) for i, j in np.argwhere(dists2d < MIN_DIST)
        if i < j and i in connected_idx and j in connected_idx
    ]
    if not violations:
        nudge_iters = it
        break

    nudge = np.zeros_like(positions)
    for i, j in violations:
        d            = dists2d[i, j]
        direction    = diff[i, j] / (d + 1e-9)
        displacement = (MIN_DIST - d) / 2.0
        nudge[i]    += direction * displacement
        nudge[j]    -= direction * displacement
    positions += nudge
    # clamp to canvas so boundary nodes don't cascade violations
    positions[:, 0] = np.clip(positions[:, 0], PADDING, CANVAS_W - PADDING)
    positions[:, 1] = np.clip(positions[:, 1], PADDING, CANVAS_H - PADDING - ISOLATE_STRIP)
else:
    nudge_iters = MAX_NUDGE_ITER

# report final state regardless of convergence
final_diff    = positions[:, np.newaxis, :] - positions[np.newaxis, :, :]
final_dists   = np.sqrt((final_diff ** 2).sum(axis=2))
np.fill_diagonal(final_dists, np.inf)
remaining     = sum(
    1 for i, j in np.argwhere(final_dists < MIN_DIST)
    if i < j and i in connected_idx and j in connected_idx
)
print(f"Nudge done: {nudge_iters} iterations, {remaining} remaining violations (cosmetic only — frontend handles final spacing)")

x_final = positions[:, 0]
y_final = positions[:, 1]

for i, nid in enumerate(node_ids):
    nodes[nid]["x"] = round(float(x_final[i]), 2)
    nodes[nid]["y"] = round(float(y_final[i]), 2)


# ── Write JSON outputs ────────────────────────────────────────────────────────

meta_block = {
    "threshold":            GRAPH_THRESHOLD,
    "node_count":           n_nodes,
    "edge_count":           len(edges),
    "within_stratum_edges": within,
    "cross_stratum_edges":  cross,
    "mds_stress":           round(float(mds.stress_), 4),
    "canvas_width":         CANVAS_W,
    "canvas_height":        CANVAS_H,
    "nudge_iterations":     nudge_iters,
}

node_list = [nodes[nid] for nid in node_ids]

# plexus_graph.json — full graph (all edges)
with open("../output/plexus_graph.json", "w", encoding="utf-8") as f:
    json.dump({"nodes": node_list, "edges": edges, "meta": meta_block}, f, indent=2)
print("\nWritten: output/plexus_graph.json")

# plexus_overview_layout.json — all edges (within + cross-stratum)
with open("../output/plexus_overview_layout.json", "w", encoding="utf-8") as f:
    json.dump({
        "nodes": node_list,
        "edges": edges,
        "meta":  {**meta_block, "edges_shown": "all"},
    }, f, indent=2)
print("Written: output/plexus_overview_layout.json")


# ── PNG diagnostic ────────────────────────────────────────────────────────────

print("\nGenerating 05_graph_preview.png...")

fig, ax = plt.subplots(figsize=(18, 11))
fig.patch.set_facecolor("#0d1117")
ax.set_facecolor("#0d1117")
ax.set_xlim(-PADDING / 2, CANVAS_W + PADDING / 2)
ax.set_ylim(-PADDING / 2, CANVAS_H + PADDING / 2)
ax.axis("off")

nid_idx = {nid: i for i, nid in enumerate(node_ids)}

# Cross-stratum edges — gold dashed
for e in edges:
    if e["is_cross_stratum"]:
        i, j = nid_idx[e["source"]], nid_idx[e["target"]]
        ax.plot(
            [x_final[i], x_final[j]], [y_final[i], y_final[j]],
            color="#FFD700", linewidth=0.6, alpha=e["cosine"] * 0.55,
            linestyle="--", zorder=1,
        )

# Within-stratum edges — grey
for e in edges:
    if not e["is_cross_stratum"]:
        i, j = nid_idx[e["source"]], nid_idx[e["target"]]
        ax.plot(
            [x_final[i], x_final[j]], [y_final[i], y_final[j]],
            color="#aaaaaa", linewidth=0.9, alpha=e["cosine"] * 0.65,
            zorder=1,
        )

# Nodes
STRATUM_COLOR = {"services": "#4e9af1", "gcc": "#f1c44e"}
for i, nid in enumerate(node_ids):
    meta = nodes[nid]
    ax.scatter(
        x_final[i], y_final[i],
        s=VOLUME_MPL[meta["volume_bucket"]],
        color=STRATUM_COLOR[meta["stratum"]],
        edgecolors="white", linewidths=0.4,
        zorder=3, alpha=0.92,
    )
    # Role label above node
    ax.text(x_final[i], y_final[i] + 15, meta["label"],
            fontsize=5.5, color="white", ha="center", va="bottom", zorder=4)
    # Degree inside node
    ax.text(x_final[i], y_final[i] - 1, str(meta["degree"]),
            fontsize=4.5, color="#cccccc", ha="center", va="center", zorder=4)

# Caption
caption = (
    f"threshold={GRAPH_THRESHOLD}  |  nodes={n_nodes}  |  edges={len(edges)} "
    f"(within={within}  cross={cross})  |  MDS stress={mds.stress_:.4f}  |  "
    f"nudge_iters={nudge_iters}"
)
fig.text(0.5, 0.015, caption, ha="center", fontsize=7, color="#888888")

# Legend
legend_handles = [
    Line2D([0], [0], marker="o", color="w", markerfacecolor="#4e9af1",
           markersize=8, label="Services node", linestyle="None"),
    Line2D([0], [0], marker="o", color="w", markerfacecolor="#f1c44e",
           markersize=8, label="GCC node", linestyle="None"),
    Line2D([0], [0], color="#aaaaaa", linewidth=1.2, label="Within-stratum edge"),
    Line2D([0], [0], color="#FFD700", linewidth=1.2, linestyle="--",
           label="Cross-stratum edge"),
]
ax.legend(handles=legend_handles, loc="upper left", fontsize=6.5,
          facecolor="#1a1a2e", edgecolor="#444444", labelcolor="white")

plt.tight_layout()
plt.savefig("../output/05_graph_preview.png", dpi=150, bbox_inches="tight",
            facecolor="#0d1117")
plt.close()
print("Written: output/05_graph_preview.png")

print("\n=== Module 05 complete ===")
_log.close()
