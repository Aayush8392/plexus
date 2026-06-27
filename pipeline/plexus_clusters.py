"""
Plexus — District Validation (clustering)
=========================================
Kimi's gate: the four "districts" in the overview brief are JUDGEMENT, not a
clustering result. Before the visual is locked, the districts must fall out of
the data — or be dropped. This script imports the FROZEN Step-3 probe, reuses
its role-vector cosine matrix (the SAME matrix that defines the graph edges),
and asks three independent questions:

  1. HOW MANY clusters does the data actually support? (silhouette sweep)
  2. WHAT membership does hierarchical clustering give at k=3/4/5?
  3. Does GRAPH community detection (which respects edge density — what the
     viewer's eye sees) agree?

Then it compares all three against the proposed four districts and tells you
which of Kimi's options applies: (A) districts validated -> draw faint contours,
(B) districts differ -> redraw to match, (C) no clean clusters -> drop drawn
boundaries, let edge density speak.

Run from the SAME directory as plexus_step3_probe.py + data files:
    python plexus_clusters.py
Requires scipy + sklearn (already present if the probe runs).
Emits a console report + plexus_clusters.json.
"""

import io
import json
import contextlib
import numpy as np
import networkx as nx
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import squareform
from sklearn.metrics import silhouette_score

print("loading frozen Step-3 pipeline (suppressing its output)...")
with contextlib.redirect_stdout(io.StringIO()):
    import plexus_step3_probe as P
print("pipeline loaded.\n")

roles = list(P.roles)
SIM = np.array(P.SIM, dtype=float)
n = len(roles)
THRESH = 0.25

# distance matrix from cosine (non-negative TF-IDF -> SIM in [0,1])
D = 1.0 - SIM
np.fill_diagonal(D, 0.0)
D = (D + D.T) / 2.0
condensed = squareform(D, checks=False)
Z = linkage(condensed, method="average")

RESULTS = {"n_roles": n, "threshold": THRESH}


def banner(t):
    print("\n" + "=" * 66 + "\n" + t + "\n" + "=" * 66)


def groups_from_labels(labels):
    g = {}
    for r, lab in zip(roles, labels):
        g.setdefault(int(lab), []).append(r)
    return g


# ---------------------------------------------------------------------------
# My proposed districts (21 assigned; 2 deliberately left for the data to place)
# ---------------------------------------------------------------------------
PROPOSED = {
    "Core":       ["Software Engineer (General)", "Backend / Java Developer",
                   "Full Stack Developer", "Frontend Developer"],
    "Data/Plat":  ["Data Engineer", "Data Scientist / ML", "Data / BI Analyst",
                   "DevOps / SRE", "Cloud Engineer / Architect"],
    "Enterprise": ["SAP Consultant", "Salesforce Developer", "Solution / Tech Architect",
                   "Eng Manager / Tech Lead", ".NET Developer", "Database Architect"],
    "Rim":        ["QA / Test Engineer", "Security Engineer", "Mobile Developer",
                   "Database Administrator", "Product Manager", "UX / UI Designer"],
}
UNASSIGNED = ["PHP / Web Developer", "Network / Sys Admin"]   # my brief omitted these
role2prop = {r: d for d, rs in PROPOSED.items() for r in rs}
for r in UNASSIGNED:
    role2prop[r] = "?(unassigned)"
# flag any proposed role not actually in the graph
missing = [r for r in role2prop if r not in roles]
if missing:
    print("NOTE: proposed roles not in graph (below MIN_ROLE_POSTINGS):", missing)


# ---------------------------------------------------------------------------
# 1 · HOW MANY CLUSTERS — silhouette sweep (let the data choose k)
# ---------------------------------------------------------------------------
banner("1 · HOW MANY CLUSTERS DOES THE DATA SUPPORT?  (silhouette, higher=better)")
print(f"{'k':>3}{'silhouette':>13}   cluster sizes")
sil_rows = []
best_k, best_s = None, -2
for k in range(2, 7):
    labels = fcluster(Z, k, criterion="maxclust")
    if len(set(labels)) < 2:
        continue
    s = float(silhouette_score(D, labels, metric="precomputed"))
    sizes = sorted((len(v) for v in groups_from_labels(labels).values()), reverse=True)
    print(f"{k:>3}{s:>13.3f}   {sizes}")
    sil_rows.append({"k": k, "silhouette": round(s, 3), "sizes": sizes})
    if s > best_s:
        best_s, best_k = s, k
print(f"\nnatural k (max silhouette) = {best_k}  (silhouette {best_s:.3f})")
print("read: if natural k == 4 and silhouette is clearly peaked, four districts are real.")
print("if the curve is flat / low (<~0.15), the space is continuous — no hard clusters.")
RESULTS["silhouette_sweep"] = sil_rows
RESULTS["natural_k"] = best_k


# ---------------------------------------------------------------------------
# 2 · HIERARCHICAL MEMBERSHIP at k = 3, 4, 5
# ---------------------------------------------------------------------------
banner("2 · HIERARCHICAL CLUSTERS — membership at k=3/4/5 (vs proposed district)")
hier = {}
for k in (3, 4, 5):
    labels = fcluster(Z, k, criterion="maxclust")
    g = groups_from_labels(labels)
    print(f"\n--- k = {k} ---")
    krec = []
    for cid, members in sorted(g.items(), key=lambda kv: -len(kv[1])):
        props = [role2prop.get(r, "?") for r in members]
        # dominant proposed district in this cluster
        dom = max(set(props), key=props.count)
        print(f"  cluster {cid} (n={len(members)}, mostly {dom}):")
        for r in members:
            tag = role2prop.get(r, "?")
            mark = "" if tag == dom else f"   <-- proposed {tag}"
            print(f"      {r:32s}{mark}")
        krec.append({"cluster": cid, "dominant_proposed": dom, "members": members})
    hier[str(k)] = krec
RESULTS["hierarchical"] = hier


# ---------------------------------------------------------------------------
# 3 · GRAPH COMMUNITY DETECTION (edge-density view — what the eye sees)
# ---------------------------------------------------------------------------
banner("3 · GRAPH COMMUNITIES @ 0.25  (greedy modularity on the drawn graph)")
G = nx.Graph()
G.add_nodes_from(roles)
for i in range(n):
    for j in range(i + 1, n):
        if SIM[i][j] >= THRESH:
            G.add_edge(roles[i], roles[j], weight=float(SIM[i][j]))

from networkx.algorithms.community import greedy_modularity_communities, modularity
comms = list(greedy_modularity_communities(G, weight="weight"))
mod = modularity(G, comms, weight="weight")
print(f"communities found: {len(comms)}   modularity: {mod:.3f}")
print("(modularity > ~0.3 = meaningful community structure; near 0 = none)")
comm_rec = []
for idx, c in enumerate(sorted(comms, key=lambda c: -len(c))):
    members = sorted(c)
    props = [role2prop.get(r, "?") for r in members]
    dom = max(set(props), key=props.count)
    print(f"\n  community {idx} (n={len(members)}, mostly {dom}):")
    for r in members:
        tag = role2prop.get(r, "?")
        mark = "" if tag == dom else f"   <-- proposed {tag}"
        print(f"      {r:32s}{mark}")
    comm_rec.append({"id": idx, "dominant_proposed": dom, "members": members})
RESULTS["graph_communities"] = {"count": len(comms), "modularity": round(mod, 3), "communities": comm_rec}


# ---------------------------------------------------------------------------
# 4 · RIM CHECK — are the proposed rim roles actually peripheral?
# ---------------------------------------------------------------------------
banner("4 · RIM CHECK — degree @ 0.25 of proposed rim roles (peripheral = a finding)")
print(f"{'role':<32}{'degree':>7}   neighbours")
rim_rec = []
for r in PROPOSED["Rim"] + UNASSIGNED:
    if r not in G:
        print(f"{r:<32}{'n/a':>7}   (not in graph)")
        continue
    deg = G.degree(r)
    nbrs = sorted(G.neighbors(r))
    print(f"{r:<32}{deg:>7}   {nbrs if nbrs else '(none — isolated within full graph)'}")
    rim_rec.append({"role": r, "degree": deg, "neighbours": nbrs})
print("\nread: degree 0-1 = genuinely peripheral, belongs on the rim (placement = finding).")
print("degree >=3 = NOT actually peripheral; pulls into a core/data cluster — fix the brief.")
RESULTS["rim_degree"] = rim_rec


# ---------------------------------------------------------------------------
# 5 · VERDICT GUIDANCE
# ---------------------------------------------------------------------------
banner("5 · WHICH KIMI OPTION APPLIES")
print(f"""
Compare the three views above:

  natural k = {best_k}  ·  graph communities = {len(comms)}  ·  modularity = {mod:.3f}

Decision tree:
  - natural k ~ 4 AND hierarchical k=4 maps cleanly to the four proposed districts
    AND modularity > 0.3  ->  OPTION A: districts validated. Draw faint convex-hull
    contours at the cluster boundaries. Proceed with the overview brief.

  - clusters are clean but DIFFERENT from the proposed four (different count, or
    roles swapped between districts)  ->  OPTION B: redraw districts to match the
    clustering. The rigour move. Update the Stitch brief's geography.

  - silhouette is flat/low (<~0.15) OR modularity near 0 OR communities don't
    correspond to interpretable groups  ->  OPTION C: drop drawn districts. Present
    the graph as continuous space; let edge density show grouping. No false boundaries.

Look especially for: any proposed-Rim role with degree >=3 (it isn't really rim),
and whether Core vs Data/Platform actually separate or merge into one dense blob.
""")

with open("plexus_clusters.json", "w") as f:
    json.dump(RESULTS, f, indent=2)
print("wrote plexus_clusters.json")
print("\npaste the full output back — we read which option applies, then finalise the brief.")
