"""
04_probe_companies.py  —  diagnostic only, not a pipeline module
Input:  ../output/roles_assigned.parquet
Output: prints top companies by posting count to stdout

Run from: pipeline/ directory
"""

import os
import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", "Run from pipeline/ directory"

df = pd.read_parquet("../output/roles_assigned.parquet")

print(f"Total rows: {len(df)}")
print(f"Unique companies: {df['companyName'].nunique()}")
print()

top = (
    df["companyName"]
    .value_counts()
    .reset_index()
    .rename(columns={"count": "postings"})
    .head(80)
)

print(top.to_string(index=False))
