#!/usr/bin/env python3
"""
Populate empty crypto sectors with symbols from MMF.
"""
import csv
import requests
from pathlib import Path

# Paths
SECTORS_CSV = Path('C:/Users/Bete/Desktop/projeto-sentinel/sectors.csv')
SYMBOLS_CSV = Path('C:/Users/Bete/Desktop/projeto-sentinel/sectors_symbols.csv')
MMF_URL = 'http://127.0.0.1:8765/mmf/debug'
ENCODING = 'utf-8-sig'

# Sector mapping patterns
SECTOR_PATTERNS = {
    'crypto_launchpad': {
        'name': 'Cripto - Launchpad',
        'keywords': ['LAUNCH', 'PAD', 'IDO', 'IEO'],
        'symbols': ['POLYX', 'LAUNCH', 'PAD', 'TPT', 'GMT', 'APE', 'HOOK', 'IDEX']
    },
    'crypto_lending': {
        'name': 'Cripto - Lending/DeFi',
        'keywords': ['LEND', 'LOAN', 'DEFI', 'AAVE', 'COMP', 'LEND'],
        'symbols': ['AAVE', 'COMP', 'LEND', 'MKR', 'SNX', 'CRV', 'YFI', 'SUSHI', 'UNI', '1INCH']
    },
    'crypto_letra_T': {
        'name': 'Cripto - Letra T',
        'pattern': lambda s: s.upper().startswith('T') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_A': {
        'name': 'Cripto - Letra A',
        'pattern': lambda s: s.upper().startswith('A') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_B': {
        'name': 'Cripto - Letra B',
        'pattern': lambda s: s.upper().startswith('B') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_C': {
        'name': 'Cripto - Letra C',
        'pattern': lambda s: s.upper().startswith('C') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_D': {
        'name': 'Cripto - Letra D',
        'pattern': lambda s: s.upper().startswith('D') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_E': {
        'name': 'Cripto - Letra E',
        'pattern': lambda s: s.upper().startswith('E') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_F': {
        'name': 'Cripto - Letra F',
        'pattern': lambda s: s.upper().startswith('F') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_G': {
        'name': 'Cripto - Letra G',
        'pattern': lambda s: s.upper().startswith('G') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_H': {
        'name': 'Cripto - Letra H',
        'pattern': lambda s: s.upper().startswith('H') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_I': {
        'name': 'Cripto - Letra I',
        'pattern': lambda s: s.upper().startswith('I') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_J': {
        'name': 'Cripto - Letra J',
        'pattern': lambda s: s.upper().startswith('J') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_K': {
        'name': 'Cripto - Letra K',
        'pattern': lambda s: s.upper().startswith('K') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_L': {
        'name': 'Cripto - Letra L',
        'pattern': lambda s: s.upper().startswith('L') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_M': {
        'name': 'Cripto - Letra M',
        'pattern': lambda s: s.upper().startswith('M') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_N': {
        'name': 'Cripto - Letra N',
        'pattern': lambda s: s.upper().startswith('N') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_O': {
        'name': 'Cripto - Letra O',
        'pattern': lambda s: s.upper().startswith('O') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_P': {
        'name': 'Cripto - Letra P',
        'pattern': lambda s: s.upper().startswith('P') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_Q': {
        'name': 'Cripto - Letra Q',
        'pattern': lambda s: s.upper().startswith('Q') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_R': {
        'name': 'Cripto - Letra R',
        'pattern': lambda s: s.upper().startswith('R') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_S': {
        'name': 'Cripto - Letra S',
        'pattern': lambda s: s.upper().startswith('S') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_U': {
        'name': 'Cripto - Letra U',
        'pattern': lambda s: s.upper().startswith('U') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_V': {
        'name': 'Cripto - Letra V',
        'pattern': lambda s: s.upper().startswith('V') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_W': {
        'name': 'Cripto - Letra W',
        'pattern': lambda s: s.upper().startswith('W') and len(s) <= 5,
        'symbols': []
    },
    'crypto_letra_Y': {
        'name': 'Cripto - Letra Y',
        'pattern': lambda s: s.upper().startswith('Y') and len(s) <= 5,
        'symbols': []
    },
}

def fetch_mmf_symbols():
    """Fetch all crypto symbols from MMF."""
    try:
        resp = requests.get(MMF_URL, timeout=10)
        data = resp.json()
        crypto_symbols = [s for s in data.get('symbols', []) if s.get('exchange') == 'CRYPTO']
        print(f"[MMF] Found {len(crypto_symbols)} crypto symbols")
        return crypto_symbols
    except Exception as e:
        print(f"[ERROR] Failed to fetch MMF: {e}")
        return []

def load_existing_symbols():
    """Load existing symbols from CSV."""
    rows = []
    if SYMBOLS_CSV.exists():
        with open(SYMBOLS_CSV, mode='r', encoding=ENCODING, newline='') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
    return rows

def load_sector_names():
    """Load sector names from sectors.csv."""
    sectors = {}
    if SECTORS_CSV.exists():
        with open(SECTORS_CSV, mode='r', encoding=ENCODING, newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                sectors[row['sector_id']] = row.get('sector_name', row['sector_id'])
    return sectors

def main():
    # Load existing data
    existing_rows = load_existing_symbols()
    sector_names = load_sector_names()
    
    # Get existing symbol-sector pairs to avoid duplicates
    existing_pairs = set((r['symbol'], r['sector_id']) for r in existing_rows)
    existing_symbols_in_crypto = set(r['symbol'] for r in existing_rows if r['sector_id'].startswith('crypto_'))
    
    # Fetch MMF symbols
    mmf_symbols = fetch_mmf_symbols()
    
    # Build new rows
    new_rows = []
    assigned = {sector_id: set() for sector_id in SECTOR_PATTERNS.keys()}
    
    for sym_data in mmf_symbols:
        symbol = sym_data.get('symbol', '').upper()
        if not symbol or symbol in existing_symbols_in_crypto:
            continue
        
        # Try to match to a sector
        for sector_id, config in SECTOR_PATTERNS.items():
            # Check explicit symbols list
            if symbol in config.get('symbols', []):
                if (symbol, sector_id) not in existing_pairs and symbol not in assigned[sector_id]:
                    new_rows.append({
                        'sector_id': sector_id,
                        'sector_name': sector_names.get(sector_id, config['name']),
                        'exchange': 'CRYPTO',
                        'symbol': symbol,
                        'description': f"{symbol} Crypto",
                        'type': 'CRYPTO',
                        'full_symbol': f"CRYPTO\\{symbol}"
                    })
                    assigned[sector_id].add(symbol)
                    existing_symbols_in_crypto.add(symbol)
                    break
            
            # Check pattern
            if 'pattern' in config:
                try:
                    if config['pattern'](symbol):
                        if (symbol, sector_id) not in existing_pairs and symbol not in assigned[sector_id]:
                            new_rows.append({
                                'sector_id': sector_id,
                                'sector_name': sector_names.get(sector_id, config['name']),
                                'exchange': 'CRYPTO',
                                'symbol': symbol,
                                'description': f"{symbol} Crypto",
                                'type': 'CRYPTO',
                                'full_symbol': f"CRYPTO\\{symbol}"
                            })
                            assigned[sector_id].add(symbol)
                            existing_symbols_in_crypto.add(symbol)
                            break
                except:
                    pass
    
    # Combine all rows
    all_rows = existing_rows + new_rows
    
    # Write back
    fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
    with open(SYMBOLS_CSV, mode='w', encoding=ENCODING, newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)
    
    print(f"\n[SUCCESS] Added {len(new_rows)} new crypto symbols")
    for sector_id, syms in assigned.items():
        if syms:
            print(f"  {sector_id}: {len(syms)} symbols")
    
    # Update sectors.csv counts
    update_sector_counts(all_rows)

def update_sector_counts(all_rows):
    """Update total_symbols in sectors.csv."""
    # Count symbols per sector
    counts = {}
    for row in all_rows:
        sid = row['sector_id']
        counts[sid] = counts.get(sid, 0) + 1
    
    # Read sectors
    sectors = []
    with open(SECTORS_CSV, mode='r', encoding=ENCODING, newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            sid = row['sector_id']
            if sid in counts:
                row['total_symbols'] = counts[sid]
            sectors.append(row)
    
    # Write back
    with open(SECTORS_CSV, mode='w', encoding=ENCODING, newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sectors)
    
    print(f"\n[SUCCESS] Updated sector counts in sectors.csv")

if __name__ == '__main__':
    main()
