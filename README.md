# Plexus

A real-data map of the Indian tech job market — built on 28,000+ job postings from 2025.

Roles are nodes. Edges connect roles by skill overlap. The map is stratified by employer type (services vs GCC), so the same title reveals itself as two different jobs depending on who is hiring.

## What it shows

- Which roles sit next to yours in the market, measured by shared skill demand
- The skills that bridge you from one role to the next
- How the same role differs between a services firm and a GCC

## How it's built

A six-module Python pipeline processes raw Naukri job posting data:

1. IT subset extraction and cleaning
2. Embedding-based skill normalisation
3. Role assignment to 23 canonical roles
4. Employer-type classification (services / GCC / unknown)
5. Graph construction — stratified nodes, symmetric cosine edges at threshold 0.25
6. Pathfinder engine — precomputed adjacency, bridge skills, onward region per role

The pipeline emits static JSON artifacts consumed by a React/Vite frontend using react-flow and recharts.

## Stack

- **Pipeline:** Python — pandas, scikit-learn, sentence-transformers, networkx
- **Frontend:** React + Vite, react-flow, recharts

## Data

Raw data files are not included in this repository. The pipeline expects:
- `data/indian-job-market-dataset-2025.xlsx` — Naukri job postings (~98k rows)
- `data/GCC-Journal-India-List.xlsx` — GCC company reference list (274 entries)

## Status

Pipeline build in progress. Frontend follows after all six modules are validated.