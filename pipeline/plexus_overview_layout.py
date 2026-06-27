"""
Plexus — Overview Layout (classical MDS)
========================================
Produces the honest continuous-map layout for the cold overview, per the
information-design review: position encodes similarity directly (Euclidean
distance on screen approximates cosine distance), deterministic, parameter-free.

Imports the FROZEN Step-3 probe, reuses its role-vector cosine matrix (SIM),
changes nothing.

Classical MDS (not iterative SMACOF) is used deliberately: it is a closed-form
eigendecomposition, so the same matrix yields the same coordinates every run —
the reproducibility that motivated MDS over force-directed in the first place.

It also SELF-VALIDATES the finding: it prints each node's distance-from-centre
against its degree. If low-degree roles sit far out and high-degree roles sit
central, the layout confirms the "dense core + thin margin" reading. If not,
the layout was inventing structure.

Emits the full data package Stitch needs (coords + size + has-GCC-twin + edges)
to plexus_overview_layout.json, so the design brief ships with real positions
and real content.

Run from the SAME directory as plexus_step3_probe.py + data files:
    python plexus_overview_layout.py
"""

import io
import json
import contextlib
import numpy as np
import networkx as nx

print("loading frozen Step-3 pipeline (suppressing its output)...")
with contextlib.redirect_stdout(io.StringIO()):
    import plexus_step3_probe as P
print("pipeline loaded.\n")

roles = list(P.roles)
SIM = np.array(P.SIM, dtype=float)
n = len(roles)
THRESH = 0.25
MIN_STRATUM = P.MIN_STRATUM

# short codes for dense-core labelling (Stitch may use these to avoid collisions)
SHORT = {
    "Software Engineer (General)": "SE", "Backend / Java Developer": "BE",
    "Full Stack Developer": "FS", "Frontend Developer": "FE", "DevOps / SRE": "DO",
    "Cloud Engineer / Architect": "CL", "Data Engineer": "DE", "Data Scientist / ML": "DS",
    "Data / BI Analyst": "BI", "Solution / Tech Architect": "SA", "Eng Manager / Tech Lead": "EM",
    "SAP Consultant": "SAP", "Salesforce Developer": "SF", "Network / Sys Admin": "NET",
    "QA / Test Engineer": "QA", "Security Engineer": "SEC", "Mobile Developer": "MOB",
    "Database Administrator": "DBA", "Database Architect": "DBAr", ".NET Developer": "NET#",
    "PHP / Web Developer": "PHP", "Product Manager": "PM", "UX / UI Designer": "UX",
}


def banner(t):
    print("\n" + "=" * 66 + "\n" + t + "\n" + "=" * 66)


# ---------------------------------------------------------------------------
# CLASSICAL MDS  (double-centering + eigendecomposition; deterministic)
# ---------------------------------------------------------------------------
banner("CLASSICAL MDS — deterministic layout from the cosine matrix")
D = 1.0 - SIM                      # dissimilarity
np.fill_diagonal(D, 0.0)
D = (D + D.T) / 2.0
D2 = D ** 2
J = np.eye(n) - np.ones((n, n)) / n
B = -0.5 * J @ D2 @ J               # double-centred Gram matrix
eigvals, eigvecs = np.linalg.eigh(B)            # ascending
order = np.argsort(eigvals)[::-1]               # descending
eigvals, eigvecs = eigvals[order], eigvecs[:, order]
pos_eig = np.clip(eigvals, 0, None)
coords = eigvecs[:, :2] * np.sqrt(pos_eig[:2])  # 23 x 2

var_explained = pos_eig[:2].sum() / pos_eig.sum()
print(f"variance captured by 2 dimensions: {var_explained:.1%}")
print("(higher = the 2-D map faithfully represents the full similarity structure)")
print(f"top eigenvalues: {np.round(eigvals[:5], 3)}")

# normalise to a 0-100 canvas (preserve aspect — same scale both axes)
c = coords - coords.mean(axis=0)
scale = np.abs(c).max()
norm = (c / scale) * 48 + 50        # -> roughly [2, 98]
norm = np.round(norm, 1)


# ---------------------------------------------------------------------------
# GRAPH (degree + edges at 0.25)
# ---------------------------------------------------------------------------
G = nx.Graph()
G.add_nodes_from(roles)
edges = []
for i in range(n):
    for j in range(i + 1, n):
        if SIM[i][j] >= THRESH:
            w = round(float(SIM[i][j]), 3)
            G.add_edge(roles[i], roles[j], weight=w)
            edges.append({"source": roles[i], "target": roles[j], "cosine": w})
deg = dict(G.degree())
possible = n * (n - 1) // 2


# ---------------------------------------------------------------------------
# PER-ROLE ATTRIBUTES (volume, size bucket, GCC twin)
# ---------------------------------------------------------------------------
vc = P.sub["role"].value_counts()
def total_posts(r): return int(vc.get(r, 0))
def gcc_n(r): return int(((P.sub.role == r) & (P.sub.emp_type == "gcc")).sum())
def svc_n(r): return int(((P.sub.role == r) & (P.sub.emp_type == "services")).sum())

vols = np.array([total_posts(r) for r in roles], dtype=float)
logv = np.log10(vols + 1)
# 4 discrete size buckets by log-volume quartile
qs = np.quantile(logv, [0.25, 0.5, 0.75])
def bucket(v):
    lv = np.log10(v + 1)
    return 1 + int(lv > qs[0]) + int(lv > qs[1]) + int(lv > qs[2])

centroid = c.mean(axis=0)
dist_center = np.sqrt((c[:, 0]) ** 2 + (c[:, 1]) ** 2)   # c already centred


# ---------------------------------------------------------------------------
# 1 · SELF-VALIDATION — does the layout reproduce core + margin?
# ---------------------------------------------------------------------------
banner("1 · LAYOUT VALIDATION — distance-from-centre vs degree")
print(f"{'role':<30}{'degree':>7}{'dist_center':>13}{'size':>6}")
val = sorted(range(n), key=lambda i: dist_center[i])
for i in val:
    print(f"{roles[i]:<30}{deg[roles[i]]:>7}{dist_center[i]:>13.3f}{bucket(vols[i]):>6}")
corr = float(np.corrcoef(dist_center, [deg[r] for r in roles])[0, 1])
print(f"\ncorrelation(distance_from_centre, degree) = {corr:+.2f}")
print("read: a clear NEGATIVE correlation = high-degree roles sit central, low-degree")
print("roles sit at the margin -> MDS confirms the dense-core/thin-margin finding.")
print("near-zero correlation = the layout does not separate core from margin.")


# ---------------------------------------------------------------------------
# 2 · MARGIN + GCC-TWIN SUMMARY
# ---------------------------------------------------------------------------
banner("2 · MARGIN ROLES (degree <= 1) + GCC-TWIN TICKS")
margin = [r for r in roles if deg[r] <= 1]
print("thin margin (degree <= 1, get a quiet peripheral label):", margin or "(none)")
twins = [r for r in roles if gcc_n(r) >= MIN_STRATUM]
print(f"\nhas-GCC-twin (perimeter tick, {len(twins)} roles): {sorted(twins)}")
print(f"services-only (solid node, no tick): {sorted(set(roles) - set(twins))}")
print(f"\nedges: {len(edges)} shown of {possible} possible (cosine >= {THRESH})")
qa_deg = deg.get("QA / Test Engineer")
print(f"\nQA / Test Engineer degree = {qa_deg}  <-- central, NOT peripheral (update the narrative)")


# ---------------------------------------------------------------------------
# WRITE PACKAGE FOR STITCH
# ---------------------------------------------------------------------------
nodes_out = []
for i, r in enumerate(roles):
    nodes_out.append({
        "id": r, "short": SHORT.get(r, r[:3]),
        "x": float(norm[i, 0]), "y": float(norm[i, 1]),
        "postings": total_posts(r), "size_bucket": bucket(vols[i]),
        "degree": deg[r], "dist_center": round(float(dist_center[i]), 3),
        "has_gcc_twin": bool(gcc_n(r) >= MIN_STRATUM),
        "gcc_postings": gcc_n(r), "services_postings": svc_n(r),
        "is_margin": deg[r] <= 1,
    })

package = {
    "layout": "classical_mds",
    "variance_explained_2d": round(float(var_explained), 3),
    "distance_degree_corr": round(corr, 3),
    "threshold": THRESH,
    "edges_shown": len(edges),
    "edges_possible": possible,
    "size_buckets": "1-4 by log10(postings) quartile",
    "margin_roles": margin,
    "gcc_twin_roles": sorted(twins),
    "nodes": nodes_out,
    "edges": edges,
    "clustering_note": "silhouette flat ~0.10, modularity 0.174, three methods disagree: "
                       "no stable partition. Render as continuous space, no drawn districts.",
}
with open("plexus_overview_layout.json", "w") as f:
    json.dump(package, f, indent=2)

banner("WRITE")
print("wrote plexus_overview_layout.json  (coords + sizes + ticks + edges for Stitch)")
print("\npaste the console output back. we confirm:")
print("  - variance_explained_2d is high enough that the 2-D map is faithful")
print("  - distance/degree correlation is clearly negative (core+margin validated)")
print("  - margin roles are the expected sparse ones (Mobile, UX, ...)")
print("then the final overview brief is built directly on this JSON.")
