"""
Module 07 — Drawer Data
Precomputes per-node company and seniority data for Screen 3 drawer sections 2 + 3.
Reads:  output/employer_tagged.parquet + output/plexus_graph.json
Emits:  output/plexus_drawer_data.json + output/07_drawer_data_log.txt
Run from: pipeline/ directory
"""

import os
import sys
import json
import re
from collections import defaultdict

import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", (
    "Run this script from the pipeline/ directory: python 07_drawer_data.py"
)

# ---------------------------------------------------------------------------
# Tee — write stdout to log file and console simultaneously
# ---------------------------------------------------------------------------
class _Tee:
    def __init__(self, path):
        self._file = open(path, "w", encoding="utf-8")
        self._stdout = sys.stdout

    def write(self, data):
        self._file.write(data)
        self._stdout.write(data)

    def flush(self):
        self._file.flush()
        self._stdout.flush()

    def close(self):
        self._file.close()

sys.stdout = _Tee("../output/07_drawer_data_log.txt")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TOP_COMPANIES_K = 5

EXPERIENCE_BRACKETS = [
    ("0–2 yrs",   0,   2),
    ("2–5 yrs",   2,   5),
    ("5–8 yrs",   5,   8),
    ("8–12 yrs",  8,  12),
    ("12+ yrs",  12, 999),
]

# ---------------------------------------------------------------------------
# Load graph — need node registry for make_node_id (same pattern as Module 06)
# ---------------------------------------------------------------------------
print("Loading plexus_graph.json ...")
with open("../output/plexus_graph.json", encoding="utf-8") as f:
    graph = json.load(f)

nodes = {n["id"]: n for n in graph["nodes"]}
print(f"  Nodes loaded: {len(nodes)}")

# Build label -> slug map (lifted directly from Module 06)
label_to_slug = {}
for nid, node in nodes.items():
    label_to_slug[node["role"]] = node["role_slug"]

def make_node_id(role_label: str, employer_type: str):
    slug = label_to_slug.get(role_label)
    if slug is None:
        return None
    candidate = f"{slug}_{employer_type}"
    return candidate if candidate in nodes else None

# ---------------------------------------------------------------------------
# Load parquet
# ---------------------------------------------------------------------------
print("\nLoading employer_tagged.parquet ...")
df = pd.read_parquet("../output/employer_tagged.parquet")
print(f"  Rows: {len(df)}")
print(f"  Columns: {list(df.columns)}")
print(f"  employer_type counts:\n{df['employer_type'].value_counts().to_string()}")

# ---------------------------------------------------------------------------
# Assign node_id to each row
# Only services + gcc rows map to a node. agency + unknown rows still
# contribute to seniority spread (all stratum included per spec).
# ---------------------------------------------------------------------------
print("\nAssigning node_ids ...")

# For seniority: all rows with a valid role assignment (any employer_type)
# We need a role-level node to attach seniority to — use services node
# preferentially, fall back to gcc. Seniority is role-level, not stratum-level.
# Strategy: assign each row to whichever stratum node exists for that role,
# using employer_type when services/gcc, else try services then gcc for agency/unknown.

def make_node_id_any(role_label: str, employer_type: str):
    """
    For services/gcc rows: return the exact stratum node if it exists.
    For agency/unknown rows: try services node first, then gcc.
    Returns None if no node exists for this role.
    """
    slug = label_to_slug.get(role_label)
    if slug is None:
        return None
    if employer_type in ("services", "gcc"):
        candidate = f"{slug}_{employer_type}"
        return candidate if candidate in nodes else None
    else:
        # agency / unknown — attach to whichever node exists
        for stratum in ("services", "gcc"):
            candidate = f"{slug}_{stratum}"
            if candidate in nodes:
                return candidate
        return None

df = df[df["role"] != "unclassified"].copy()
df["node_id"] = df.apply(
    lambda r: make_node_id_any(r["role"], r["employer_type"]), axis=1
)

matched = df["node_id"].notna().sum()
print(f"  Rows matched to a node: {matched} / {len(df)}")

# ---------------------------------------------------------------------------
# Section 2 — Top companies per node, stratified (services | gcc only)
# top_companies: { "services": [{"name": ..., "count": ...}, ...],
#                  "gcc":      [{"name": ..., "count": ...}, ...] }
# ---------------------------------------------------------------------------
print("\nComputing top companies ...")

# Only services + gcc rows for company counts
company_df = df[df["employer_type"].isin(["services", "gcc"]) & df["node_id"].notna()].copy()

# node_id -> stratum -> company -> count
company_counts = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

for _, row in company_df.iterrows():
    nid      = row["node_id"]
    stratum  = row["employer_type"]
    company  = str(row["companyName"]).strip() if pd.notna(row["companyName"]) else None
    if company and company.lower() not in ("nan", "none", ""):
        company_counts[nid][stratum][company] += 1

top_companies = {}
for nid in nodes:
    result = {}
    for stratum in ("services", "gcc"):
        counts = company_counts[nid].get(stratum, {})
        if counts:
            ranked = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:TOP_COMPANIES_K]
            result[stratum] = [{"name": name, "count": cnt} for name, cnt in ranked]
        else:
            result[stratum] = []
    top_companies[nid] = result

# Quick sanity check
sample_nodes = list(nodes.keys())[:3]
for nid in sample_nodes:
    tc = top_companies[nid]
    svc = tc["services"][:2]
    gcc = tc["gcc"][:2]
    print(f"  {nid}: services top2={svc} | gcc top2={gcc}")

# ---------------------------------------------------------------------------
# Section 3 — Seniority spread per node
# Uses minimumExperience column (numeric). All employer_types included.
# seniority_spread: [{"bracket": "0–2 yrs", "count": N}, ...]
# ---------------------------------------------------------------------------
print("\nComputing seniority spread ...")

seniority_df = df[df["node_id"].notna()].copy()

# minimumExperience is numeric per pipeline context. Coerce just in case.
seniority_df["min_exp"] = pd.to_numeric(seniority_df["minimumExperience"], errors="coerce")

# node_id -> bracket_label -> count
bracket_counts = defaultdict(lambda: defaultdict(int))

for _, row in seniority_df.iterrows():
    nid = row["node_id"]
    exp = row["min_exp"]
    if pd.isna(exp):
        continue
    for label, lo, hi in EXPERIENCE_BRACKETS:
        if lo <= exp < hi:
            bracket_counts[nid][label] += 1
            break

seniority_spread = {}
for nid in nodes:
    spread = []
    for label, lo, hi in EXPERIENCE_BRACKETS:
        count = bracket_counts[nid].get(label, 0)
        spread.append({"bracket": label, "count": count})
    seniority_spread[nid] = spread

# Sanity check
for nid in sample_nodes:
    total = sum(b["count"] for b in seniority_spread[nid])
    print(f"  {nid}: total bracketed={total} | spread={seniority_spread[nid]}")

# ---------------------------------------------------------------------------
# Typical experience per canonical role (parsed from `experience` text column)
# "3-8 Yrs" → min_years=3. Grouped by role_slug across all strata.
# ---------------------------------------------------------------------------
print("\nComputing typical experience ...")

def parse_exp_min(exp_str):
    if pd.isna(exp_str):
        return None
    m = re.search(r'(\d+)', str(exp_str))
    return int(m.group(1)) if m else None

exp_df = df[df["node_id"].notna()].copy()
exp_df["exp_min"] = exp_df["experience"].apply(parse_exp_min)

node_to_role_slug = {nid: nodes[nid]["role_slug"] for nid in nodes}
exp_df["role_slug"] = exp_df["node_id"].map(node_to_role_slug)

role_exp_stats = (
    exp_df[exp_df["exp_min"].notna()]
    .groupby("role_slug")["exp_min"]
    .agg(["median", "mean", "count"])
)

typical_experience = {}
for nid in nodes:
    role_slug = nodes[nid]["role_slug"]
    if role_slug in role_exp_stats.index:
        median_yrs = role_exp_stats.loc[role_slug, "median"]
        count      = int(role_exp_stats.loc[role_slug, "count"])
        typical_experience[nid] = {
            "median_min_years": int(median_yrs),
            "label": f"Typical: {int(median_yrs)}+ years",
            "sample_size": count,
        }
        print(f"  {nid:<45}  median={int(median_yrs)} yrs  (n={count})")
    else:
        typical_experience[nid] = None
        print(f"  {nid:<45}  no experience data")

# ---------------------------------------------------------------------------
# Assemble output
# ---------------------------------------------------------------------------
print("\nAssembling output ...")
drawer_data = {}
for nid in nodes:
    drawer_data[nid] = {
        "top_companies":      top_companies[nid],
        "seniority_spread":   seniority_spread[nid],
        "typical_experience": typical_experience.get(nid),
    }

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print("\n--- Summary ---")
nodes_with_svc_companies = sum(
    1 for nid in nodes if top_companies[nid]["services"]
)
nodes_with_gcc_companies = sum(
    1 for nid in nodes if top_companies[nid]["gcc"]
)
nodes_with_seniority = sum(
    1 for nid in nodes if any(b["count"] > 0 for b in seniority_spread[nid])
)
print(f"Total nodes in output        : {len(drawer_data)}")
print(f"Nodes with services companies: {nodes_with_svc_companies}")
print(f"Nodes with gcc companies     : {nodes_with_gcc_companies}")
print(f"Nodes with seniority data    : {nodes_with_seniority}")

# ---------------------------------------------------------------------------
# Write output
# ---------------------------------------------------------------------------
out_path = "../output/plexus_drawer_data.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(drawer_data, f, indent=2, ensure_ascii=False)

print(f"\nWritten: {out_path}")
print("Module 07 complete.")
