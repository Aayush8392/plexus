"""
Plexus — Sensitivity Sweep (rigour exhibit)
============================================
Imports the FROZEN Step-3 probe and re-uses its cosine matrices + primitives.
Does NOT reimplement the pipeline and does NOT edit the probe.

Purpose (per the round-2 methodology review): convert two promissory
"dissolved-once-you-run-it" claims into actual findings —
  (A) the 0.25 edge threshold is a dual-constraint Goldilocks choice, not
      a cut tuned to erase islands;
  (B) the core structural findings are robust to that choice.

Four independent sweeps:
  1. THRESHOLD  (full role graph, SIM):  isolated count + avg degree + components
        -> shows hairball below 0.22, fragmentation at 0.30: bounds the band.
  2. CANONICAL  (full role graph, SIM):  edge-persistence of the verified pairs
        -> cosines are FIXED; this shows at which thresholds each stays an edge.
  3. ONWARD     (stratified services, SSIM): onward door per role across the band,
        using the SHIPPING rule (junction-guarded, distinctiveness dropped).
        Classified STABLE / CORE-STABLE / UNSTABLE.
  4. MIN_STRATUM (posting counts):       splittable-into-both count across {20,25,30}
        -> the 12<->13 fragility (Security gcc=25 sits on the floor).

NB: sweeps 1-3 vary the EDGE threshold (cosines never move). Sweep 4 varies
MIN_STRATUM (posting counts). They are deliberately NOT crossed — the threshold
does not govern the splittable count and vice versa.

Run from the SAME directory as plexus_step3_probe.py and the data files:
    python plexus_sensitivity.py
Emits a console report + plexus_sensitivity.json (methodology-surface artifact).
"""

import io
import json
import contextlib
import numpy as np
import networkx as nx

# ---------------------------------------------------------------------------
# Load the frozen probe (runs its full pipeline once, silently) and borrow
# its globals. Nothing here mutates the probe.
# ---------------------------------------------------------------------------
print("loading frozen Step-3 pipeline (suppressing its output)...")
with contextlib.redirect_stdout(io.StringIO()):
    import plexus_step3_probe as P
print("pipeline loaded.\n")

roles      = P.roles            # full role-graph node names
SIM        = P.SIM              # cosine matrix over `roles`
snodes     = P.snodes           # stratified node names ("Role @ services"/"@ gcc")
SSIM       = P.SSIM             # cosine matrix over `snodes`
serv       = P.serv             # services stratified nodes
node_roles = P.node_roles       # roles clearing MIN_ROLE_POSTINGS
s_role     = P.s_role
s_strat    = P.s_strat
direct     = P.direct           # within-services doors of a stratified node @ thr
score_onward = P.score_onward   # onward candidates @ thr (we drop its distinctiveness rank)

BAND = [0.20, 0.22, 0.25, 0.28, 0.30]   # full sweep range (sweeps 1, 2, 3b display)
# regimes the data revealed in sweep 1: 0 isolated holds through 0.25, fragments at 0.28.
CONNECTED = [0.20, 0.22, 0.25]          # every role has a neighbour here — stability lives here
LEGIBLE   = [0.22, 0.25]                # connected AND not hairball-dense (avg deg ~9 / ~7.6)
POSTCLIFF = [0.28, 0.30]                # roles fragment off here — reported, not counted
OPERATING = 0.25                         # the connectivity ceiling: highest thr with 0 isolated
GENERALIST = "Software Engineer (General)"   # constructed catch-all: never an onward door

RESULTS = {"band": BAND, "connected": CONNECTED, "legible": LEGIBLE,
           "operating_threshold": OPERATING}


def banner(t):
    print("\n" + "=" * 66 + "\n" + t + "\n" + "=" * 66)


# ---------------------------------------------------------------------------
# SWEEP 1 — threshold sweep on the full role graph (the Goldilocks evidence)
# ---------------------------------------------------------------------------
banner("1 · THRESHOLD SWEEP — full role graph (bounds the viable band)")
print(f"{'thr':>6} {'edges':>6} {'avg_deg':>8} {'components':>11} {'isolated':>9}")
sweep1 = []
for thr in BAND:
    G = nx.Graph(); G.add_nodes_from(roles)
    for i in range(len(roles)):
        for j in range(i + 1, len(roles)):
            if SIM[i][j] >= thr:
                G.add_edge(roles[i], roles[j])
    degs = [d for _, d in G.degree()]
    iso = [r for r in roles if G.degree(r) == 0]
    row = {"thr": thr, "edges": G.number_of_edges(),
           "avg_degree": round(float(np.mean(degs)), 2),
           "components": nx.number_connected_components(G),
           "isolated": len(iso), "isolated_nodes": iso}
    sweep1.append(row)
    print(f"{thr:>6} {row['edges']:>6} {row['avg_degree']:>8} "
          f"{row['components']:>11} {row['isolated']:>9}"
          + (f"   {iso}" if iso else ""))
print("\nread: 0 isolated holds through 0.25, then 0.28 fragments roles off (cliff).")
print("below ~0.22 the graph thickens toward a hairball (avg degree climbs).")
print("0.25 is the CONNECTIVITY CEILING — the highest threshold at which every role")
print("still has a neighbour. that is a stated principle, not a cut tuned to erase islands.")
RESULTS["threshold_sweep"] = sweep1


# ---------------------------------------------------------------------------
# SWEEP 2 — canonical edge persistence (verified cosines are fixed)
# ---------------------------------------------------------------------------
banner("2 · CANONICAL ADJACENCIES — cosine is fixed; edge status vs threshold")
CANON_PAIRS = [
    ("Backend / Java Developer", "Full Stack Developer"),
    ("Frontend Developer",       "Full Stack Developer"),
    ("DevOps / SRE",             "Cloud Engineer / Architect"),
    ("QA / Test Engineer",       "Software Engineer (General)"),
    ("Security Engineer",        "Network / Sys Admin"),
]
def sim_full(a, b):
    if a in roles and b in roles:
        return float(SIM[roles.index(a)][roles.index(b)])
    return None

print(f"{'pair':<52}{'cos':>6}   " + "  ".join(f"{t:>4}" for t in BAND))
sweep2 = []
for a, b in CANON_PAIRS:
    c = sim_full(a, b)
    label = f"{a.split('/')[0].strip()[:22]} ~ {b.split('/')[0].strip()[:22]}"
    if c is None:
        print(f"{label:<52}{'n/a':>6}   (one or both roles not in graph)")
        sweep2.append({"pair": [a, b], "cosine": None}); continue
    marks = "  ".join(f"{'edge' if c >= t else '--':>4}" for t in BAND)
    print(f"{label:<52}{c:>6.2f}   {marks}")
    sweep2.append({"pair": [a, b], "cosine": round(c, 3),
                   "edge_at": {str(t): (c >= t) for t in BAND}})
print("\nread: cosines do not move with threshold; only edge membership does.")
print("a finding is fragile only if a verified edge dies inside the core band.")
RESULTS["canonical_persistence"] = sweep2


# ---------------------------------------------------------------------------
# SWEEP 3 — onward-door stability (SHIPPING rule: hub-guarded, no distinctiveness)
# ---------------------------------------------------------------------------
banner("3 · ONWARD-DOOR STABILITY — junction-guarded, across the band")

# total postings per role (for volume tiebreak + display)
_vc = P.sub["role"].value_counts()
ROLE_POST = {r: int(_vc.get(r, 0)) for r in node_roles}
N_SERV = len(serv)

def is_junction(m, thr):
    """m is a structural junction if it is a direct door for >60% of services roles."""
    if N_SERV <= 1:
        return False
    deg = len(direct(m, thr))          # symmetric graph: m's door-count == roles m is a door for
    return deg / (N_SERV - 1) > 0.60

def onward(n, thr):
    """Shipping onward rule. Returns dict or None.
       TWO guards against surfacing a generic node as the crowned onward move:
         (a) definitional — the constructed catch-all SE(General) is never the
             onward door, by construction (it can still be a plain direct door);
         (b) structural — any node that is a direct door for >60% of services
             roles is flagged a junction and kept out of the 'specific' slot.
       Rank by new-roles-opened (count), posting-volume tiebreak. No distinctiveness."""
    cands = [c for c in score_onward(n, thr) if c[1] > 0]   # c = (m, nnew, dist, score, newroles)
    if not cands:
        return None
    enr = []
    for m, nnew, _dist, _score, newroles in cands:
        if s_role(m) == GENERALIST:          # guard (a): definitional exclusion
            continue
        vol = sum(ROLE_POST.get(r, 0) for r in newroles)
        enr.append((m, nnew, vol, newroles))
    if not enr:
        return None
    enr.sort(key=lambda c: (-c[1], -c[2]))                  # count first, volume tiebreak
    nonj = [c for c in enr if not is_junction(c[0], thr)]   # guard (b): structural hub test
    pick, kind = (nonj[0], "specific") if nonj else (enr[0], "junction-only")
    m, nnew, vol, newroles = pick
    return {"door": s_role(m), "kind": kind, "opens": nnew,
            "opens_postings": vol, "new_roles": newroles}

def door_name(n, thr):
    o = onward(n, thr)
    return None if o is None else (o["door"], o["kind"])

def _abbr(v):
    # v is (door_role, kind) or None — show identity, not just category
    if v is None:
        return "—"
    door, kind = v
    short = door.split("/")[0].split("(")[0].strip()[:8]
    return short + ("*" if kind == "junction-only" else "")

sweep3 = []
counts = {"STABLE": 0, "NEAR-STABLE": 0, "UNSTABLE": 0}
print(f"{'role':<26}{'verdict':<13}{'0.20':<10}{'0.22':<10}{'0.25':<10}{'cliff'}")
for n in serv:
    per = {str(t): door_name(n, t) for t in BAND}
    conn_set = {per[str(t)] for t in CONNECTED}   # [0.20, 0.22, 0.25] — identity compared
    leg_set  = {per[str(t)] for t in LEGIBLE}      # [0.22, 0.25]
    if len(conn_set) == 1:
        verdict = "STABLE"          # SAME door across the whole connected band
    elif len(leg_set) == 1:
        verdict = "NEAR-STABLE"     # same door in the legible band; differs only at dense 0.20
    else:
        verdict = "UNSTABLE"        # door identity changes inside the legible band — real fragility
    counts[verdict] += 1
    cliff = "".join("·" if per[str(t)] is None else ("J" if per[str(t)][1] == "junction-only" else "S") for t in POSTCLIFF)
    print(f"{s_role(n)[:25]:<26}{verdict:<13}"
          f"{_abbr(per['0.2']):<10}{_abbr(per['0.22']):<10}{_abbr(per['0.25']):<10}{cliff}")
    sweep3.append({"role": s_role(n), "verdict": verdict,
                   "onward_by_threshold": {k: (None if v is None else {"door": v[0], "kind": v[1]}) for k, v in per.items()},
                   "detail_at_operating": onward(n, OPERATING)})
print(f"\nlegend: door columns show the crowned onward door's identity at each connected threshold.")
print(f"        * = junction-flagged · — = no onward door · cliff = S/J/· at {POSTCLIFF} (not counted)")
print(f"        STABLE = same door across {CONNECTED} · NEAR-STABLE = same across {LEGIBLE} only")
print(f"\nVERDICT: {counts['STABLE']} stable · {counts['NEAR-STABLE']} near-stable · "
      f"{counts['UNSTABLE']} unstable  (of {len(serv)} services nodes)")
print("UNSTABLE here means the door's IDENTITY changes inside the legible band {0.22,0.25} —")
print("that is genuine fragility, and for those roles a single crowned onward card is NOT")
print("defensible (show the top 2-3 instead). stable+near-stable roles can keep one card.")
print("SE(General) is excluded from the onward slot by construction (— where it was the only door).")
RESULTS["onward_stability"] = {"counts": counts, "roles": sweep3}

# --- soft-hub check: is any crowned onward door quietly acting like SE did? ---
print("\n--- onward-door concentration @ 0.25 (soft-hub check) ---")
from collections import Counter as _C
crowned = _C()
for n in serv:
    o = onward(n, OPERATING)
    if o is not None:
        crowned[o["door"]] += 1
print(f"{'onward door':<28}{'#roles crown it':>16}{'its door-degree':>17}{'frac of roles':>15}")
hub_rows = []
for door, freq in crowned.most_common():
    snode = f"{door} @ services"
    if snode in serv:
        deg = len(direct(snode, OPERATING))
        frac = deg / (N_SERV - 1)
        flag = "  <-- >60% JUNCTION" if frac > 0.60 else ("  (watch)" if frac > 0.45 else "")
        print(f"{door[:27]:<28}{freq:>16}{deg:>17}{frac:>14.0%}{flag}")
        hub_rows.append({"door": door, "crowned_by": freq, "degree": deg, "fraction": round(frac, 3)})
print("read: a door crowned by many roles is only a problem if it is ALSO high-degree")
print("(a structural hub). high crown-count + low/mid degree = a genuine specialism many")
print("roles legitimately border, not a catch-all. that distinction is the whole point.")
RESULTS["onward_concentration"] = hub_rows


# ---------------------------------------------------------------------------
# SWEEP 3b — sparse-role nearest within-services door (settles the label question)
# ---------------------------------------------------------------------------
banner("3b · SPARSE ROLES — actual nearest within-services cosine (read the bytes)")
def sim_s(a, b):
    return float(SSIM[snodes.index(a)][snodes.index(b)])
sparse = [n for n in serv if not direct(n, OPERATING)]
sparse_rows = []
print(f"{'role (services)':<30}{'nearest within-svc door':<30}{'cos':>6}  crosses?")
for n in sparse:
    others = [m for m in serv if m != n]
    if not others:
        continue
    nearest = max(others, key=lambda m: sim_s(n, m))
    c = sim_s(n, nearest)
    crosses = " ".join(f"{t}:{'Y' if c >= t else 'n'}" for t in BAND)
    print(f"{s_role(n)[:29]:<30}{s_role(nearest)[:29]:<30}{c:>6.2f}  {crosses}")
    sparse_rows.append({"role": s_role(n), "nearest": s_role(nearest),
                        "cosine": round(c, 3),
                        "edge_at": {str(t): (c >= t) for t in BAND}})
print("\nread: this prints the real stratified cosine, not the label. if a role the")
print("doc calls 'sparse @ 0.25' actually has cos >= 0.25 here, the doc is stale — fix it.")
RESULTS["sparse_nearest"] = sparse_rows


# ---------------------------------------------------------------------------
# SWEEP 4 — MIN_STRATUM sweep (the 12<->13 fragility)
# ---------------------------------------------------------------------------
banner("4 · MIN_STRATUM SWEEP — splittable-into-both count (12<->13 fragility)")
def strat_n(role, et):
    return int(((P.sub.role == role) & (P.sub.emp_type == et)).sum())

sweep4 = []
prev = None
print(f"{'MIN_STRATUM':>12}{'splittable_both':>17}   roles entering/leaving vs previous")
for ms in [20, 25, 30]:
    both = sorted(r for r in node_roles
                  if strat_n(r, "services") >= ms and strat_n(r, "gcc") >= ms)
    delta = ""
    if prev is not None:
        gained = sorted(set(both) - set(prev))
        lost = sorted(set(prev) - set(both))
        bits = []
        if gained: bits.append("+" + ", ".join(gained))
        if lost:   bits.append("-" + ", ".join(lost))
        delta = "  ".join(bits)
    print(f"{ms:>12}{len(both):>17}   {delta}")
    sweep4.append({"min_stratum": ms, "count": len(both), "roles": both})
    prev = both
# spotlight the floor case
sec_gcc = strat_n("Security Engineer", "gcc")
print(f"\nSecurity Engineer gcc count = {sec_gcc}  (floor is MIN_STRATUM=25)")
print("if this equals 25, one posting either way flips the headline 12<->13 — disclose as a range.")
RESULTS["min_stratum_sweep"] = {"rows": sweep4, "security_gcc_count": sec_gcc}


# ---------------------------------------------------------------------------
# WRITE ARTIFACT
# ---------------------------------------------------------------------------
banner("WRITE")
with open("plexus_sensitivity.json", "w") as f:
    json.dump(RESULTS, f, indent=2)
print("wrote plexus_sensitivity.json")
print("\npaste the full console output back for review. things to check:")
print("  - sweep 1: is isolated==0 only inside [0.22,0.28]? does 0.30 reintroduce isolates?")
print("  - sweep 2: does any verified edge die inside the core band {0.22,0.25,0.28}?")
print("  - sweep 3: how many STABLE/NEAR-STABLE now SE(General) is excluded? any UNSTABLE in the legible band {0.22,0.25}?")
print("  - sweep 3b: does any 'sparse' role actually clear 0.25? (stale-doc check)")
print("  - sweep 4: is the count 12 or 13 at MS=25, and where does it flip?")
