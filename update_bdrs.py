import csv

# Mapeamento de simbolos US para BDRs disponiveis no MT5
bdr_map = {
    'AAPL': 'AAPL34', 'ABBV': 'ABBV34', 'ABT': 'ABT34', 'ADBE': 'ADBE34',
    'AMAT': 'AMAT34', 'AMD': 'AMD34', 'AMZN': 'AMZO34', 'ASML': 'ASML34',
    'AVGO': 'AVGO34', 'BABA': 'BABA34', 'BAC': 'BAC34', 'BRK.B': 'BERK34',
    'COST': 'COST34', 'CRM': 'CRM34', 'CSCO': 'CSCO34', 'CVX': 'CVX34',
    'DHR': 'DHR34', 'DIS': 'DIS34', 'GOOGL': 'GOGL34', 'HD': 'HD34',
    'IBM': 'IBM34', 'INTC': 'INTC34', 'JNJ': 'JNJ34', 'JPM': 'JPM34',
    'KO': 'KO34', 'LLY': 'LLY34', 'LRCX': 'LRCX34', 'MA': 'MA34',
    'MCD': 'MCD34', 'MELI': 'MELI34', 'META': 'META34', 'MRK': 'MRK34',
    'MSFT': 'MSFT34', 'NEE': 'NEE34', 'NFLX': 'NFLX34', 'NKE': 'NKE34',
    'NVDA': 'NVDA34', 'PDD': 'PDD34', 'PEP': 'PEP34', 'PG': 'PG34',
    'QCOM': 'QCOM34', 'TMO': 'TMO34', 'TSLA': 'TSLA34', 'TSM': 'TSM34',
    'TXN': 'TXN34', 'UNH': 'UNH34', 'V': 'V34', 'WMT': 'WMT34', 'XOM': 'XOM34'
}

# Ler CSV
with open('sectors_symbols.csv', 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

# Atualizar setor_008
updated = 0
for row in rows:
    if row['sector_id'] == 'sector_008' and row['symbol'] in bdr_map:
        old_sym = row['symbol']
        new_sym = bdr_map[old_sym]
        row['symbol'] = new_sym
        row['full_symbol'] = f"BOVESPA\\{new_sym}"
        updated += 1
        print(f"  {old_sym} -> {new_sym}")

# Escrever CSV
fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open('sectors_symbols.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"\nAtualizados {updated} simbolos do setor_008 para BDRs")
