import urllib.request
import json

# Testar criptos adicionais mencionadas pelo usuário
crypto_symbols = [
    # Layer 1/2
    'APT', 'ARB', 'OP', 'MATIC', 'AVAX', 'FTM', 'NEAR', 'INJ', 'SEI', 'SUI',
    # BNB Chain
    'CAKE', 'BNB', 'XVS', 'BAND',
    # Solana
    'RAY', 'JUP', 'BONK', 'WIF',
    # RWA
    'ONDO', 'RIO', 'TRU',
    # Meme
    'PEPE', 'FLOKI', 'BONK', 'WIF', 'DOGE', 'SHIB',
    # AI
    'FET', 'RNDR', 'TAO', 'GRT', 'AGIX',
    # Metaverso
    'SAND', 'MANA', 'AXS', 'ENJ', 'ILV',
    # Gaming
    'GALA', 'IMX', 'YGG', 'PIXEL',
    # DeFi
    'AAVE', 'UNI', 'MKR', 'CRV', 'COMP', 'SUSHI', 'SNX', 'LDO',
    # Staking
    'LSD', 'RPL', 'FXS',
    # Fan Token
    'CHZ', 'PSG', 'BAR', 'JUV',
    # Infra
    'ATOM', 'HBAR', 'QNT', 'LINK',
    # Storage
    'FIL', 'AR', 'STORJ',
    # NFT
    'APE', 'PUNK', 'BLUR',
    # POW
    'LTC', 'BCH', 'KAS', 'DASH',
    # Polkadot
    'DOT', 'KSM', 'GLMR', 'ASTR',
    # Launchpad
    'LAUNCH', 'BGB', 'KCS',
    # Privacy
    'XMR', 'ZEC', 'DASH',
    # Exchange
    'BNB', 'KCS', 'BGB', 'CRO', 'FTT',
    # Stablecoins
    'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD',
    # Interop
    'RUNE', 'XIBC', 'SYN',
    # Yield
    'YFI', 'PICKLE',
    # Derivatives
    'DYDX', 'GMX', 'PERP',
    # Lending
    'COMP', 'AAVE', 'MKR',
    # Insurance
    'NEXUS',
    # Ethereum ecosystem
    'ETH', 'LDO', 'ENS', 'POW', 'STETH',
    # Bitcoin ecosystem
    'BTC', 'STX', 'ORDI', 'SATS',
    # Cosmos
    'ATOM', 'OSMO', 'JUNO', 'SCRT',
    # Avalanche
    'AVAX', 'JOE', 'BENQI',
    # Polygon
    'MATIC', 'AAVE', 'QUICK',
    # Arbitrum
    'ARB', 'GMX', 'JOE',
    # Optimism
    'OP', 'SNX', 'VELO',
    # Binance
    'BNB', 'CAKE', 'XVS',
    # Tron
    'TRX', 'BTT', 'JST',
    # Cardano
    'ADA', 'SUND', 'MELD',
    # Algorand
    'ALGO', 'TINY', 'OPUL',
    # NEAR
    'NEAR', 'AURORA', 'REF'
]

print("Testando criptos em tempo real...\n")
working = []
not_working = []

for sym in crypto_symbols:
    req = urllib.request.Request(
        'http://127.0.0.1:8765/tick',
        data=json.dumps({'symbol': sym}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        r = urllib.request.urlopen(req, timeout=5)
        d = json.loads(r.read())
        bid = d.get('bid', 0)
        error = d.get('error', None)
        if bid and bid > 0:
            working.append(sym)
        else:
            not_working.append(sym)
    except:
        not_working.append(sym)

print(f"✓ Funcionando ({len(working)}): {working[:20]}...")
print(f"✗ Não funciona ({len(not_working)}): {not_working[:20]}...")
