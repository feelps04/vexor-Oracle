const geckos = require('@geckos.io/client').default;

console.log('[Test] Creating Geckos client...');

const channel = geckos({
  port: 10208
});

channel.onConnect((err) => {
  if (err) {
    console.error('[Test] Connection error:', err);
    process.exit(1);
  }
  console.log('[Test] Connected successfully!');
});

channel.on('ticks', (data) => {
  console.log('[Test] Received ticks:', data.items?.length || 0, 'items');
});

channel.onDisconnect(() => {
  console.log('[Test] Disconnected');
});

setTimeout(() => {
  console.log('[Test] Timeout - no connection');
  process.exit(1);
}, 10000);

console.log('[Test] Waiting for connection...');
