const http = require('http');

const data = JSON.stringify({ symbol: 'VALE3', priceBRL: 68.55, bid: 68.54, ask: 68.56 });

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/v1/market/ingest/tick',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
