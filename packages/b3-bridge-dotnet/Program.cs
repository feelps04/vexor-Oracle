using System.Buffers.Binary;
using System.Diagnostics;
using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;
using System.Text;
using Confluent.Kafka;

static class Env
{
  public static string Get(string key, string fallback) => string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))
    ? fallback
    : Environment.GetEnvironmentVariable(key)!.Trim();

  public static int GetInt(string key, int fallback)
  {
    var s = Environment.GetEnvironmentVariable(key);
    return int.TryParse(s, out var v) ? v : fallback;
  }

  public static bool GetBool(string key, bool fallback)
  {
    var s = Environment.GetEnvironmentVariable(key);
    if (string.IsNullOrWhiteSpace(s)) return fallback;
    s = s.Trim().ToLowerInvariant();
    return s is "1" or "true" or "yes" or "y" or "on";
  }
}

static class Program
{
  public static void Main(string[] args)
  {
    // Layout: 56 bytes per record.
    // symbol[12] (ansi, null-terminated), bid(double), ask(double), volume(int64), timestamp(int64 epoch ms), anomaly_flag(int32), heartbeat(int32), writing_flag(int32)
    // Note: The user provided heartbeat + writing_flag (4 bytes each). Total adds up to 56 bytes.
    const int RECORD_BYTES = 56;

    static string ReadSymbol(ReadOnlySpan<byte> sym12)
    {
      int len = sym12.IndexOf((byte)0);
      if (len < 0) len = sym12.Length;
      if (len == 0) return string.Empty;
      try
      {
        return Encoding.ASCII.GetString(sym12.Slice(0, len)).Trim().ToUpperInvariant();
      }
      catch
      {
        return string.Empty;
      }
    }

    static double ReadDoubleLE(ReadOnlySpan<byte> s)
    {
      long bits = BinaryPrimitives.ReadInt64LittleEndian(s);
      return BitConverter.Int64BitsToDouble(bits);
    }

    static long ReadInt64LE(ReadOnlySpan<byte> s) => BinaryPrimitives.ReadInt64LittleEndian(s);
    static int ReadInt32LE(ReadOnlySpan<byte> s) => BinaryPrimitives.ReadInt32LittleEndian(s);

    static int ParseArgsCount(string[] a)
    {
      for (var i = 0; i < a.Length; i++)
      {
        if (a[i] == "--count" && i + 1 < a.Length && int.TryParse(a[i + 1], out var n)) return n;
        if (a[i].StartsWith("--count=", StringComparison.OrdinalIgnoreCase) && int.TryParse(a[i].Substring("--count=".Length), out var m)) return m;
      }
      return 0;
    }

    static bool HasArg(string[] a, string name)
    {
      foreach (var x in a)
      {
        if (string.Equals(x, name, StringComparison.OrdinalIgnoreCase)) return true;
        if (x.StartsWith(name + "=", StringComparison.OrdinalIgnoreCase)) return true;
      }
      return false;
    }

    var probeMode = HasArg(args, "--probe");

    var mmfName = Env.Get("B3_SHARED_MEMORY_NAME", "B3_Shared_Memory");
    var pollMs = Env.GetInt("B3_BRIDGE_POLL_MS", 10);
    var recordCount = Env.GetInt("B3_SHARED_MEMORY_COUNT", 0);
    if (recordCount <= 0)
    {
      var fromArgs = ParseArgsCount(args);
      if (fromArgs > 0) recordCount = fromArgs;
    }

    if (recordCount <= 0)
    {
      Console.Error.WriteLine("Missing record count. Set B3_SHARED_MEMORY_COUNT or pass --count <n>.");
      Environment.Exit(2);
      return;
    }

    var brokers = Env.Get("KAFKA_BROKERS", "localhost:9092");
    var topicDepth = Env.Get("KAFKA_TOPIC_DEPTH_L2", "market.depth.l2");
    var topicTrades = Env.Get("KAFKA_TOPIC_TRADES", "market.trades");
    var enableTrades = Env.GetBool("B3_BRIDGE_ENABLE_TRADES", false);

    Console.WriteLine($"b3-bridge-dotnet starting: mmf={mmfName} count={recordCount} pollMs={pollMs} brokers={brokers} depthTopic={topicDepth} tradesTopic={topicTrades} enableTrades={enableTrades} probe={probeMode}");

    MemoryMappedFile mmf;
    try
    {
      mmf = MemoryMappedFile.OpenExisting(mmfName, MemoryMappedFileRights.Read);
    }
    catch (Exception ex)
    {
      Console.Error.WriteLine($"Failed to open MMF '{mmfName}': {ex.Message}");
      Environment.Exit(3);
      return;
    }

    var mapBytes = checked(recordCount * RECORD_BYTES);
    using var accessor = mmf.CreateViewAccessor(0, mapBytes, MemoryMappedFileAccess.Read);

    var producerConfig = new ProducerConfig
    {
      BootstrapServers = brokers,
      Acks = Acks.Leader,
      LingerMs = 0,
      BatchSize = 0,
      MessageSendMaxRetries = 3,
      SocketTimeoutMs = 5000,
    };

    using var producer = new ProducerBuilder<string, string>(producerConfig).Build();

    var lastHeartbeat = new int[recordCount];
    Array.Fill(lastHeartbeat, -1);
    var lastPublishTs = new long[recordCount];

    var sw = Stopwatch.StartNew();
    var buf = new byte[RECORD_BYTES];
    var nextLogAt = 0L;
    var logEveryMs = 5000;
    long publishedDepth = 0;
    long skippedWriting = 0;
    long skippedNoSymbol = 0;
    long skippedNoQuote = 0;

    while (true)
    {
      var loopStart = sw.ElapsedMilliseconds;

      for (int i = 0; i < recordCount; i++)
      {
        accessor.ReadArray(i * RECORD_BYTES, buf, 0, RECORD_BYTES);
        var span = (ReadOnlySpan<byte>)buf;

        var sym = ReadSymbol(span.Slice(0, 12));
        if (string.IsNullOrWhiteSpace(sym))
        {
          skippedNoSymbol++;
          continue;
        }

        var bid = ReadDoubleLE(span.Slice(12, 8));
        var ask = ReadDoubleLE(span.Slice(20, 8));
        var volume = ReadInt64LE(span.Slice(28, 8));
        var ts = ReadInt64LE(span.Slice(36, 8));
        var anomaly = ReadInt32LE(span.Slice(44, 4));
        var heartbeat = ReadInt32LE(span.Slice(48, 4));
        var writingFlag = ReadInt32LE(span.Slice(52, 4));

        if (writingFlag == 1)
        {
          skippedWriting++;
          continue;
        }

        if (heartbeat == lastHeartbeat[i])
        {
          continue;
        }

        lastHeartbeat[i] = heartbeat;

        if (!(double.IsFinite(bid) && bid > 0) && !(double.IsFinite(ask) && ask > 0))
        {
          skippedNoQuote++;
          continue;
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var outTs = ts > 0 ? ts : nowMs;

        var bidStr = bid.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var askStr = ask.ToString(System.Globalization.CultureInfo.InvariantCulture);
        string depthJson = $"{{\"symbol\":\"{sym}\",\"ts\":{outTs},\"bids\":[{{\"price\":{bidStr},\"size\":{volume}}}],\"asks\":[{{\"price\":{askStr},\"size\":{volume}}}]}}";

        try
        {
          producer.Produce(topicDepth, new Message<string, string> { Key = sym, Value = depthJson });
          publishedDepth++;
          lastPublishTs[i] = nowMs;
        }
        catch
        {
          // ignore
        }

        if (probeMode)
        {
          var age = nowMs - outTs;
          Console.WriteLine($"probe depth symbol={sym} bid={bid} ask={ask} vol={volume} ts={outTs} ageMs={age} hb={heartbeat} anomaly={anomaly}");
        }

        if (enableTrades)
        {
          // This shared memory struct does not contain real trade prints (price/qty/side/tradeId).
          // We keep the pipeline gated until EA provides a proper trades ring-buffer layout.
          // Intentionally no publishing here.
        }
      }

      var after = sw.ElapsedMilliseconds;
      if (after >= nextLogAt)
      {
        nextLogAt = after + logEveryMs;
        Console.WriteLine($"stats t={after}ms publishedDepth={publishedDepth} skippedWriting={skippedWriting} skippedNoSymbol={skippedNoSymbol} skippedNoQuote={skippedNoQuote}");
      }

      var loopMs = sw.ElapsedMilliseconds - loopStart;
      var sleep = pollMs - (int)loopMs;
      if (sleep > 0) Thread.Sleep(sleep);
    }
  }
}
