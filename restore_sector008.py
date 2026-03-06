import csv

# Todos os BDRs do setor_008 com suas descrições
bdrs = [
    ('AAPL34', 'Apple Inc'), ('ABBV34', 'AbbVie'), ('ABT34', 'Abbott Labs'),
    ('ADBE34', 'Adobe'), ('AMAT34', 'Applied Materials'), ('AMD34', 'Advanced Micro Devices'),
    ('AMZO34', 'Amazon Inc'), ('ASML34', 'ASML Holding'), ('AVGO34', 'Broadcom'),
    ('BABA34', 'Alibaba Group'), ('BAC34', 'Bank of America'), ('BERK34', 'Berkshire Hathaway'),
    ('COST34', 'Costco'), ('CRM34', 'Salesforce'), ('CSCO34', 'Cisco'),
    ('CVX34', 'Chevron'), ('DHR34', 'Danaher'), ('DIS34', 'Walt Disney'),
    ('GOGL34', 'Alphabet Inc'), ('HD34', 'Home Depot'), ('IBM34', 'IBM'),
    ('INTC34', 'Intel'), ('JNJ34', 'Johnson & Johnson'), ('JPM34', 'JPMorgan Chase'),
    ('KO34', 'Coca-Cola'), ('LLY34', 'Eli Lilly'), ('LRCX34', 'Lam Research'),
    ('MA34', 'Mastercard'), ('MCD34', "McDonald's"), ('MELI34', 'MercadoLibre'),
    ('META34', 'Meta Platforms'), ('MRK34', 'Merck'), ('MSFT34', 'Microsoft Corp'),
    ('NEE34', 'NextEra Energy'), ('NFLX34', 'Netflix'), ('NKE34', 'Nike'),
    ('NVDA34', 'Nvidia Corp'), ('PDD34', 'Pinduoduo'), ('PEP34', 'PepsiCo'),
    ('PG34', 'Procter & Gamble'), ('QCOM34', 'Qualcomm'), ('TMO34', 'Thermo Fisher'),
    ('TSLA34', 'Tesla Inc'), ('TSM34', 'Taiwan Semiconductor'), ('TXN34', 'Texas Instruments'),
    ('UNH34', 'UnitedHealth Group'), ('V34', 'Visa Inc'), ('WMT34', 'Walmart'),
    ('XOM34', 'ExxonMobil')
]

# Ler CSV atual
with open('sectors_symbols.csv', 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

# Remover setor_008 existente
rows = [r for r in rows if r['sector_id'] != 'sector_008']

# Adicionar todos os BDRs do setor_008
for symbol, description in bdrs:
    rows.append({
        'sector_id': 'sector_008',
        'sector_name': 'Ações - Mercado Global (NYSE/NASDAQ)',
        'exchange': 'BOVESPA',
        'symbol': symbol,
        'description': description,
        'type': 'BDR',
        'full_symbol': f'BOVESPA\\{symbol}'
    })

# Escrever CSV
fieldnames = ['sector_id', 'sector_name', 'exchange', 'symbol', 'description', 'type', 'full_symbol']
with open('sectors_symbols.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f'Restorados {len(bdrs)} BDRs do setor_008')
