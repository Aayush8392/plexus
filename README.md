# Plexus

A structural map of the Indian IT job market built from 130,757 real job postings.

Roles are nodes. Edges connect roles by skill overlap. The map is stratified by employer type — `Role@Services` and `Role@GCC` are different nodes with different skill profiles, different volumes, and different adjacencies. The same title is two different jobs depending on who is hiring.

---

## What it shows

- Which roles sit next to yours in the market, measured by shared skill demand
- The skills that bridge you from one role to the next
- How the same role differs between a services firm (TCS, Infosys, Wipro) and a GCC (a multinational's in-house tech arm)
- Which roles have few structural connections — an honest finding, not a data gap

## What it does not show

Salary, hiring probability, risk scores, or career advice. Every output is structural — if the dataset doesn't support it, it isn't shown.

---

## How it's built

A seven-module Python pipeline processes raw Naukri job posting data:

1. **Ingest** — IT subset extraction (dual-field keyword filter), salary cleaning
2. **Skill normalisation** — embedding-based resolution via `sentence-transformers` (local inference)
3. **Role assignment** — 23 canonical IT roles, rule-based with KMeans cross-check, seeded from O*NET titles
4. **Employer classification** — token-boundary matching against GCC Journal India list; agency heuristic (staffing-specific)
5. **Graph construction** — 38 stratified nodes, TF-IDF skill vectors, symmetric cosine edges at threshold ≥ 0.20, MDS layout
6. **Pathfinder engine** — precomputed adjacency, bridge skills, onward region, seniority stopword guard per node
7. **Drawer data** — top hiring companies and seniority spread per stratified role node

The pipeline emits static JSON artifacts consumed by a React/Vite frontend. A FastAPI backend adds TF-IDF CV snapping and JD classification in phase 2.

---

## Stack

| Layer | Tech |
|-------|------|
| Pipeline | Python — pandas, scikit-learn, sentence-transformers, networkx |
| Backend (phase 2) | FastAPI — CV snap, JD classify, static serving |
| Frontend | React + Vite, react-flow, recharts |
| Hosting | Vercel (static SPA) |

---

## Key numbers

| Metric | Value |
|--------|-------|
| Total IT postings | 130,757 |
| Canonical roles | 23 |
| Stratified nodes on graph | 38 |
| Within-stratum edges | 163 |
| Cross-stratum edges | 112 |
| Cosine threshold | ≥ 0.20 |
| GCC corpus share | 4.7% |
| Structurally isolated nodes | 5 |

---

## Honest findings

- The market does not partition — silhouette ≈ 0.10, modularity ≈ 0.17. No districts are drawn because the data doesn't support them.
- GCC is 4.7% of public Naukri postings — a channel-stratification finding, not a scraping failure.
- Obsolescence direction is backwards — seniors show higher demand for modern stacks, not lower.
- An asymmetric top-K metric manufactured 7 structural islands. Symmetric cosine found 0.
- Single onward door is threshold-unstable — top adjacent role changes identity within ±0.03. The UI shows an onward region instead.

---

## Data

Raw data files are not included in this repository. The pipeline expects:

- `data/indian-job-market-dataset-2025.xlsx` — Naukri job postings (~28k base rows)
- `data/GCC-Journal-India-List.xlsx` — GCC company reference list (274 entries)
- Supplement files in `data/expansion/` — three additional Naukri scrapes (102k net new rows)

See [DISCLOSURE.md](DISCLOSURE.md) for full data sourcing, methodology, and known limitations.

---

## Status

**v1 complete. Deployment: Vercel (pending).**

Pipeline modules 01–07 validated. Frontend screens 1, 2, 2b, 3 locked. FastAPI backend live locally.
