"""
03_extract_roles.py
Input:  ../output/skill_normalised.parquet
Output: ../output/roles_assigned.parquet
        ../output/03_extract_roles_log.txt

Assignment pipeline:
  Stage 1 — Title match: ordered CANON list, first-wins, 22 specific roles
             before SE(General) catch-all.
  Stage 2 — SE(General) de-hub: reroute via skill SIGNALS fingerprint.
             Requires >=2 signal matches AND gap >=1 over second-best.
  KMeans  — Sanity check only. Runs on TF-IDF skill vectors independently,
             compares cluster labels to rule assignments, reports disagreement rate.
             Does NOT change output.

Run from: pipeline/ directory
"""

import os
import sys
import ast
from collections import Counter

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score

assert os.path.basename(os.getcwd()) == "pipeline", (
    "Run this script from the pipeline/ directory."
)

# ── Tee ──────────────────────────────────────────────────────────────────────

class _Tee:
    def __init__(self, path):
        self._log = open(path, "w", encoding="utf-8")
        self._stdout = sys.stdout
        sys.stdout = self

    def write(self, data):
        self._stdout.write(data)
        self._log.write(data)

    def flush(self):
        self._stdout.flush()
        self._log.flush()

    def isatty(self):
        return False

    def close(self):
        sys.stdout = self._stdout
        self._log.close()

tee = _Tee("../output/03_extract_roles_log.txt")

# ── 1 · LOAD ─────────────────────────────────────────────────────────────────

print("1 · LOAD")
df = pd.read_parquet("../output/skill_normalised.parquet")
print(f"rows loaded: {len(df):,}")

# skills column may be stored as stringified lists — normalise to actual lists
if df["normalised_skills"].dtype == object and isinstance(df["normalised_skills"].iloc[0], str):
    df["normalised_skills"] = df["normalised_skills"].apply(ast.literal_eval)

print(f"null skills rows: {df['normalised_skills'].apply(lambda x: len(x) == 0).sum():,}")

# ── 2 · STAGE 1 — TITLE MATCH ────────────────────────────────────────────────

print("\n2 · STAGE 1 — TITLE MATCH")

CANON = [
    ('Data Scientist / ML',        ['data scientist','machine learning','ml engineer','ai engineer','deep learning','data science','generative ai','llm engineer','llm']),
    ('Data Engineer',              ['data engineer','etl','big data','hadoop','spark develop','databricks','dataops','analytics engineer','snowflake']),
    ('Data / BI Analyst',          ['data analyst','business analyst','bi develop','bi analyst','power bi','tableau','analytics','bi engineer','report developer','reporting']),
    ('DevOps / SRE',               ['devops','site reliability',' sre','platform engineer','build and release','cloudops']),
    ('Cloud Engineer / Architect', ['cloud engineer','cloud architect','aws engineer','azure engineer','cloud consultant']),
    ('Security Engineer',          ['security engineer','security architect','cyber','infosec','soc analyst','penetration','vapt']),
    ('QA / Test Engineer',         ['qa','quality assurance','test engineer','sdet','automation test','software tester','testing','test analyst','uat','performance testing','load testing','quality analyst']),
    ('Full Stack Developer',       ['full stack','fullstack','mean stack','mern','mern stack']),
    ('Frontend Developer',         ['frontend','front end','react develop','angular develop','ui developer','ui engineer','ui/ux develop']),
    ('Mobile Developer',           ['android develop','ios develop','mobile develop','flutter','react native develop']),
    ('.NET Developer',             ['.net','dot net','c# develop','asp.net']),
    ('PHP / Web Developer',        ['php develop','laravel','wordpress developer','codeigniter','core php']),
    ('Backend / Java Developer',   ['backend','back end','java develop','spring develop','node develop','python develop','golang develop','api develop','java engineer','python engineer','node engineer']),
    ('Database Architect',         ['database architect','data architect']),
    ('Database Administrator',     ['dba','database admin','oracle dba','sql dba','database engineer']),
    ('Solution / Tech Architect',  ['solution architect','technical architect','software architect','enterprise architect','java architect','technology architect','software architect','application architect']),
    ('Eng Manager / Tech Lead',    ['engineering manager','tech lead','technical lead','team lead','development lead','delivery lead','engineering lead','software lead','module lead','scrum master','agile coach']),
    ('SAP Consultant',             ['sap']),
    ('Salesforce Developer',       ['salesforce']),
    ('Network / Sys Admin',        ['network engineer','system administrator','system admin','network admin','windows admin','linux admin','noc']),
    ('Product Manager',            ['product manager','product owner','associate product manager','apm','senior product manager','group product manager']),
    ('UX / UI Designer',           ['ux designer','ui designer','ux researcher','product designer','ui/ux','interaction designer','user experience designer','visual designer']),
    ('Software Engineer (General)',['software engineer','software developer','programmer','sde','application developer','it developer',
                                    'implementation engineer','support engineer','integration engineer','systems engineer',
                                    'production engineer','release engineer','specialist','technical consultant',
                                    'functional consultant','servicenow','plsql developer','oracle developer',
                                    'aem developer','drupal developer','java microservices',
                                    'application developer','application engineer','application support',
                                    'software consultant','software specialist','software support',
                                    'systems analyst','developer']),
]

def assign_role_title(title):
    tl = str(title).lower()
    for lab, kw in CANON:
        if any(k in tl for k in kw):
            return lab
    return 'unclassified'

df["role"] = df["title"].apply(assign_role_title)

stage1_counts = df["role"].value_counts()
print(f"unclassified after stage 1: {stage1_counts.get('unclassified', 0):,}")
print(f"SE(General) after stage 1:  {stage1_counts.get('Software Engineer (General)', 0):,}")
print("\nStage 1 distribution:")
for role, cnt in stage1_counts.items():
    print(f"  {role:<35} {cnt:>6,}")

# ── 3 · STAGE 2 — SE(GENERAL) DE-HUB ────────────────────────────────────────

print("\n3 · STAGE 2 — SE(GENERAL) DE-HUB")

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
    sk = {s.lower() for s in skills}
    best = None
    bn = 0
    second = 0
    for role, sig in SIGNALS.items():
        h = sum(1 for x in sig if x in sk)
        if h > bn:
            second = bn
            bn = h
            best = role
        elif h > second:
            second = h
    return best if (bn >= 2 and bn - second >= 1) else None

seg_mask = df["role"] == "Software Engineer (General)"
rr = df.loc[seg_mask, "normalised_skills"].apply(reroute)
rerouted = rr.notna().sum()
df.loc[seg_mask, "role"] = rr.where(rr.notna(), "Software Engineer (General)")

print(f"SE(General) postings entering de-hub: {seg_mask.sum():,}")
print(f"rerouted to specific role:            {rerouted:,}")
print(f"remaining as SE(General):             {seg_mask.sum() - rerouted:,}")

reroute_dest = df.loc[seg_mask, "role"].value_counts()
print("\nDe-hub destinations:")
for role, cnt in reroute_dest.items():
    print(f"  {role:<35} {cnt:>6,}")

# ── 4 · FINAL ROLE DISTRIBUTION ──────────────────────────────────────────────

print("\n4 · FINAL ROLE DISTRIBUTION")

MIN_ROLE_POSTINGS = 80
final_counts = df["role"].value_counts()
node_roles = [r for r, c in final_counts.items()
              if r != "unclassified" and c >= MIN_ROLE_POSTINGS]

print(f"\nMIN_ROLE_POSTINGS = {MIN_ROLE_POSTINGS}")
print(f"graph-eligible role nodes: {len(node_roles)}")
print(f"unclassified (excluded):   {final_counts.get('unclassified', 0):,}")
print()
for role, cnt in final_counts.items():
    marker = "✓" if (role != "unclassified" and cnt >= MIN_ROLE_POSTINGS) else "✗"
    print(f"  {marker} {role:<35} {cnt:>6,}")

# ── 5 · KMEANS SANITY CHECK ──────────────────────────────────────────────────

print("\n5 · KMEANS SANITY CHECK")

# Build TF-IDF on skill lists for classified postings only
classified_mask = df["role"] != "unclassified"
df_cls = df[classified_mask].copy()

skill_docs = df_cls["normalised_skills"].apply(lambda lst: " ".join(lst))

n_clusters = len(node_roles)
print(f"fitting TF-IDF + KMeans (k={n_clusters}) on {len(df_cls):,} classified postings...")

vec = TfidfVectorizer(min_df=2, max_df=0.95)
X = vec.fit_transform(skill_docs)

km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
km_labels = km.fit_predict(X)

# Map string roles to integer labels for ARI
role_to_int = {r: i for i, r in enumerate(df_cls["role"].unique())}
rule_labels = df_cls["role"].map(role_to_int).values

ari = adjusted_rand_score(rule_labels, km_labels)
print(f"Adjusted Rand Index (rule vs KMeans): {ari:.3f}")
print("  (ARI=1.0 = perfect agreement, 0.0 = random, negative = worse than random)")

# Per-role: what fraction of a rule-assigned role lands in one dominant KMeans cluster?
print("\nPer-role KMeans concentration (% of role in its dominant cluster):")
df_cls = df_cls.copy()
df_cls["km_label"] = km_labels
for role in node_roles:
    role_mask = df_cls["role"] == role
    if role_mask.sum() == 0:
        continue
    dominant_pct = df_cls.loc[role_mask, "km_label"].value_counts().iloc[0] / role_mask.sum() * 100
    print(f"  {role:<35} {dominant_pct:>5.1f}%")

print("\nNote: KMeans is a sanity check only — output uses rule assignments.")

# ── 6 · SAVE ─────────────────────────────────────────────────────────────────

print("\n6 · SAVE")
df.to_parquet("../output/roles_assigned.parquet", index=False)
print(f"saved: ../output/roles_assigned.parquet  ({len(df):,} rows)")
print(f"columns: {list(df.columns)}")

tee.close()
