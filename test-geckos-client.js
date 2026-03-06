const { geckos } = require('@geckos.io/client');

console.log('[Test] Creating Geckos client...');
const channel = geckos({ url: 'http://127.0.0.1', port: 10208 });

channel.onConnect((err) => {
  if (err) {
    console.error('[Test] Connection error:', err);
    process.exit(1);
  }
  console.log('[Test] Connected! Channel ID:', channel.id);
  
  channel.on('ticks', (data) => {
    console.log('[Test] Received ticks:', data?.items?.length || 0, 'items');
  });
  
  channel.on('init', (data) => {
    console.log('[Test] Received init:', data?.symbols?.length || 0, 'symbols');
  });
  
  // Subscribe to symbols
  channel.emit('set_symbols', { symbols: ['VALE3', 'PETR4', 'XLM', 'XRP'] });
  console.log('[Test] Sent set_symbols');
  
  // Exit after 5 seconds
  setTimeout(() => {
    console.log('[Test] Test complete, exiting...');
    channel.close();
    process.exit(0);
  }, 5000);
});

channel.onDisconnect(() => {
  console.log('[Test] Disconnected');
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('[Test] Connection timeout');
  process.exit(1);
}, 10000);
