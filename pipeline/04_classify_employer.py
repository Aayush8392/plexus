"""
04_classify_employer.py
Input:  ../output/roles_assigned.parquet
Output: ../output/employer_tagged.parquet
        ../output/04_classify_employer_log.txt

Classification priority (first match wins):
  1. SERVICES_SET (hardcoded) → "services"
  2. GCC Journal match (token-boundary + bidirectional + Jaccard fallback) → "gcc"
  3. AGENCY_KEYWORDS (regex, digit-boundary-aware) → "agency"
  4. KNOWN_AGENCIES (hardcoded exceptions) → "agency"
  5. → "unknown"

Run from: pipeline/ directory
"""

import os, re, sys
import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", "Run from pipeline/ directory"


# ── Tee ──────────────────────────────────────────────────────────────────────

class _Tee:
    def __init__(self, *streams):
        self.streams = streams
    def write(self, data):
        for s in self.streams:
            s.write(data)
    def flush(self):
        for s in self.streams:
            s.flush()

os.makedirs("../output", exist_ok=True)
_log = open("../output/04_classify_employer_log.txt", "w", encoding="utf-8")
sys.stdout = _Tee(sys.__stdout__, _log)


# ── Classification sets ───────────────────────────────────────────────────────

# Indian IT outsourcing + Big 4 GCC conflators — matched before Journal lookup
SERVICES_TERMS = [
    "accenture",
    "tata consultancy services", "tcs",
    "infosys",
    "wipro",
    "capgemini",
    "cognizant",
    "hcltech", "hcl technologies", "hcl",
    "ibm",
    "hexaware technologies", "hexaware",
    "mphasis",
    "zensar technologies", "zensar",
    "itc infotech",
    "thoughtworks",
    "publicis sapient",
    "tech mahindra",
    "ltimindtree",
    "persistent systems", "persistent",
    "kyndryl",
    "coforge",
    "happiest minds technologies", "happiest minds",
    "incedo",
    "yash technologies",
    "slk digital",
    "iris software",
    "prodapt solutions",
    "infogain",
    "bounteous x accolite", "bounteous",
    "pradeepit consulting services", "pradeepit",
    # Big 4 / professional-services conflators present in GCC Journal
    "deloitte",
    "ey",
    "kpmg",
    "pwc",
    # Other services firms in Journal
    "infor",
    "atos",
    "ntt data",
]

# Agency firms whose names carry no staffing keywords — hardcoded exceptions
KNOWN_AGENCY_TERMS = [
    "ideslabs",
    "wenger watson", "wenger & watson",
    "diverse lynx",
    "lancesoft",
    "talent21",                            # digit in name bypasses \b — hardcoded only
    "uplers",
    "purview india consulting and services",
    "purview services",
    "purview",
    "hr india solutions",
]

# Agency keywords — applied to digit-boundary-split company names
AGENCY_KW_PATTERNS = [
    r'\bstaffing\b',
    r'\bmanpower\b',
    r'\brecruitment\b',
    r'\brecruiter\b',
    r'\bplacement\b',
    r'\btalent\b',
    r'\bresources\b',
    r'\bconsultancy\b',
    r'\bworkforce\b',
    r'hr\s+solutions',
]

# GCC names that automated matching can't resolve (S&P punctuation → "s p")
KNOWN_GCC_TERMS = [
    "s p global",
]


# ── Normalisation ─────────────────────────────────────────────────────────────

_LEGAL = re.compile(
    r'\bprivate\s+limited\b|\bpvt\.?\s*ltd\.?\b|\blimited\b|\bltd\.?\b'
    r'|\bllp\b|\binc\.?\b|\bllc\b|\bco\b(?=\s*$)',
    re.IGNORECASE
)
_PUNCT = re.compile(r'[^\w\s]')
_WS    = re.compile(r'\s+')

def _norm(name) -> str:
    if not isinstance(name, str):
        return ""
    s = name.lower()
    s = _LEGAL.sub(' ', s)
    s = _PUNCT.sub(' ', s)
    s = _WS.sub(' ', s).strip()
    return s

def _digit_split(s: str) -> str:
    """'talent21' → 'talent 21' so \b works across letter↔digit transitions."""
    return re.sub(r'(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])', ' ', s)

def _tbpat(term: str) -> re.Pattern:
    """Token-boundary pattern using negative char lookbehind/ahead on [a-z]."""
    return re.compile(r'(?<![a-z])' + re.escape(term) + r'(?![a-z])')


# ── Pre-compile matchers ──────────────────────────────────────────────────────

_SVC_PATS  = [_tbpat(_norm(t)) for t in SERVICES_TERMS]
_AGY_PATS  = [re.compile(p)     for p in AGENCY_KW_PATTERNS]
_KAGC_PATS = [_tbpat(_norm(t)) for t in KNOWN_AGENCY_TERMS]
_KGCC_PATS = [_tbpat(_norm(t)) for t in KNOWN_GCC_TERMS]


# ── Build GCC set from Journal (exclude services conflators) ──────────────────

def _load_gcc_entries(xlsx: str):
    df = pd.read_excel(xlsx, sheet_name="All GCCs – India Master")
    names = df['Company / GCC Name'].dropna().tolist()
    entries = []
    for raw in names:
        nn = _norm(raw)
        if nn and not any(p.search(nn) for p in _SVC_PATS):
            entries.append(nn)
    return entries

GCC_ENTRIES   = _load_gcc_entries("../data/GCC-Journal-India-List.xlsx")
GCC_TOK_SETS  = [set(e.split()) for e in GCC_ENTRIES]
_MIN_TOK_LEN  = 3   # filter single-char tokens (s, p, a) from Jaccard

# Generic tokens that appear in many company names — excluded from Jaccard scoring
# so "Suzva Software Technologies" can't match "Bosch Global Software Technologies"
_GCC_STOPWORDS = {
    "software", "technologies", "technology", "systems", "solutions",
    "services", "global", "india", "digital", "group", "tech",
    "center", "centre", "management", "consulting", "research",
    "development", "innovations", "pvt", "ltd",
}


def _jaccard(a_toks: set, b_toks: set) -> float:
    a = {t for t in a_toks if len(t) >= _MIN_TOK_LEN and t not in _GCC_STOPWORDS}
    b = {t for t in b_toks if len(t) >= _MIN_TOK_LEN and t not in _GCC_STOPWORDS}
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# ── Classifiers ───────────────────────────────────────────────────────────────

def _is_services(nn: str) -> bool:
    return any(p.search(nn) for p in _SVC_PATS)

def _is_gcc(nn: str) -> bool:
    if not nn:
        return False
    # Known-GCC overrides (punctuation edge cases)
    if any(p.search(nn) for p in _KGCC_PATS):
        return True
    pat = _tbpat(nn)
    toks = set(nn.split())
    for entry, etoks in zip(GCC_ENTRIES, GCC_TOK_SETS):
        # Primary: dataset name found inside Journal entry (short-in-long)
        if pat.search(entry):
            return True
        # Secondary: Journal entry found inside dataset name (long-in-short)
        if re.search(r'(?<![a-z])' + re.escape(entry) + r'(?![a-z])', nn):
            return True
        # Fallback: Jaccard ≥ 0.40, requiring ≥ 2 distinctive (non-stopword) tokens
        # in common — prevents generic tokens like "software"/"technologies" driving matches
        if len(toks) >= 2:
            distinctive_common = (
                {t for t in toks  if len(t) >= _MIN_TOK_LEN and t not in _GCC_STOPWORDS} &
                {t for t in etoks if len(t) >= _MIN_TOK_LEN and t not in _GCC_STOPWORDS}
            )
            if len(distinctive_common) >= 2 and _jaccard(toks, etoks) >= 0.40:
                return True
    return False

def _is_agency_kw(nn: str) -> bool:
    split = _digit_split(nn)
    return any(p.search(split) for p in _AGY_PATS)

def _is_known_agency(nn: str) -> bool:
    return any(p.search(nn) for p in _KAGC_PATS)

def classify(name) -> str:
    nn = _norm(name)
    if not nn:
        return 'unknown'
    if _is_services(nn):   return 'services'
    if _is_gcc(nn):        return 'gcc'
    if _is_agency_kw(nn):  return 'agency'
    if _is_known_agency(nn): return 'agency'
    return 'unknown'


# ── Main ──────────────────────────────────────────────────────────────────────

df = pd.read_parquet("../output/roles_assigned.parquet")
print(f"Rows in:          {len(df):,}")
print(f"Unique companies: {df['companyName'].nunique():,}")
print(f"GCC Journal entries after conflator exclusion: {len(GCC_ENTRIES)}")

df['employer_type'] = df['companyName'].map(classify)

counts = df['employer_type'].value_counts()
pct    = (counts / len(df) * 100).round(1)

print("\nEmployer-type distribution:")
for lbl in ['services', 'gcc', 'agency', 'unknown']:
    n = counts.get(lbl, 0)
    p = pct.get(lbl, 0.0)
    print(f"  {lbl:10s}: {n:6,d}  ({p}%)")
print(f"  {'TOTAL':10s}: {len(df):6,d}")

print("\n[Probe targets for reference]")
print("  services:  ~29.7%  |  gcc: ~4.4%  |  agency: ~4.5%  |  unknown: ~61.4%")
print("  (probe used narrower agency definition; true agency share expected higher)")

# Top-40 companies with assigned label — spot-check
top40 = (
    df.groupby(['companyName', 'employer_type'])
    .size()
    .reset_index(name='n')
    .sort_values('n', ascending=False)
    .head(40)
)
print("\nTop 40 companies by volume + assigned label:")
print(top40.to_string(index=False))

df.to_parquet("../output/employer_tagged.parquet", index=False)
print(f"\nWritten: ../output/employer_tagged.parquet")
print(f"Columns: {list(df.columns)}")

sys.stdout = sys.__stdout__
_log.close()
print(f"Log:     ../output/04_classify_employer_log.txt")
