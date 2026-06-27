"""
Plexus — Step-3 Adjacent Roles Probe
Extends Step-2 with Product Manager + UX/UI Designer probe.

Step-1 proved the structure holds (clustering PASS, stratification PASS).
Step-2 fixed the reachability metric (symmetric cosine, 0 isolated nodes).
Step-3 adds PM and UX/UI to the filter and canon, then re-runs the full
pipeline to check whether they clear MIN_ROLE_POSTINGS and MIN_STRATUM.

Run from terminal:
    python plexus_step3_probe.py

Output is printed to stdout — paste the full output back for review.
"""

import re
import numpy as np
import pandas as pd
from collections import Counter, defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import networkx as nx

pd.set_option("display.max_colwidth", 60)


# =============================================================================
# 0 · CONFIG & IMPORTS
# Edit SUBSTRATE / GCC_FILE to your local paths.
# =============================================================================

SUBSTRATE = "indian-job-market-dataset-2025.xlsx"
GCC_FILE  = "GCC-Journal-India-List.xlsx"

# --- tunables ---
MIN_ROLE_POSTINGS = 80
MIN_STRATUM       = 25
CORE_K            = 12
EDGE_THRESHOLDS   = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40]
GRAPH_THRESHOLD   = 0.25   # confirmed from sweep: 0 isolated @ 0.25

# Fix E — parse-time NOISE blocklist
NOISE = {
    'senior','junior','it services','dot','technical support','web services',
    'good','communication','good communication','years','experience','responsible',
    'ability','work','team','it','company','role','job','requirement','knowledge',
    'strong','excellent','skills','skill','plus','etc','various','new','using',
    'related','based','per','will','must','candidate','position',
    'immediate joiner','notice period'
}

# alias map
ALIAS = {
    'reactjs':'react','react.js':'react','react js':'react',
    'nodejs':'node','node.js':'node','node js':'node',
    'js':'javascript','ts':'typescript','k8s':'kubernetes',
    'aws cloud':'aws','amazon web services':'aws',
    'mssql':'sql server','ms sql':'sql server',
    'postgresql':'postgres','mongo':'mongodb',
    'dot net':'.net','dotnet':'.net','dot net core':'.net core',
    'asp.net':'.net','asp net':'.net',
    'c sharp':'c#','csharp':'c#',
    'springboot':'spring boot','restful':'rest api','rest':'rest api',
    'cicd':'ci cd','ci/cd':'ci cd','ml':'machine learning',
    'powerbi':'power bi','html5':'html','css3':'css'
}

# SKILL_STOP — generic-but-real skills stripped when building discriminative role cores
SKILL_STOP = {
    'software','development','software development','software engineering',
    'programming','coding','technical','troubleshooting','analytical',
    'problem solving','teamwork','sales','administration','management',
    'design','testing','engineering','operations','support','documentation',
    'agile','scrum','leadership','time management','information technology',
    'computer science','project management','application development',
    'development methodologies','business intelligence'
}


# =============================================================================
# 1 · LOAD & CONFIRM SHAPES
# =============================================================================

print("=" * 60)
print("1 · LOAD")
print("=" * 60)
df  = pd.read_excel(SUBSTRATE, sheet_name="Sheet1")
gcc = pd.read_excel(GCC_FILE, sheet_name="All GCCs – India Master")
print("Substrate:", df.shape, "| GCC master:", gcc.shape)
assert {"title", "tagsAndSkills", "companyName"} <= set(df.columns)
assert "Company / GCC Name" in gcc.columns


# =============================================================================
# 2 · IT SUBSET FILTER
# CHANGE 1: PM and UX keywords added to TECH_TITLE
# =============================================================================

print("\n" + "=" * 60)
print("2 · IT SUBSET FILTER")
print("=" * 60)

TECH_TITLE = [
    'software','developer','programmer','full stack','fullstack',
    'frontend','front end','backend','back end','devops',' sre',
    'data scien','data engineer','data analyst','ml engineer',
    'machine learning',' ai ','ai engineer','qa ','sdet','test engineer',
    'automation test','tester','web develop','mobile develop','android',
    'ios develop','java develop','python develop','dot net','.net',
    'php develop','cloud engineer','cloud architect','solution architect',
    'technical architect','database admin','dba','system admin',
    'network engineer','security engineer','cyber','sap ','salesforce',
    'tech lead','engineering manager','data architect','etl',
    'bi develop','platform engineer',
    # CHANGE 1 — PM and UX additions
    'product manager','product owner','associate product manager',
    'ux designer','ui designer','ux researcher','product designer',
    'ui/ux','interaction designer','user experience','user research',
]

TECH_SKILL = [
    'java','python','javascript','typescript','react','angular','vue',
    'node','express','aws','azure','gcp','kubernetes','docker','sql',
    'mysql','postgres','mongodb','spring','hibernate','c++','c#','.net',
    'php','html','css','git','jenkins','kafka','spark','hadoop',
    'tensorflow','pytorch','selenium','rest api','microservices','devops',
    'linux','terraform','redis','elasticsearch','scala','golang','rust'
]

t = df["title"].fillna("").str.lower()
s = df["tagsAndSkills"].fillna("").str.lower()
is_it = (
    t.apply(lambda x: any(k in x for k in TECH_TITLE)) |
    s.apply(lambda x: sum(1 for k in TECH_SKILL if k in x) >= 2)
)
sub = df[is_it].copy().reset_index(drop=True)
print(f"IT subset: {len(sub)} ({len(sub)/len(df)*100:.1f}%)")


# =============================================================================
# 3 · CLEANED SKILL NORMALISATION (Fix E)
# =============================================================================

print("\n" + "=" * 60)
print("3 · SKILL NORMALISATION")
print("=" * 60)

def clean_tok(tok):
    tok = tok.strip().lower()
    tok = re.sub(r'[^a-z0-9+#. /]', ' ', tok)   # keep + # . so c#, c++, .net survive
    tok = re.sub(r'\s+', ' ', tok).strip()
    return ALIAS.get(tok, tok)

def parse_skills(cell):
    if not isinstance(cell, str):
        return []
    out = []
    for raw in cell.split(','):
        c = clean_tok(raw)
        if c and len(c) > 1 and c not in NOISE:
            out.append(c)
    return out

sub["skills"] = sub["tagsAndSkills"].apply(parse_skills)
allsk = Counter(sk for lst in sub["skills"] for sk in lst)
print("avg skills/posting:", round(sub['skills'].apply(len).mean(), 1))
print("\nTOP 25 cleaned skills:")
for sk, c in allsk.most_common(25):
    print(f"  {sk:26s} {c}")
print("\n[check] junk tokens gone?",
      {j: allsk.get(j, 0) for j in ['senior','it services','dot','technical support','web services']})
print("[check] tech tokens preserved?",
      {j: allsk.get(j, 0) for j in ['.net','c#','c++','.net core']})


# =============================================================================
# 4 · CANONICAL ROLES + DE-HUB
# CHANGE 2: Product Manager and UX / UI Designer added before SE(General)
# =============================================================================

print("\n" + "=" * 60)
print("4 · CANONICAL ROLES + DE-HUB")
print("=" * 60)

CANON = [
    ('Data Scientist / ML',        ['data scientist','machine learning','ml engineer','ai engineer','deep learning','data science']),
    ('Data Engineer',              ['data engineer','etl','big data','hadoop','spark develop','databricks']),
    ('Data / BI Analyst',          ['data analyst','business analyst','bi develop','bi analyst','power bi','tableau','analytics']),
    ('DevOps / SRE',               ['devops','site reliability',' sre','platform engineer','build and release','cloudops']),
    ('Cloud Engineer / Architect', ['cloud engineer','cloud architect','aws engineer','azure engineer','cloud consultant']),
    ('Security Engineer',          ['security engineer','cyber','infosec','soc analyst','penetration','vapt']),
    ('QA / Test Engineer',         ['qa','quality assurance','test engineer','sdet','automation test','software tester','testing','test analyst']),
    ('Full Stack Developer',       ['full stack','fullstack','mean stack','mern','mern stack']),
    ('Frontend Developer',         ['frontend','front end','react develop','angular develop','ui developer','ui engineer','ui/ux develop']),
    ('Mobile Developer',           ['android develop','ios develop','mobile develop','flutter','react native develop']),
    ('.NET Developer',             ['.net','dot net','c# develop','asp.net']),
    ('PHP / Web Developer',        ['php develop','laravel','wordpress developer','codeigniter','core php']),
    ('Backend / Java Developer',   ['backend','back end','java develop','spring develop','node develop','python develop','golang develop','api develop']),
    ('Database Architect',         ['database architect','data architect']),
    ('Database Administrator',     ['dba','database admin','oracle dba','sql dba','database engineer']),
    ('Solution / Tech Architect',  ['solution architect','technical architect','software architect','enterprise architect']),
    ('Eng Manager / Tech Lead',    ['engineering manager','tech lead','technical lead','team lead','development lead','delivery lead']),
    ('SAP Consultant',             ['sap']),
    ('Salesforce Developer',       ['salesforce']),
    ('Network / Sys Admin',        ['network engineer','system administrator','system admin','network admin','windows admin','linux admin','noc']),
    # CHANGE 2 — new adjacent roles (must sit above SE(General) catch-all)
    ('Product Manager',            ['product manager','product owner','associate product manager',
                                    'apm','senior product manager','group product manager']),
    ('UX / UI Designer',           ['ux designer','ui designer','ux researcher','product designer',
                                    'ui/ux','interaction designer','user experience designer',
                                    'visual designer']),
    ('Software Engineer (General)',['software engineer','software developer','programmer','sde','application developer','it developer']),
]

def assign_role(title):
    tl = str(title).lower()
    for lab, kw in CANON:
        if any(k in tl for k in kw):
            return lab
    return 'unclassified'

sub["role"] = sub["title"].apply(assign_role)

SIGNALS = {
    'Frontend Developer':       ['react','angular','vue','javascript','typescript','redux','rxjs','html','css','responsive web design','frontend development','next js'],
    'Backend / Java Developer': ['spring','spring boot','hibernate','microservices','j2ee','jpa','rest api','spring mvc','kafka'],
    '.NET Developer':           ['.net','.net core','c#','asp','mvc','entity framework','wpf'],
    'PHP / Web Developer':      ['php','laravel','wordpress','codeigniter','magento'],
    'Data Scientist / ML':      ['machine learning','deep learning','tensorflow','pytorch','keras','nlp','computer vision','data scientist','pandas'],
    'Data Engineer':            ['etl','spark','hadoop','pyspark','hive','airflow','snowflake','data warehousing','scala','databricks'],
    'Data / BI Analyst':        ['power bi','tableau','data analysis','data visualization','qlik'],
    'DevOps / SRE':             ['devops','kubernetes','docker','terraform','jenkins','ci cd','ansible','sre','aws devops'],
    'QA / Test Engineer':       ['selenium','automation testing','sdet','appium','cypress','playwright','rest assured','test automation','manual testing'],
    'Database Administrator':   ['oracle dba','rman','oracle rac','database administration','sql server dba'],
    'SAP Consultant':           ['sap','sap abap','sap sd','sap fico','sap hana','sap mm'],
    'Salesforce Developer':     ['salesforce','apex','visualforce','soql','salesforce lightning'],
    'Mobile Developer':         ['android','ios','flutter','kotlin','swift','react native'],
    'Security Engineer':        ['penetration testing','vapt','siem','soc','cyber security','owasp'],
}

def reroute(skills):
    sk = set(skills)
    best = None
    bn = 0
    second = 0
    for role, sig in SIGNALS.items():
        h = sum(1 for x in sig if x in sk)
        if h > bn:
            second = bn; bn = h; best = role
        elif h > second:
            second = h
    return best if (bn >= 2 and bn - second >= 1) else None

mask = sub["role"] == "Software Engineer (General)"
rr = sub.loc[mask, "skills"].apply(reroute)
sub.loc[mask, "role"] = rr.where(rr.notna(), "Software Engineer (General)")
print(f"de-hub rerouted {int(rr.notna().sum())} postings out of Software Engineer (General)")

role_counts = sub["role"].value_counts()
node_roles = [r for r, c in role_counts.items() if r != 'unclassified' and c >= MIN_ROLE_POSTINGS]
print(f"graph-eligible role nodes: {len(node_roles)}")
print("\nRole counts (all roles including new):")
for r, c in role_counts.items():
    flag = ""
    if r in ('Product Manager', 'UX / UI Designer'):
        flag = "  ← NEW"
    elif r == 'unclassified':
        flag = "  (excluded)"
    marker = "✓" if (r != 'unclassified' and c >= MIN_ROLE_POSTINGS) else "✗"
    print(f"  {marker} {r:35s} {c:6d}{flag}")


# =============================================================================
# 5 · ROLE VECTORS ON CLEANED SKILLS (TF-IDF)
# =============================================================================

print("\n" + "=" * 60)
print("5 · ROLE VECTORS")
print("=" * 60)

def core(role, k=CORE_K, stratum=None):
    m = (sub.role == role)
    if stratum is not None:
        m &= (sub.emp_type == stratum)
    toks = [s for lst in sub.loc[m, "skills"] for s in lst if s not in SKILL_STOP]
    return [w for w, _ in Counter(toks).most_common(k)]

role_docs = {}
for r in node_roles:
    role_docs[r] = [s for lst in sub.loc[sub.role == r, "skills"] for s in lst]

roles = list(role_docs.keys())
vec = TfidfVectorizer(analyzer=lambda x: x, min_df=2, sublinear_tf=True)
X = vec.fit_transform([role_docs[r] for r in roles])
SIM = cosine_similarity(X)
print("role-vector matrix:", X.shape)


# =============================================================================
# DIAGNOSTIC 1 — Gate-1 nearest neighbours on CLEANED vectors (CHECKPOINT)
# Do the Step-2-validated connections survive the new roles being added?
# =============================================================================

print("\n" + "=" * 60)
print("DIAGNOSTIC 1 · CLEANED GATE-1 NEAREST NEIGHBOURS")
print("Reference: QA->SE ~0.40, Backend->Full Stack ~0.63")
print("=" * 60)

def nn(role, k=5):
    i = roles.index(role)
    order = SIM[i].argsort()[::-1]
    return [(roles[j], round(float(SIM[i][j]), 2)) for j in order if roles[j] != role][:k]

check_roles = [
    'QA / Test Engineer', 'Backend / Java Developer', 'Database Administrator',
    'Data Scientist / ML', 'DevOps / SRE', 'Frontend Developer', 'Security Engineer',
    'Product Manager', 'UX / UI Designer',   # new roles — check their neighbours
]
for p in check_roles:
    if p in roles:
        print(f"{p:32s} -> {nn(p)}")
    else:
        print(f"{p:32s} -> NOT IN GRAPH (below MIN_ROLE_POSTINGS={MIN_ROLE_POSTINGS})")


# =============================================================================
# 6 · FIX A — SYMMETRIC-COSINE REACHABILITY + THRESHOLD SWEEP
# =============================================================================

print("\n" + "=" * 60)
print("6 · THRESHOLD SWEEP (full role graph)")
print("=" * 60)

print(f"{'thr':>5} {'edges':>6} {'avg_deg':>8} {'components':>11} {'isolated':>9}")
for thr in EDGE_THRESHOLDS:
    G = nx.Graph()
    G.add_nodes_from(roles)
    for i in range(len(roles)):
        for j in range(i + 1, len(roles)):
            if SIM[i][j] >= thr:
                G.add_edge(roles[i], roles[j])
    degs = [d for _, d in G.degree()]
    print(f"{thr:>5} {G.number_of_edges():>6} {np.mean(degs):>8.2f} "
          f"{nx.number_connected_components(G):>11} {sum(1 for d in degs if d == 0):>9}")

G = nx.Graph()
G.add_nodes_from(roles)
for i in range(len(roles)):
    for j in range(i + 1, len(roles)):
        if SIM[i][j] >= GRAPH_THRESHOLD:
            G.add_edge(roles[i], roles[j], weight=round(float(SIM[i][j]), 3))
isolated = [r for r in roles if G.degree(r) == 0]
print(f"\n@ GRAPH_THRESHOLD={GRAPH_THRESHOLD}: {G.number_of_edges()} edges, "
      f"isolated nodes ({len(isolated)}): {isolated}")
print(">> Step-2 had 0 isolated. Check if new roles disturb this.")


# =============================================================================
# 7 · FIX B — NODE-LEVEL STRATIFICATION
# =============================================================================

print("\n" + "=" * 60)
print("7 · EMPLOYER TAGGING + STRATIFICATION")
print("=" * 60)

def norm(x):
    x = str(x).lower()
    x = re.sub(r'[^a-z0-9 ]', ' ', x)
    return re.sub(r'\s+', ' ', x).strip()

def tokm(n, p):
    p = norm(p)
    return bool(p) and re.search(r'(?:^| )' + re.escape(p) + r'(?:$| )', n) is not None

BLOCK = [
    'accenture','wipro','capgemini','cognizant','hcltech','hcl technologies',
    'tcs','tata consultancy','tech mahindra','mphasis','hexaware','zensar',
    'mindtree','ltimindtree','ltts','persistent','coforge','birlasoft','cybage',
    'conduent','genpact','wns','firstsource','ey','deloitte','kpmg','pwc',
    'ibm','dxc','atos','infosys','info edge','nagarro','happiest minds',
    'sonata','cyient','kpit','zoho'
]

def gcc_brand(raw):
    x = norm(raw)
    for j in ['india','bangalore','bengaluru','hyderabad','pune','mumbai',
              'chennai','delhi','ncr','gurgaon','gurugram','kolkata','gcc',
              'global','capability','centre','center','technology','technologies',
              'solutions','services','engineering','advanced','development']:
        x = re.sub(r'(?:^| )' + j + r'(?:$| )', ' ', ' ' + x + ' ').strip()
    return re.sub(r'\s+', ' ', x).strip()

genuine = sorted({
    gcc_brand(r) for r in gcc['Company / GCC Name'].dropna()
    if not any(tokm(norm(r), b) for b in BLOCK) and len(gcc_brand(r)) >= 3
})

def tag(cn):
    nm = norm(cn)
    if any(tokm(nm, b) for b in BLOCK): return 'services'
    if any(tokm(nm, g) for g in genuine): return 'gcc'
    return 'other'

sub['emp_type'] = sub['companyName'].apply(tag)

# stratified nodes
strat_docs = {}
for r in node_roles:
    for et in ['services', 'gcc']:
        d = [s for lst in sub.loc[(sub.role == r) & (sub.emp_type == et), "skills"] for s in lst]
        if sub[(sub.role == r) & (sub.emp_type == et)].shape[0] >= MIN_STRATUM:
            strat_docs[f"{r} @ {et}"] = d

snodes = list(strat_docs)
svec = TfidfVectorizer(analyzer=lambda x: x, min_df=2, sublinear_tf=True)
SX = svec.fit_transform([strat_docs[n] for n in snodes])
SSIM = cosine_similarity(SX)

def s_strat(n): return n.rsplit(" @ ", 1)[1]
def s_role(n):  return n.rsplit(" @ ", 1)[0]

def reach_stratified(node, thr):
    i = snodes.index(node)
    st = s_strat(node)
    within, cross = [], []
    for j, m in enumerate(snodes):
        if j == i or SSIM[i][j] < thr:
            continue
        (within if s_strat(m) == st else cross).append((s_role(m), round(float(SSIM[i][j]), 2)))
    return sorted(within, key=lambda x: -x[1]), sorted(cross, key=lambda x: -x[1])

print(f"stratified nodes ({len(snodes)}): "
      f"{sum(1 for n in snodes if s_strat(n)=='services')} services / "
      f"{sum(1 for n in snodes if s_strat(n)=='gcc')} gcc\n")

for n in [x for x in snodes if s_strat(x) == 'services']:
    w, c = reach_stratified(n, GRAPH_THRESHOLD)
    flag = "  ← NEW" if s_role(n) in ('Product Manager', 'UX / UI Designer') else ""
    print(f"[{n}]{flag}")
    print(f"   within-stratum doors: {w if w else '(none direct)'}")
    print(f"   cross-stratum (GCC, labelled): {c if c else '(none)'}")


# =============================================================================
# MOAT HEADLINE — roles splittable into BOTH strata
# =============================================================================

print("\n" + "=" * 60)
print("MOAT — SPLITTABLE ROLES")
print("=" * 60)

def _strat_n(role, et):
    return int(((sub.role == role) & (sub.emp_type == et)).sum())

both = [r for r in node_roles
        if _strat_n(r, 'services') >= MIN_STRATUM and _strat_n(r, 'gcc') >= MIN_STRATUM]
services_only = [r for r in node_roles
                 if _strat_n(r, 'services') >= MIN_STRATUM and _strat_n(r, 'gcc') < MIN_STRATUM]
gcc_only = [r for r in node_roles
            if _strat_n(r, 'services') < MIN_STRATUM and _strat_n(r, 'gcc') >= MIN_STRATUM]

print(f"MIN_STRATUM = {MIN_STRATUM}")
print(f"splittable into BOTH strata: {len(both)}")
for r in sorted(both):
    flag = "  ← NEW" if r in ('Product Manager', 'UX / UI Designer') else ""
    print(f"   {r:35s} services={_strat_n(r,'services'):5d}  gcc={_strat_n(r,'gcc'):5d}{flag}")
print(f"services-node only: {len(services_only)} | gcc-node only: {len(gcc_only)}")
print(">> update the context doc moat number (was 13) with len(both) after confirming.")


# =============================================================================
# 8 · FIX C — TWO-HOP PATHFINDER WITH SPECIFICITY-WEIGHTED ONWARD DOORS
# CHANGE 3: BRIDGE_STOP added; gap_to patched to filter soft descriptors
# =============================================================================

print("\n" + "=" * 60)
print("8 · PATHFINDER (services default view)")
print("=" * 60)

serv = [n for n in snodes if s_strat(n) == 'services']

# document frequency of each skill across role cores
_role_df = Counter()
for r in node_roles:
    for sk in set(core(r, k=30)):
        _role_df[sk] += 1
_n_roles = len(node_roles)

def distinctiveness(node):
    skills = core(s_role(node), k=12, stratum='services')
    if not skills: return 0.0
    rarity = [_n_roles / _role_df.get(sk, 1) for sk in skills]
    return float(np.mean(rarity))

DISTINCT_FLOOR = 5.5

# CHANGE 3 — seniority/soft descriptor guard; covers PM and UX additions
BRIDGE_STOP = {
    'stakeholder management','stakeholder','communication','presentation',
    'leadership','strategy','planning','analytical thinking','problem solving',
    'critical thinking','decision making','user research process',
    'product strategy','business strategy','collaboration','interpersonal',
    'organizational','time management','attention to detail',
    'product lifecycle','roadmap','go to market','market research',
    'wireframing','prototyping','user stories','product vision',
}

def sim(a, b): return float(SSIM[snodes.index(a)][snodes.index(b)])

def direct(n, thr):
    return sorted(
        [m for m in serv if m != n and sim(n, m) >= thr],
        key=lambda m: -sim(n, m)
    )

def gap_to(src_role, dst_role):
    have = set(core(src_role, stratum='services'))
    raw = [sk for sk in core(dst_role, stratum='services') if sk not in have]
    filtered = [sk for sk in raw if sk not in BRIDGE_STOP]
    return filtered[:5] if filtered else raw[:3]   # fallback to raw if all filtered

def score_onward(n, thr):
    d = direct(n, thr)
    dset = set(d) | {n}
    cands = []
    for m in d:
        new = {x for x in direct(m, thr) if x not in dset}
        dist = distinctiveness(m)
        cands.append((m, len(new), dist, len(new) * dist, sorted(s_role(x) for x in new)))
    return sorted(cands, key=lambda c: -c[3])

def pathfinder(n, thr):
    rname = s_role(n)
    d = direct(n, thr)
    flag = "  ← NEW" if rname in ('Product Manager', 'UX / UI Designer') else ""
    print(f"[{rname}]  (services){flag}")
    if not d:
        nearest = max((m for m in serv if m != n), key=lambda m: sim(n, m))
        print(f"   no direct door. nearest door: '{s_role(nearest)}' (cos {sim(n, nearest):.2f}, a stretch)")
        print(f"      skills to bridge there: {gap_to(rname, s_role(nearest))}")
        print(f"      reaching it opens ({len(direct(nearest, thr))}): {[s_role(m) for m in direct(nearest, thr)]}")
        return
    print(f"   reachable now ({len(d)}): {[s_role(m) for m in d]}")
    ranked = [c for c in score_onward(n, thr) if c[1] > 0]
    if not ranked:
        print("   no onward door opens new roles — your direct doors above are the move.")
        return
    print("   onward-door candidates (door | +new | distinct | score):")
    for m, nnew, dist, sc, _ in ranked[:2]:
        print(f"      {s_role(m):28s} +{nnew}  d={dist:.2f}  score={sc:.2f}")
    best = ranked[0]
    m, nnew, dist, sc, newroles = best
    if DISTINCT_FLOOR is None or dist >= DISTINCT_FLOOR:
        print(f"   >> highest-leverage onward door: '{s_role(m)}' "
              f"(learn {gap_to(rname, s_role(m))}) -> opens +{nnew}: {newroles}")
    else:
        print(f"   >> no standout next specialism from here — your direct doors are the real move.")
        print(f"      if pushing further: '{s_role(m)}' (best available, d={dist:.2f}) "
              f"-> opens +{nnew}: {newroles}")

for n in serv:
    pathfinder(n, GRAPH_THRESHOLD)
    print()


# =============================================================================
# 9 · DIAGNOSTIC 2 — DE-HUB ON/OFF CHECK
# =============================================================================

print("\n" + "=" * 60)
print("9 · DIAGNOSTIC 2 — DE-HUB ON/OFF")
print("=" * 60)

sub2 = sub.copy()
sub2["role"] = sub2["title"].apply(assign_role)   # NO de-hub
rc2 = sub2["role"].value_counts()
nr2 = [r for r, c in rc2.items() if r != 'unclassified' and c >= MIN_ROLE_POSTINGS]
rd2 = {r: [s for lst in sub2.loc[sub2.role == r, "skills"] for s in lst] for r in nr2}
v2 = TfidfVectorizer(analyzer=lambda x: x, min_df=2, sublinear_tf=True)
X2 = v2.fit_transform([rd2[r] for r in nr2])
S2 = cosine_similarity(X2)

def iso_count(sim_mat, names, thr):
    G = nx.Graph()
    G.add_nodes_from(names)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if sim_mat[i][j] >= thr:
                G.add_edge(names[i], names[j])
    return [n for n in names if G.degree(n) == 0]

iso_on  = iso_count(SIM, roles, GRAPH_THRESHOLD)
iso_off = iso_count(S2, nr2, GRAPH_THRESHOLD)
print(f"isolated WITH de-hub    ({len(iso_on)}): {iso_on}")
print(f"isolated WITHOUT de-hub ({len(iso_off)}): {iso_off}")
print(">> if WITHOUT has fewer isolated, the generic node was a real bridge and de-hub over-corrected.")


# =============================================================================
# 10 · VERDICT — paste full output back for review
# =============================================================================

print("\n" + "=" * 60)
print("10 · WHAT TO CHECK IN THIS OUTPUT")
print("=" * 60)
print("""
Role counts section:
  - Did Product Manager clear MIN_ROLE_POSTINGS=80?
  - Did UX / UI Designer clear MIN_ROLE_POSTINGS=80?
  - If either is marked ✗, it does not get a node — scope stays as-is for that role.

Diagnostic 1 (nearest neighbours):
  - Do QA->SE and Backend->Full Stack still match Step-2 numbers (~0.40, ~0.63)?
  - What are PM and UX's nearest neighbours? (expect PM->Eng Manager, UX->Frontend)
  - If PM or UX connect to unexpected roles, inspect their skill vectors.

Threshold sweep:
  - Is isolated count still 0 at GRAPH_THRESHOLD=0.25?
  - If new roles cause isolated nodes, raise GRAPH_THRESHOLD or reconsider adding them.

Stratification (moat):
  - Did PM or UX clear MIN_STRATUM=25 for both services AND gcc?
  - If services-only, the two-dialects beat won't fire — still useful, just weaker.
  - Update the context doc moat number from 13 to len(both).

Pathfinder output for PM and UX:
  - Are bridge skills concrete (tools, frameworks) or soft (strategy, collaboration)?
  - If BRIDGE_STOP filtered everything and fallback to raw shows soft skills,
    add those terms to BRIDGE_STOP and re-run.

Diagnostic 2:
  - Should still show 0 isolated with de-hub and 0 without — same as Step-2.
""")
