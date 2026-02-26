using System.Buffers.Binary;
using System.Diagnostics;
using System.Globalization;
using System.IO.MemoryMappedFiles;
using System.Linq;
using System.Text;
using Confluent.Kafka;

// ──────────────────────────────────────────────────────────────────────
// StockPriceProducer — RAM → Kafka
//
// Reads the B3RAM shared memory written by Sentinel_RAM (MT5 EA v13.08)
// and publishes real-time ticks to Kafka.
//
// Struct layout v13.08 (56 bytes, no padding):
//   offset  0: double bid          (8 bytes)
//   offset  8: double ask          (8 bytes)
//   offset 16: long   volume       (8 bytes)
//   offset 24: long   timestamp    (8 bytes, epoch ms)
//   offset 32: int    anomaly_flag (4 bytes)
//   offset 36: int    heartbeat    (4 bytes)
//   offset 40: int    writing_flag (4 bytes)
//   offset 44: char   symbol[12]   (12 bytes, ASCII null-terminated)
// ──────────────────────────────────────────────────────────────────────

static class Env
{
    public static string Get(string key, string fallback) =>
        string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))
            ? fallback
            : Environment.GetEnvironmentVariable(key)!.Trim();

    public static int GetInt(string key, int fallback)
    {
        var s = Environment.GetEnvironmentVariable(key);
        return int.TryParse(s, out var v) ? v : fallback;
    }
}

static class Program
{
    static string JsonEscape(string s)
    {
        if (string.IsNullOrEmpty(s)) return string.Empty;
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    static void Main()
    {
        var probeMode = Environment.GetCommandLineArgs().Any(a => string.Equals(a, "--probe", StringComparison.OrdinalIgnoreCase));

        // ── Config ──────────────────────────────────────────────────
        var mmfName     = Env.Get("MT5_SHARED_MEMORY_NAME", "B3RAM");
        var recordBytes = Env.GetInt("MT5_RECORD_BYTES", 128);
        var recordCount = Env.GetInt("MT5_RECORD_COUNT", 100); // max slots
        var pollMs      = Env.GetInt("MT5_POLL_MS", 50);

        // Offsets (v13.08 layout)
        var bidOff    = Env.GetInt("MT5_BID_OFFSET_BYTES", 0);
        var askOff    = Env.GetInt("MT5_ASK_OFFSET_BYTES", 8);
        var volOff    = Env.GetInt("MT5_VOLUME_OFFSET_BYTES", 16);
        var tsOff     = Env.GetInt("MT5_TIME_OFFSET_BYTES", 24);
        var anomOff   = Env.GetInt("MT5_ANOMALY_OFFSET_BYTES", 32);
        var hbOff     = Env.GetInt("MT5_HEARTBEAT_OFFSET_BYTES", 36);
        var wfOff     = Env.GetInt("MT5_WRITING_FLAG_OFFSET_BYTES", 40);
        var symOff    = Env.GetInt("MT5_SYMBOL_OFFSET_BYTES", 44);
        var symBytes  = Env.GetInt("MT5_SYMBOL_BYTES", 16);
        var grpOff    = Env.GetInt("MT5_GROUP_OFFSET_BYTES", 60);
        var grpBytes  = Env.GetInt("MT5_GROUP_BYTES", 64);

        var brokers    = Env.Get("KAFKA_BOOTSTRAP_SERVERS", "localhost:29092");
        var topicTick  = Env.Get("KAFKA_TOPIC_TICKS", "stocks.ticker");
        var topicDepth = Env.Get("KAFKA_TOPIC_DEPTH_L2", "market.depth.l2");

        Console.WriteLine($"[StockPriceProducer] Starting...");
        Console.WriteLine($"  mmf={mmfName} records={recordCount} recordBytes={recordBytes} pollMs={pollMs}");
        Console.WriteLine($"  offsets: bid={bidOff} ask={askOff} vol={volOff} ts={tsOff} sym={symOff} grp={grpOff}");
        Console.WriteLine($"  kafka={brokers} tickTopic={topicTick} depthTopic={topicDepth}");
        if (probeMode) Console.WriteLine("  probe=true");

        // ── Open shared memory ──────────────────────────────────────
        MemoryMappedFile mmf;
        var retryMs = 1000;
        while (true)
        {
            try
            {
                mmf = MemoryMappedFile.OpenExisting(mmfName, MemoryMappedFileRights.Read);
                Console.WriteLine($"[StockPriceProducer] Shared memory '{mmfName}' opened OK");
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[StockPriceProducer] Waiting for MMF '{mmfName}': {ex.Message}");
                Thread.Sleep(retryMs);
                retryMs = Math.Min(30_000, retryMs * 2);
            }
        }

        var mapBytes = checked(recordCount * recordBytes);
        using var accessor = mmf.CreateViewAccessor(0, mapBytes, MemoryMappedFileAccess.Read);

        // ── Kafka producer ──────────────────────────────────────────
        var producerConfig = new ProducerConfig
        {
            BootstrapServers = brokers,
            Acks = Acks.Leader,
            LingerMs = 5,
            BatchSize = 16384,
            MessageSendMaxRetries = 5,
            RetryBackoffMs = 100,
        };

        using var producer = new ProducerBuilder<string, string>(producerConfig).Build();
        Console.WriteLine($"[StockPriceProducer] Kafka producer connected to {brokers}");

        // ── State tracking ──────────────────────────────────────────
        var lastHeartbeat = new int[recordCount];
        Array.Fill(lastHeartbeat, -1);

        var publishedSnapshot = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var sw = Stopwatch.StartNew();
        var buf = new byte[recordBytes];
        long publishedTicks = 0;
        long publishedDepth = 0;
        long skippedWriting = 0;
        long skippedEmpty = 0;
        long skippedInvalid = 0;
        long nextLogAt = 0;
        const int LOG_EVERY_MS = 5000;

        // ── Main loop ───────────────────────────────────────────────
        Console.WriteLine($"[StockPriceProducer] Polling started — {recordCount} slots every {pollMs}ms");

        while (true)
        {
            var loopStart = sw.ElapsedMilliseconds;

            for (int i = 0; i < recordCount; i++)
            {
                accessor.ReadArray(i * recordBytes, buf, 0, recordBytes);
                var span = (ReadOnlySpan<byte>)buf;

                // ── Read writing_flag: skip if EA is mid-write ──
                var writingFlag = BinaryPrimitives.ReadInt32LittleEndian(span.Slice(wfOff, 4));
                if (writingFlag == 1)
                {
                    skippedWriting++;
                    continue;
                }

                // ── Read symbol ─────────────────────────────────
                var symSpan = span.Slice(symOff, symBytes);
                int nul = symSpan.IndexOf((byte)0);
                if (nul < 0) nul = symBytes;
                if (nul == 0)
                {
                    skippedEmpty++;
                    continue;
                }

                string symbol;
                try
                {
                    symbol = Encoding.ASCII.GetString(symSpan.Slice(0, nul)).Trim().ToUpperInvariant();
                }
                catch
                {
                    skippedInvalid++;
                    continue;
                }

                // ── Read group/path (SYMBOL_PATH) ───────────────
                string group = string.Empty;
                try
                {
                    if (grpOff >= 0 && grpBytes > 0 && grpOff + grpBytes <= recordBytes)
                    {
                        var grpSpan = span.Slice(grpOff, grpBytes);
                        int gnul = grpSpan.IndexOf((byte)0);
                        if (gnul < 0) gnul = grpBytes;
                        if (gnul > 0)
                            group = Encoding.ASCII.GetString(grpSpan.Slice(0, gnul)).Trim();
                    }
                }
                catch
                {
                    // ignore group parsing
                }

                if (string.IsNullOrWhiteSpace(symbol) || symbol.Length < 2)
                {
                    skippedEmpty++;
                    continue;
                }

                // Validate symbol is printable ASCII
                bool validSym = true;
                foreach (char c in symbol)
                {
                    if (c < 32 || c > 126) { validSym = false; break; }
                }
                if (!validSym)
                {
                    skippedInvalid++;
                    continue;
                }

                // ── Read heartbeat: skip if unchanged (but still publish a one-time snapshot per symbol)
                var heartbeat = BinaryPrimitives.ReadInt32LittleEndian(span.Slice(hbOff, 4));
                var heartbeatChanged = heartbeat != lastHeartbeat[i];
                if (heartbeatChanged)
                    lastHeartbeat[i] = heartbeat;

                // ── Read prices ─────────────────────────────────
                long bidBits = BinaryPrimitives.ReadInt64LittleEndian(span.Slice(bidOff, 8));
                double bid = BitConverter.Int64BitsToDouble(bidBits);

                long askBits = BinaryPrimitives.ReadInt64LittleEndian(span.Slice(askOff, 8));
                double ask = BitConverter.Int64BitsToDouble(askBits);

                long volume = BinaryPrimitives.ReadInt64LittleEndian(span.Slice(volOff, 8));
                long timestamp = BinaryPrimitives.ReadInt64LittleEndian(span.Slice(tsOff, 8));

                // ── Validate: price must be > 0 ─────────────────
                bool hasBid = double.IsFinite(bid) && bid > 0;
                bool hasAsk = double.IsFinite(ask) && ask > 0;
                if (!hasBid && !hasAsk)
                {
                    skippedInvalid++;
                    continue;
                }

                // If the EA isn't producing new heartbeats (market closed), publish a one-time snapshot
                // for each symbol so downstream (Kafka/Redis/UI) can still show the last known real price.
                if (!heartbeatChanged && publishedSnapshot.Contains(symbol))
                    continue;

                var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var outTs = timestamp > 0 ? timestamp : nowMs;

                // Use bid as priceBRL (market price), fallback to ask
                double priceBRL = hasBid ? bid : ask;

                // ── Publish tick to stocks.ticker ────────────────
                var bidStr = bid.ToString("G", CultureInfo.InvariantCulture);
                var askStr = ask.ToString("G", CultureInfo.InvariantCulture);
                var priceStr = priceBRL.ToString("G", CultureInfo.InvariantCulture);

                var groupJson = JsonEscape(group);
                string tickJson = $$"""{"type":"tick","symbol":"{{symbol}}","group":"{{groupJson}}","priceBRL":{{priceStr}},"price":{{priceStr}},"bid":{{bidStr}},"ask":{{askStr}},"volume":{{volume}},"volumeDay":{{volume}},"ts":{{outTs}}}""";

                try
                {
                    producer.Produce(topicTick, new Message<string, string>
                    {
                        Key = symbol,
                        Value = tickJson
                    });
                    publishedTicks++;
                    publishedSnapshot.Add(symbol);
                }
                catch { /* retry next cycle */ }

                // ── Publish depth to market.depth.l2 ────────────
                string depthJson = $$"""{"symbol":"{{symbol}}","ts":{{outTs}},"volumeDay":{{volume}},"bids":[{"price":{{bidStr}},"size":0}],"asks":[{"price":{{askStr}},"size":0}]}""";

                try
                {
                    producer.Produce(topicDepth, new Message<string, string>
                    {
                        Key = symbol,
                        Value = depthJson
                    });
                    publishedDepth++;
                    publishedSnapshot.Add(symbol);
                }
                catch { /* retry next cycle */ }

                if (probeMode)
                {
                    var ageMs = nowMs - outTs;
                    Console.WriteLine($"probe symbol={symbol} group={group} bid={bidStr} ask={askStr} volumeDay={volume} ts={outTs} ageMs={ageMs} hb={heartbeat}");
                }
            }

            // ── Periodic stats log ──────────────────────────────
            var elapsed = sw.ElapsedMilliseconds;
            if (elapsed >= nextLogAt)
            {
                nextLogAt = elapsed + LOG_EVERY_MS;
                Console.WriteLine($"[StockPriceProducer] t={elapsed}ms ticks={publishedTicks} depth={publishedDepth} skipped(writing={skippedWriting} empty={skippedEmpty} invalid={skippedInvalid})");
            }

            // ── Sleep until next poll ───────────────────────────
            var loopMs = sw.ElapsedMilliseconds - loopStart;
            var sleep = pollMs - (int)loopMs;
            if (sleep > 0) Thread.Sleep(sleep);
        }
    }
}
