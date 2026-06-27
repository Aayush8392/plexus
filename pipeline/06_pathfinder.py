"""
Module 06 — Pathfinder
Precomputes per-node Pathfinder data from plexus_graph.json + employer_tagged.parquet.
Emits: output/plexus_pathfinder.json + output/06_pathfinder_log.txt
Run from: pipeline/ directory
"""

import os
import sys
import json
from collections import defaultdict

import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", (
    "Run this script from the pipeline/ directory: python 06_pathfinder.py"
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

sys.stdout = _Tee("../output/06_pathfinder_log.txt")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
GRAPH_THRESHOLD = 0.20
BRIDGE_SKILL_CAP = 10
SPECIFICITY_MAX_NODE_FRAC = 0.50  # drop skills present in >50% of nodes

SENIORITY_STOPWORDS = {
    # Unlearnable meta-skills
    "Leadership", "Communication", "Team Management", "Stakeholder Management",
    "Project Management", "Strategic Thinking", "Problem Solving",
    "Analytical Skills", "Decision Making", "Presentation Skills",
    "Mentoring", "Collaboration", "Time Management",
    "Technical Leadership", "Software Development Methodologies",
    # Generic tech meta-terms
    "Software Development", "Application Development", "Information Technology",
    "Computer Science", "Coding", "Debugging", "Documentation",
    # Table-stakes skills with no bridge signal
    "Agile", "Scrum", "Git", "SQL", "REST",
    # Corpus recruiter noise
    "Hr Generalist Activities", "Joining Formalities", "Screening",
    # Corpus artifacts and domain bleed
    "Pan", "Pharmaceutical", "Salesforce",
}

BRIDGE_FALLBACK = (
    "this move requires seniority and breadth typical of {role} "
    "— see full skill profile."
)

# Proximity tag cosine bands
def proximity_tag(cosine: float) -> str:
    if cosine >= 0.40:
        return "strong"
    if cosine >= 0.30:
        return "moderate"
    return "a stretch"

# SE(General) slugs — excluded from onward region definitionally
SE_GENERAL_SLUGS = {"software_engineer_general"}

# Structural hub threshold: degree > 60% of (total_nodes - 1)
HUB_DEGREE_THRESHOLD = 0.60

# Onward region suppressed if source node's best door cosine is below this floor
ONWARD_MIN_DOOR_COSINE = 0.25

# ---------------------------------------------------------------------------
# Load graph
# ---------------------------------------------------------------------------
print("Loading plexus_graph.json ...")
with open("../output/plexus_graph.json", encoding="utf-8") as f:
    graph = json.load(f)

nodes = {n["id"]: n for n in graph["nodes"]}
edges = graph["edges"]

total_nodes = len(nodes)
hub_cutoff = HUB_DEGREE_THRESHOLD * (total_nodes - 1)
print(f"  Nodes: {total_nodes} | Hub cutoff (degree > {hub_cutoff:.1f}): applies to nodes with degree >= {int(hub_cutoff)+1}")

# ---------------------------------------------------------------------------
# Build adjacency — separate within-stratum and cross-stratum
# ---------------------------------------------------------------------------
within_adj = defaultdict(list)   # node_id -> [(neighbour_id, cosine)]
cross_adj  = defaultdict(list)   # node_id -> [(neighbour_id, cosine)]

for e in edges:
    src, tgt, cos, is_cross = e["source"], e["target"], e["cosine"], e["is_cross_stratum"]
    if is_cross:
        cross_adj[src].append((tgt, cos))
        cross_adj[tgt].append((src, cos))
    else:
        within_adj[src].append((tgt, cos))
        within_adj[tgt].append((src, cos))

for nid in within_adj:
    within_adj[nid].sort(key=lambda x: x[1], reverse=True)
for nid in cross_adj:
    cross_adj[nid].sort(key=lambda x: x[1], reverse=True)

# ---------------------------------------------------------------------------
# Identify structural hubs
# Hubs = SE(General) nodes (definitional) + any node with degree > hub_cutoff
# Hubs: excluded from onward region + get no onward region themselves
# ---------------------------------------------------------------------------
hub_node_ids = set()
for nid, node in nodes.items():
    if node["role_slug"] in SE_GENERAL_SLUGS:
        hub_node_ids.add(nid)
    elif node["degree"] > hub_cutoff:
        hub_node_ids.add(nid)

print(f"  Hub nodes excluded from onward region: {sorted(hub_node_ids)}")

# ---------------------------------------------------------------------------
# Build full skill sets + per-node skill frequency from employer_tagged.parquet
# node_skill_freq[node_id][skill] = number of postings mentioning that skill
# ---------------------------------------------------------------------------
print("\nLoading employer_tagged.parquet for full skill aggregation ...")
df = pd.read_parquet("../output/employer_tagged.parquet")

label_to_slug = {}
for nid, node in nodes.items():
    label_to_slug[node["role"]] = node["role_slug"]

def make_node_id(role_label: str, employer_type: str):
    slug = label_to_slug.get(role_label)
    if slug is None:
        return None
    candidate = f"{slug}_{employer_type}"
    return candidate if candidate in nodes else None

node_skills = defaultdict(set)          # node_id -> set of skill strings
node_skill_freq = defaultdict(lambda: defaultdict(int))  # node_id -> skill -> count

eligible = df[df["employer_type"].isin(["services", "gcc"]) & (df["role"] != "unclassified")]
for _, row in eligible.iterrows():
    nid = make_node_id(row["role"], row["employer_type"])
    if nid is None:
        continue
    skills = row["normalised_skills"]
    if skills is None:
        continue
    if hasattr(skills, "tolist"):
        skills = skills.tolist()
    for s in skills:
        if s:
            s = str(s)
            node_skills[nid].add(s)
            node_skill_freq[nid][s] += 1

print(f"  Nodes with aggregated skills: {len(node_skills)}")
for nid in sorted(node_skills):
    print(f"    {nid}: {len(node_skills[nid])} unique skills")

# ---------------------------------------------------------------------------
# Specificity filter — drop skills present in > SPECIFICITY_MAX_NODE_FRAC of nodes
# ---------------------------------------------------------------------------
specificity_cutoff = int(SPECIFICITY_MAX_NODE_FRAC * total_nodes)
skill_node_count = defaultdict(int)
for nid, skills in node_skills.items():
    for s in skills:
        skill_node_count[s] += 1

universal_skills = {s for s, cnt in skill_node_count.items() if cnt > specificity_cutoff}
print(f"\n  Universal skills filtered (present in >{specificity_cutoff} nodes): {len(universal_skills)}")

ALL_STOPWORDS = SENIORITY_STOPWORDS | universal_skills

# ---------------------------------------------------------------------------
# Self-twin helper
# ---------------------------------------------------------------------------
def get_self_twin(node: dict):
    twin_id = node.get("twin_id")
    if twin_id and twin_id in nodes:
        return twin_id
    return None

# ---------------------------------------------------------------------------
# Onward region — 2-hop path scoring
# Skip entirely for hub nodes (they connect everywhere; no meaningful onward)
# ---------------------------------------------------------------------------
def compute_onward_region(source_id: str) -> tuple:
    """Returns (region_list, is_hub)."""
    if source_id in hub_node_ids:
        return [], True

    # Suppress onward if best door is too weak to yield meaningful 2-hop paths
    best_door_cosine = within_adj[source_id][0][1] if within_adj[source_id] else 0.0
    if best_door_cosine < ONWARD_MIN_DOOR_COSINE:
        return [], False

    door_ids = {nid for nid, _ in within_adj[source_id]}

    candidate_scores = defaultdict(float)
    for door_id, door_cosine in within_adj[source_id]:
        for onward_id, onward_cosine in within_adj[door_id]:
            if onward_id == source_id:
                continue
            if onward_id in hub_node_ids:
                continue
            if onward_id in door_ids:
                continue
            candidate_scores[onward_id] += door_cosine * onward_cosine

    if not candidate_scores:
        return [], False

    ranked = sorted(candidate_scores.items(), key=lambda x: x[1], reverse=True)[:3]

    region = []
    for onward_id, score in ranked:
        onward_node = nodes[onward_id]
        region.append({
            "node_id": onward_id,
            "label": onward_node["label"],
            "stratum": onward_node["stratum"],
            "posting_count": onward_node["posting_count"],
            "path_score": round(score, 4),
        })
    return region, False

# ---------------------------------------------------------------------------
# Bridge skills
# Intersection of source + door skill sets, stopword + specificity filtered,
# sorted by frequency in door node (skills the door role emphasises most),
# capped at BRIDGE_SKILL_CAP
# ---------------------------------------------------------------------------
def compute_bridge_skills(source_id: str, door_id: str, door_label: str):
    src_skills = node_skills.get(source_id, set())
    door_skills = node_skills.get(door_id, set())
    shared = src_skills & door_skills
    filtered = [s for s in shared if s not in ALL_STOPWORDS]
    if not filtered:
        return BRIDGE_FALLBACK.format(role=door_label)
    door_freq = node_skill_freq[door_id]
    filtered.sort(key=lambda s: door_freq.get(s, 0), reverse=True)
    return filtered[:BRIDGE_SKILL_CAP]

# ---------------------------------------------------------------------------
# Main loop — compute pathfinder per node
# ---------------------------------------------------------------------------
print("\nComputing Pathfinder per node ...")
pathfinder = {}

for nid, node in nodes.items():
    within_neighbours = within_adj[nid]
    cross_neighbours  = cross_adj[nid]

    # --- Doors (within-stratum) ---
    doors_full = []
    for door_id, cos in within_neighbours:
        door_node = nodes[door_id]
        bridge = compute_bridge_skills(nid, door_id, door_node["label"])
        doors_full.append({
            "node_id": door_id,
            "label": door_node["label"],
            "stratum": door_node["stratum"],
            "cosine": cos,
            "proximity_tag": proximity_tag(cos),
            "posting_count": door_node["posting_count"],
            "bridge_skills": bridge,
        })

    doors_top5 = doors_full[:5]

    # --- Cross-stratum overlay ---
    has_cross_stratum = len(cross_neighbours) > 0
    cross_stratum_doors = []
    for door_id, cos in cross_neighbours:
        door_node = nodes[door_id]
        cross_stratum_doors.append({
            "node_id": door_id,
            "label": door_node["label"],
            "stratum": door_node["stratum"],
            "cosine": cos,
            "proximity_tag": proximity_tag(cos),
        })

    # --- Self-twin ---
    twin_id = get_self_twin(node)

    # --- Onward region ---
    onward_region, is_hub = compute_onward_region(nid)

    pathfinder[nid] = {
        "node_id": nid,
        "label": node["label"],
        "stratum": node["stratum"],
        "posting_count": node["posting_count"],
        "top_skills": node["top_skills"],
        "low_connectivity": len(within_adj[nid]) == 0,
        "is_hub": is_hub,
        "self_twin_id": twin_id,
        "has_cross_stratum": has_cross_stratum,
        "doors_top5": doors_top5,
        "doors_full": doors_full,
        "cross_stratum_doors": cross_stratum_doors,
        "onward_region": onward_region,
    }

    door_count = len(doors_full)
    onward_count = len(onward_region)
    print(f"  {nid}: {door_count} doors | onward={onward_count} | hub={is_hub} | twin={'yes' if twin_id else 'no'} | cross={has_cross_stratum}")

# ---------------------------------------------------------------------------
# Summary stats
# ---------------------------------------------------------------------------
print("\n--- Summary ---")
total = len(pathfinder)
with_onward  = sum(1 for v in pathfinder.values() if v["onward_region"])
hub_count    = sum(1 for v in pathfinder.values() if v["is_hub"])
with_twin    = sum(1 for v in pathfinder.values() if v["self_twin_id"])
with_cross   = sum(1 for v in pathfinder.values() if v["has_cross_stratum"])
low_conn     = sum(1 for v in pathfinder.values() if v["low_connectivity"])

print(f"Nodes processed        : {total}")
print(f"Hub nodes (no onward)  : {hub_count}")
print(f"With onward region     : {with_onward}")
print(f"With self-twin         : {with_twin}")
print(f"With cross-stratum     : {with_cross}")
print(f"Low-connectivity nodes : {low_conn}")
print(f"Universal skills removed: {len(universal_skills)}")

tag_counts = defaultdict(int)
for v in pathfinder.values():
    for d in v["doors_top5"]:
        tag_counts[d["proximity_tag"]] += 1
print(f"Proximity tags (top-5 doors): {dict(tag_counts)}")

fallback_count = 0
total_door_entries = 0
bridge_lengths = []
for v in pathfinder.values():
    for d in v["doors_full"]:
        total_door_entries += 1
        if isinstance(d["bridge_skills"], str):
            fallback_count += 1
        else:
            bridge_lengths.append(len(d["bridge_skills"]))

avg_bridge = sum(bridge_lengths) / len(bridge_lengths) if bridge_lengths else 0
print(f"Bridge skill fallback rate  : {fallback_count}/{total_door_entries} ({100*fallback_count/max(total_door_entries,1):.1f}%)")
print(f"Avg bridge skills per door  : {avg_bridge:.1f} (max {BRIDGE_SKILL_CAP})")

# ---------------------------------------------------------------------------
# Write output
# ---------------------------------------------------------------------------
out_path = "../output/plexus_pathfinder.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(pathfinder, f, indent=2, ensure_ascii=False)

print(f"\nWritten: {out_path}")
print("Module 06 complete.")
