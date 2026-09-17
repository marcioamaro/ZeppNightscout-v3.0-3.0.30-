import { trace, setDebugContext, errorDetails } from '../shared/debug';
import * as ble from '../shared/page-ble';
import { syncBackground } from '../shared/page-ble';
import { createWidget, widget, prop, align, event } from '@zos/ui';
import { push } from '@zos/router';
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor';
import { triggerVibration } from '../shared/vibrator';
import { queryPermission, requestPermission } from '@zos/app';
import { showToast } from '@zos/interaction';
import { localStorage } from '../shared/storage';
import * as alarm from '@zos/alarm';
import { loadSettings, saveSettings, getBGColor, getBGStatus } from '../shared/settings';
import { getLayout, isDeviceSupported } from '../shared/layout';
import { getSnoozeUntil, setAlertSnooze, processBackgroundReading } from '../shared/background-alert';
import { getConnectionStatus } from '../shared/connection-status';

// SERVICE VALIDATION: Runtime permission check required by Zepp OS 3.0+
function ensureBgServicePermission() {
  try {
    const query = queryPermission({ code: 'device:os.bg_service' });
    console.log('[BG] Permission query: ' + JSON.stringify(query));
    console.log('[BG] Permission query type: ' + typeof query + ' isNull:' + (query === null));

    // SERVICE VALIDATION: Avoid Array.isArray (may not exist in Zepp OS QuickJS)
    // Check array by duck-typing: has length property and is not an object with .code
    let isGranted = false;
    if (query !== null && typeof query === 'object' && typeof query.length !== 'undefined') {
      // Array-like format: [statusCode] where 0 = granted
      const len = query.length;
      console.log('[BG] Permission array len: ' + len + (len > 0 ? ' code:' + query[0] : ''));
      isGranted = (len > 0 && query[0] === 0);
      if (len === 0) {
        // Undetermined — call requestPermission to trigger native OS dialog
        console.log('[BG] Permission undetermined. Calling requestPermission...');
        // falls through to requestPermission block below
      }
    } else if (query !== null && typeof query === 'object') {
      // Object format: {code:0, granted:true}
      isGranted = (query.code === 0 && query.granted === true);
      console.log('[BG] Permission object granted=' + isGranted);
    } else {
      // Cannot determine format — do not block service
      console.log('[BG] Permission unknown format, assuming granted');
      return true;
    }

    if (isGranted) {
      console.log('[BG] Permission already granted');
      return true;
    }

    // SERVICE VALIDATION: Guard requestPermission — may not exist on all firmwares
    console.log('[BG] typeof requestPermission: ' + typeof requestPermission);
    if (typeof requestPermission !== 'function') {
      console.log('[BG] requestPermission unavailable. Assuming granted.');
      return true;
    }

    console.log('[BG] Requesting bg_service permission...');
    const req = requestPermission({ code: 'device:os.bg_service' });
    console.log('[BG] requestPermission result: ' + JSON.stringify(req));

    // Duck-type check for result
    let reqGranted = false;
    if (req !== null && typeof req === 'object' && typeof req.length !== 'undefined') {
      reqGranted = (req.length > 0 && req[0] === 0);
    } else if (req !== null && typeof req === 'object') {
      reqGranted = (req.granted === true);
    }

    if (reqGranted) {
      console.log('[BG] Permission granted after request');
      return true;
    }

    console.log('[BG] Permission DENIED by user');
    return false;
  } catch (e) {
    console.log('[BG] Permission check EXCEPTION: ' + (e && e.message ? e.message : String(e)));
    // On any error, do not block service start
    return true;
  }
}

// ALERT FIX: Helper to cancel any pending wake-up alarm
function cancelPendingAlarm() {
  try {
    const pendingAlarmId = localStorage.getItem('zightscout_pending_alarm');
    if (pendingAlarmId) {
      const id = parseInt(pendingAlarmId, 10);
      if (typeof alarm.unset === 'function') {
        alarm.unset(id);
      } else if (typeof alarm.cancel === 'function') {
        alarm.cancel(id);
      }
      localStorage.removeItem('zightscout_pending_alarm');
      console.log('[PAGE] Pending alarm cancelled, id=' + id);
    }
  } catch (e) {
    console.error('[PAGE] Alarm cancel error: ' + (e && e.message ? e.message : e));
  }
}

const APP_ID = 1127422;
const layout = getLayout();
const W = layout.W;
const H = layout.H;
const CX = layout.CX;
const GRAPH_POINTS = 36;

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

Page({
  state: {
    layout: layout,
    appSidePort: 0,
    fetchTimer: null,
    refreshInterval: null,
    widgets: {},
    graphDots: [],
    settings: null,
    vibrator: null,
    lastVibratedBG: null,
    lastVibratedLevel: 'normal',
    lastVibratedTime: 0,
    lastReadingData: null,
    readingHealthTimer: null,
    fetchInFlight: false
  },
  _bleInitialized: false,
  _bleConnected: false,
  _waitingForServiceStop: false,
  _bleListenerRegistered: false,
  _handshakeTimer: null,
  _handshakeTimeoutValid: false,

  onInit(params) {
    setDebugContext('page');
    trace('LIFECYCLE_INIT');
    setDebugContext('page');
    trace('LIFECYCLE_INIT');
    console.log('[AUDIT] ZightScout: Universal - Page onInit params: ' + (typeof params === 'object' ? JSON.stringify(params) : params));
    
    // ALERT FIX: Cancel any pending fallback alarm upon page activation
    cancelPendingAlarm();

    // ALERT FIX: Receive notification/alarm params and force data refresh
    if (params) {
      try {
        let paramStr = typeof params === 'string' ? params : (params.param || '');
        if (paramStr) {
          const pairs = paramStr.split('&');
          let alertVal = null;
          let sgvVal = null;
          let levelVal = null;
          let alarmWake = false;
          for (let i = 0; i < pairs.length; i++) {
            const parts = pairs[i].split('=');
            if (parts[0] === 'alert') alertVal = decodeURIComponent(parts[1] || '');
            if (parts[0] === 'sgv') sgvVal = decodeURIComponent(parts[1] || '');
            if (parts[0] === 'level') levelVal = decodeURIComponent(parts[1] || '');
            if (parts[0] === 'alarm_wake') alarmWake = (parts[1] === 'true');
            if (parts[0] === 'minutes') {
              const m = Number(parts[1]);
              if (m === 15 || m === 30 || m === 60) {
                setAlertSnooze(m);
                showToast({ content: 'Snooze: ' + m + ' min' });
              }
            }
          }
          if (alertVal || alarmWake) {
            console.log(`[PAGE] Opened via ${alarmWake ? 'ALARM' : 'NOTIFICATION'}. SGV=${sgvVal}, Level=${levelVal || alertVal}`);
            this._openedViaAlert = true;
            this._alertContext = { sgv: sgvVal, level: levelVal || alertVal, alarmWake: alarmWake };
          }
        }
      } catch (e) {
        console.error('[PAGE] Param parse error: ' + (e && e.message ? e.message : e));
      }
    }

    // ALERT FIX: If params is undefined or missing alert, check localStorage open flag
    if (!this._openedViaAlert) {
      try {
        const flagStr = localStorage.getItem('zightscout_open_flag');
        if (flagStr) {
          const flag = JSON.parse(flagStr);
          const age = Date.now() - flag.timestamp;
          if (flag.openRequested && age < 120000) {
            console.log(`[PAGE] onInit: Recovered alert from open_flag. SGV=${flag.sgv}, Level=${flag.level}`);
            this._openedViaAlert = true;
            this._alertContext = { sgv: flag.sgv, level: flag.level };
          }
          localStorage.removeItem('zightscout_open_flag');
        }
      } catch (flagErr) {}
    }

    this.state.layout = getLayout();
    if (!isDeviceSupported()) {
      console.warn('[AUDIT] Device resolution not supported for medical safety');
      return;
    }
    this.state.settings = loadSettings();
    try {
      this.state.vibrator = new Vibrator();
    } catch (e) {
      console.log('Vibrator init error:', e);
    }

    syncBackground(this.state.settings);
    if (this.state.readingHealthTimer) clearInterval(this.state.readingHealthTimer);
    this.state.readingHealthTimer = setInterval(() => this.refreshReadingHealth(), 1000);
    this.refreshReadingHealth();
    setTimeout(() => this._initPageCommunication(), 50);
  },

  _initPageCommunication() {
    // Guard contra chamada dupla (timeout + callback)
    if (this._bleInitialized) {
      console.log('[PAGE] BLE already initialized. Skipping duplicate call.');
      return;
    }
    this._bleInitialized = true;

    console.log('[PAGE] Initializing page communication');
    // Keep the last valid reading visible while the foreground BLE session reconnects.
    this._showCachedDataWithWarning('Conectando ao celular...');
    this._initCommunicationWithRetry(0);
  },

  // ALERT OPEN FIX: Check notification open flag on resume with staleness guard
  onResume() {
    console.log('[PAGE] onResume called');

    // ALERT FIX: Cancel any pending fallback alarm upon page resume
    cancelPendingAlarm();

    // Verificar se abertura foi solicitada via notificação de alerta
    let openedViaAlert = this._openedViaAlert || false;
    try {
      const flagStr = localStorage.getItem('zightscout_open_flag');
      if (flagStr) {
        const flag = JSON.parse(flagStr);
        // Flag válido apenas se < 120 segundos (evita abertura tardia stale)
        const age = Date.now() - flag.timestamp;
        if (flag.openRequested && age < 120000) {
          console.log(`[PAGE] Opened via alert notification flag. SGV=${flag.sgv}, Level=${flag.level}, Age=${Math.floor(age/1000)}s`);
          openedViaAlert = true;
          this._openedViaAlert = true;
          // Armazenar contexto do alerta para highlight visual
          this._alertContext = { sgv: flag.sgv, level: flag.level };
        } else {
          console.log(`[PAGE] Stale open flag ignored. Age=${Math.floor(age/1000)}s`);
        }
        // SEMPRE limpar flag após leitura
        localStorage.removeItem('zightscout_open_flag');
      }
    } catch (e) {
      console.error('[PAGE] Error reading open flag: ' + (e && e.message ? e.message : e));
      try {
        localStorage.removeItem('zightscout_open_flag');
      } catch (err) {}
    }

    this.state.layout = getLayout();
    if (!isDeviceSupported()) return;
    this.state.settings = loadSettings();
    if (this.state.lastReadingData) {
      this.updateUI(this.state.lastReadingData);
    }

    // Salvaguarda 6: Protecao Contra Service Kill
    try {
      const bgInterval = parseInt(this.state.settings.backgroundInterval, 10) || 0;
      if (bgInterval > 0) {
        const lastExecStr = localStorage.getItem('lastBgExecution');
        if (lastExecStr) {
          const lastExec = parseInt(lastExecStr, 10);
          const gapMs = Date.now() - lastExec;
          const maxAllowed = bgInterval * 60000 * 1.5;
          if (gapMs > maxAllowed) {
            const gapMinutes = Math.round(gapMs / 1000);
            console.log(`[BG] Execution gap detected: ${gapMinutes} min since last run`);
            if (this.state.widgets && this.state.widgets.status) {
              this.state.widgets.status.setProperty(prop.TEXT, '2º plano interrompido. Verifique.');
              this.state.widgets.status.setProperty(prop.COLOR, 0xFFAA00);
            }
          }
        }

        // SERVICE VALIDATION: Heartbeat diagnostics — proves service is really running
        try {
          const hb = parseInt(localStorage.getItem('zightscout_service_heartbeat') || '0', 10);
          const ageSec = Math.floor((Date.now() - hb) / 1000);
          if (hb === 0) {
            console.error('[DIAG] NO HEARTBEAT. Service never started or was killed.');
          } else if (ageSec > (bgInterval * 60 * 1.5)) {
            console.warn(`[DIAG] STALE HEARTBEAT: ${ageSec}s ago (expected ≤${bgInterval * 60}s). Service may be dead.`);
          } else {
            console.log(`[DIAG] HEALTHY: heartbeat ${ageSec}s ago. Service running normally.`);
          }
        } catch (hbErr) {
          console.error('[DIAG] Heartbeat check error: ' + (hbErr && hbErr.message ? hbErr.message : hbErr));
        }
      } else {
        console.log('[DIAG] bgInterval=0 (OFF). No heartbeat expected.');
      }
    } catch (e) {
      console.log('ZightScout: onResume check gap error:', e);
    }

    syncBackground(this.state.settings);
    if (this.state.readingHealthTimer) clearInterval(this.state.readingHealthTimer);
    this.state.readingHealthTimer = setInterval(() => this.refreshReadingHealth(), 1000);
    this.refreshReadingHealth();
    // Settings may have replaced the UI listener. Reattach without touching service BLE.
    ble.createConnect((index, data, size) => this.handleDataReceived(data, size));
    if (!this._bleInitialized) { this._initPageCommunication(); return; }

    // Se BLE já está inicializado e conectado, apenas refetch
    if (this._bleInitialized && this._bleConnected) {
      console.log('[PAGE] BLE already connected. Refreshing data only.');
      this.fetchData();
    } else if (this._bleInitialized && !this._bleConnected) {
      // Se BLE não está conectado, tentar reconectar
      console.log('[PAGE] BLE initialized but not connected. Reconnecting...');
      this.initCommunication();
    }

    // Destaque visual se veio de alerta
    if (this._alertContext) {
      console.log('[PAGE] Highlighting alert context: ' + JSON.stringify(this._alertContext));
      if (this.state.widgets && this.state.widgets.status) {
        const prefix = this._alertContext.level === 'critical' ? '🚨 Alerta: ' : '⚠️ Alerta: ';
        this.state.widgets.status.setProperty(prop.TEXT, prefix + (this._alertContext.sgv || '') + ' mg/dL');
      }
    }
  },

  build() {
    console.log('ZightScout: Universal - Page build');
    if (!isDeviceSupported()) {
      this.createUnsupportedUI();
      return;
    }
    this.createUI();
  },

  createUnsupportedUI() {
    const l = this.state.layout || getLayout();

    // Title
    createWidget(widget.TEXT, {
      x: 0,
      y: Math.floor(l.H * 0.15),
      w: l.W,
      h: 30,
      text: 'ZightScout',
      text_size: Math.max(18, Math.floor(24 * l.scale)),
      color: 0x3388FF,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // Warning Title
    createWidget(widget.TEXT, {
      x: Math.floor(l.W * 0.08),
      y: Math.floor(l.H * 0.28),
      w: Math.floor(l.W * 0.84),
      h: 36,
      text: 'Dispositivo Nao Homologado',
      text_size: Math.max(13, Math.floor(16 * l.scale)),
      color: 0xFF3333,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // Warning Body
    createWidget(widget.TEXT, {
      x: Math.floor(l.W * 0.08),
      y: Math.floor(l.H * 0.40),
      w: Math.floor(l.W * 0.84),
      h: Math.floor(l.H * 0.35),
      text: `Resolucao ${l.W}x${l.H} abaixo do minimo seguro (390px).\n\nPara seguranca medica do paciente, a visualizacao neste modelo nao e permitida.`,
      text_size: Math.max(11, Math.floor(13 * l.scale)),
      color: 0xCCCCCC,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });
  },

  createUI() {
    const widgets = this.state.widgets;
    const l = this.state.layout || getLayout();

    // Header title
    widgets.title = createWidget(widget.TEXT, {
      x: 0,
      y: l.headerY,
      w: l.W,
      h: Math.floor(30 * l.scaleY),
      text: 'ZightScout',
      text_size: l.headerFontSize,
      color: 0x3388FF,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // Main glucose reading
    widgets.glucose = createWidget(widget.TEXT, {
      x: 0,
      y: l.glucoseY,
      w: l.W,
      h: l.glucoseH,
      text: '--',
      text_size: l.glucoseFontSize,
      color: 0xFFFFFF,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // Trend arrow PNG image
    widgets.arrow = createWidget(widget.IMG, {
      x: l.CX + Math.floor(45 * l.scale),
      y: l.arrowY,
      w: l.arrowSize,
      h: l.arrowSize,
      src: 'arrows/flat.png'
    });

    // Delta and reading age combined (e.g. "+6 mg/dL • 1 min atrás")
    widgets.delta = createWidget(widget.TEXT, {
      x: 0,
      y: l.deltaY,
      w: l.W,
      h: Math.floor(32 * l.scaleY),
      text: '',
      text_size: l.deltaFontSize,
      color: 0xAAAAAA,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // Status (e.g. "No Alvo", "Baixo", "Muito Alto")
    widgets.status = createWidget(widget.TEXT, {
      x: 0,
      y: l.statusY,
      w: l.W,
      h: Math.floor(28 * l.scaleY),
      text: 'Iniciando...',
      text_size: l.statusFontSize,
      color: 0x888888,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // Compact fallback for bold: high contrast, uppercase labels and status color.
    widgets.connectionStatus = createWidget(widget.TEXT, {
      x: Math.floor(l.W * 0.06),
      y: l.connectionY,
      w: Math.floor(l.W * 0.88),
      h: l.connectionH,
      text: 'BLE AGUARDA | HTTP AGUARDA | SEM LEITURA',
      text_size: l.connectionFontSize,
      color: 0xFFAA00,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });
    try {
      widgets.connectionStatus.addEventListener(event.CLICK_DOWN, () => {
        push({ url: 'page/page2?tab=server' });
      });
    } catch (e) { console.log('[PAGE] Connection status touch unavailable:', e); }

    const snoozeBannerH = Math.max(20, Math.floor(24 * l.scaleY));
    const snoozeBannerY = Math.max(l.connectionY + l.connectionH, l.graphBox.y - snoozeBannerH - 4);
    widgets.snoozeBanner = createWidget(widget.FILL_RECT, {
      x: Math.floor(l.W * 0.10), y: snoozeBannerY, w: Math.floor(l.W * 0.80), h: snoozeBannerH,
      radius: Math.floor(snoozeBannerH / 2), color: 0x000000
    });
    widgets.snoozeText = createWidget(widget.TEXT, {
      x: Math.floor(l.W * 0.12), y: snoozeBannerY, w: Math.floor(l.W * 0.76), h: snoozeBannerH,
      text: "", text_size: Math.max(10, Math.floor(12 * l.scale)), color: 0xFFCC88,
      align_h: align.CENTER_H, align_v: align.CENTER_V
    });

    // Mini graph background card
    const graphY = l.graphBox.y;
    const graphH = l.graphBox.h;
    const graphW = l.graphBox.w;
    const graphX = l.graphBox.x;

    createWidget(widget.FILL_RECT, {
      x: graphX,
      y: graphY,
      w: graphW,
      h: graphH,
      radius: Math.floor(12 * l.scale),
      color: 0x111625
    });

    // Target zone background guide line (75 - 120)
    createWidget(widget.FILL_RECT, {
      x: graphX + 8,
      y: graphY + Math.floor(graphH * 0.5),
      w: graphW - 16,
      h: 1,
      color: 0x1A2838
    });

    // Mini graph data dots
    const dots = [];
    const dotSpacing = Math.floor((graphW - 24) / GRAPH_POINTS);
    const dotStartX = graphX + 12;
    const dotSize = Math.max(3, Math.floor(4 * l.scale));
    const dotRadius = Math.floor(dotSize / 2);

    for (let i = 0; i < GRAPH_POINTS; i++) {
      const dot = createWidget(widget.FILL_RECT, {
        x: dotStartX + i * dotSpacing,
        y: graphY + Math.floor(graphH / 2),
        w: dotSize,
        h: dotSize,
        radius: dotRadius,
        color: 0x223355
      });
      dots.push(dot);
    }
    this.state.graphDots = dots;

    // Last update label
    widgets.lastUpdate = createWidget(widget.TEXT, {
      x: 0,
      y: Math.floor(l.H * 0.79),
      w: l.W,
      h: Math.floor(22 * l.scaleY),
      text: '',
      text_size: Math.max(12, Math.floor(14 * l.scale)),
      color: 0x666666,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // Refresh button
    createWidget(widget.BUTTON, {
      x: l.CX - l.btnW - Math.floor(l.btnGap / 2),
      y: l.btnBottomY,
      w: l.btnW,
      h: l.btnH,
      radius: l.btnRadius,
      normal_color: 0x1A4080,
      press_color: 0x2266AA,
      text: 'Atualizar',
      text_size: l.btnFontSize,
      color: 0xCCDDFF,
      click_func: () => { try { showToast({ content: 'Atualizando...' }); } catch (e) {}
        // Match initial startup: discard any stale phone-side port, attach the
        // foreground UI receiver again, then handshake before requesting data.
        console.log('[PAGE] Button Atualizar: restarting foreground BLE flow.');
        this._bleConnected = false;
        this.state.appSidePort = 0;
        this.state.fetchInFlight = false;
        this._bleListenerRegistered = false;
        try { ble.disConnect(); } catch (e) {}
        this._initCommunicationWithRetry(0);
      }
    });

    // Settings button
    createWidget(widget.BUTTON, {
      x: l.CX + Math.floor(l.btnGap / 2),
      y: l.btnBottomY,
      w: l.btnW,
      h: l.btnH,
      radius: l.btnRadius,
      normal_color: 0x1A253A,
      press_color: 0x2A354A,
      text: 'Ajustes',
      text_size: l.btnFontSize,
      color: 0x88BBEE,
      click_func: () => {
        push({ url: 'page/page2' });
      }
    });
    this.refreshReadingHealth();
  },

  initCommunication() {
    this._initCommunicationWithRetry(0);
  },

  _initCommunicationWithRetry(attempt) {
    const MAX_RETRIES = 3;
    const HANDSHAKE_TIMEOUT_MS = 8000;
    const currentAttempt = attempt || 0;

    console.log('[PAGE] BLE init attempt ' + (currentAttempt + 1) + '/' + (MAX_RETRIES + 1));
    this._handshakeTimeoutValid = true;

    try {
      if (!this._bleListenerRegistered) {
        this._bleListenerRegistered = true;
        console.log('[AUDIT] ZightScout: Active 2 BLE registering connection');
        ble.createConnect((index, data, size) => {
          this.handleDataReceived(data, size);
        });
      }

      // Schedule initial handshake
      setTimeout(() => {
        this.sendShake();
      }, 200);

      // Setup periodic update every 5 minutes (clearing previous interval if active)
    if (this.state.readingHealthTimer) { clearInterval(this.state.readingHealthTimer); this.state.readingHealthTimer = null; }
      if (this.state.refreshInterval) {
        clearInterval(this.state.refreshInterval);
        this.state.refreshInterval = null;
      }
      this.state.refreshInterval = setInterval(() => {
        if (loadSettings().backgroundInterval > 0) return;
        this.fetchData();
      }, 30000);
    } catch (e) {
      console.log('[AUDIT] ZightScout: BLE createConnect error:', e && e.message ? e.message : e);
      this.showError('Erro ao iniciar BLE');
    }

    // Limpar timer anterior se existir
    if (this._handshakeTimer) {
      clearTimeout(this._handshakeTimer);
      this._handshakeTimer = null;
    }

    this._handshakeTimer = setTimeout(() => {
      if (!this._handshakeTimeoutValid) return;
      if (this._bleConnected && this.state.appSidePort !== 0) return;

      console.warn('[PAGE] ⚠️ BLE handshake TIMEOUT after ' + HANDSHAKE_TIMEOUT_MS + 'ms (attempt ' + (currentAttempt + 1) + ')');

      if (!this._bleConnected && currentAttempt < MAX_RETRIES) {
        console.log('[PAGE] Retrying BLE handshake...');
        this._initCommunicationWithRetry(currentAttempt + 1);
      } else if (!this._bleConnected) {
        console.error('[PAGE] ❌ BLE handshake FAILED after ' + (MAX_RETRIES + 1) + ' attempts');
        this._showCachedDataWithWarning('Sem conexão com celular');
      }
    }, HANDSHAKE_TIMEOUT_MS);
  },

  _showCachedDataWithWarning(reason) {
    console.log('[PAGE] _showCachedDataWithWarning: ' + (reason || ''));
    if (this.state.fetchTimer) {
      clearTimeout(this.state.fetchTimer);
      this.state.fetchTimer = null;
    }

    const widgets = this.state.widgets;
    let rendered = false;

    try {
      const cachedStr = localStorage.getItem('zightscout_last_data');
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached && (cached.currentBG || cached.sgv)) {
          console.log('[PAGE] Rendering cached data from localStorage: ' + (cached.currentBG || cached.sgv));
          this.updateUI(cached);
          rendered = true;
        }
      }
    } catch (e) {
      console.error('[PAGE] Cache read error: ' + (e && e.message ? e.message : e));
    }

    if (!rendered && this._alertContext && this._alertContext.sgv) {
      console.log('[PAGE] Rendering alertContext SGV: ' + this._alertContext.sgv);
      this.updateUI({
        currentBG: parseInt(this._alertContext.sgv, 10) || this._alertContext.sgv,
        direction: 'Flat',
        statusText: this._alertContext.level === 'critical' ? 'Alerta Crítico' : 'Fora do Alvo'
      });
      rendered = true;
    }

    if (!rendered && widgets && widgets.status) {
      try {
        const msg = reason ? (reason + ' • Toque Atualizar') : 'Dados desatualizados • Toque Atualizar';
        widgets.status.setProperty(prop.TEXT, msg);
        widgets.status.setProperty(prop.COLOR, 0xFF8800);
      } catch (err) {}
    }
  },

  sendShake() {
    const buf = new ArrayBuffer(16 + 1);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    dv.setUint8(0, 1);                  // flag: MessageFlag.App = 0x1
    dv.setUint8(1, 1);                  // version: MessageVersion.Version1 = 0x1
    dv.setUint16(2, 1, true);           // type: MessageType.Shake = 0x0001
    dv.setUint16(4, 20, true);          // port1: appDevicePort = 20
    dv.setUint16(6, 0, true);           // port2: appSidePort = 0
    dv.setUint32(8, APP_ID, true);      // appId: 1127422
    dv.setUint32(12, 0, true);          // extra: 0
    u8[16] = APP_ID & 0xFF;

    try {
      ble.send(buf, buf.byteLength);
      console.log('ZightScout: Shake packet sent to scheduler');
    } catch (e) {
      console.log('ZightScout: Shake packet error:', e && e.message ? e.message : e);
    }
  },

  sendDataMessage(msgObj) {
    const jsonStr = JSON.stringify(msgObj);
    const utf8Buf = str2buf(jsonStr);
    const totalLen = 16 + utf8Buf.byteLength;
    const buf = new ArrayBuffer(totalLen);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    dv.setUint8(0, 1);
    dv.setUint8(1, 1);
    dv.setUint16(2, 4, true);                     // type: MessageType.Data = 0x0004
    dv.setUint16(4, 20, true);                    // port1: appDevicePort = 20
    dv.setUint16(6, this.state.appSidePort, true); // port2: established appSidePort
    dv.setUint32(8, APP_ID, true);                // appId: 1127422
    dv.setUint32(12, 0, true);                    // extra: 0

    const payloadBytes = new Uint8Array(utf8Buf);
    u8.set(payloadBytes, 16);

    try {
      ble.send(buf, buf.byteLength);
      console.log('ZightScout: Message sent to appSidePort =', this.state.appSidePort);
    } catch (e) {
      console.log('ZightScout: Send error:', e && e.message ? e.message : e);
      this.showError('Falha no envio');
    }
  },

  fetchData() {
    if (this.state.fetchInFlight) { console.log('[PAGE] Fetch skipped: request already in flight'); return; }
    this.state.fetchInFlight = true;
    console.log('ZightScout: Requesting glucose data...');
    if (this.state.widgets.lastUpdate) { try { this.state.widgets.lastUpdate.setProperty(prop.TEXT, 'Sincronizando...'); this.state.widgets.lastUpdate.setProperty(prop.COLOR, 0xFFAA00); } catch (e) {} }
    const widgets = this.state.widgets;
    if (widgets.status && !localStorage.getItem('zightscout_last_data')) {
      try {
        widgets.status.setProperty(prop.TEXT, 'Atualizando...');
        widgets.status.setProperty(prop.COLOR, 0xFFAA00);
      } catch (e) {}
    }

    // Safety timeout: if side-service doesn't return data within 12 seconds, display cached data
    if (this.state.fetchTimer) {
      clearTimeout(this.state.fetchTimer);
      this.state.fetchTimer = null;
    }
    this.state.fetchTimer = setTimeout(() => {
      console.warn('[PAGE] ⚠️ Fetch timeout (12s) without response. Showing cached data.');
      this.state.fetchInFlight = false;
      this._showCachedDataWithWarning('Sem resposta do servidor');
    }, 12000);

    const cfg = this.state.settings || loadSettings();

    if (!cfg.apiUrl || !cfg.apiUrl.trim()) {
      this.state.fetchInFlight = false;
      this._showCachedDataWithWarning('Abra Ajustes e configure a URL');
      return;
    }

    if (this.state.appSidePort === 0) {
      const storedPort = Number(localStorage.getItem('zightscout_ble_port'));
      if (storedPort > 0) this.state.appSidePort = storedPort;
    }

    if (this.state.appSidePort === 0) {
      this.sendShake();
      setTimeout(() => {
        this.sendDataMessage({
          type: 'FETCH_DATA',
          apiUrl: cfg.apiUrl
        });
      }, 600);
    } else {
      this.sendDataMessage({
        type: 'FETCH_DATA',
        apiUrl: cfg.apiUrl
      });
    }
  },

  handleDataReceived(data, size) {
    try {
      if (!data) return;
      const len = (size && size > 0) ? size : (data.byteLength || 0);
      const u8 = new Uint8Array(data.buffer || data, data.byteOffset || 0, len);
      if (u8.length === 0) return;

      if (u8.length >= 16 && u8[0] === 1 && u8[1] === 1) {
        const dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
        const pType = dv.getUint16(2, true);
        const pPort2 = dv.getUint16(6, true);

        if (pType === 1) {
          this.state.appSidePort = pPort2;
          localStorage.setItem('zightscout_ble_port', String(this.state.appSidePort));
          localStorage.setItem('zightscout_ble_last_contact', String(Date.now()));
          this._bleConnected = true;
          this.refreshConnectionStatus();
          this._handshakeTimeoutValid = false;
          if (this._handshakeTimer) {
            clearTimeout(this._handshakeTimer);
            this._handshakeTimer = null;
          }
          console.log('[PAGE] ✅ BLE handshake established, appSidePort =', this.state.appSidePort);
          this.fetchData();
          return;
        } else if (pType === 2) {
          console.log('ZightScout: Session reset notice from schedule');
          this.state.appSidePort = 0;
          localStorage.setItem('zightscout_ble_last_disconnect', String(Date.now()));
          this._bleConnected = false;
          this.refreshConnectionStatus();
          setTimeout(() => {
            this.sendShake();
          }, 30000);
          return;
        }
      }

      const offset = (u8.length >= 16 && u8[0] === 1 && u8[1] === 1) ? 16 : 0;
      const payloadU8 = u8.subarray(offset);
      const jsonStr = buf2str(payloadU8);
      if (!jsonStr || jsonStr.indexOf('{') === -1) return;

      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.data) {
        if (this.state.fetchTimer) {
          clearTimeout(this.state.fetchTimer);
          this.state.fetchTimer = null;
        }
        this.state.fetchInFlight = false;
        if (parsed.data.error) {
          this.showError(parsed.data.message || 'Erro Nightscout');
        } else if (!parsed.data.verification && !parsed.data.tokenValidation && !parsed.data.secret) {
          // AUDIT FIX: Watch is the single source of truth for settings.
          // Do NOT overwrite local watch settings with side-service defaults!
          const receivedAt = Date.now();
          const reading = { ...parsed.data, receivedAt: receivedAt };
          this.state.lastReadingData = reading;
          try {
            localStorage.setItem('zightscout_last_data', JSON.stringify(reading));
            localStorage.setItem('zightscout_last_fetch_at', String(receivedAt));
            localStorage.removeItem('zightscout_last_fetch_error');
          } catch (e) {}
          this.updateUI(reading);
          this.refreshReadingHealth();
          if (loadSettings().backgroundInterval > 0) {
            try { processBackgroundReading(reading); } catch (e) {}
          } else {
            this.checkVibrationAlerts(reading);
          }
        }
      }
    } catch (e) {
      console.log('ZightScout: Parse error:', e && e.message ? e.message : e);
      this.showError('Erro nos dados');
    }
  },

  updateUI(data) {
    if (!data) return;
    const widgets = this.state.widgets;
    const cfg = this.state.settings || loadSettings();
    const bgColor = getBGColor(data.currentBG, cfg);

    // Glucose value with trend arrow PNG image
    const ARROW_FILES = {
      'DoubleUp': 'arrows/up_up.png',
      'DOUBLE_UP': 'arrows/up_up.png',
      'DOUBLEUP': 'arrows/up_up.png',
      'TripleUp': 'arrows/up_up.png',
      'SingleUp': 'arrows/up.png',
      'SINGLE_UP': 'arrows/up.png',
      'FortyFiveUp': 'arrows/forty_five_up.png',
      'FORTY_FIVE_UP': 'arrows/forty_five_up.png',
      'Flat': 'arrows/flat.png',
      'FLAT': 'arrows/flat.png',
      'FortyFiveDown': 'arrows/forty_five_down.png',
      'FORTY_FIVE_DOWN': 'arrows/forty_five_down.png',
      'SingleDown': 'arrows/down.png',
      'SINGLE_DOWN': 'arrows/down.png',
      'DoubleDown': 'arrows/down_down.png',
      'DOUBLE_DOWN': 'arrows/down_down.png',
      'DOUBLEDOWN': 'arrows/down_down.png',
      'TripleDown': 'arrows/down_down.png'
    };
    const dirKey = data.direction ? String(data.direction).trim() : '';
    const arrowSrc = ARROW_FILES[dirKey] || ARROW_FILES[dirKey.toUpperCase()] || (data.trend && ARROW_FILES[data.trend]) || 'arrows/flat.png';
    const bgVal = String(data.currentBG || '--');

    if (widgets.glucose) {
      try {
        widgets.glucose.setProperty(prop.TEXT, bgVal);
        widgets.glucose.setProperty(prop.COLOR, bgColor);
      } catch (e) {}
    }

    if (widgets.arrow) {
      try {
        const l = this.state.layout || getLayout();
        const offset = (bgVal.length >= 3) ? Math.floor(75 * l.scale) : (bgVal.length === 2 ? Math.floor(54 * l.scale) : Math.floor(35 * l.scale));
        widgets.arrow.setProperty(prop.X, l.CX + offset);
        widgets.arrow.setProperty(prop.SRC, arrowSrc);
      } catch (e) {}
    }

    // Delta and Reading Age (e.g., "+6 mg/dL  •  1 min atrás")
    if (widgets.delta) {
      try {
        let deltaPart = '';
        if (data.delta && data.delta !== '--') {
          deltaPart = (String(data.delta).indexOf('mg/dL') !== -1) ? data.delta : (data.delta + ' mg/dL');
        } else if (data.deltaValue !== undefined && data.deltaValue !== null) {
          deltaPart = (data.deltaValue >= 0 ? '+' : '') + data.deltaValue + ' mg/dL';
        }

        const agePart = data.lastUpdate || '';
        let fullDeltaText = '';
        if (deltaPart && agePart) {
          fullDeltaText = deltaPart + '  •  ' + agePart;
        } else {
          fullDeltaText = deltaPart || agePart;
        }

        widgets.delta.setProperty(prop.TEXT, fullDeltaText);
      } catch (e) {}
    }

    // Status description ("No Alvo", "Muito Baixo", etc.)
    if (widgets.status) {
      try {
        const statusText = getBGStatus(data.currentBG, cfg); const statusSnooze = getSnoozeUntil(); const statusRemain = statusSnooze ? Math.max(1, Math.ceil((statusSnooze - Date.now()) / 60000)) : 0;
        widgets.status.setProperty(prop.TEXT, statusText + (statusRemain ? ' • SNOOZE ATIVO • ' + statusRemain + ' min restantes' : ''));
        widgets.status.setProperty(prop.COLOR, bgColor);
      } catch (e) {}
    }

    // Mini graph dots
    const dots = this.state.graphDots;
    const historyList = (data.dataPoints && data.dataPoints.length > 0) ? data.dataPoints : (data.history || []);
    if (historyList && Array.isArray(historyList) && dots && dots.length > 0) {
      const l = this.state.layout || getLayout();
      const graphY = l.graphBox.y;
      const graphH = l.graphBox.h;
      const minBG = 40;
      const maxBG = 300;
      const count = Math.min(dots.length, historyList.length);

      for (let i = 0; i < count; i++) {
        const entry = historyList[historyList.length - count + i];
        const val = typeof entry === 'number' ? entry : (entry && entry.sgv ? entry.sgv : 0);
        if (val > 0) {
          const clamped = Math.max(minBG, Math.min(maxBG, val));
          const norm = (clamped - minBG) / (maxBG - minBG);
          const dotY = graphY + graphH - 8 - Math.floor(norm * (graphH - 16));
          const dotColor = getBGColor(val, cfg);
          try {
            dots[i].setProperty(prop.Y, dotY);
            dots[i].setProperty(prop.COLOR, dotColor);
          } catch (e) {}
        }
      }
    }

    // Last sync timestamp
    const snoozeUntil = getSnoozeUntil();
    const snoozeSeconds = snoozeUntil ? Math.max(1, Math.ceil((snoozeUntil - Date.now()) / 1000)) : 0;
    if (widgets.snoozeBanner && widgets.snoozeText) {
      try {
        widgets.snoozeBanner.setProperty(prop.COLOR, snoozeSeconds ? 0x56321F : 0x000000);
        widgets.snoozeText.setProperty(prop.TEXT, snoozeSeconds ? ("SNOOZE ATIVO • faltam " + Math.floor(snoozeSeconds / 60) + ":" + String(snoozeSeconds % 60).padStart(2, '0')) : "SNOOZE DESATIVADO");
      } catch (e) {}
    }
    if (widgets.lastUpdate) {
      try {
        const fetchAt = Number(data.receivedAt) || Number(localStorage.getItem('zightscout_last_fetch_at')) || Date.now();
        this.state.lastFetchAt = fetchAt;
        localStorage.setItem('zightscout_last_fetch_at', String(fetchAt));
        const fetchDate = new Date(fetchAt);
        const hh = String(fetchDate.getHours()).padStart(2, '0');
        const mm = String(fetchDate.getMinutes()).padStart(2, '0');
        const ss = String(fetchDate.getSeconds()).padStart(2, '0');
        widgets.lastUpdate.setProperty(prop.TEXT, 'Última atualização: ' + hh + ':' + mm + ':' + ss);
      } catch (e) {}
    }
  },

  refreshConnectionStatus() {
    const widgets = this.state.widgets || {};
    if (!widgets.connectionStatus) return;
    try {
      const status = getConnectionStatus(this.state.settings || loadSettings());
      this.state.connectionStatus = status;
      widgets.connectionStatus.setProperty(prop.TEXT, status.text);
      widgets.connectionStatus.setProperty(prop.COLOR, status.color);
    } catch (e) { console.log('[PAGE] Connection status update error:', e); }
  },

  refreshReadingHealth() {
    const widgets = this.state.widgets || {};
    this.refreshConnectionStatus();
    const connection = this.state.connectionStatus || getConnectionStatus(this.state.settings || loadSettings());
    const readingState = connection.reading;
    let reading = this.state.lastReadingData;
    if (!reading) { try { reading = JSON.parse(localStorage.getItem('zightscout_last_data') || 'null'); } catch (e) {} }
    const snoozeUntil = getSnoozeUntil();
    const snoozeSeconds = snoozeUntil ? Math.max(1, Math.ceil((snoozeUntil - Date.now()) / 1000)) : 0;
    if (widgets.snoozeBanner && widgets.snoozeText) {
      try {
        widgets.snoozeBanner.setProperty(prop.COLOR, snoozeSeconds ? 0x56321F : 0x000000);
        widgets.snoozeText.setProperty(prop.TEXT, snoozeSeconds ? ('SNOOZE ATIVO • faltam ' + Math.floor(snoozeSeconds / 60) + ':' + String(snoozeSeconds % 60).padStart(2, '0')) : 'SNOOZE DESATIVADO');
      } catch (e) {}
    }
    if (widgets.lastUpdate) {
      try {
        const fetchAt = Number(this.state.lastFetchAt || (reading && reading.receivedAt) || localStorage.getItem('zightscout_last_fetch_at'));
        if (fetchAt > 0) {
          const fetchDate = new Date(fetchAt);
          const hh = String(fetchDate.getHours()).padStart(2, '0');
          const mm = String(fetchDate.getMinutes()).padStart(2, '0');
          const ss = String(fetchDate.getSeconds()).padStart(2, '0');
          widgets.lastUpdate.setProperty(prop.TEXT, 'Última atualização: ' + hh + ':' + mm + ':' + ss);
        } else {
          widgets.lastUpdate.setProperty(prop.TEXT, 'Aguardando atualização');
        }
        // Based on the Nightscout entry timestamp, not the BLE receive time.
        widgets.lastUpdate.setProperty(prop.COLOR, readingState ? readingState.color : 0x666666);
      } catch (e) {}
    }
    if (widgets.status) {
      try {
        const statusRemain = snoozeUntil ? Math.max(1, Math.ceil((snoozeUntil - Date.now()) / 60000)) : 0;
        if (readingState && (readingState.label === 'ATRASADO' || readingState.label === 'VENCIDO')) {
          widgets.status.setProperty(prop.TEXT, readingState.label + ' • ' + readingState.detail + (statusRemain ? ' • SNOOZE ATIVO • ' + statusRemain + ' min restantes' : ''));
          widgets.status.setProperty(prop.COLOR, readingState.color);
        } else if (reading && reading.currentBG !== undefined) {
          widgets.status.setProperty(prop.TEXT, getBGStatus(reading.currentBG, this.state.settings || loadSettings()) + (statusRemain ? ' • SNOOZE ATIVO • ' + statusRemain + ' min restantes' : ''));
          widgets.status.setProperty(prop.COLOR, getBGColor(reading.currentBG, this.state.settings || loadSettings()));
        }
      } catch (e) {}
    }
  },


  checkVibrationAlerts(data) {
    if (loadSettings().backgroundInterval > 0 || getSnoozeUntil()) return; // Service or global Snooze owns alerts.
    if (!data || !data.currentBG) return;
    const numBG = parseInt(data.currentBG, 10);
    if (isNaN(numBG)) return;

    const cfg = this.state.settings || loadSettings();
    const now = Date.now();

    const isRed = (numBG < cfg.veryLow || numBG > cfg.veryHigh);
    const isYellow = (!isRed && ((numBG >= cfg.veryLow && numBG < cfg.low) || (numBG > cfg.high && numBG <= cfg.veryHigh)));
    const level = isRed ? 'critical' : (isYellow ? 'warning' : 'normal');
    const transitioned = level !== this.state.lastVibratedLevel;
    this.state.lastVibratedLevel = level;
    if (!transitioned) return;

    if (isRed && cfg.criticalVibration) {
      console.log('ZightScout: Critical RED alert triggered -> strong vibration');
      triggerVibration('critical', this.state.vibrator);
      this.state.lastVibratedBG = data.currentBG;
      this.state.lastVibratedTime = now;
    } else if (isYellow && cfg.outOfRangeVibration) {
      console.log('ZightScout: Out of target YELLOW alert triggered -> notification vibration');
      triggerVibration('warning', this.state.vibrator);
      this.state.lastVibratedBG = data.currentBG;
      this.state.lastVibratedTime = now;
    }
  },

  showError(msg) {
    try { localStorage.setItem('zightscout_last_fetch_error', JSON.stringify({ timestamp: Date.now(), message: String(msg || 'Erro') })); } catch (e) {}
    this.refreshConnectionStatus();
    const widgets = this.state.widgets;
    if (widgets.status) {
      try {
        widgets.status.setProperty(prop.TEXT, msg || 'Erro');
        widgets.status.setProperty(prop.COLOR, 0xFF4444);
      } catch (e) {}
    }
  },

  onDestroy() {
    console.log('[AUDIT] ZightScout: Active 2 - Page onDestroy');
    if (this._handshakeTimer) {
      clearTimeout(this._handshakeTimer);
      this._handshakeTimer = null;
    }
    this._handshakeTimeoutValid = false;
    if (this.state.readingHealthTimer) { clearInterval(this.state.readingHealthTimer); this.state.readingHealthTimer = null; }
    if (this.state.refreshInterval) {
      clearInterval(this.state.refreshInterval);
      this.state.refreshInterval = null;
    }
    if (this.state.fetchTimer) {
      clearTimeout(this.state.fetchTimer);
      this.state.fetchTimer = null;
    }
    try {
      ble.disConnect();
    } catch (e) {}

    // Reset flags para próxima abertura
    this._bleInitialized = false;
    this._bleConnected = false;
    this._waitingForServiceStop = false;
    this._bleListenerRegistered = false;

    syncBackground(loadSettings());
  }
});
