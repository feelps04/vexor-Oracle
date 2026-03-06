#!/usr/bin/env python3
"""Populate missing crypto sectors"""
import csv
from pathlib import Path

SYMBOLS_CSV = Path('C:/Users/Bete/Desktop/projeto-sentinel/sectors_symbols.csv')
ENCODING = 'utf-8-sig'

# Load existing
with open(SYMBOLS_CSV, mode='r', encoding=ENCODING, newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Define symbols for missing sectors
NEW_SECTORS = {
    'crypto_leverage': {
        'name': 'Cripto - Tokens Alavancados (UP/DOWN)',
        'symbols': ['BTCUP', 'BTCDOWN', 'ETHUP', 'ETHDOWN', 'BNBUP', 'BNBDOWN', 
                    'ADAUP', 'ADADOWN', 'DOGEUP', 'DOGEDOWN', 'XRPUP', 'XRPDOWN',
                    'SOLUP', 'SOLDOWN', 'MATICUP', 'MATICDOWN', 'DOTUP', 'DOTDOWN',
                    'LTCUP', 'LTCDOWN', 'LINKUP', 'LINKDOWN', 'AVAXUP', 'AVAXDOWN']
    },
    'crypto_privacy': {
        'name': 'Cripto - Privacidade',
        'symbols': ['XMR', 'ZEC', 'DASH', 'BEAM', 'GRIN', 'FIRO', 'NAV', 'PIVX', 
                    'XVG', 'ZEN', 'SCRT', 'ROSE', 'KEEP', 'NYM', 'HORUS', 'MWC',
                    'AEON', 'BIP', 'BTE', 'CLOAK', 'DNET', 'DYN', 'ENC', 'GRC',
                    'HNC', 'KMD', 'LBC', 'LYNX', 'MUE', 'NIX', 'PART', 'RDD', 
                    'SUMO', 'TRTL', 'VTC', 'XHV', 'XMY', 'XSH', 'XUE', 'ZCL', 'ZEPH']
    },
    'crypto_prediction': {
        'name': 'Cripto - Mercados de Previsão',
        'symbols': ['POLY', 'REP', 'GNO', 'OLY', 'PRODE', 'THALES', 'AZURO', 'SX',
                    'AUGUR', 'GNOSIS', 'OLYMPUS', 'PRODE', 'THALES', 'AZURO', 'SX']
    },
    'crypto_insurance': {
        'name': 'Cripto - Seguros DeFi',
        'symbols': ['NEXO', 'CEL', 'DPI', 'NEXUS', 'OPYN', 'HEGIC', 'COVER', 
                    'INSURACE', 'BRIDGE', 'MUTUAL', 'NEXO', 'CEL']
    }
}

# Get existing symbols to avoid duplicates
existing = set((r['symbol'], r['sector_id']) for r in rows)
existing_symbols_crypto = set(r['symbol'] for r in rows if r['sector_id'].startswith('crypto_'))

new_rows = []
for sector_id, config in NEW_SECTORS.items():
    for sym in config['symbols']:
        if sym not in existing_symbols_crypto:
            new_rows.append({
                'sector_id': sector_id,
                'sector_name': config['name'],
                'exchange': 'CRYPTO',
                'symbol': sym,
                'description': f'{sym} Crypto',
                'type': 'CRYPTO',
                'full_symbol': f'CRYPTO\\{sym}'
            })
            existing_symbols_crypto.add(sym)

# Write back
all_rows = rows + new_rows
fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open(SYMBOLS_CSV, mode='w', encoding=ENCODING, newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(all_rows)

print(f'Added {len(new_rows)} new symbols')
for sector_id in NEW_SECTORS.keys():
    count = len([r for r in new_rows if r['sector_id'] == sector_id])
    print(f'  {sector_id}: {count} symbols')
