import { trace, setDebugContext, safeUrl, errorDetails } from '../shared/debug';
/**
 * ZightScout - App-Side Service
 * Handles API calls to Nightscout server
 */

import { messageBuilder, MESSAGE_TYPES } from '../shared/message';

// API configuration
const DATA_POINTS_COUNT = 48; // Number of glucose readings to fetch
const STATUS_ENDPOINT = '/api/v1/status';
const ENTRIES_ENDPOINT = '/api/v1/entries.json';
const ADMIN_ENDPOINT = '/api/v1/treatments.json';
const DEFAULT_URL = '';
let configuredUrl = DEFAULT_URL;
let configuredToken = '';

function cleanToken(value) { return typeof value === 'string' ? value.trim() : ''; }
function withToken(endpoint, token) { const clean = cleanToken(token); return clean ? endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(clean) : endpoint; }
function authMessage(status) { if (status === 401 || status === 403) return 'Token invalido ou sem permissao de leitura'; if (status === 429) return 'Limite de consultas atingido; tente novamente depois'; if (status >= 500) return 'Servidor Nightscout indisponivel'; return 'Falha ao consultar o Nightscout (HTTP ' + status + ')'; }

/**
 * Sanitize Nightscout URL
 * Automatically prepends https:// if missing and strips trailing slashes
 */
function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '';
  }
  let clean = rawUrl.trim();
  if (!clean) return '';
  clean = clean.replace(/\/+$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  return clean;
}

function buf2str(u8) {
  if (!u8 || u8.length === 0) return '';
  let out = '';
  let i = 0;
  while (i < u8.length) {
    let c = u8[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c > 0xBF && c < 0xE0) {
      out += String.fromCharCode(((c & 0x1F) << 6) | (u8[i++] & 0x3F));
    } else if (c > 0xDF && c < 0xF0) {
      out += String.fromCharCode(((c & 0x0F) << 12) | ((u8[i++] & 0x3F) << 6) | (u8[i++] & 0x3F));
    } else {
      let u = (((c & 0x07) << 18) | ((u8[i++] & 0x3F) << 12) | ((u8[i++] & 0x3F) << 6) | (u8[i++] & 0x3F)) - 0x10000;
      out += String.fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 0x3FF));
    }
  }
  return out;
}

function str2buf(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    } else if (c < 0xD800 || c >= 0xE000) {
      bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    } else {
      i++;
      c = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
      bytes.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
  }
  const buf = new ArrayBuffer(bytes.length);
  const u8 = new Uint8Array(buf);
  for (let j = 0; j < bytes.length; j++) {
    u8[j] = bytes[j];
  }
  return buf;
}

/**
 * Safely parse incoming payload from device
 */
function parsePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'object' && !(payload instanceof ArrayBuffer) && !ArrayBuffer.isView(payload)) {
    return payload;
  }
  try {
    let rawStr = '';
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(payload)) {
      rawStr = payload.toString('utf-8');
    } else {
      const view = new Uint8Array(payload.buffer || payload, payload.byteOffset || 0, payload.byteLength || 0);
      rawStr = buf2str(view);
    }
    // AUDIT FIX: Strip leading binary header bytes if present by locating first '{'
    const idx = rawStr.indexOf('{');
    if (idx !== -1) {
      return JSON.parse(rawStr.substring(idx));
    }
    return JSON.parse(rawStr);
  } catch (e) {
    console.error('[AUDIT] Error parsing payload:', e);
    return null;
  }
}

function getStoredSetting(key, defaultVal) {
  try {
    if (typeof settingsStorage !== 'undefined' && settingsStorage.getItem) {
      const val = settingsStorage.getItem(key);
      if (val !== undefined && val !== null && val !== '') {
        try { return JSON.parse(val); } catch (e) { return val; }
      }
    }
    if (typeof settings !== 'undefined' && settings && settings.settingsStorage && settings.settingsStorage.getItem) {
      const val = settings.settingsStorage.getItem(key);
      if (val !== undefined && val !== null && val !== '') {
        try { return JSON.parse(val); } catch (e) { return val; }
      }
    }
  } catch (e) {}
  return defaultVal;
}

function setStoredSetting(key, value) {
  try {
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof settingsStorage !== 'undefined' && settingsStorage.setItem) {
      settingsStorage.setItem(key, valStr);
    }
    if (typeof settings !== 'undefined' && settings && settings.settingsStorage && settings.settingsStorage.setItem) {
      settings.settingsStorage.setItem(key, valStr);
    }
  } catch (e) {}
}

let bgFetchTimer = null;

function setupBackgroundFetch(intervalMinutes, fetchCallback) {
  if (bgFetchTimer) {
    clearInterval(bgFetchTimer);
    bgFetchTimer = null;
  }
  const interval = parseInt(intervalMinutes, 10);
  if (!interval || interval <= 0) {
    console.log('ZightScout SideService: Periodic background fetch disabled (interval=0)');
    return;
  }
  console.log('ZightScout SideService: Periodic background fetch set for every', interval, 'minutes');
  const intervalMs = interval * 60 * 1000;
  bgFetchTimer = setInterval(() => {
    console.log('ZightScout SideService: Periodic background timer fired');
    if (typeof fetchCallback === 'function') {
      fetchCallback();
    }
  }, intervalMs);
}

// App-side service
AppSideService({
  onInit() {
    setDebugContext('phone'); trace('LIFECYCLE_INIT');
    configuredToken = cleanToken(getStoredSetting('zightscout_nightscout_token', ''));
    console.log('ZightScout: App-side service initialized');
    this.setupMessageHandlers();
    // Only the presence bit crosses to the watch; the raw credential stays on the phone.
    this.sendToDeviceHelper({ tokenUpdate: true, configured: !!configuredToken });
    console.log('[ZIGHTSCOUT][BACKGROUND] Polling is owned by the watch App-Service');
  },

  onRun() {
    console.log('ZightScout: App-side service running');
  },

  onDestroy() {
    console.log('ZightScout: App-side service destroyed');
    if (bgFetchTimer) {
      clearInterval(bgFetchTimer);
      bgFetchTimer = null;
    }
  },

  setupPeriodicFetch(interval) {
    setupBackgroundFetch(interval, () => {
      this.fetchNightscoutData(configuredUrl, '');
    });
  },

  /**
   * Setup message handlers for communication with device
   */
  setupMessageHandlers() {
    if (typeof messaging === 'undefined' || !messaging.peerSocket) {
      console.error('CRITICAL: messaging.peerSocket is unavailable in side service');
      return;
    }

    messaging.peerSocket.addListener('message', (rawPayload) => {
      console.log('[AUDIT] Received raw message from device');
      const data = parsePayload(rawPayload);
      if (!data) {
        console.error('[AUDIT] Failed to parse message payload');
        return;
      }
      console.log('[AUDIT] Parsed message type:', data.type);

      trace('PHONE_COMMAND', { type: data.type, cycle: data.backgroundCycle, apiUrl: safeUrl(data.apiUrl) });
      if (data.type === MESSAGE_TYPES.FETCH_DATA) {
        if (data.apiUrl) configuredUrl = sanitizeUrl(data.apiUrl);
        console.log('[ZIGHTSCOUT][NIGHTSCOUT] FETCH_DATA url=' + safeUrl(configuredUrl) + ' token=' + (configuredToken ? 'configured' : 'none'));
        this.fetchNightscoutData(configuredUrl, configuredToken, data.backgroundCycle);
      } else if (data.type === MESSAGE_TYPES.UPDATE_SETTINGS) {
        if (data.settings && Object.prototype.hasOwnProperty.call(data.settings, 'apiUrl')) configuredUrl = sanitizeUrl(data.settings.apiUrl);
        if (data.settings && Object.prototype.hasOwnProperty.call(data.settings, 'apiToken')) { configuredToken = cleanToken(data.settings.apiToken); setStoredSetting('zightscout_nightscout_token', configuredToken); this.sendToDeviceHelper({ tokenUpdate: true, configured: !!configuredToken }); }
      } else if (data.type === MESSAGE_TYPES.VERIFY_URL) {
        this.verifyNightscoutUrl(data.apiUrl || configuredUrl, configuredToken);
      } else if (data.type === MESSAGE_TYPES.VALIDATE_TOKEN) {
        this.validateToken(data.apiUrl, data.apiToken);
      }
    });
  },

  /**
   * Fetch data from Nightscout API
   */
  fetchNightscoutData(apiUrl, apiToken, backgroundCycle) {
    trace('PHONE_FETCH_START', { cycle: backgroundCycle, apiUrl: safeUrl(apiUrl), hasToken: !!apiToken });
    const url = sanitizeUrl(apiUrl);
    if (!url) { this.sendToDeviceHelper({ error: true, message: 'URL do Nightscout nao configurada', backgroundCycle: backgroundCycle }); return; }
    console.log('Fetching from Nightscout:', safeUrl(url) + ' token=' + (apiToken ? 'configured' : 'none'));

    // The phone or an intermediary may cache GET responses. A manual refresh
    // must ask Nightscout for a new response, so add an ignored cache buster.
    const endpoint = withToken(url + ENTRIES_ENDPOINT + "?count=" + DATA_POINTS_COUNT, apiToken) + "&_=" + Date.now();

    this.request({
      method: 'GET',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json'
      },
      endpointType: 'entries'
    })
    .then(response => {
      console.log('API response received');
      if (response.status < 200 || response.status >= 300) throw new Error(authMessage(response.status));
      const data = response.body;

      if (Array.isArray(data) && data.length > 0) {
        const parsedData = this.parseNightscoutData(data);
        trace('PHONE_GLUCOSE', { cycle: backgroundCycle, count: data.length, currentBG: parsedData.currentBG, readingTimestamp: parsedData.readingTimestamp, cacheBusted: true });
        parsedData.backgroundCycle = backgroundCycle;
        this.sendDataToDevice(parsedData);
      } else {
        this.sendToDeviceHelper({ error: true, message: 'Sem leituras no Nightscout', backgroundCycle: backgroundCycle });
      }
    })
    .catch(error => {
      console.error('Fetch error:', error);
      this.sendToDeviceHelper({ error: true, message: 'Problema de conexao: ' + (error.message || 'servidor indisponivel'), backgroundCycle: backgroundCycle });
    });
  },

  /**
   * Verify Nightscout URL by checking status endpoint
   */
  verifyNightscoutUrl(apiUrl, apiToken) {
    const url = sanitizeUrl(apiUrl);
    if (!url) { this.sendVerificationResultToDevice({ success: false, message: 'URL do Nightscout nao configurada' }); return; }
    console.log('Verifying URL:', safeUrl(url));

    const endpoint = withToken(`${url}${STATUS_ENDPOINT}`, apiToken);

    this.request({
      method: 'GET',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json'
      },
      endpointType: 'status'
    })
    .then(response => {
      const data = response.body;
      const isHtmlOk = typeof data === 'string' && (data.indexOf('STATUS OK') !== -1 || data.indexOf('status') !== -1 || data.indexOf('ok') !== -1);
      const isJsonOk = data && (data.status === 'ok' || data.name || data.version);

      if (response.status === 200 || isHtmlOk || isJsonOk) {
        const entriesEndpoint = withToken(url + ENTRIES_ENDPOINT + '?count=1', apiToken);
        return this.request({ method: 'GET', url: entriesEndpoint, headers: { 'Content-Type': 'application/json' }, endpointType: 'entries-verify' })
          .then(entriesResponse => {
            if (entriesResponse.status < 200 || entriesResponse.status >= 300) throw new Error(authMessage(entriesResponse.status));
            if (!Array.isArray(entriesResponse.body) || entriesResponse.body.length === 0) throw new Error('Servidor respondeu, mas sem dados de glicose');
            this.sendVerificationResultToDevice({ success: true, serverInfo: { name: (data && data.name) ? data.name : 'Nightscout Online', version: (data && data.version) ? data.version : 'OK (200)', data: 'ok' } });
          });
      } else {
        this.sendVerificationResultToDevice({
          success: false,
          message: 'Status HTTP ' + response.status
        });
      }
    })
    .catch(error => {
      console.error('Verify error:', error);
      this.sendVerificationResultToDevice({
        success: false,
        message: error.message || 'Falha ao conectar'
      });
    });
  },

  /**
   * Validate API token
   */
  validateToken(apiUrl, apiToken) {
    const url = sanitizeUrl(apiUrl || configuredUrl);
    if (!apiToken || !apiToken.trim()) {
      this.sendTokenValidationResultToDevice({
        success: true,
        accessLevel: 'none',
        message: 'Acesso anonimo / sem token'
      });
      return;
    }

    const endpoint = withToken(`${url}${ADMIN_ENDPOINT}`, apiToken);
    this.request({
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ eventType: 'Note', notes: 'verify' }]),
      endpointType: 'admin'
    })
    .then(response => {
      if (response.status < 200 || response.status >= 300) throw { httpStatus: response.status };
      this.sendTokenValidationResultToDevice({
        success: true, accessLevel: 'admin', message: 'Token de escrita (Admin)'
      });
    })
    .catch(error => {
      const status = error && error.httpStatus;
      if (status === 401 || status === 403) {
        this.sendTokenValidationResultToDevice({ success: true, accessLevel: 'readable', message: 'Token somente leitura (Seguro)' });
        return;
      }
      this.sendTokenValidationResultToDevice({
        success: false, accessLevel: 'unknown',
        message: status ? authMessage(status) : 'Nao foi possivel validar o token; tente novamente'
      });
    });
  },

  parseNightscoutData(entries) {
    if (!entries || entries.length === 0) return null;
    const ordered = entries.slice().map(entry => ({ ...entry, _timestamp: Number(entry.date || Date.parse(entry.dateString)) }))
      .filter(entry => isFinite(entry._timestamp) && isFinite(Number(entry.sgv)))
      .sort((a, b) => b._timestamp - a._timestamp);
    if (!ordered.length) return null;
    const latest = ordered[0];
    const previous = ordered[1];

    let delta = 0;
    let deltaDisplay = '--';
    if (previous && latest.sgv && previous.sgv) {
      delta = latest.sgv - previous.sgv;
      deltaDisplay = (delta >= 0 ? '+' : '') + delta;
    }

    const trendMap = {
      'DoubleUp': '↑↑',
      'DOUBLE_UP': '↑↑',
      'DOUBLEUP': '↑↑',
      'TripleUp': '↑↑↑',
      'SingleUp': '↑',
      'SINGLE_UP': '↑',
      'FortyFiveUp': '↗',
      'FORTY_FIVE_UP': '↗',
      'Flat': '→',
      'FLAT': '→',
      'FortyFiveDown': '↘',
      'FORTY_FIVE_DOWN': '↘',
      'SingleDown': '↓',
      'SINGLE_DOWN': '↓',
      'DoubleDown': '↓↓',
      'DOUBLE_DOWN': '↓↓',
      'DOUBLEDOWN': '↓↓',
      'TripleDown': '↓↓↓',
      'NOT COMPUTABLE': '-',
      'RATE OUT OF RANGE': '?'
    };
    const dirKey = latest.direction ? String(latest.direction).trim() : '';
    const trend = trendMap[dirKey] || trendMap[dirKey.toUpperCase()] || '→';
    const dataPoints = ordered.map(entry => entry.sgv || 0);
    const lastUpdate = this.formatTimeSince(latest._timestamp);
    const historyData = dataPoints.slice(0, DATA_POINTS_COUNT).reverse();

    return {
      readingTimestamp: latest._timestamp,
      currentBG: latest.sgv ? latest.sgv.toString() : '--',
      trend: trend,
      directionArrow: trend,
      direction: latest.direction,
      delta: deltaDisplay,
      deltaValue: delta,
      lastUpdate: lastUpdate,
      dataPoints: historyData,
      history: historyData
      // AUDIT FIX: Do not include settings object; watch localStorage is the authoritative single source of truth
    };
  },

  formatTimeSince(timestamp) {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMin = Math.floor(diffMs / 60000);

      if (diffMin < 1) return 'Agora';
      if (diffMin === 1) return '1 min atrás';
      if (diffMin < 60) return `${diffMin} min atrás`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour === 1) return '1 hora atrás';
      return `${diffHour} horas atrás`;
    } catch (error) {
      return 'Desconhecido';
    }
  },

  sendToDeviceHelper(data) {
    if (typeof messaging === 'undefined' || !messaging.peerSocket) {
      console.error('messaging.peerSocket not found');
      return;
    }
    trace('PHONE_RESPONSE_SEND', { currentBG: data.currentBG, cycle: data.backgroundCycle, error: data.error, keys: Object.keys(data) });
    const message = messageBuilder.response(data);
    const jsonStr = JSON.stringify(message);

    try {
      if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(jsonStr, 'utf-8');
        messaging.peerSocket.send(buf.buffer);
      } else {
        const buf = str2buf(jsonStr);
        messaging.peerSocket.send(buf);
      }
    } catch (err) {
      console.warn('Buffer send failed, fallback to raw send:', err.message);
      try {
        messaging.peerSocket.send(message);
      } catch (e2) {}
    }
  },

  sendDataToDevice(data) {
    this.sendToDeviceHelper(data);
  },

  sendVerificationResultToDevice(result) {
    this.sendToDeviceHelper({ verification: true, ...result });
  },

  sendTokenValidationResultToDevice(result) {
    this.sendToDeviceHelper({ tokenValidation: true, ...result });
  },

  sendErrorToDevice(errorMessage) {
    this.sendToDeviceHelper({ error: true, message: errorMessage });
  },

  updateSettings(settings) {
    console.log('Updating settings:', settings);
    this.settings = settings;
  },

  request(options) {
    if (typeof fetch === 'undefined') {
      console.log('Fetch not available, simulating response');
      return this.getSimulatedResponse(options);
    }

    const fetchOptions = {
      url: options.url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 20000
    };
    if (options.body) {
      fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const started = Date.now();
    trace('HTTP_START', { url: safeUrl(options.url), endpoint: options.endpointType, method: fetchOptions.method });
    return fetch(fetchOptions)
    .then(response => {
      trace('HTTP_RESULT', { status: response.status, durationMs: Date.now() - started, endpoint: options.endpointType, bodyType: typeof response.body, length: typeof response.body === 'string' ? response.body.length : undefined });
      let body = response.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          // If body is HTML/text (e.g. <h1>STATUS OK</h1>), keep as string
        }
      }
      return { body: body, status: response.status };
    })
    .catch(error => {
      trace('HTTP_ERROR', { ...errorDetails(error), durationMs: Date.now() - started, endpoint: options.endpointType });
      throw error;
    });
  },

  getSimulatedResponse(options) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          body: [
            { sgv: 115, direction: 'Flat', date: Date.now() - 60000, dateString: new Date().toISOString() },
            { sgv: 112, direction: 'Flat', date: Date.now() - 360000, dateString: new Date().toISOString() }
          ]
        });
      }, 500);
    });
  }
});