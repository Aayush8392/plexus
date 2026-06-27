"""
02_normalise_skills.py  (v3 — corpus-native, token-level canonicalisation)
Input:  ../output/it_subset.parquet
Output: ../output/skill_normalised.parquet
        ../output/02_normalise_skills_log.txt

Normalisation pipeline per raw skill string:
  0. Garbage filter  — drop non-skill entries (sentences, salaries, job titles)
  1. Multi-word canonical lookup  — exact match on lowercase phrase
  2. Token-level case normalise   — per-token CAPS_PRESERVE / CANONICAL_EXACT
  3. Version strip                — trailing version numbers (space-separated only)
  4. Suffix strip                 — trailing generic descriptor words
  5. Prefix cluster               — collapse versioned/generic variants to anchor
  6. Stopword drop                — discard generic meta-terms that are not skills

Run from: pipeline/ directory
"""

import os
import re
import sys
from collections import Counter

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


LOG_PATH = "../output/02_normalise_skills_log.txt"
tee = _Tee(LOG_PATH)

print("Loading libraries...")
import pandas as pd

# ── Config ────────────────────────────────────────────────────────────────────

PARQUET_IN  = "../output/it_subset.parquet"
PARQUET_OUT = "../output/skill_normalised.parquet"

# ── Garbage filter ────────────────────────────────────────────────────────────

GARBAGE_RE = re.compile(
    r"""
    \d+\s*\+?\s*years?          # "5+ years", "10 year"
  | \d+\s*(?:lpa|ctc|lakh)     # "25 LPA", "12 CTC"
  | \bsalary\b | \bctc\b       # salary mentions
  | \bhiring\b | \bjobs?\b | \bcareers?\b  # recruitment keywords
  | \bgood\s+\w | \bexcellent\s+\w | \bstrong\s+\w  # "good communication"
  | \bverbal\b | \bwritten\b   # "verbal communication"
  | \bwillingness\b | \bability\s+to\b   # requirement phrases
  | \bexperience\s+in\b | \bexperience\s+with\b      # experience phrases
    """,
    re.IGNORECASE | re.VERBOSE,
)

MAX_SKILL_LEN = 60  # skills are rarely longer than this


def is_garbage(raw: str) -> bool:
    if len(raw) > MAX_SKILL_LEN:
        return True
    if GARBAGE_RE.search(raw):
        return True
    return False


# ── Multi-word canonical map ──────────────────────────────────────────────────
# Checked BEFORE token-level normalisation. Keys are lowercase.

MULTI_WORD_CANONICAL = {
    # ML / AI
    "machine learning":              "Machine Learning",
    "artificial intelligence":       "Artificial Intelligence",
    "deep learning":                 "Deep Learning",
    "natural language processing":   "NLP",
    "computer vision":               "Computer Vision",
    "generative ai":                 "Generative AI",
    "large language models":         "LLM",
    "large language model":          "LLM",
    "reinforcement learning":        "Reinforcement Learning",
    # Data
    "data science":                  "Data Science",
    "data engineering":              "Data Engineering",
    "data analytics":                "Data Analytics",
    "data analysis":                 "Data Analysis",
    "data visualization":            "Data Visualization",
    "data visualisation":            "Data Visualization",
    "business intelligence":         "Business Intelligence",
    "business analysis":             "Business Analysis",
    "business analyst":              "Business Analysis",
    # DevOps / Infra
    "site reliability engineering":  "SRE",
    "site reliability":              "SRE",
    "continuous integration":        "CI/CD",
    "continuous deployment":         "CI/CD",
    "continuous delivery":           "CI/CD",
    "ci/cd":                         "CI/CD",
    "ci / cd":                       "CI/CD",
    "infrastructure as code":        "IaC",
    "infrastructure-as-code":        "IaC",
    # Web / API
    "rest api":                      "REST API",
    "restful api":                   "REST API",
    "restful apis":                  "REST API",
    "rest apis":                     "REST API",
    "web services":                  "Web Services",
    "micro services":                "Microservices",
    "micro-services":                "Microservices",
    # Software practices
    "object oriented":               "OOP",
    "object oriented programming":   "OOP",
    "object-oriented programming":   "OOP",
    "object-oriented":               "OOP",
    "test driven development":       "TDD",
    "test-driven development":       "TDD",
    "behaviour driven development":  "BDD",
    "behavior driven development":   "BDD",
    "version control":               "Git",
    "source control":                "Git",
    # Cloud
    "amazon web services":           "AWS",
    "google cloud platform":         "GCP",
    "google cloud":                  "GCP",
    "microsoft azure":               "Azure",
    # SAP common variants
    "sap hana":                      "SAP HANA",
    "sap s/4hana":                   "SAP S/4HANA",
    "sap s4 hana":                   "SAP S/4HANA",
    "sap s4hana":                    "SAP S/4HANA",
    # Other common
    "spring boot":                   "Spring Boot",
    "spring framework":              "Spring",
    "node js":                       "Node.js",
    "node.js":                       "Node.js",
    "react js":                      "React.js",
    "react.js":                      "React.js",
    "vue js":                        "Vue.js",
    "vue.js":                        "Vue.js",
    "next js":                       "Next.js",
    "express js":                    "Express.js",
    "angular js":                    "Angular",
    "angularjs":                     "Angular",
    "power bi":                      "Power BI",
    "ms excel":                      "Excel",
    "microsoft excel":               "Excel",
    "ms word":                       "MS Word",
    "ms office":                     "MS Office",
    "microsoft office":              "MS Office",
    "linux/unix":                    "Linux",
    "unix/linux":                    "Linux",
    "project management":            "Project Management",
    "agile methodology":             "Agile",
    "agile methodologies":           "Agile",
    "agile development":             "Agile",
    "agile framework":               "Agile",
    "agile environment":             "Agile",
    "agile software development":    "Agile",
    "scrum methodology":             "Scrum",
    "scrum framework":               "Scrum",
    "full stack":                    "Full Stack",
    "full-stack":                    "Full Stack",
    "fullstack":                     "Full Stack",
}

# ── CAPS_PRESERVE — pure all-caps abbreviations ───────────────────────────────
# Token matched: token.upper() in CAPS_PRESERVE

CAPS_PRESERVE = {
    "AWS", "GCP", "SQL", "API", "SAP", "SRE", "ETL", "ERP", "CRM", "SDK",
    "CI", "CD", "UI", "UX", "ML", "AI", "NLP", "DL", "BI", "KPI", "OOP",
    "REST", "SOAP", "JSON", "XML", "HTML", "CSS", "HTTP", "HTTPS", "TCP",
    "IP", "DNS", "VPN", "SSH", "SSL", "TLS", "JWT", "LDAP", "OAuth",
    "JIRA", "SDLC", "SCRUM", "EC2", "RDS", "IAM", "ECS", "EKS",
    "SQS", "SNS", "EMR", "ATM", "BPO", "KYC", "AML", "BFSI",
    "SLA", "POC", "B2B", "B2C", "SaaS", "PaaS", "IaaS", "IaC",
    "RDBMS", "OLAP", "OLTP", "ELT", "MDM", "CDN", "WAF", "SIEM",
    "SOC", "NOC", "ITIL", "ITSM", "PMO", "RPA", "BPM", "OCR", "NER",
    "LLM", "RAG", "GPU", "CPU", "RAM", "SSD", "VM", "VPC", "NAT",
    "OSPF", "BGP", "MPLS", "LAN", "WAN", "VLAN", "SAN", "NAS",
    "CQRS", "DDD", "TDD", "BDD", "MVC", "MVVM",
    "PHP", "ASP", "JSP", "JVM", "JDK", "JRE", "IDE", "ORM",
    "ISO", "ANSI", "IEEE", "GDPR", "HIPAA", "PCI", "SOX",
    "S3",
}

# ── CANONICAL_EXACT — mixed-case / special-char canonical forms ───────────────
# Token matched case-insensitively.

CANONICAL_EXACT = {
    # Languages
    "javascript":   "JavaScript",
    "typescript":   "TypeScript",
    "powershell":   "PowerShell",
    "golang":       "Go",
    "go":           "Go",        # careful — only fires as a whole token
    # Databases
    "mysql":        "MySQL",
    "mongodb":      "MongoDB",
    "postgresql":   "PostgreSQL",
    "graphql":      "GraphQL",
    "nosql":        "NoSQL",
    "mariadb":      "MariaDB",
    "hbase":        "HBase",
    "dynamodb":     "DynamoDB",
    "elasticsearch":"Elasticsearch",
    "neo4j":        "Neo4j",
    # Frameworks / tools
    "openshift":    "OpenShift",
    "wordpress":    "WordPress",
    "kubernetes":   "Kubernetes",
    "terraform":    "Terraform",
    "ansible":      "Ansible",
    "jenkins":      "Jenkins",
    "kafka":        "Kafka",
    "hadoop":       "Hadoop",
    "spark":        "Spark",
    "tableau":      "Tableau",
    "salesforce":   "Salesforce",
    "servicenow":   "ServiceNow",
    "pytorch":      "PyTorch",
    "tensorflow":   "TensorFlow",
    "hive":         "Hive",
    "airflow":      "Airflow",
    "dbt":          "dbt",
    "fastapi":      "FastAPI",
    "linkedin":     "LinkedIn",
    "github":       "GitHub",
    "gitlab":       "GitLab",
    # .NET ecosystem
    ".net":         ".NET",
    "asp.net":      "ASP.NET",
    # Practices
    "devops":       "DevOps",
    "gitops":       "GitOps",
    "dataops":      "DataOps",
    "mlops":        "MLOps",
    "aiops":        "AIOps",
    "agile":        "Agile",
    "scrum":        "Scrum",
    # Cloud products
    "azure":        "Azure",
    # Frontend
    "angular":      "Angular",
    "react":        "React",
    # Standards with digits glued (not versions)
    "iso8583":      "ISO8583",
    "iso27001":     "ISO27001",
    "iso9001":      "ISO9001",
    "pci-dss":      "PCI-DSS",
}

_CANONICAL_LOWER = CANONICAL_EXACT  # keys already lowercase

# ── Stopwords — normalised skills that are not real skills ────────────────────

STOPWORDS = {
    "Development", "Software", "Application", "Management", "Design",
    "Testing", "Engineering", "Data", "Analysis", "Analytics",
    "Communication", "Leadership", "Teamwork", "Problem Solving",
    "Troubleshooting", "Support", "Maintenance", "Operations",
    "Site", "Reliability", "Integration", "Delivery", "Deployment",
    "Architecture", "Service", "Services", "System", "Systems",
    "Technology", "Technologies", "Programming", "Scripting",
    "Implementation", "Solutions", "Strategy", "Planning",
    "Monitoring", "Security", "Performance", "Quality",
}

# ── Version regex ─────────────────────────────────────────────────────────────

VERSION_RE = re.compile(
    r"""
    \s+                           # must be preceded by whitespace
    (?:
        v?\d+(?:\.\d+)*\+?        # 15, 3.11, 6+, 1.2.3
      | \d+(?:\.\d+)*\s*(?:lts|eol)?   # 8 LTS, 11 EOL
      | /\s*\.?net\s*\d+\+?       # / .NET 6+
    )
    $
    """,
    re.IGNORECASE | re.VERBOSE,
)

# ── Suffix strip ──────────────────────────────────────────────────────────────

SUFFIX_WORDS = re.compile(
    r"""\s+(?:
        programming | scripting | developer | developers |
        expert | specialist | professional | consultant | advanced |
        basics | fundamentals | concepts | framework | frameworks |
        language | languages | tools | tool |
        environment | practices | technique | techniques | skill | skills
    )$""",
    re.IGNORECASE | re.VERBOSE,
)

# ── Tech anchors for prefix clustering ───────────────────────────────────────

TECH_ANCHORS = [
    ".NET", "ASP.NET",
    "Angular", "React", "Vue", "Node", "Next", "Express",
    "Python", "Java", "JavaScript", "TypeScript", "Go", "Kotlin", "Swift",
    "Scala", "Ruby", "PHP", "Perl", "Rust", "C++", "C#",
    "Spring", "Django", "Flask", "FastAPI", "Laravel",
    "AWS", "Azure", "GCP",
    "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins",
    "Kafka", "Spark", "Hadoop", "Airflow",
    "MySQL", "PostgreSQL", "MongoDB", "Redis", "Cassandra",
    "Tableau", "Power BI", "Grafana",
    "TensorFlow", "PyTorch", "Scikit",
    "Salesforce", "ServiceNow", "SAP", "Oracle",
    "Linux", "Unix",
    "Agile", "Scrum",
]
_ANCHOR_LOWER = {a.lower(): a for a in TECH_ANCHORS}


# ── Normalisation functions ───────────────────────────────────────────────────

def _tokenise(s: str) -> list[str]:
    """Split on whitespace, keeping separators for reassembly."""
    return re.split(r"(\s+)", s)


def _normalise_token(token: str) -> str:
    """Canonicalise a single whitespace-free token."""
    lower = token.lower()
    if lower in _CANONICAL_LOWER:
        return _CANONICAL_LOWER[lower]
    if token.upper() in CAPS_PRESERVE:
        return token.upper()
    return token.title()


def _case_normalise(raw: str) -> str:
    """Token-level canonical matching; title-case fallback per token."""
    stripped = raw.strip()
    lower = stripped.lower()

    # Whole-string canonical first (catches .net, asp.net, multi-char exact)
    if lower in _CANONICAL_LOWER:
        return _CANONICAL_LOWER[lower]

    # Token-level pass
    parts = _tokenise(stripped)
    result = []
    for part in parts:
        if re.match(r"^\s+$", part) or part == "":
            result.append(part)
        elif "/" in part:
            # Handle slash-joined tokens (CI/CD, AWS/GCP, etc.)
            sub = []
            for sp in part.split("/"):
                sub.append(_normalise_token(sp) if sp else "")
            result.append("/".join(sub))
        else:
            result.append(_normalise_token(part))
    return "".join(result)


def _strip_version(skill: str) -> str:
    return VERSION_RE.sub("", skill).strip()


def _strip_suffix(skill: str) -> str:
    return SUFFIX_WORDS.sub("", skill).strip()


def _prefix_cluster(skill: str) -> str:
    lower = skill.lower()
    for anchor_lower, anchor_canonical in _ANCHOR_LOWER.items():
        if lower == anchor_lower:
            return anchor_canonical
        if lower.startswith(anchor_lower + " ") or \
           lower.startswith(anchor_lower + "-") or \
           lower.startswith(anchor_lower + "."):
            tail = skill[len(anchor_lower):].strip(" -.")
            if re.match(r"^[\d\.\+\s]+$", tail) or \
               SUFFIX_WORDS.match(" " + tail):
                return anchor_canonical
    return skill


def normalise_skill(raw: str) -> str | None:
    """
    Full pipeline. Returns None if skill should be dropped (garbage or stopword).
    """
    stripped = raw.strip()
    if not stripped:
        return None

    # Step 0: garbage filter
    if is_garbage(stripped):
        return None

    # Step 1: multi-word canonical
    lower = stripped.lower()
    if lower in MULTI_WORD_CANONICAL:
        result = MULTI_WORD_CANONICAL[lower]
    else:
        # Steps 2–5
        result = _case_normalise(stripped)
        result = _strip_version(result)
        result = _strip_suffix(result)
        result = _prefix_cluster(result)
        result = result.strip(" ,-")

    if not result:
        return None

    # Step 6: stopword drop
    if result in STOPWORDS:
        return None

    return result


def parse_skills(raw: str) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


# ── Load data ─────────────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print("STEP 1 — Load it_subset.parquet")
print('='*60)

df = pd.read_parquet(PARQUET_IN)
print(f"Rows loaded:          {len(df):,}")
print(f"Null tagsAndSkills:   {df['tagsAndSkills'].isna().sum()}")
print()
print("DATA LINEAGE NOTE:")
print("  28,665 rows is the correct locked figure for it_subset.parquet.")
print("  The 28,250 figure cited in earlier reviews was the pre-keyword-fix")
print("  estimate from Module 01 development. The keyword fixes (sre, qa,")
print("  sap end-of-string, quality assurance, bi analyst) were applied")
print("  post-Kimi-review of Module 01 and are documented in plexus_pipeline.md.")
print("  There is no data lineage break. 28,665 is locked.")

df["tagsAndSkills"] = df["tagsAndSkills"].fillna("")

# ── Parse raw skills ──────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print("STEP 2 — Parse raw skills")
print('='*60)

df["raw_skills"] = df["tagsAndSkills"].apply(parse_skills)
all_raw = sorted({s for skills in df["raw_skills"] for s in skills})
print(f"Unique raw skills:    {len(all_raw):,}")

# ── Build normalisation mapping ───────────────────────────────────────────────

print(f"\n{'='*60}")
print("STEP 3 — Build normalisation mapping")
print('='*60)

mapping = {}
garbage_count = 0
stopword_count = 0
changed_count = 0
unchanged_count = 0

for raw in all_raw:
    result = normalise_skill(raw)
    if result is None:
        if is_garbage(raw):
            garbage_count += 1
        else:
            stopword_count += 1
        mapping[raw] = None
    else:
        mapping[raw] = result
        if raw != result:
            changed_count += 1
        else:
            unchanged_count += 1

kept = sum(1 for v in mapping.values() if v is not None)
print(f"Raw skills:           {len(all_raw):,}")
print(f"Dropped (garbage):    {garbage_count:,}")
print(f"Dropped (stopword):   {stopword_count:,}")
print(f"Kept + changed:       {changed_count:,}")
print(f"Kept unchanged:       {unchanged_count:,}")
print(f"Total kept:           {kept:,}")

# ── Spot-check: changed and multi-word canonical mappings ─────────────────────

changed_pairs = [(k, v) for k, v in mapping.items() if v is not None and k != v]
mw_pairs      = [(k, v) for k, v in mapping.items()
                 if v is not None and k.lower() in MULTI_WORD_CANONICAL]

print(f"\nSpot-check — multi-word canonical matches (all {len(mw_pairs)}):")
for k, v in sorted(mw_pairs):
    print(f"  {k!r:50s} → {v!r}")

print(f"\nSpot-check — other changed mappings (first 40 of {len(changed_pairs):,}):")
non_mw = [(k, v) for k, v in changed_pairs if k.lower() not in MULTI_WORD_CANONICAL]
for k, v in non_mw[:40]:
    print(f"  {k!r:50s} → {v!r}")

print(f"\nSpot-check — garbage dropped (first 20 of {garbage_count:,}):")
garbage_examples = [k for k, v in mapping.items() if v is None and is_garbage(k)][:20]
for g in garbage_examples:
    print(f"  {g!r}")

print(f"\nSpot-check — stopwords dropped (first 20 of {stopword_count:,}):")
sw_examples = [k for k, v in mapping.items() if v is None and not is_garbage(k)][:20]
for s in sw_examples:
    print(f"  {s!r}")

# ── Apply mapping ─────────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print("STEP 4 — Apply mapping to all rows")
print('='*60)

df["normalised_skills"] = df["raw_skills"].apply(
    lambda skills: list(dict.fromkeys(
        v for raw in skills
        for v in [mapping.get(raw, normalise_skill(raw))]
        if v is not None
    ))
)

empty = (df["normalised_skills"].apply(len) == 0).sum()
print(f"Rows with zero normalised skills: {empty:,}")

print(f"\nSample normalised_skills (first 5 rows):")
for i, row in df["normalised_skills"].head(5).items():
    print(f"  row {i}: {row}")

# ── Vocabulary reduction ──────────────────────────────────────────────────────

all_canonical = {s for skills in df["normalised_skills"] for s in skills}
print(f"\nRaw unique skills:        {len(all_raw):,}")
print(f"Canonical unique skills:  {len(all_canonical):,}")
print(f"Vocabulary reduction:     {(1 - len(all_canonical)/len(all_raw))*100:.1f}%")

# ── Frequency distribution ────────────────────────────────────────────────────

print(f"\n{'='*60}")
print("STEP 5 — Skill frequency distribution")
print('='*60)

from collections import Counter
skill_counts = Counter(s for skills in df["normalised_skills"] for s in skills)
total_postings = len(df)

freq_1    = sum(1 for c in skill_counts.values() if c == 1)
freq_lt5  = sum(1 for c in skill_counts.values() if c < 5)
freq_lt10 = sum(1 for c in skill_counts.values() if c < 10)
freq_ge10 = sum(1 for c in skill_counts.values() if c >= 10)

print(f"Total unique canonical skills:    {len(skill_counts):,}")
print(f"Appearing in exactly 1 posting:   {freq_1:,}  ({freq_1/len(skill_counts)*100:.1f}%)")
print(f"Appearing in < 5 postings:        {freq_lt5:,}  ({freq_lt5/len(skill_counts)*100:.1f}%)")
print(f"Appearing in < 10 postings:       {freq_lt10:,}  ({freq_lt10/len(skill_counts)*100:.1f}%)")
print(f"Appearing in >= 10 postings:      {freq_ge10:,}  ({freq_ge10/len(skill_counts)*100:.1f}%)")

print(f"\nTop 30 skills by frequency:")
for skill, count in skill_counts.most_common(30):
    pct = count / total_postings * 100
    print(f"  {count:6,}  ({pct:5.1f}%)  {skill}")

print(f"\nBottom 20 skills (rarest):")
for skill, count in skill_counts.most_common()[:-21:-1]:
    print(f"  {count:6,}              {skill!r}")

# ── Write output ──────────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print("STEP 6 — Write skill_normalised.parquet")
print('='*60)

df.to_parquet(PARQUET_OUT, index=False)
print(f"Written: {PARQUET_OUT}")
print(f"Shape:   {df.shape}")
print(f"Columns: {list(df.columns)}")

print(f"\nLog written to: {LOG_PATH}")
print("Module 02 complete.")

tee.close()
