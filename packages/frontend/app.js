(function () {
  const API_BASE = window.API_BASE || 'http://localhost:3000';

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
        headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch(API_BASE + '/api/v1/orders/btc', {
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

  function refreshTimeMachine() {
    var accountId = (document.getElementById('timemachine-account') && document.getElementById('timemachine-account').value) || 'acc-1';
    var atInput = document.getElementById('timemachine-slider');
    var at = atInput && atInput.value ? new Date(atInput.value).toISOString() : new Date().toISOString();
    var balanceEl = document.getElementById('timemachine-balance');
    if (!balanceEl) return;
    fetch(API_BASE + '/api/v1/accounts/' + encodeURIComponent(accountId) + '/balance-at?at=' + encodeURIComponent(at))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        balanceEl.textContent = 'R$ ' + (data.balanceBrl != null ? (data.balanceBrl / 100).toFixed(2) : '—').replace('.', ',');
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
    fetch(API_BASE + '/api/v1/integrity?accounts=acc-1,acc-2,acc-3')
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
      var biometricToken = null;
      try {
        biometricToken = await showBiometricModal();
      } catch (e) {
        return;
      }
      posStatus.textContent = 'Processando...';
      if (posSteps) { posSteps.setAttribute('aria-hidden', 'false'); posSteps.textContent = 'Convertendo câmbio...'; }
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
          if (posSteps) posSteps.textContent = 'Erro: ' + (data.message || res.status);
          return;
        }
        posStatus.textContent = 'APROVADO';
        if (posSteps) posSteps.textContent = 'Transação aprovada.';
        if (posDisplay) posDisplay.textContent = 'R$ ' + (data.amountBRL != null ? (data.amountBRL / 100).toFixed(2) : amount.toFixed(2)).replace('.', ',');
        if (posQrWrap && posQrCanvas && typeof QRCode !== 'undefined') {
          posQrWrap.setAttribute('aria-hidden', 'false');
          var jsonStr = JSON.stringify(data, null, 2);
          var dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
          QRCode.toCanvas(posQrCanvas, dataUrl, { width: 160, margin: 1 }, function (err) {
            if (err && posQrWrap) posQrWrap.querySelector('.pos-qr-label').textContent = 'QR indisponível';
          });
        }
      } catch (err) {
        posStatus.textContent = 'Erro de rede';
        if (posSteps) posSteps.textContent = String(err.message);
      }
    });
  }
})();
