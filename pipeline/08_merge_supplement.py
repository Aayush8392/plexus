"""
Plexus — Module 08: Merge IT Supplement Data
=============================================
Merges three new IT posting sources into the existing it_subset.parquet.
Deduplicates on jobId. Applies IT keyword filter to the general Naukri 2019 CSV.
Overwrites output/it_subset.parquet with the expanded dataset.

Run from the pipeline/ directory:
    python 08_merge_supplement.py

Reads:
    ../output/it_subset.parquet                          (existing 28,665 rows)
    D:/Data files/expansion/round 2/naukri_software_engineer.jsonl
    D:/Data files/expansion/round 2/naukri_data_scientist.jsonl
    D:/Data files/expansion/round 2/r14/home/sdf/marketing_sample_for_naukri_com-jobs__20190701_20190830__30k_data.csv

Emits:
    ../output/it_subset.parquet   (expanded)
    ../output/08_merge_supplement_log.txt
"""

import os, sys, json, csv
import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", \
    "Run from pipeline/ directory: cd pipeline && python 08_merge_supplement.py"

# ── Tee logger ────────────────────────────────────────────────────────────────
class _Tee:
    def __init__(self, *streams):
        self._streams = streams
    def write(self, data):
        for s in self._streams: s.write(data)
    def flush(self):
        for s in self._streams: s.flush()

os.makedirs("../output", exist_ok=True)
_log = open("../output/08_merge_supplement_log.txt", "w", encoding="utf-8")
sys.stdout = _Tee(sys.__stdout__, _log)

# ── Paths ─────────────────────────────────────────────────────────────────────
EXISTING     = "../output/it_subset.parquet"
SE_JSONL     = r"D:\Data files\expansion\round 2\naukri_software_engineer.jsonl"
DS_JSONL     = r"D:\Data files\expansion\round 2\naukri_data_scientist.jsonl"
NAU19_CSV    = r"D:\Data files\expansion\round 2\r14\naukri_com-job_sample.csv"

# ── IT keyword filter (identical to Module 01) ────────────────────────────────
TECH_TITLE = [
    'software','developer','programmer','full stack','fullstack',
    'frontend','front end','backend','back end','devops',
    'sre','site reliability',
    'data scien','data engineer','data analyst','ml engineer',
    'machine learning',' ai ','ai engineer',
    'qa','quality assurance',
    'sdet','test engineer','automation test','tester',
    'web develop','mobile develop','android',
    'ios develop','java develop','python develop','dot net','.net',
    'php develop','cloud engineer','cloud architect','solution architect',
    'technical architect','database admin','dba','system admin',
    'network engineer','security engineer','cyber',
    'sap',
    'salesforce','tech lead','engineering manager','data architect','etl',
    'bi develop','bi analyst','platform engineer',
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
    'linux','terraform','redis','elasticsearch','scala','golang','rust',
]

def is_it_row(title, skills):
    t = (title or "").lower()
    s = (skills or "").lower()
    title_hit = any(k in t for k in TECH_TITLE)
    skill_hit = sum(1 for k in TECH_SKILL if k in s) >= 2
    return title_hit or skill_hit

# ── Canonical columns (must match existing parquet schema) ────────────────────
# Existing key columns: title, jobId, companyName, tagsAndSkills,
#                       jobDescription, experience, salary, location, companyId
# New rows only need these — all other columns will be NaN.

KEEP_COLS = ["title", "jobId", "companyName", "tagsAndSkills",
             "jobDescription", "experience", "salary", "location", "companyId",
             "currency", "source"]

# ── 1. Load existing ──────────────────────────────────────────────────────────
print("=" * 60)
print("1 · LOAD EXISTING it_subset.parquet")
print("=" * 60)

existing = pd.read_parquet(EXISTING)
existing_ids = set(existing["jobId"].astype(str).tolist())
print(f"Existing rows: {len(existing):,}")
print(f"Existing unique jobIds: {len(existing_ids):,}")

# ── 2. Load jsonl files ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("2 · LOAD JSONL FILES")
print("=" * 60)

def load_jsonl(path, label, existing_ids, seen_ids):
    rows = []
    skipped_dup = 0
    skipped_existing = 0
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            try:
                row = json.loads(line)
                jid = str(row.get("jobId", ""))
                if jid in existing_ids:
                    skipped_existing += 1
                    continue
                if jid in seen_ids:
                    skipped_dup += 1
                    continue
                seen_ids.add(jid)
                rows.append({
                    "title":         row.get("title", ""),
                    "jobId":         jid,
                    "companyName":   row.get("companyName", ""),
                    "tagsAndSkills": row.get("tagsAndSkills", ""),
                    "jobDescription":row.get("jobDescription", ""),
                    "experience":    row.get("experience", ""),
                    "salary":        row.get("salary", ""),
                    "location":      row.get("location", ""),
                    "companyId":     str(row.get("companyId", "")),
                    "currency":      row.get("currency", "INR"),
                    "source":        label,
                })
            except:
                pass
    print(f"  {label}: {len(rows):,} net new | skipped existing={skipped_existing:,} | skipped inter-file dup={skipped_dup:,}")
    return rows

seen_ids = set()
se_rows = load_jsonl(SE_JSONL, "naukri_se_jsonl", existing_ids, seen_ids)
ds_rows = load_jsonl(DS_JSONL, "naukri_ds_jsonl", existing_ids, seen_ids)

# ── 3. Load Naukri 2019 general CSV ──────────────────────────────────────────
print("\n" + "=" * 60)
print("3 · LOAD NAUKRI 2019 GENERAL CSV (with IT filter)")
print("=" * 60)

nau19_rows = []
skipped_existing = 0
skipped_dup = 0
skipped_non_it = 0

with open(NAU19_CSV, encoding="utf-8", errors="ignore") as f:
    reader = csv.DictReader(f)
    for row in reader:
        jid    = str(row.get("jobid", "")).strip()
        title  = (row.get("jobtitle")  or "").strip()
        skills = (row.get("skills")    or "").strip()

        if not is_it_row(title, skills):
            skipped_non_it += 1
            continue
        if jid in existing_ids:
            skipped_existing += 1
            continue
        if jid in seen_ids:
            skipped_dup += 1
            continue

        seen_ids.add(jid)
        nau19_rows.append({
            "title":         title,
            "jobId":         jid,
            "companyName":   (row.get("company")             or "").strip(),
            "tagsAndSkills": skills,
            "jobDescription":(row.get("jobdescription")      or "").strip(),
            "experience":    (row.get("experience")          or "").strip(),
            "salary":        (row.get("payrate")             or "").strip(),
            "location":      (row.get("joblocation_address") or "").strip(),
            "companyId":     "",
            "currency":      "INR",
            "source":        "naukri_2019_csv",
        })

print(f"  Naukri 2019 CSV: {len(nau19_rows):,} net new IT rows")
print(f"  Skipped non-IT: {skipped_non_it:,}")
print(f"  Skipped existing: {skipped_existing:,}")
print(f"  Skipped inter-file dup: {skipped_dup:,}")

# ── 4. Combine and append ─────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("4 · COMBINE AND APPEND")
print("=" * 60)

all_new = se_rows + ds_rows + nau19_rows
print(f"Total net new rows: {len(all_new):,}")
print(f"  From naukri_se_jsonl  : {len(se_rows):,}")
print(f"  From naukri_ds_jsonl  : {len(ds_rows):,}")
print(f"  From naukri_2019_csv  : {len(nau19_rows):,}")

new_df = pd.DataFrame(all_new)

# Align columns with existing — add missing cols as NaN
for col in existing.columns:
    if col not in new_df.columns:
        new_df[col] = pd.NA

# Keep only columns present in existing + source
new_df = new_df.reindex(columns=list(existing.columns) + ["source"], fill_value=pd.NA)

# Add source col to existing too for provenance
existing["source"] = "naukri_original"

for col in ["jobId", "companyId"]:
    if col in existing.columns: existing[col] = existing[col].astype(str)
    if col in new_df.columns:   new_df[col]   = new_df[col].astype(str)
combined = pd.concat([existing, new_df], ignore_index=True)

print(f"\nCombined shape: {combined.shape}")
print(f"Original rows : {len(existing):,}")
print(f"New rows added: {len(new_df):,}")
print(f"Total         : {len(combined):,}")

# Sanity check — no duplicate jobIds
dup_check = combined["jobId"].astype(str).duplicated().sum()
print(f"Duplicate jobIds in combined: {dup_check:,}  (should be 0)")

# ── 5. Emit ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("5 · EMIT")
print("=" * 60)

combined.to_parquet(EXISTING, index=False)
print(f"Wrote: {EXISTING}")
print(f"Shape: {combined.shape}")
print(f"Columns: {list(combined.columns)}")
print("\nSource breakdown:")
print(combined["source"].value_counts().to_string())
print("\nDone. Re-run Modules 02 → 07 in sequence.")

_log.close()
