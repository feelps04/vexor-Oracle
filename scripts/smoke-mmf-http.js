const base = 'http://127.0.0.1:8000';

async function getText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const text = await r.text();
  return { status: r.status, text };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const start = Date.now();
  const timeoutMs = 30_000;

  while (Date.now() - start < timeoutMs) {
    const health = await getText(`${base}/health`);
    if (health.status !== 200) {
      console.log('health ->', health.status, health.text.slice(0, 200));
      await sleep(1000);
      continue;
    }

    const btc = await getText(`${base}/api/v1/stocks/BTC/quote`);
    const eth = await getText(`${base}/api/v1/stocks/ETH/quote`);
    const usdt = await getText(`${base}/api/v1/stocks/USDT/quote`);

    const ok = btc.status === 200 && eth.status === 200 && usdt.status === 200;
    if (ok) {
      console.log('OK', { btc: btc.text, eth: eth.text, usdt: usdt.text });
      return;
    }

    const syms = await getText(`${base}/symbols?limit=2000`);
    if (syms.status === 200) {
      try {
        const j = JSON.parse(syms.text);
        const list = Array.isArray(j.symbols) ? j.symbols : [];
        const hasCrypto = ['BTC', 'ETH', 'USDT'].every((s) => list.includes(s));
        console.log('quotes', { btc: btc.status, eth: eth.status, usdt: usdt.status, hasCrypto });
      } catch {
        console.log('quotes', { btc: btc.status, eth: eth.status, usdt: usdt.status });
      }
    } else {
      console.log('quotes', { btc: btc.status, eth: eth.status, usdt: usdt.status, symbols: syms.status });
    }

    await sleep(1000);
  }

  throw new Error('Timeout waiting for crypto quotes to be available via mmf-api-lite');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
