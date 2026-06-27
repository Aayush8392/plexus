"""
Plexus — Module 01: Ingest
===========================
Loads the raw job-market xlsx, applies the IT dual-field keyword filter
(title OR skills), cleans salary strings, and emits the IT subset.

Run from the pipeline/ directory:
    python 01_ingest.py

Reads:
    ../data/indian-job-market-dataset-2025.xlsx  (Sheet1, 97,929 rows)
    ../data/GCC-Journal-India-List.xlsx          (shape-check only)

Emits:
    ../output/it_subset.parquet
    ../output/01_ingest_log.txt

Numbers to confirm against context:
    IT subset ~ 28,250 rows (28.8% of corpus)
    Salary disclosed ~ 34.6% of full corpus (IT subset may differ)
"""

import os
import sys
import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", \
    "Run this script from the pipeline/ directory: cd pipeline && python 01_ingest.py"

# ---------------------------------------------------------------------------
# TEE — write stdout to log file AND terminal simultaneously
# ---------------------------------------------------------------------------
class _Tee:
    def __init__(self, *streams):
        self._streams = streams
    def write(self, data):
        for s in self._streams:
            s.write(data)
    def flush(self):
        for s in self._streams:
            s.flush()

_log_path = os.path.join("..", "output", "01_ingest_log.txt")
os.makedirs(os.path.join("..", "output"), exist_ok=True)
_log_file = open(_log_path, "w", encoding="utf-8")
sys.stdout = _Tee(sys.__stdout__, _log_file)

# ---------------------------------------------------------------------------
# PATHS  (relative to pipeline/)
# ---------------------------------------------------------------------------
DATA_DIR   = os.path.join("..", "data")
OUTPUT_DIR = os.path.join("..", "output")

SUBSTRATE = os.path.join(DATA_DIR, "indian-job-market-dataset-2025.xlsx")
GCC_FILE  = os.path.join(DATA_DIR, "GCC-Journal-India-List.xlsx")

# ---------------------------------------------------------------------------
# 1 · LOAD
# ---------------------------------------------------------------------------
print("=" * 60)
print("1 · LOAD")
print("=" * 60)

df  = pd.read_excel(SUBSTRATE, sheet_name="Sheet1")
gcc = pd.read_excel(GCC_FILE,  sheet_name="All GCCs – India Master")

print(f"Substrate : {df.shape[0]:,} rows × {df.shape[1]} cols")
print(f"GCC master: {gcc.shape[0]:,} rows × {gcc.shape[1]} cols")

assert {"title", "tagsAndSkills", "companyName", "jobDescription"} <= set(df.columns), \
    "Missing expected columns — check sheet name or column headers."
assert "Company / GCC Name" in gcc.columns, \
    "GCC master missing 'Company / GCC Name' column."

# Duplicate check
dup_jobs = df["jobId"].duplicated().sum()
print(f"\nDuplicate jobIds in full corpus: {dup_jobs:,}")
print(f"Columns: {list(df.columns)}")

# ---------------------------------------------------------------------------
# 2 · IT DUAL-FIELD KEYWORD FILTER
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print("2 · IT SUBSET FILTER")
print("=" * 60)

# Title keywords — match anywhere in the lowercased title string.
# Space-padded terms use word-boundary intent; end-of-string failures fixed below.
# PM and UX terms included (validated in step3_probe).
TECH_TITLE = [
    'software','developer','programmer','full stack','fullstack',
    'frontend','front end','backend','back end','devops',
    'sre','site reliability',                          # fixed: was ' sre' (missed "SRE Lead")
    'data scien','data engineer','data analyst','ml engineer',
    'machine learning',' ai ','ai engineer',
    'qa','quality assurance',                          # fixed: was 'qa ' (missed "Lead QA"); added 'quality assurance'
    'sdet','test engineer','automation test','tester',
    'web develop','mobile develop','android',
    'ios develop','java develop','python develop','dot net','.net',
    'php develop','cloud engineer','cloud architect','solution architect',
    'technical architect','database admin','dba','system admin',
    'network engineer','security engineer','cyber',
    'sap',                                             # fixed: was 'sap ' (missed "Senior SAP")
    'salesforce','tech lead','engineering manager','data architect','etl',
    'bi develop','bi analyst','platform engineer',     # added 'bi analyst'
    # PM and UX (step3_probe Change 1)
    'product manager','product owner','associate product manager',
    'ux designer','ui designer','ux researcher','product designer',
    'ui/ux','interaction designer','user experience','user research',
]

# Skill keywords — 2+ hits required (reduces false positives).
# SKILL_HIT_THRESHOLD = 2 — calibrated to 28,250-row verified IT subset; not independently validated.
TECH_SKILL = [
    'java','python','javascript','typescript','react','angular','vue',
    'node','express','aws','azure','gcp','kubernetes','docker','sql',
    'mysql','postgres','mongodb','spring','hibernate','c++','c#','.net',
    'php','html','css','git','jenkins','kafka','spark','hadoop',
    'tensorflow','pytorch','selenium','rest api','microservices','devops',
    'linux','terraform','redis','elasticsearch','scala','golang','rust',
]

t = df["title"].fillna("").str.lower()
s = df["tagsAndSkills"].fillna("").str.lower()

title_match = t.apply(lambda x: any(k in x for k in TECH_TITLE))
skill_match = s.apply(lambda x: sum(1 for k in TECH_SKILL if k in x) >= 2)
is_it = title_match | skill_match

sub = df[is_it].copy().reset_index(drop=True)

pct = len(sub) / len(df) * 100
print(f"Title match  : {title_match.sum():,}")
print(f"Skill match  : {skill_match.sum():,}")
print(f"Combined (OR): {is_it.sum():,}")
print(f"\nIT subset    : {len(sub):,} rows ({pct:.1f}% of corpus)")
print("Context target: ~28,250 rows (28.8%) — keyword fixes may shift this slightly, document if so.")

dup_it = sub["jobId"].duplicated().sum()
print(f"Duplicate jobIds in IT subset: {dup_it:,}")

# ---------------------------------------------------------------------------
# 3 · SALARY CLEANING
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print("3 · SALARY CLEANING")
print("=" * 60)

# Disclosure tracked on raw `salary` text field (contains "Not disclosed" literal).
# minimumSalary / maximumSalary are numeric — populated only when disclosed.
NOT_DISCLOSED_STRINGS = {"not disclosed", "not disclose", "", "nan", "none", "-"}
salary_text = sub["salary"].fillna("").astype(str).str.strip().str.lower()
disclosed_mask = ~salary_text.isin(NOT_DISCLOSED_STRINGS)

disclosed_text = disclosed_mask.sum()
print(f"Disclosed (salary text field) : {disclosed_text:,} ({disclosed_text/len(sub)*100:.1f}%)")
print(f"Not disclosed                 : {len(sub) - disclosed_text:,} ({(len(sub)-disclosed_text)/len(sub)*100:.1f}%)")

# Cross-check: numeric minimumSalary populated rows
numeric_disclosed = sub["minimumSalary"].notna().sum()
print(f"Numeric non-null minimumSalary: {numeric_disclosed:,} ({numeric_disclosed/len(sub)*100:.1f}%)")
print("Context target: ~34.6% disclosed on full corpus — IT subset rate may differ.")
print("No salary deliverables downstream; this check is informational only.")

# Standardise NaN for undisclosed rows in numeric columns
sub["minSalary_clean"] = sub["minimumSalary"].where(disclosed_mask)
sub["maxSalary_clean"] = sub["maximumSalary"].where(disclosed_mask)

# ---------------------------------------------------------------------------
# 4 · SHAPE CHECKS
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print("4 · SHAPE CHECKS")
print("=" * 60)

print("Null counts in key columns:")
for col in ["title", "tagsAndSkills", "companyName", "jobDescription"]:
    nulls = sub[col].isna().sum()
    print(f"  {col:20s}: {nulls:,} nulls ({nulls/len(sub)*100:.1f}%)")

print(f"\nSample titles (first 10):")
for t_ in sub["title"].head(10).tolist():
    print(f"  {t_}")

# ---------------------------------------------------------------------------
# 5 · EMIT
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print("5 · EMIT")
print("=" * 60)

out_path = os.path.join(OUTPUT_DIR, "it_subset.parquet")
sub.to_parquet(out_path, index=False)
print(f"Wrote: {out_path}")
print(f"Shape: {sub.shape}")
print(f"Columns: {list(sub.columns)}")
