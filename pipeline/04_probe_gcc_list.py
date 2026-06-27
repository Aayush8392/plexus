"""
04_probe_gcc_list.py  —  diagnostic only
Input:  ../data/GCC-Journal-India-List.xlsx
Output: prints all company names from 'All GCCs - India Master' sheet

Run from: pipeline/ directory
"""

import os
import pandas as pd

assert os.path.basename(os.getcwd()) == "pipeline", "Run from pipeline/ directory"

df = pd.read_excel(
    "../data/GCC-Journal-India-List.xlsx",
    sheet_name="All GCCs – India Master"
)

print(f"Columns: {list(df.columns)}")
print(f"Rows: {len(df)}")
print()
print(df.to_string(index=False))
