(function () {
  const API_BASE = window.API_BASE || 'http://localhost:3000';

  var authEmailInput = document.getElementById('auth-email');
  var authPasswordInput = document.getElementById('auth-password');
  var btnAuthRegister = document.getElementById('btn-auth-register');
  var btnAuthLogin = document.getElementById('btn-auth-login');
  var btnAuthLogout = document.getElementById('btn-auth-logout');
  var authStatusEl = document.getElementById('auth-status');
  var authAccountIdEl = document.getElementById('auth-accountId');

  function setAuthStatus(status, accountId) {
    if (authStatusEl) authStatusEl.textContent = status;
    if (authAccountIdEl) authAccountIdEl.textContent = accountId || '—';
  }

  function getStoredAuth() {
    try {
      var raw = localStorage.getItem('auth');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function storeAuth(auth) {
    try {
      if (!auth) {
        localStorage.removeItem('auth');
        return;
      }
      localStorage.setItem('auth', JSON.stringify(auth));
    } catch {}
  }

  function applyAccountIdToInputs(accountId) {
    if (!accountId) return;
    var ids = ['accountId', 'btc-accountId', 'stock-accountId', 'balance-accountId', 'timemachine-account'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && 'value' in el) {
        el.value = accountId;
        try {
          el.dispatchEvent(new Event('change'));
        } catch {}
      }
    });
  }

  function authHeaders() {
    var auth = getStoredAuth();
    if (auth && auth.accessToken) {
      return { Authorization: 'Bearer ' + auth.accessToken };
    }
    return {};
  }

  function getActiveAccountId() {
    var auth = getStoredAuth();
    if (auth && auth.accountId) return auth.accountId;
    return null;
  }

  // Helper function to validate candle data before sending to Lightweight Charts
  function isValidCandle(c) {
    return c && 
      typeof c === 'object' &&
      Number.isFinite(c.time) && c.time > 0 &&
      Number.isFinite(c.open) && 
      Number.isFinite(c.high) && 
      Number.isFinite(c.low) && 
      Number.isFinite(c.close);
  }

  const form = document.getElementById('tx-form');
  const btcForm = document.getElementById('btc-form');
  const stockForm = document.getElementById('stock-form');
  const btnSubmit = document.getElementById('btn-submit');
  const btnBtcSubmit = document.getElementById('btn-btc-submit');
  const btnStockSubmit = document.getElementById('btn-stock-submit');
  const stepperPanel = document.getElementById('stepper-panel');
  const receiptPanel = document.getElementById('receipt-panel');
  const receiptBody = document.getElementById('receipt-body');
  const btnExport = document.getElementById('btn-export');
  const steps = {
    awesome: document.getElementById('step-awesome'),
    brasil: document.getElementById('step-brasil'),
    kafka: document.getElementById('step-kafka'),
    auth: document.getElementById('step-auth'),
  };

  function setStepLabel(id, label) {
    const el = steps[id];
    if (!el) return;
    const labelEl = el.querySelector('.step-label');
    if (labelEl) labelEl.textContent = label;
  }

  function setStepState(id, state, statusText) {
    const el = steps[id];
    if (!el) return;
    el.className = 'step ' + state;
    const status = el.querySelector('.step-status');
    if (status) status.textContent = statusText || '';
  }

  function resetStepper() {
    Object.keys(steps).forEach(function (key) {
      setStepState(key, 'pending', '');
    });
  }

  function resetStepperLabelsDefault() {
    setStepLabel('awesome', 'AwesomeAPI (câmbio)');
    setStepLabel('brasil', 'BrasilAPI (banco)');
    setStepLabel('kafka', 'Kafka Producer');
    setStepLabel('auth', 'Auth Engine');
  }

  function generateIdempotencyKey() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function doAuth(kind) {
    if (!authEmailInput || !authPasswordInput) return;
    var email = String(authEmailInput.value || '').trim();
    var password = String(authPasswordInput.value || '');
    if (!email || !password) {
      setAuthStatus('Preencha email e senha', null);
      return;
    }
    try {
      if (btnAuthRegister) btnAuthRegister.disabled = true;
      if (btnAuthLogin) btnAuthLogin.disabled = true;
      var res = await fetch(API_BASE + '/api/v1/auth/' + kind, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
        credentials: 'include',
      });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok || !data) {
        setAuthStatus((data && data.message) ? data.message : 'Erro no ' + (kind === 'register' ? 'cadastro' : 'login'), null);
        return;
      }
      storeAuth({ accessToken: data.accessToken, accountId: data.accountId, userId: data.userId, email: email });
      setAuthStatus('Logado', data.accountId);
      applyAccountIdToInputs(data.accountId);
      if (typeof refreshBalance === 'function') refreshBalance();
      if (typeof refreshTimeMachine === 'function') refreshTimeMachine(new Date().toISOString());
    } catch (e) {
      setAuthStatus('Erro de rede', null);
    } finally {
      if (btnAuthRegister) btnAuthRegister.disabled = false;
      if (btnAuthLogin) btnAuthLogin.disabled = false;
    }
  }

  function logout() {
    storeAuth(null);
    setAuthStatus('Deslogado', null);
  }

  if (btnAuthRegister) btnAuthRegister.addEventListener('click', function () { doAuth('register'); });
  if (btnAuthLogin) btnAuthLogin.addEventListener('click', function () { doAuth('login'); });
  if (btnAuthLogout) btnAuthLogout.addEventListener('click', function () { logout(); });

  (function initAuthUi() {
    var auth = getStoredAuth();
    if (auth && auth.accountId) {
      setAuthStatus('Logado', auth.accountId);
      applyAccountIdToInputs(auth.accountId);
    } else {
      setAuthStatus('Deslogado', null);
    }
  })();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const idempotencyKey = document.getElementById('idempotencyKey').value.trim() || generateIdempotencyKey();
    document.getElementById('idempotencyKey').value = idempotencyKey;

    const payload = {
      accountId: document.getElementById('accountId').value.trim(),
      amount: parseInt(document.getElementById('amount').value, 10),
      currency: document.getElementById('currency').value,
      merchantId: document.getElementById('merchantId').value.trim(),
      idempotencyKey: idempotencyKey,
    };

    const targetBankCode = document.getElementById('targetBankCode').value.trim();
    if (targetBankCode) payload.targetBankCode = targetBankCode;

    stepperPanel.setAttribute('aria-hidden', 'false');
    receiptPanel.setAttribute('aria-hidden', 'true');
    resetStepper();
    resetStepperLabelsDefault();
    btnSubmit.disabled = true;

    setStepState('awesome', 'active', 'Chamando AwesomeAPI...');
    if (payload.currency !== 'BRL') {
      await new Promise(function (r) { setTimeout(r, 400); });
      setStepState('awesome', 'done', 'Cotação obtida');
    } else {
      setStepState('awesome', 'done', 'BRL (sem conversão)');
    }

    setStepState('brasil', 'active', 'Chamando BrasilAPI...');
    if (payload.targetBankCode) {
      await new Promise(function (r) { setTimeout(r, 300); });
      setStepState('brasil', 'done', 'Banco validado');
    } else {
      setStepState('brasil', 'done', 'Opcional');
    }

    setStepState('kafka', 'active', 'Produzindo evento...');

    try {
      const res = await fetch(API_BASE + '/api/v1/transactions', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        setStepState('kafka', 'pending', 'Erro');
        setStepState('auth', 'pending', '');
        receiptBody.textContent = JSON.stringify({ error: data.message || res.statusText, status: res.status }, null, 2);
        receiptPanel.setAttribute('aria-hidden', 'false');
        btnSubmit.disabled = false;
        return;
      }

      setStepState('kafka', 'done', 'Evento de liquidação gerado');
      setStepState('auth', 'done', 'Enviado para Auth Engine (processamento assíncrono)');

      receiptBody.textContent = JSON.stringify(data, null, 2);
      receiptPanel.setAttribute('aria-hidden', 'false');
    } catch (err) {
      setStepState('kafka', 'pending', 'Erro de rede');
      setStepState('auth', 'pending', '');
      receiptBody.textContent = JSON.stringify({ error: err.message }, null, 2);
      receiptPanel.setAttribute('aria-hidden', 'false');
    }

    btnSubmit.disabled = false;
  });

  if (btcForm) {
    btcForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const idempotencyKey = document.getElementById('btc-idempotencyKey').value.trim() || generateIdempotencyKey();
      document.getElementById('btc-idempotencyKey').value = idempotencyKey;
      const payload = {
        accountId: document.getElementById('btc-accountId').value.trim(),
        amountBtc: parseFloat(document.getElementById('btc-amount').value, 10),
        idempotencyKey: idempotencyKey,
      };
      stepperPanel.setAttribute('aria-hidden', 'false');
      receiptPanel.setAttribute('aria-hidden', 'true');
      resetStepper();
      setStepLabel('awesome', 'Mercado Bitcoin (câmbio)');
      setStepLabel('brasil', 'Opcional');
      setStepLabel('kafka', 'Kafka Producer');
      setStepLabel('auth', 'Auth Engine');
      btnBtcSubmit.disabled = true;

      setStepState('awesome', 'active', 'Chamando Mercado Bitcoin...');
      await new Promise(function (r) { setTimeout(r, 500); });
      setStepState('awesome', 'done', 'Cotação obtida');
      setStepState('brasil', 'done', 'N/A');
      setStepState('kafka', 'active', 'Produzindo evento...');

      try {
        const res = await fetch(API_BASE + '/api/v1/btc/buy', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          setStepState('kafka', 'pending', 'Erro');
          setStepState('auth', 'pending', '');
          receiptBody.textContent = JSON.stringify({ error: data.message || res.statusText, status: res.status }, null, 2);
          receiptPanel.setAttribute('aria-hidden', 'false');
          btnBtcSubmit.disabled = false;
          return;
        }
        if (data.btcRate != null) {
          setStepState('awesome', 'done', 'Cotação obtida: R$ ' + Number(data.btcRate).toLocaleString('pt-BR'));
        }
        setStepState('kafka', 'done', 'Evento de liquidação gerado');
        setStepState('auth', 'done', 'Enviado para Auth Engine (processamento assíncrono)');
        receiptBody.textContent = JSON.stringify(data, null, 2);
        receiptPanel.setAttribute('aria-hidden', 'false');
      } catch (err) {
        setStepState('kafka', 'pending', 'Erro de rede');
        setStepState('auth', 'pending', '');
        receiptBody.textContent = JSON.stringify({ error: err.message }, null, 2);
        receiptPanel.setAttribute('aria-hidden', 'false');
      }
      btnBtcSubmit.disabled = false;
    });
  }

  if (stockForm) {
    stockForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const idempotencyKey = document.getElementById('stock-idempotencyKey').value.trim() || generateIdempotencyKey();
      document.getElementById('stock-idempotencyKey').value = idempotencyKey;
      const payload = {
        accountId: document.getElementById('stock-accountId').value.trim(),
        symbol: document.getElementById('stock-symbol').value.trim().toUpperCase(),
        quantity: parseInt(document.getElementById('stock-quantity').value, 10),
        idempotencyKey: idempotencyKey,
      };
      stepperPanel.setAttribute('aria-hidden', 'false');
      receiptPanel.setAttribute('aria-hidden', 'true');
      resetStepper();
      setStepLabel('awesome', 'Brapi (cotação)');
      setStepLabel('brasil', 'Opcional');
      setStepLabel('kafka', 'Kafka Producer');
      setStepLabel('auth', 'Auth Engine');
      btnStockSubmit.disabled = true;

      setStepState('awesome', 'active', 'Chamando Brapi...');
      await new Promise(function (r) { setTimeout(r, 400); });
      setStepState('awesome', 'done', 'Cotação obtida');
      setStepState('brasil', 'done', 'N/A');
      setStepState('kafka', 'active', 'Produzindo evento...');

      try {
        const res = await fetch(API_BASE + '/api/v1/orders/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          setStepState('kafka', 'pending', 'Erro');
          setStepState('auth', 'pending', '');
          receiptBody.textContent = JSON.stringify({ error: data.message || res.statusText, status: res.status }, null, 2);
          receiptPanel.setAttribute('aria-hidden', 'false');
          btnStockSubmit.disabled = false;
          return;
        }
        if (data.stockPrice != null) {
          setStepState('awesome', 'done', 'Cotação obtida: R$ ' + Number(data.stockPrice).toLocaleString('pt-BR'));
        }
        setStepState('kafka', 'done', 'Evento de liquidação gerado');
        setStepState('auth', 'done', 'Enviado para Auth Engine (processamento assíncrono)');
        receiptBody.textContent = JSON.stringify(data, null, 2);
        receiptPanel.setAttribute('aria-hidden', 'false');
      } catch (err) {
        setStepState('kafka', 'pending', 'Erro de rede');
        setStepState('auth', 'pending', '');
        receiptBody.textContent = JSON.stringify({ error: err.message }, null, 2);
        receiptPanel.setAttribute('aria-hidden', 'false');
      }
      btnStockSubmit.disabled = false;
    });
  }

  btnExport.addEventListener('click', function () {
    const text = receiptBody.textContent;
    if (!text) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'comprovante-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  function setupStocksChart() {
    var symbolSelect = document.getElementById('stocks-symbol');
    var rangeSelect = document.getElementById('stocks-range');
    var intervalSelect = document.getElementById('stocks-interval');
    var btnRefresh = document.getElementById('btn-stocks-refresh');
    var container = document.getElementById('stocks-chart');
    if (!symbolSelect || !rangeSelect || !intervalSelect || !btnRefresh || !container) return;
    if (typeof LightweightCharts === 'undefined') return;

    var chart = LightweightCharts.createChart(container, {
      layout: { background: { color: 'transparent' }, textColor: '#D9D9D9' },
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.4)' }, horzLines: { color: 'rgba(42, 46, 57, 0.4)' } },
      timeScale: { timeVisible: true, secondsVisible: true },
      rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.4)' },
    });
    var series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    function resize() {
      try {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 320 });
      } catch (e) {}
    }
    window.addEventListener('resize', resize);
    resize();

    async function loadSymbols() {
      const res = await fetch(API_BASE + '/api/v1/stocks');
      const data = await res.json();
      const symbols = (data && data.symbols) ? data.symbols : [];
      symbolSelect.innerHTML = '';
      symbols.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        symbolSelect.appendChild(opt);
      });
      if (symbols.length) symbolSelect.value = symbols[0];
    }

    async function loadHistory() {
      var symbol = symbolSelect.value;
      var range = rangeSelect.value;
      var interval = intervalSelect.value;
      btnRefresh.disabled = true;
      btnRefresh.textContent = 'Carregando...';
      try {
        const url = API_BASE + '/api/v1/stocks/' + encodeURIComponent(symbol) + '/history?range=' + encodeURIComponent(range) + '&interval=' + encodeURIComponent(interval);
        const res = await fetch(url);
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          candles = [];
          lastCandle = null;
          series.setData([]);
          btnRefresh.textContent = 'Erro';
          return;
        }
        const candlesData = (data && Array.isArray(data.candles)) ? data.candles : [];
        candles = candlesData.map(function (c) {
          return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
        }).filter(isValidCandle);
        lastCandle = candles.length ? candles[candles.length - 1] : null;
        series.setData(candles);
        chart.timeScale().fitContent();
      } finally {
        btnRefresh.disabled = false;
        btnRefresh.textContent = 'Atualizar gráfico';
      }
    }

    var liveWs = null;
    var candles = [];
    var lastCandle = null;
    var liveSymbol = null;

    function maxCandlesForRange() {
      var range = rangeSelect.value;
      var interval = intervalSelect.value;
      var sec = intervalSeconds(interval);
      var totalSec = range === '1d' ? 86400 : range === '5d' ? 5 * 86400 : range === '7d' ? 7 * 86400 : range === '1mo' ? 30 * 86400 : 86400;
      return Math.max(30, Math.min(1500, Math.floor(totalSec / sec) + 5));
    }

    function pushCandle(c) {
      if (!isValidCandle(c)) return;
      candles.push(c);
      var max = maxCandlesForRange();
      if (candles.length > max) candles = candles.slice(candles.length - max);
      series.setData(candles);
      chart.timeScale().fitContent();
    }
    function intervalSeconds(interval) {
      if (interval === '1m') return 60;
      if (interval === '5m') return 5 * 60;
      if (interval === '15m') return 15 * 60;
      if (interval === '30m') return 30 * 60;
      if (interval === '1h' || interval === '60m') return 60 * 60;
      if (interval === '1d') return 86400;
      if (interval === '1wk') return 7 * 86400;
      if (interval === '1mo') return 30 * 86400;
      return 60;
    }

    function candleTimeForInterval(tsSec, interval) {
      var sec = intervalSeconds(interval);
      return tsSec - (tsSec % sec);
    }

    function connectLive() {
      try {
        if (liveWs) {
          try { liveWs.close(); } catch (e) {}
        }
        var symbol = symbolSelect.value;
        liveSymbol = symbol;
        var wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/stocks?symbol=' + encodeURIComponent(symbol);
        liveWs = new WebSocket(wsUrl);
        liveWs.onmessage = function (ev) {
          var msg;
          try { msg = JSON.parse(ev.data); } catch { return; }
          if (!msg || msg.type !== 'tick') return;
          var price = Number(msg.priceBRL);
          if (!Number.isFinite(price) || price <= 0) return;

          var interval = intervalSelect.value;
          var tsSec = Math.floor((Number(msg.ts) || Date.now()) / 1000);
          var t = candleTimeForInterval(tsSec, interval);
          if (!lastCandle || lastCandle.time !== t) {
            var open = lastCandle ? lastCandle.close : price;
            lastCandle = { time: t, open: open, high: price, low: price, close: price };
            pushCandle(lastCandle);
          } else {
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
            lastCandle.close = price;
            if (isValidCandle(lastCandle)) {
              series.update(lastCandle);
            }
          }
        };
        liveWs.onclose = function () {
          if (symbolSelect.value !== liveSymbol) return;
          setTimeout(connectLive, 1500);
        };
        liveWs.onerror = function () {
          try { liveWs.close(); } catch (e) {}
        };
      } catch (e) {
        if (symbolSelect.value !== liveSymbol) return;
        setTimeout(connectLive, 1500);
      }
    }

    btnRefresh.addEventListener('click', function () {
      candles = [];
      lastCandle = null;
      return loadHistory().then(connectLive);
    });
    symbolSelect.addEventListener('change', function () {
      candles = [];
      lastCandle = null;
      return loadHistory().then(connectLive);
    });
    rangeSelect.addEventListener('change', function () {
      candles = [];
      lastCandle = null;
      return loadHistory().then(connectLive);
    });
    intervalSelect.addEventListener('change', function () {
      candles = [];
      lastCandle = null;
      return loadHistory().then(connectLive);
    });

    loadSymbols().then(function () { return loadHistory(); }).then(connectLive).catch(function () {});
  }

  setupStocksChart();

  function setupFxChart() {
    var chartEl = document.getElementById('fx-chart');
    var rangeEl = document.getElementById('fx-range');
    var intervalEl = document.getElementById('fx-interval');
    var btnRefresh = document.getElementById('btn-fx-refresh');
    var currencyEl = document.getElementById('currency');
    var pairEl = document.getElementById('fx-pair');
    if (!chartEl || !rangeEl || !intervalEl || !btnRefresh || !currencyEl) return;
    if (typeof LightweightCharts === 'undefined') return;

    var chart = LightweightCharts.createChart(chartEl, {
      layout: { background: { color: 'transparent' }, textColor: '#D9D9D9' },
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.4)' }, horzLines: { color: 'rgba(42, 46, 57, 0.4)' } },
      timeScale: { timeVisible: true, secondsVisible: true },
      rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.4)' },
    });
    var series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    function resize() {
      try {
        chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight || 260 });
      } catch (e) {}
    }
    window.addEventListener('resize', resize);
    resize();

    var ws = null;
    var candles = [];
    var lastCandle = null;
    var currentCurrency = null;

    function maxCandlesForRange() {
      var range = rangeEl.value;
      var interval = intervalEl.value;
      var sec = intervalSeconds(interval);
      var totalSec = range === '1h' ? 3600 : range === '6h' ? 6 * 3600 : range === '1d' ? 86400 : range === '5d' ? 5 * 86400 : range === '7d' ? 7 * 86400 : range === '1mo' ? 30 * 86400 : 86400;
      return Math.max(30, Math.min(1500, Math.floor(totalSec / sec) + 5));
    }

    function pushCandle(c) {
      if (!isValidCandle(c)) return;
      candles.push(c);
      var max = maxCandlesForRange();
      if (candles.length > max) candles = candles.slice(candles.length - max);
      series.setData(candles);
      chart.timeScale().fitContent();
    }

    function intervalSeconds(interval) {
      if (interval === '1m') return 60;
      if (interval === '5m') return 5 * 60;
      if (interval === '15m') return 15 * 60;
      if (interval === '1h') return 60 * 60;
      return 86400;
    }

    function bucketSec(tsSec) {
      var sec = intervalSeconds(intervalEl.value);
      return tsSec - (tsSec % sec);
    }

    function getCurrency() {
      var c = String(currencyEl.value || 'BRL').toUpperCase();
      if (c === 'USD' || c === 'EUR') return c;
      // When the transaction currency is BRL, still show FX chart with a real pair (USD/BRL)
      return 'USD';
    }

    function reset() {
      candles = [];
      lastCandle = null;
      series.setData([]);
      chart.timeScale().fitContent();
    }

    function closeWs() {
      if (!ws) return;
      try { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); } catch (e) {}
      ws = null;
    }

    async function loadHistory() {
      var c = getCurrency();
      if (pairEl) pairEl.textContent = c + '/BRL';
      currentCurrency = c;
      var range = rangeEl.value;
      var interval = intervalEl.value;
      try {
        var url = API_BASE + '/api/v1/fx/history?currency=' + encodeURIComponent(c) + '&range=' + encodeURIComponent(range) + '&interval=' + encodeURIComponent(interval);
        var res = await fetch(url);
        var json = await res.json().catch(function () { return null; });
        if (!res.ok || !json || !Array.isArray(json.data)) {
          if (pairEl) pairEl.textContent = (c + '/BRL') + ' (configure TWELVE_DATA_API_KEY)';
          reset();
          return;
        }
        series.setData(json.data);
        candles = json.data;
        lastCandle = json.data.length ? json.data[json.data.length - 1] : null;
        chart.timeScale().fitContent();
      } catch (e) {
        if (pairEl) pairEl.textContent = (c + '/BRL') + ' (erro ao carregar)';
        reset();
      }
    }

    function connectLive() {
      var c = getCurrency();
      if (pairEl) pairEl.textContent = c + '/BRL';
      currentCurrency = c;
      closeWs();
      var wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/fx?currency=' + encodeURIComponent(c);
      ws = new WebSocket(wsUrl);
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!msg || msg.type !== 'tick') return;
        if (String(msg.currency || '').toUpperCase() !== currentCurrency) return;
        var rate = Number(msg.rate);
        if (!Number.isFinite(rate) || rate <= 0) return;
        var tsSec = Math.floor((Number(msg.ts) || Date.now()) / 1000);
        var t = bucketSec(tsSec);
        if (!lastCandle || lastCandle.time !== t) {
          var open = lastCandle ? lastCandle.close : rate;
          lastCandle = { time: t, open: open, high: rate, low: rate, close: rate };
          pushCandle(lastCandle);
        } else {
          lastCandle.high = Math.max(lastCandle.high, rate);
          lastCandle.low = Math.min(lastCandle.low, rate);
          lastCandle.close = rate;
          if (isValidCandle(lastCandle)) {
            series.update(lastCandle);
          }
        }
      };
      ws.onclose = function () {
        setTimeout(function () {
          if (getCurrency() === currentCurrency) connectLive();
        }, 1500);
      };
      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    }

    btnRefresh.addEventListener('click', function () {
      candles = [];
      reset();
      loadHistory().then(connectLive);
    });
    rangeEl.addEventListener('change', function () {
      candles = [];
      reset();
      loadHistory().then(connectLive);
    });
    intervalEl.addEventListener('change', function () {
      candles = [];
      reset();
      loadHistory().then(connectLive);
    });
    currencyEl.addEventListener('change', function () {
      candles = [];
      reset();
      loadHistory().then(connectLive);
    });

    loadHistory().then(connectLive);
  }

  setupFxChart();

  function setupBtcChartAndQuote() {
    var chartEl = document.getElementById('btc-chart');
    var quoteEl = document.getElementById('btc-quote');
    var totalEl = document.getElementById('btc-total');
    var amountEl = document.getElementById('btc-amount');
    var rangeEl = document.getElementById('btc-range');
    var intervalEl = document.getElementById('btc-interval');
    var btnRefresh = document.getElementById('btn-btc-refresh');
    if (!chartEl || !quoteEl || !totalEl || !amountEl) return;
    if (typeof LightweightCharts === 'undefined') return;

    var chart = LightweightCharts.createChart(chartEl, {
      layout: { background: { color: 'transparent' }, textColor: '#D9D9D9' },
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.4)' }, horzLines: { color: 'rgba(42, 46, 57, 0.4)' } },
      timeScale: { timeVisible: true, secondsVisible: true },
      rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.4)' },
    });
    var series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    function resize() {
      try {
        chart.applyOptions({ width: chartEl.clientWidth, height: chartEl.clientHeight || 320 });
      } catch (e) {}
    }
    window.addEventListener('resize', resize);
    resize();

    var ws = null;
    var candles = [];
    var lastCandle = null;
    var lastPrice = null;
    function updateTotals() {
      var qty = Number(String(amountEl.value).replace(',', '.'));
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(lastPrice)) {
        totalEl.textContent = '—';
        return;
      }
      var total = qty * lastPrice;
      totalEl.textContent = 'R$ ' + total.toFixed(2);
    }

    amountEl.addEventListener('input', updateTotals);

    function intervalSeconds(interval) {
      if (interval === '1m') return 60;
      if (interval === '5m') return 5 * 60;
      if (interval === '15m') return 15 * 60;
      return 60;
    }

    function bucketSec(tsSec) {
      var interval = intervalEl ? intervalEl.value : '1m';
      var sec = intervalSeconds(interval);
      return tsSec - (tsSec % sec);
    }

    function maxCandlesForRange() {
      var range = rangeEl ? rangeEl.value : '1h';
      var interval = intervalEl ? intervalEl.value : '1m';
      var sec = intervalSeconds(interval);
      var totalSec = range === '6h' ? 6 * 3600 : range === '1d' ? 24 * 3600 : 3600;
      return Math.max(30, Math.min(1500, Math.floor(totalSec / sec) + 5));
    }

    function pushCandle(c) {
      if (!isValidCandle(c)) return;
      candles.push(c);
      var max = maxCandlesForRange();
      if (candles.length > max) candles = candles.slice(candles.length - max);
      series.setData(candles);
      chart.timeScale().fitContent();
    }

    async function loadHistory() {
      var range = rangeEl ? rangeEl.value : '1h';
      var interval = intervalEl ? intervalEl.value : '1m';
      try {
        var url = API_BASE + '/api/v1/btc/history?range=' + encodeURIComponent(range) + '&interval=' + encodeURIComponent(interval);
        var res = await fetch(url);
        var json = await res.json().catch(function () { return null; });
        if (!res.ok || !json || !Array.isArray(json.data)) {
          candles = [];
          lastCandle = null;
          series.setData([]);
          chart.timeScale().fitContent();
          return;
        }
        candles = json.data;
        lastCandle = candles.length ? candles[candles.length - 1] : null;
        series.setData(candles);
        chart.timeScale().fitContent();
      } catch (e) {
        // ignore
      }
    }

    function connect() {
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
      var wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/btc';
      ws = new WebSocket(wsUrl);
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!msg || msg.type !== 'tick') return;
        var price = Number(msg.priceBRL);
        if (!Number.isFinite(price) || price <= 0) return;
        lastPrice = price;
        quoteEl.textContent = 'R$ ' + price.toFixed(2);
        updateTotals();

        var tsSec = Math.floor((Number(msg.ts) || Date.now()) / 1000);
        var t = bucketSec(tsSec);
        if (!lastCandle || lastCandle.time !== t) {
          var open = lastCandle ? lastCandle.close : price;
          lastCandle = { time: t, open: open, high: price, low: price, close: price };
          pushCandle(lastCandle);
        } else {
          lastCandle.high = Math.max(lastCandle.high, price);
          lastCandle.low = Math.min(lastCandle.low, price);
          lastCandle.close = price;
          if (isValidCandle(lastCandle)) {
            series.update(lastCandle);
          }
        }
      };
      ws.onclose = function () {
        setTimeout(connect, 1500);
      };
      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    }

    connect();

    function resetChart() {
      candles = [];
      lastCandle = null;
      series.setData([]);
      chart.timeScale().fitContent();
      loadHistory();
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', function () {
        resetChart();
      });
    }
    if (rangeEl) rangeEl.addEventListener('change', resetChart);
    if (intervalEl) intervalEl.addEventListener('change', resetChart);

    loadHistory();
  }

  setupBtcChartAndQuote();

  document.getElementById('api-base').textContent = API_BASE;

  function refreshHealth() {
    var icon = document.getElementById('health-icon');
    var text = document.getElementById('health-text');
    if (!icon || !text) return;
    fetch(API_BASE + '/health')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status === 'degraded') {
          icon.textContent = '\u2699\uFE0F';
          icon.className = 'health-icon health-icon--degraded';
          text.textContent = data.message || 'Degradado';
        } else {
          icon.textContent = '\u2705';
          icon.className = 'health-icon health-icon--ok';
          text.textContent = 'OK' + (data.redisLatencyMs != null ? ' (' + data.redisLatencyMs + 'ms)' : '');
        }
      })
      .catch(function () {
        icon.textContent = '\u2699\uFE0F';
        icon.className = 'health-icon health-icon--degraded';
        text.textContent = 'Indisponível';
      });
  }
  setInterval(refreshHealth, 5000);
  refreshHealth();

  var timeMachineChart = null;
  var timeMachineSeries = null;
  function ensureTimeMachineChart() {
    var container = document.getElementById('timemachine-chart');
    if (!container) return;
    if (typeof LightweightCharts === 'undefined') return;
    if (timeMachineChart && timeMachineSeries) return;
    timeMachineChart = LightweightCharts.createChart(container, {
      layout: { background: { color: 'transparent' }, textColor: '#D9D9D9' },
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.4)' }, horzLines: { color: 'rgba(42, 46, 57, 0.4)' } },
      timeScale: { timeVisible: true, secondsVisible: true },
      rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.4)' },
    });
    timeMachineSeries = timeMachineChart.addLineSeries({
      color: '#60a5fa',
      lineWidth: 2,
    });
    function resize() {
      try {
        timeMachineChart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 260 });
      } catch (e) {}
    }
    window.addEventListener('resize', resize);
    resize();
  }

  async function refreshTimeMachineSeries() {
    var accountId = (document.getElementById('timemachine-account') && document.getElementById('timemachine-account').value) || 'acc-1';
    ensureTimeMachineChart();
    if (!timeMachineSeries) return;
    fetch(API_BASE + '/api/v1/accounts/' + encodeURIComponent(accountId) + '/balance-series', {
      headers: authHeaders(),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var pts = data && Array.isArray(data.points) ? data.points : [];
        var seriesData = pts
          .filter(function (p) { return p && typeof p.time === 'number' && typeof p.balanceBrl === 'number'; })
          .map(function (p) { return { time: p.time, value: p.balanceBrl / 100 }; });
        timeMachineSeries.setData(seriesData);
        if (timeMachineChart) timeMachineChart.timeScale().fitContent();
      })
      .catch(function () {});
  }

  function refreshTimeMachine(atOverrideIso) {
    var accountInput = document.getElementById('timemachine-account');
    var atInput = document.getElementById('timemachine-slider');
    var accountId = accountInput && accountInput.value ? accountInput.value.trim() : 'acc-1';
    var at = atOverrideIso || (atInput && atInput.value ? new Date(atInput.value).toISOString() : new Date().toISOString());
    var balanceEl = document.getElementById('timemachine-balance');
    if (!balanceEl) return;
    fetch(API_BASE + '/api/v1/accounts/' + encodeURIComponent(accountId) + '/balance-at?at=' + encodeURIComponent(at), {
      headers: authHeaders(),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        balanceEl.textContent = 'R$ ' + (data.balanceBrl != null ? (data.balanceBrl / 100).toFixed(2) : '—').replace('.', ',');
        refreshTimeMachineSeries();
      })
      .catch(function () {
        balanceEl.textContent = '—';
      });
  }
  var btnTimeMachine = document.getElementById('btn-timemachine-refresh');
  if (btnTimeMachine) btnTimeMachine.addEventListener('click', refreshTimeMachine);
  var sliderTime = document.getElementById('timemachine-slider');
  if (sliderTime) sliderTime.addEventListener('change', refreshTimeMachine);
  refreshTimeMachine();

  function refreshIntegrity() {
    const tbody = document.getElementById('integrity-tbody');
    const shield = document.getElementById('integrity-shield');
    const statusEl = document.getElementById('integrity-status');
    if (!tbody || !shield || !statusEl) return;
    var active = getActiveAccountId();
    var accounts = active ? [active, 'acc-2', 'acc-3'] : ['acc-1', 'acc-2', 'acc-3'];
    // de-dup
    var uniq = [];
    for (var i = 0; i < accounts.length; i++) {
      if (uniq.indexOf(accounts[i]) === -1) uniq.push(accounts[i]);
    }
    fetch(API_BASE + '/api/v1/integrity?accounts=' + encodeURIComponent(uniq.join(',')), {
      headers: authHeaders(),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.match === undefined) return;
        shield.className = 'integrity-shield match-' + data.match;
        statusEl.textContent = data.match ? 'Integridade OK' : 'Divergência';
        tbody.innerHTML = '';
        const accounts = Object.keys(data.redis || {});
        accounts.forEach(function (acc) {
          const tr = document.createElement('tr');
          const redisVal = data.redis[acc] != null ? data.redis[acc] : '—';
          const sqlVal = data.sql[acc] != null ? data.sql[acc] : '—';
          const match = data.redis[acc] === data.sql[acc];
          tr.innerHTML = '<td>' + acc + '</td><td>' + redisVal + '</td><td>' + sqlVal + '</td><td>' + (match ? 'Sim' : 'Não') + '</td>';
          tbody.appendChild(tr);
        });
      })
      .catch(function () {
        statusEl.textContent = 'Indisponível';
        shield.className = 'integrity-shield';
      });
  }
  const btnIntegrity = document.getElementById('btn-integrity-refresh');
  if (btnIntegrity) btnIntegrity.addEventListener('click', refreshIntegrity);
  refreshIntegrity();

  function connectRealtime() {
    try {
      var wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws?accounts=acc-1,acc-2,acc-3&accountId=' + encodeURIComponent((document.getElementById('timemachine-account') && document.getElementById('timemachine-account').value) || 'acc-1') + '&intervalMs=2000';
      var ws = new WebSocket(wsUrl);

      ws.onmessage = function (ev) {
        var msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!msg || msg.type !== 'snapshot') return;

        var balanceEl = document.getElementById('timemachine-balance');
        void balanceEl;

        var tbody = document.getElementById('integrity-tbody');
        var shield = document.getElementById('integrity-shield');
        var statusEl = document.getElementById('integrity-status');
        if (tbody && shield && statusEl && msg.integrity) {
          shield.className = 'integrity-shield match-' + (msg.integrity.match ? 'true' : 'false');
          statusEl.textContent = msg.integrity.match ? 'Integridade OK' : 'Divergência';
          tbody.innerHTML = '';
          var accounts = Object.keys(msg.integrity.redis || {});
          accounts.forEach(function (acc) {
            var tr = document.createElement('tr');
            var redisVal = msg.integrity.redis[acc] != null ? msg.integrity.redis[acc] : '—';
            var sqlVal = msg.integrity.sql && msg.integrity.sql[acc] != null ? msg.integrity.sql[acc] : '—';
            var match = redisVal === sqlVal;
            tr.innerHTML = '<td>' + acc + '</td><td>' + redisVal + '</td><td>' + sqlVal + '</td><td>' + (match ? 'Sim' : 'Não') + '</td>';
            tbody.appendChild(tr);
          });
        }
      };

      ws.onclose = function () {
        setTimeout(connectRealtime, 2000);
      };
      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    } catch (e) {
      setTimeout(connectRealtime, 2000);
    }
  }

  connectRealtime();

  var posDisplay = document.getElementById('pos-display');
  var posStatus = document.getElementById('pos-status');
  var posSteps = document.getElementById('pos-steps');
  var posQrWrap = document.getElementById('pos-qr-wrap');
  var posQrCanvas = document.getElementById('pos-qr-canvas');
  var posAmount = document.getElementById('pos-amount');
  var posCurrency = document.getElementById('pos-currency');
  var biometricModal = document.getElementById('biometric-modal');
  var biometricConfirm = document.getElementById('biometric-confirm');
  var biometricCancel = document.getElementById('biometric-cancel');
  var pendingPosCallback = null;

  function showBiometricModal() {
    return new Promise(function (resolve, reject) {
      if (!biometricModal) { resolve(null); return; }
      pendingPosCallback = { resolve: resolve, reject: reject };
      biometricModal.setAttribute('aria-hidden', 'false');
    });
  }
  function hideBiometricModal() {
    if (biometricModal) biometricModal.setAttribute('aria-hidden', 'true');
    pendingPosCallback = null;
  }
  if (biometricConfirm) {
    biometricConfirm.addEventListener('click', function () {
      var token = 'bio-' + generateIdempotencyKey();
      if (pendingPosCallback) pendingPosCallback.resolve(token);
      hideBiometricModal();
    });
  }
  if (biometricCancel) {
    biometricCancel.addEventListener('click', function () {
      if (pendingPosCallback) pendingPosCallback.reject(new Error('Cancelado'));
      hideBiometricModal();
    });
  }

  var posBtnPay = document.getElementById('pos-btn-pay');
  if (posBtnPay && posDisplay && posStatus) {
    posBtnPay.addEventListener('click', async function () {
      var amountStr = (posAmount && posAmount.value) ? posAmount.value.replace(',', '.') : '100';
      var currency = (posCurrency && posCurrency.value) || 'BRL';
      var amount = parseFloat(amountStr) || 100;

      if (posQrWrap) posQrWrap.setAttribute('aria-hidden', 'true');
      if (posSteps) { posSteps.setAttribute('aria-hidden', 'true'); posSteps.textContent = ''; }
      if (posStatus) posStatus.textContent = 'Aguardando';
      if (posDisplay) posDisplay.textContent = '—';

      var biometricToken = null;
      try {
        biometricToken = await showBiometricModal();
      } catch (e) {
        return;
      }
      posStatus.textContent = 'Processando...';
      if (posSteps) { posSteps.setAttribute('aria-hidden', 'false'); posSteps.textContent = 'Iniciando...'; }
      var payload = {
        accountId: 'acc-1',
        amount: currency === 'BRL' ? Math.round(amount * 100) : Math.round(amount * 100),
        currency: currency,
        merchantId: 'pos-1',
        idempotencyKey: generateIdempotencyKey(),
      };
      if (biometricToken) payload.biometricToken = biometricToken;
      if (currency !== 'BRL') {
        await new Promise(function (r) { setTimeout(r, 400); });
        if (posSteps) posSteps.textContent = 'Validando banco...';
        await new Promise(function (r) { setTimeout(r, 300); });
      }
      if (posSteps) posSteps.textContent = 'Autorizando...';
      try {
        var res = await fetch(API_BASE + '/api/v1/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          posStatus.textContent = 'Negado';
          if (posSteps) { posSteps.setAttribute('aria-hidden', 'false'); posSteps.textContent = 'Erro: ' + (data.message || res.status); }
          return;
        }
        posStatus.textContent = 'Enviado';
        if (posSteps) posSteps.textContent = 'Enviado (assíncrono).';
        if (posDisplay) posDisplay.textContent = 'R$ ' + (data.amountBRL != null ? (data.amountBRL / 100).toFixed(2) : amount.toFixed(2)).replace('.', ',');
        if (posQrWrap && posQrCanvas && typeof QRCode !== 'undefined') {
          posQrWrap.setAttribute('aria-hidden', 'false');
          var jsonStr = JSON.stringify(data, null, 2);
          var blob = new Blob([jsonStr], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          QRCode.toCanvas(posQrCanvas, url, { width: 160, margin: 1 }, function (err) {
            if (err && posQrWrap) posQrWrap.querySelector('.pos-qr-label').textContent = 'QR indisponível';
          });
        }
      } catch (err) {
        posStatus.textContent = 'Erro de rede';
        if (posSteps) { posSteps.setAttribute('aria-hidden', 'false'); posSteps.textContent = String(err.message); }
      }
    });
  }

  // Balance management functionality
  var balanceAccountInput = document.getElementById('balance-accountId');
  var balanceAmountInput = document.getElementById('balance-amount');
  var btnDeposit = document.getElementById('btn-deposit');
  var btnWithdraw = document.getElementById('btn-withdraw');
  var balanceDisplay = document.getElementById('current-balance');
  var balanceResult = document.getElementById('balance-result');

  async function refreshBalance() {
    if (!balanceAccountInput || !balanceDisplay) return;
    var accountId = balanceAccountInput.value.trim() || 'acc-1';
    try {
      var res = await fetch(API_BASE + '/api/v1/accounts/' + encodeURIComponent(accountId) + '/balance', {
        headers: authHeaders(),
      });
      var data = await res.json().catch(function () { return null; });
      if (res.ok && data) {
        balanceDisplay.textContent = 'R$ ' + (data.balance / 100).toFixed(2).replace('.', ',');
      } else {
        balanceDisplay.textContent = 'R$ —';
      }
    } catch (e) {
      balanceDisplay.textContent = 'R$ —';
    }
  }

  async function doOperation(type) {
    if (!balanceAccountInput || !balanceAmountInput || !balanceResult) return;
    var accountId = balanceAccountInput.value.trim() || 'acc-1';
    // Convert from BRL (reais) to cents - multiply by 100
    var amountBRL = parseFloat(balanceAmountInput.value);
    var amount = Math.round(amountBRL * 100); // Convert to cents
    if (!Number.isFinite(amount) || amount <= 0) {
      balanceResult.textContent = 'Valor inválido';
      balanceResult.style.display = 'block';
      balanceResult.style.background = '#ef4444';
      return;
    }
    try {
      var url = API_BASE + '/api/v1/accounts/' + encodeURIComponent(accountId) + '/' + type;
      var res = await fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ amount: amount })
      });
      var data = await res.json().catch(function () { return null; });
      if (res.ok && data) {
        balanceResult.textContent = (type === 'deposit' ? 'Depósito' : 'Retirada') + ' realizado! Novo saldo: R$ ' + (data.newBalance / 100).toFixed(2).replace('.', ',');
        balanceResult.style.display = 'block';
        balanceResult.style.background = '#22c55e';
        balanceDisplay.textContent = 'R$ ' + (data.newBalance / 100).toFixed(2).replace('.', ',');
        var tmInput = document.getElementById('timemachine-slider');
        if (tmInput && !tmInput.disabled) {
          var now = new Date();
          tmInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        refreshTimeMachine(new Date().toISOString());
      } else {
        balanceResult.textContent = data && data.message ? data.message : 'Erro na operação';
        balanceResult.style.display = 'block';
        balanceResult.style.background = '#ef4444';
      }
    } catch (e) {
      balanceResult.textContent = 'Erro de rede';
      balanceResult.style.display = 'block';
      balanceResult.style.background = '#ef4444';
    }
  }

  if (btnDeposit) {
    btnDeposit.addEventListener('click', function () { doOperation('deposit'); });
  }
  if (btnWithdraw) {
    btnWithdraw.addEventListener('click', function () { doOperation('withdraw'); });
  }
  if (balanceAccountInput) {
    balanceAccountInput.addEventListener('change', refreshBalance);
    refreshBalance();
  }

})();
