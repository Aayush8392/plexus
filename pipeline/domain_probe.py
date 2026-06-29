"""
Plexus — Domain Expansion Probe
=================================
Checks which non-IT domains are viable in the existing Naukri dataset.

For each candidate domain:
  - Filters the full 97,929-row corpus by domain keywords (title OR skills)
  - Buckets postings into candidate roles
  - Reports: total postings, roles above MIN_ROLE_POSTINGS=80, rough employer split

Run from the pipeline/ directory:
    python domain_probe.py

Reads:
    ../data/indian-job-market-dataset-2025.xlsx  (Sheet1)
    ../data/GCC-Journal-India-List.xlsx

Emits:
    ../output/domain_probe_log.txt
"""

import os
import sys
import re
import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", \
    "Run from the pipeline/ directory: cd pipeline && python domain_probe.py"

# ---------------------------------------------------------------------------
# TEE
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

os.makedirs(os.path.join("..", "output"), exist_ok=True)
_log_path = os.path.join("..", "output", "domain_probe_log.txt")
_log_file = open(_log_path, "w", encoding="utf-8")
sys.stdout = _Tee(sys.__stdout__, _log_file)

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
MIN_ROLE_POSTINGS = 80
DATA_DIR = os.path.join("..", "data")

SUBSTRATE = os.path.join(DATA_DIR, "indian-job-market-dataset-2025.xlsx")
GCC_FILE  = os.path.join(DATA_DIR, "GCC-Journal-India-List.xlsx")

# ---------------------------------------------------------------------------
# 1 · LOAD
# ---------------------------------------------------------------------------
print("=" * 60)
print("LOADING CORPUS")
print("=" * 60)

df  = pd.read_excel(SUBSTRATE, sheet_name="Sheet1")
gcc = pd.read_excel(GCC_FILE,  sheet_name="All GCCs – India Master")

print(f"Full corpus : {df.shape[0]:,} rows")

title_raw  = df["title"].fillna("").str.lower()
skills_raw = df["tagsAndSkills"].fillna("").str.lower()
company    = df["companyName"].fillna("").str.lower()

# ---------------------------------------------------------------------------
# 2 · EMPLOYER SPLIT HELPERS (simplified — token-boundary on key names)
# ---------------------------------------------------------------------------
SERVICES_FIRMS = {
    "tata consultancy services", "tcs", "infosys", "wipro", "hcl technologies",
    "hcl tech", "tech mahindra", "cognizant", "capgemini", "accenture",
    "ltimindtree", "lti mindtree", "mphasis", "hexaware", "birlasoft",
    "niit technologies", "coforge", "persistent systems", "cyient",
    "zensar", "mastech", "l&t technology", "l&t infotech",
}

STAFFING_KEYWORDS = [
    "staffing", "manpower", "recruitment", "talent solutions", "hr solutions",
    "workforce", "consulting services", "placement",
]

gcc_names = set()
for name in gcc["Company / GCC Name"].dropna().str.lower():
    gcc_names.add(name.strip())

def _classify_employer(co: str) -> str:
    co = co.strip().lower()
    for firm in SERVICES_FIRMS:
        if re.search(r'\b' + re.escape(firm) + r'\b', co):
            return "services"
    for gname in gcc_names:
        if len(gname) > 4 and gname in co:
            return "gcc"
    for kw in STAFFING_KEYWORDS:
        if kw in co:
            return "agency"
    return "unknown"

emp_labels = company.apply(_classify_employer)

# ---------------------------------------------------------------------------
# 3 · DOMAIN DEFINITIONS
# ---------------------------------------------------------------------------
# Each domain: dict with
#   'title_kw'  — any match in title → include
#   'skill_kw'  — any match in skills → include (OR with title)
#   'roles'     — list of (role_label, [title_keywords]) for bucketing
#                 First-wins ordering, like Module 03 CANON list.
#                 A posting can only fall into one role bucket.

DOMAINS = {

    # ------------------------------------------------------------------
    "BFSI Tech": {
        "title_kw": [
            "banking", "fintech", "finance tech", "financial technolog",
            "payments developer", "payment developer", "payment engineer",
            "core banking", "treasury", "risk analyst", "credit analyst",
            "aml analyst", "anti money laundering", "compliance analyst",
            "trade finance", "insurance developer", "actuar",
            "wealth management", "capital markets", "lending",
        ],
        "skill_kw": [
            "finacle", "temenos", "murex", "summit", "calypso",
            "fiserv", "finastra", "swift", "sepa", "iso 20022",
            "basel", "ifrs", "aml", "kyc", "pci dss", "payment gateway",
            "upi", "neft", "rtgs", "credit risk", "market risk",
        ],
        "roles": [
            ("Core Banking Developer",    ["core banking", "finacle", "temenos", "t24"]),
            ("Payments Developer",        ["payment developer", "payment engineer", "payments engineer"]),
            ("Risk Analyst",              ["risk analyst", "credit risk analyst", "market risk"]),
            ("Compliance / AML Analyst",  ["compliance analyst", "aml analyst", "anti money launder", "kyc analyst"]),
            ("Treasury Analyst",          ["treasury analyst", "treasury manager"]),
            ("Credit Analyst",            ["credit analyst", "credit underwriter", "lending analyst"]),
            ("Trade Finance Analyst",     ["trade finance", "lc analyst", "documentary credit"]),
            ("Insurance Tech Developer",  ["insurance developer", "insurance technolog", "actuar"]),
            ("Wealth / Capital Markets",  ["wealth management", "capital markets", "portfolio management"]),
            ("BFSI Data Analyst",         ["data analyst", "bi analyst", "reporting analyst"]),
            ("BFSI Business Analyst",     ["business analyst", "functional consultant", "ba "]),
            ("Fintech Product Manager",   ["product manager", "product owner"]),
        ],
    },

    # ------------------------------------------------------------------
    "Data & Analytics": {
        "title_kw": [
            "data scientist", "data science", "machine learning engineer",
            "ml engineer", "data analyst", "business analyst", "bi analyst",
            "data engineer", "analytics engineer", "insight analyst",
            "research analyst", "quantitative analyst", "decision scientist",
            "nlp engineer", "computer vision", "deep learning",
        ],
        "skill_kw": [
            "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch",
            "xgboost", "lightgbm", "spark", "databricks", "snowflake",
            "dbt", "airflow", "tableau", "power bi", "looker",
            "a/b testing", "statistical modeling", "feature engineering",
            "nlp", "llm", "langchain",
        ],
        "roles": [
            ("Data Scientist / ML",       ["data scientist", "machine learning engineer", "ml engineer", "decision scientist", "nlp engineer", "computer vision", "deep learning"]),
            ("Data Engineer",             ["data engineer", "analytics engineer", "etl developer", "pipeline engineer"]),
            ("Data / BI Analyst",         ["data analyst", "bi analyst", "business intelligence", "reporting analyst", "insight analyst"]),
            ("Business Analyst",          ["business analyst", "functional analyst", "ba "]),
            ("Quantitative Analyst",      ["quantitative analyst", "quant analyst", "quant researcher"]),
            ("Research Scientist",        ["research scientist", "applied scientist", "ai researcher"]),
        ],
    },

    # ------------------------------------------------------------------
    "E-commerce & Supply Chain Tech": {
        "title_kw": [
            "supply chain", "logistics tech", "warehouse tech", "fulfillment",
            "inventory", "demand plann", "procurement tech", "scm developer",
            "e-commerce developer", "ecommerce developer", "marketplace developer",
            "catalog developer", "order management", "last mile",
        ],
        "skill_kw": [
            "sap scm", "sap ewm", "sap mm", "oracle scm", "manhattan",
            "blue yonder", "o9 solutions", "kinaxis", "netsuite",
            "shopify", "magento", "woocommerce", "hybris", "salesforce commerce",
            "wms", "tms", "erp", "demand forecasting",
        ],
        "roles": [
            ("E-commerce Developer",      ["ecommerce developer", "e-commerce developer", "marketplace developer", "catalog developer", "shopify", "magento"]),
            ("Supply Chain Developer",    ["supply chain developer", "scm developer", "sap scm", "oracle scm"]),
            ("Demand / Inventory Planner",["demand plann", "inventory plann", "s&op", "supply planning"]),
            ("Warehouse / WMS Developer", ["warehouse", "wms developer", "fulfillment tech", "ewm"]),
            ("Logistics Tech",            ["logistics tech", "tms developer", "last mile", "route optim"]),
            ("Procurement Tech",          ["procurement tech", "purchase developer", "source to pay"]),
            ("SCM Business Analyst",      ["supply chain analyst", "scm analyst", "logistics analyst"]),
        ],
    },

    # ------------------------------------------------------------------
    "HR & People Tech": {
        "title_kw": [
            "hr business partner", "hrbp", "talent acquisition", "recruiter",
            "learning development", "l&d specialist", "compensation benefits",
            "hr analyst", "people analytics", "hr operations", "hris",
            "workday consultant", "successfactors consultant", "hr consultant",
            "organisational development", "organizational development",
        ],
        "skill_kw": [
            "workday", "successfactors", "sap hcm", "oracle hcm",
            "darwinbox", "keka", "greythr", "people analytics",
            "hris", "ats", "taleo", "greenhouse", "lever",
            "talent management", "performance management", "compensation",
        ],
        "roles": [
            ("HR Business Partner",       ["hr business partner", "hrbp", "hr generalist"]),
            ("Talent Acquisition",        ["talent acquisition", "recruiter", "ta specialist", "technical recruiter"]),
            ("L&D Specialist",            ["learning development", "l&d specialist", "training specialist", "learning consultant"]),
            ("Comp & Ben Specialist",     ["compensation benefits", "comp & ben", "rewards specialist", "total rewards"]),
            ("HRIS / Workday Consultant", ["workday consultant", "successfactors consultant", "sap hcm", "oracle hcm", "hris"]),
            ("HR Analytics",              ["hr analyst", "people analytics", "workforce analytics"]),
            ("HR Operations",             ["hr operations", "hr ops", "hr shared services"]),
        ],
    },

    # ------------------------------------------------------------------
    "Marketing & Growth": {
        "title_kw": [
            "performance marketing", "digital marketing", "growth hacker",
            "seo specialist", "sem specialist", "paid media", "content marketer",
            "brand manager", "product marketing", "crm marketing",
            "email marketing", "social media marketer", "marketing analyst",
            "marketing automation", "growth analyst",
        ],
        "skill_kw": [
            "google ads", "facebook ads", "meta ads", "google analytics",
            "hubspot", "marketo", "salesforce marketing", "mailchimp",
            "seo", "sem", "ppc", "a/b testing", "conversion rate",
            "crm", "attribution", "mixpanel", "amplitude", "clevertap",
            "moengage", "webengage",
        ],
        "roles": [
            ("Performance / Digital Marketer", ["performance marketing", "digital marketing", "paid media", "ppc specialist", "sem specialist"]),
            ("SEO / Content Specialist",       ["seo specialist", "content marketer", "content strategist", "seo executive"]),
            ("Brand Manager",                  ["brand manager", "brand strategist"]),
            ("Product Marketing Manager",      ["product marketing", "pmm", "go-to-market"]),
            ("CRM / Marketing Automation",     ["crm marketing", "marketing automation", "email marketing", "lifecycle marketing"]),
            ("Growth Analyst",                 ["growth hacker", "growth analyst", "growth manager"]),
            ("Social Media Manager",           ["social media marketer", "social media manager", "community manager"]),
        ],
    },

    # ------------------------------------------------------------------
    "Product Management": {
        "title_kw": [
            "product manager", "product owner", "associate product manager",
            "apm ", "senior product manager", "group product manager",
            "head of product", "vp product", "chief product",
            "product lead", "technical product manager",
        ],
        "skill_kw": [
            "product roadmap", "user stories", "agile product", "jira product",
            "product discovery", "okr", "kpi product", "go-to-market",
            "product strategy", "feature prioritization", "product analytics",
            "mixpanel product", "amplitude product",
        ],
        "roles": [
            ("Product Manager (Tech)",    ["product manager", "technical product manager", "platform product manager"]),
            ("Product Owner",             ["product owner", "scrum product owner"]),
            ("Associate PM",              ["associate product manager", "apm "]),
            ("Senior / Lead PM",          ["senior product manager", "group product manager", "lead product manager"]),
            ("Head / VP Product",         ["head of product", "vp product", "chief product", "director product"]),
        ],
    },

    # ------------------------------------------------------------------
    "Healthcare & Pharma Tech": {
        "title_kw": [
            "clinical data", "pharmacovigilance", "drug safety", "regulatory affairs",
            "health informatics", "medical coder", "bioinformatics",
            "clinical sas", "ehr developer", "emr developer",
            "healthcare it", "health tech", "medtech developer",
        ],
        "skill_kw": [
            "cdisc", "sdtm", "adam", "sas clinical", "r clinical",
            "pharmacovigilance", "argus", "oracle argus", "veeva",
            "hl7", "fhir", "ehr", "emr", "epic", "cerner",
            "icd coding", "cpt coding", "ich gcp", "fda 21 cfr",
        ],
        "roles": [
            ("Clinical Data Manager",     ["clinical data manager", "cdm", "clinical data associate"]),
            ("Pharmacovigilance Analyst", ["pharmacovigilance", "drug safety", "pv analyst", "safety analyst"]),
            ("Clinical SAS Programmer",   ["clinical sas", "sas programmer", "biostatistics"]),
            ("Regulatory Affairs",        ["regulatory affairs", "ra specialist", "dossier", "ctd writing"]),
            ("Health Informatics",        ["health informatics", "ehr developer", "emr developer", "fhir developer"]),
            ("Medical Coder",             ["medical coder", "icd coder", "cpt coder", "hcc coder"]),
            ("Bioinformatics",            ["bioinformatics", "genomics", "computational biology"]),
        ],
    },

    # ------------------------------------------------------------------
    "Manufacturing & Industrial Tech": {
        "title_kw": [
            "plc programmer", "scada engineer", "automation engineer",
            "robotics engineer", "mes developer", "industry 4.0",
            "iiot engineer", "embedded systems", "firmware engineer",
            "process automation", "instrumentation engineer",
            "quality engineer manufacturing", "lean engineer",
        ],
        "skill_kw": [
            "plc", "scada", "hmi", "siemens s7", "allen bradley",
            "rockwell", "wonderware", "ignition", "mes", "erp manufacturing",
            "sap pp", "sap pm", "sap qm", "autocad", "solidworks",
            "catia", "ansys", "matlab", "vxworks", "rtos",
            "can bus", "modbus", "profibus", "opc ua",
        ],
        "roles": [
            ("PLC / SCADA Engineer",      ["plc programmer", "scada engineer", "hmi developer", "dcs engineer"]),
            ("Automation Engineer",       ["automation engineer", "process automation", "robotics engineer", "robot programmer"]),
            ("Embedded / Firmware",       ["embedded systems", "firmware engineer", "embedded software", "rtos developer"]),
            ("MES / Industry 4.0",        ["mes developer", "industry 4.0", "iiot engineer", "manufacturing execution"]),
            ("CAD / CAE Engineer",        ["autocad", "solidworks", "catia", "ansys", "cad engineer", "cae engineer"]),
            ("Quality Engineer",          ["quality engineer", "lean engineer", "six sigma", "process quality"]),
        ],
    },

}

# ---------------------------------------------------------------------------
# 4 · RUN PROBE
# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
print("DOMAIN PROBE RESULTS")
print(f"MIN_ROLE_POSTINGS threshold: {MIN_ROLE_POSTINGS}")
print("=" * 60)

VERDICT_SUMMARY = []

for domain_name, cfg in DOMAINS.items():
    print(f"\n{'─' * 60}")
    print(f"DOMAIN: {domain_name}")
    print(f"{'─' * 60}")

    # --- filter corpus to this domain ---
    tkw = cfg["title_kw"]
    skw = cfg["skill_kw"]

    title_hit = title_raw.apply(lambda x: any(k in x for k in tkw))
    skill_hit = skills_raw.apply(lambda x: any(k in x for k in skw))
    mask = title_hit | skill_hit

    sub = df[mask].copy().reset_index(drop=True)
    t_sub   = title_raw[mask].reset_index(drop=True)
    emp_sub = emp_labels[mask].reset_index(drop=True)

    print(f"Total postings matched : {len(sub):,}")
    if len(sub) == 0:
        print("  → NO DATA. Skip.")
        VERDICT_SUMMARY.append((domain_name, 0, 0, "❌ No data"))
        continue

    # employer split
    emp_counts = emp_sub.value_counts()
    for label in ["services", "gcc", "agency", "unknown"]:
        n = emp_counts.get(label, 0)
        print(f"  {label:10s}: {n:,} ({n/len(sub)*100:.1f}%)")

    # --- role bucketing ---
    role_counts = {}
    assigned    = [False] * len(sub)

    for role_label, keywords in cfg["roles"]:
        hits = t_sub.apply(lambda x: any(k in x for k in keywords))
        # also check skills for any keyword
        skills_sub = skills_raw[mask].reset_index(drop=True)
        skill_hits = skills_sub.apply(lambda x: any(k in x for k in keywords))
        combined = hits | skill_hits
        count = combined.sum()
        role_counts[role_label] = int(count)

    # sort descending
    role_counts = dict(sorted(role_counts.items(), key=lambda x: -x[1]))

    print(f"\nRole breakdown (title + skill match, overlapping):")
    viable = 0
    for role, cnt in role_counts.items():
        flag = "✅" if cnt >= MIN_ROLE_POSTINGS else "  "
        if cnt >= MIN_ROLE_POSTINGS:
            viable += 1
        print(f"  {flag} {role:<45s}: {cnt:,}")

    print(f"\nRoles above {MIN_ROLE_POSTINGS} postings: {viable}")

    # verdict
    if viable >= 8:
        verdict = "✅ STRONG — pipeline-ready"
    elif viable >= 5:
        verdict = "⚠️  VIABLE — thinner than IT, proceed carefully"
    elif viable >= 3:
        verdict = "⚠️  MARGINAL — few viable roles, corpus thin"
    else:
        verdict = "❌ WEAK — insufficient viable roles"

    print(f"VERDICT: {verdict}")
    VERDICT_SUMMARY.append((domain_name, len(sub), viable, verdict))

# ---------------------------------------------------------------------------
# 5 · SUMMARY TABLE
# ---------------------------------------------------------------------------
print("\n\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"{'Domain':<35} {'Postings':>10} {'Viable roles':>13} {'Verdict'}")
print("─" * 85)
for name, total, viable, verdict in VERDICT_SUMMARY:
    print(f"{name:<35} {total:>10,} {viable:>13} {verdict}")

print("\nNotes:")
print("  - Role counts overlap (one posting can match multiple role keywords).")
print("  - Employer split uses simplified matching — indicative only.")
print("  - 'Viable roles' = roles above MIN_ROLE_POSTINGS=80.")
print("  - Data & Analytics overlaps heavily with IT domain — deduplicate before building.")
print(f"\nLog written to: {_log_path}")
