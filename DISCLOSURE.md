# Plexus — Data & Methodology Disclosure

## What this is

Plexus is a structural map of the Indian IT job market built from real job postings. It shows which roles sit next to each other by shared skill demand, and how the same role differs depending on who is hiring. It is an analytical tool, not a job search engine, a recommender system, or a career advisory product. It does not tell you what to do — it shows you what the market looks like.

---

## Data sources

| Source | Description | Rows used |
|--------|-------------|-----------|
| Naukri job postings 2025 | Primary dataset — IT & engineering roles, India | 28,665 |
| Naukri Software Engineer supplement (JSONL) | Additional SE postings, 2019–2026 | 87,299 |
| Naukri Data Scientist supplement (JSONL) | Additional DS/ML postings | 9,279 |
| Naukri general postings 2019 (CSV) | Historical supplement | 5,514 |
| **Total IT subset** | | **130,757** |

**GCC reference:** `GCC-Journal-India-List.xlsx` — 274 Global Capability Centres in India (30 services conflators excluded via token-boundary matching → 244 genuine captives used).

Raw data files are not included in this repository and are not redistributed. The pipeline emits static JSON artifacts; no raw posting data is exposed in the frontend.

---

## What the graph encodes

**Nodes** — 38 stratified role nodes across 22 canonical IT roles. Each role appears as up to two nodes: one for the services labour market (`Role@Services`) and one for the GCC labour market (`Role@GCC`). Services and GCC nodes of the same role share an identity colour but are analytically separate — they have different skill vectors, different posting volumes, and different edges.

**Edges** — symmetric cosine similarity between TF-IDF skill vectors. An edge exists when cosine ≥ 0.20. Edge width encodes cosine weight. Edges are a proxy for skill-overlap reachability — not a guarantee of career movement, not a measure of salary gain, not a prediction of hiring probability.

**Node size** — posting volume (4 buckets). Larger node = more postings in the dataset.

**Layout** — seeded from classical MDS coordinates, refined by a d3-force simulation. Position is approximate. Proximity encodes similarity but is not exact — the edge weight is the exact measure, not spatial distance.

---

## Employer-type classification

Postings are classified into four strata: **services** (TCS, Infosys, Wipro and peers), **GCC** (in-house tech arms of multinationals), **agency/staffing** (Quess, TeamLease and peers), and **unknown**. Classification uses token-boundary company-name matching against the GCC reference list, with a staffing-specific heuristic for agency detection.

Verified split on the 130,757-row IT subset: **services 33.3% / GCC 4.7% / agency 18.0% / unknown 43.9%**.

Only services and GCC postings contribute to stratified role nodes. Agency and unknown postings are excluded from node construction but are included in the posting counts shown in the drawer.

---

## Skill pipeline

1. Raw `tagsAndSkills` field extracted per posting.
2. Embedding-based skill normalisation using `sentence-transformers` (local inference, no external API).
3. TF-IDF vectors built per stratified role node from normalised skill counts.
4. Symmetric cosine similarity matrix computed across all 38 nodes.
5. Edges added at threshold ≥ 0.20.

**Skill gap / bridge skills** are computed as the set difference between a door role's top skills and the current role's top skills. They are filtered through a seniority stopword list at render time. When the filtered set is empty, the UI shows: "This move requires seniority and breadth typical of [role] — see full skill profile." Bridge skills are indicative, not a gap analysis tool.

---

## Known limitations

**GCC corpus thinness.** GCC postings are 4.7% of the IT corpus. GCC role nodes with fewer than 25 postings (MIN_STRATUM = 25) are not built. This is why several roles have a services node but no GCC node — the market data is genuinely thin for GCC at that role, which is itself a structural finding.

**Five structurally isolated nodes.** Five nodes have maximum cosine < 0.20 to all other nodes in their stratum: `network_sys_admin_services`, `ux_ui_designer_services`, and three others. These are shown on the canvas with a `low_connectivity` flag in their data. Their isolation is a structural finding, not a data gap — the skill overlap to adjacent roles is genuinely low in this dataset.

**Layout is approximate.** MDS stress = 39.80 (raw, not normalised). The five isolated nodes distort the embedding. Spatial proximity is a guide only — use edge weights for exact similarity.

**No temporal signal.** `jobUploaded` is a relative string ("3 days ago") — no usable date. The dataset is a cross-section, not a time series. No trend or drift claims are made.

**No salary signal.** Salary disclosed in ~34.6% of postings, with non-random disclosure patterns. No salary-dependent analysis is performed.

**Recruiting channel confound.** Services firms post heavily on Naukri; GCC and product firms hire largely through their own ATS and LinkedIn. The GCC 4.7% corpus share reflects channel bias, not total GCC hiring volume. This is documented as a structural finding, not corrected for.

**No clustering structure.** K-means and community detection found no stable partition (silhouette ≈ 0.10, modularity ≈ 0.17). The map is one dense mass with a thin margin — no districts, regions, or clusters are drawn, because the data does not support them.

**CV parsing is approximate.** CV upload uses client-side pdf.js / mammoth parsing. Parsed skills are matched against role top-skill lists via cosine similarity. This is a node-selector, not a bespoke placement engine. The confirmed-role step exists precisely because the snap is imprecise.

---

## What Plexus does not show

- Salary ranges or compensation benchmarks
- Hiring probability or demand forecasts
- Risk scores or danger signals
- Career advice or role recommendations
- Any prediction about an individual's employability
- Temporal trends or market direction

---

## Honest findings from the build

These are findings that emerged from the data and in some cases contradicted the original hypotheses:

1. **Obsolescence direction is backwards — verified.** Seniors show higher demand for modern stacks; juniors show higher demand for legacy. The original hypothesis was reversed. Verified objectively via technology release-year proxy (86 dateable skills, n = 91,383 postings): Pearson r = +0.068, Spearman r = +0.089, p < 10⁻⁹⁴. Effect is real but small — mean stack recency rises ~2 years from the 0–2 yr bracket (1995.8) to the 9–12 yr bracket (1997.9), then plateaus. The finding is directional; it is not a large-magnitude gap.
2. **No stable partition exists.** The market does not cluster into clean districts. Absence of structure is the finding.
3. **GCC is genuinely 4.7% of public postings.** Not a scraping failure — a channel-stratification finding.
4. **Manufactured islands from bad metrics.** An asymmetric top-K metric reported 7 structurally isolated roles. Symmetric cosine found 0. The islands were a metric artifact, not a market fact.
5. **Product stratum is not viable.** 705 postings (0.7%) across 39 companies; marquee product companies hire through their own ATS. The moat does not replicate in the product domain.
6. **Single onward door is threshold-unstable.** The top adjacent role by cosine changes identity within a ±0.03 threshold range. The UI shows an onward region (2–3 roles, equal weight) rather than a single crowned door.
7. **QA is the most central cross-cutting services role** — degree 10, adjacent to every major cluster. Prior framing as a "sparse rim" role was wrong.

---

## Builder

Aayush — MBA student, India. Prior: Wipro (Java/SAP Hybris). Contact: mr.aayush89@gmail.com

This project is an analytical portfolio piece, not a commercial product. The codebase is MIT licensed. Raw data is not redistributed.
