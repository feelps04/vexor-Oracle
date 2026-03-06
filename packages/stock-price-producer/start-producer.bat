@echo off
set KAFKA_DISABLED=true
set MT5_WATCH_METHOD=mmf
set MMF_CONFIGS=[{"name":"Local\\B3RAM","source":"genial","recordBytes":128,"recordCount":8192},{"name":"Local\\GLOBALRAM_XP","source":"pepperstone","recordBytes":128,"recordCount":16384}]
set MARKET_INGEST_URL=http://127.0.0.1:3000/api/v1/market/ingest/ticks
set MARKET_INGEST_BATCH_MAX=250
set MARKET_INGEST_FLUSH_MS=50
node dist/main.js
