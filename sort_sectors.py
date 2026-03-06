#!/usr/bin/env python3
"""Sort sectors alphabetically in sectors.csv"""
import csv
from pathlib import Path

SECTORS_CSV = Path('C:/Users/Bete/Desktop/projeto-sentinel/sectors.csv')
ENCODING = 'utf-8-sig'

# Read all sectors
with open(SECTORS_CSV, mode='r', encoding=ENCODING, newline='') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    rows = list(reader)

# Sort by sector_name (alphabetically)
rows.sort(key=lambda r: r['sector_name'].lower())

# Write back
with open(SECTORS_CSV, mode='w', encoding=ENCODING, newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Sorted {len(rows)} sectors alphabetically by name")
print("\nFirst 10 sectors:")
for r in rows[:10]:
    print(f"  {r['sector_id']}: {r['sector_name']}")
