import csv

# Mapeamento de simbolos US para MT5 Genial (sufixo .US)
us_map = {
    'AAPL': 'AAPL.US', 'ABBV': 'ABBV.US', 'ABT': 'ABT.US', 'ADBE': 'ADBE.US',
    'AMAT': 'AMAT.US', 'AMD': 'AMD.US', 'AMZN': 'AMZN.US', 'ASML': 'ASML.US',
    'AVGO': 'AVGO.US', 'BABA': 'BABA.US', 'BAC': 'BAC.US', 'BRK.B': 'BRK.B.US',
    'COST': 'COST.US', 'CRM': 'CRM.US', 'CSCO': 'CSCO.US', 'CVX': 'CVX.US',
    'DHR': 'DHR.US', 'DIS': 'DIS.US', 'GOOGL': 'GOOGL.US', 'HD': 'HD.US',
    'IBM': 'IBM.US', 'INTC': 'INTC.US', 'JNJ': 'JNJ.US', 'JPM': 'JPM.US',
    'KO': 'KO.US', 'LLY': 'LLY.US', 'LRCX': 'LRCX.US', 'MA': 'MA.US',
    'MCD': 'MCD.US', 'MELI': 'MELI.US', 'META': 'META.US', 'MRK': 'MRK.US',
    'MSFT': 'MSFT.US', 'NEE': 'NEE.US', 'NFLX': 'NFLX.US', 'NKE': 'NKE.US',
    'NVDA': 'NVDA.US', 'PDD': 'PDD.US', 'PEP': 'PEP.US', 'PG': 'PG.US',
    'QCOM': 'QCOM.US', 'TMO': 'TMO.US', 'TSLA': 'TSLA.US', 'TSM': 'TSM.US',
    'TXN': 'TXN.US', 'UNH': 'UNH.US', 'V': 'V.US', 'WMT': 'WMT.US', 'XOM': 'XOM.US'
}

# Ler CSV
with open('sectors_symbols.csv', 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

# Atualizar setor_008 para usar .US
updated = 0
for row in rows:
    if row['sector_id'] == 'sector_008':
        old_sym = row['symbol']
        # Remove sufixo 34/33 se existir e adiciona .US
        base = old_sym.replace('34', '').replace('33', '').replace('35', '')
        if base in us_map:
            new_sym = us_map[base]
            row['symbol'] = new_sym
            row['full_symbol'] = f"BOVESPA\\{new_sym}"
            row['exchange'] = "NYSE"
            updated += 1

# Escrever CSV
fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open('sectors_symbols.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f'Atualizados {updated} simbolos do setor_008 para .US')
