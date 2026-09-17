import * as ble from '@zos/ble';
import { Time } from '@zos/sensor';
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor';
import { notify } from '@zos/notification';
import { set as alarmSet, REPEAT_ONCE } from '@zos/alarm';
import { localStorage } from '@zos/storage';
import { loadSettings, getBGColor, getBGStatus } from './shared/settings';

const APP_ID = 1127123;

function recordBgExecution() {
  try {
    localStorage.setItem('lastBgExecution', Date.now().toString());
  } catch (e) {}
}

function logAlertAudit(type, detail, status) {
  try {
    const raw = localStorage.getItem('zightscout_alert_log');
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    list.unshift({
      ts: Date.now(),
      type: type,
      detail: detail,
      status: status
    });
    if (list.length > 50) {
      list = list.slice(0, 50);
    }
    localStorage.setItem('zightscout_alert_log', JSON.stringify(list));
  } catch (e) {
    console.log('[ALERT] Audit log error:', e);
  }
}

// ALERT FIX: Alarm fallback for guaranteed page wake-up (medication-style)
function scheduleAlarmFallback(numBG, level) {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const alarmId = alarmSet({
      url: 'pages/index', // ← Acorda a page DIRETAMENTE
      time: nowSec + 30, // Daqui a 30 segundos
      repeat_type: REPEAT_ONCE, // Apenas uma vez
      param: `alarm_wake=true&sgv=${numBG}&level=${level}`,
      store: false // Não persistir após reboot (é fallback temporário)
    });

    if (alarmId > 0) {
      console.log(`[ALERT] Alarm set as fallback, id=${alarmId}, fires in 30s`);
      localStorage.setItem('zightscout_pending_alarm', String(alarmId));
      logAlertAudit('alarm_fallback', `${level} sgv=${numBG}`, `id=${alarmId}`);
    } else {
      console.error('[ALERT] Alarm set FAILED, id=0');
      logAlertAudit('alarm_fallback', `${level} sgv=${numBG}`, 'FAILED');
    }
  } catch (alarmErr) {
    console.error('[ALERT] Alarm error: ' + (alarmErr && alarmErr.message ? alarmErr.message : alarmErr));
  }
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

AppService({
  state: {
    appSidePort: 0,
    timeSensor: null,
    minuteCount: 0,
    vibrator: null,
    lastAlertBG: null,
    lastAlertTime: 0
  },

  onInit() {
    // SERVICE VALIDATION: Heartbeat — proves service started
    console.log('[BG] ===== APP-SERVICE STARTED =====');
    try { localStorage.setItem('zightscout_service_heartbeat', String(Date.now())); } catch (_) {}
    try {
      this.state.vibrator = new Vibrator();
    } catch (e) {
      console.log('ZightScout AppService: Vibrator init error:', e);
    }

    this.initBle();
    this.initTimer();
  },

  initBle() {
    try {
      ble.createConnect((index, data, size) => {
        this.handleBleMessage(data, size);
      });
      console.log('ZightScout AppService: BLE connect registered');

      this.sendShake();
    } catch (e) {
      console.log('ZightScout AppService: BLE error:', e);
    }
  },

  sendShake() {
    const buf = new ArrayBuffer(16 + 1);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    dv.setUint8(0, 1);
    dv.setUint8(1, 1);
    dv.setUint16(2, 1, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint32(8, APP_ID, true);
    dv.setUint32(12, 0, true);
    u8[16] = APP_ID & 0xFF;

    try {
      ble.send(buf, buf.byteLength);
    } catch (e) {}
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
    dv.setUint16(2, 4, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, this.state.appSidePort, true);
    dv.setUint32(8, APP_ID, true);
    dv.setUint32(12, 0, true);

    const payloadBytes = new Uint8Array(utf8Buf);
    u8.set(payloadBytes, 16);

    try {
      ble.send(buf, buf.byteLength);
    } catch (e) {}
  },

  fetchData() {
    const s = loadSettings();
    const interval = parseInt(s.bgInterval, 10) || 0;
    if (interval <= 0) {
      console.log('[BG] Interval OFF. No action taken.');
      return;
    }
    if (!s.apiUrl || !s.apiUrl.trim()) {
      console.log('[BG] No apiUrl configured. Skipping background fetch.');
      return;
    }

    recordBgExecution();

    console.log('ZightScout AppService: Requesting BG data in background...');
    if (this.state.appSidePort === 0) {
      this.sendShake();
      // Retry in next tick
      return;
    }

    this.sendDataMessage({
      type: 'FETCH_DATA',
      apiUrl: s.apiUrl,
      apiToken: s.apiToken
    });
  },

  initTimer() {
    try {
      this.state.timeSensor = new Time();
      this.state.timeSensor.onPerMinute(() => {
        this.onMinuteTick();
      });
      console.log('ZightScout AppService: Time onPerMinute registered');
    } catch (e) {
      console.log('ZightScout AppService: Time sensor error:', e);
    }
  },

  onMinuteTick() {
    // SERVICE VALIDATION: Heartbeat — updated every minute to prove service is alive
    try { localStorage.setItem('zightscout_service_heartbeat', String(Date.now())); } catch (_) {}
    console.log('[BG] Heartbeat: ' + new Date(Date.now()).toISOString());

    const s = loadSettings();
    const interval = parseInt(s.bgInterval, 10) || 0;
    if (interval <= 0) {
      this.state.minuteCount = 0;
      console.log('[BG] Interval OFF. No action taken.');
      return;
    }

    this.state.minuteCount++;
    if (this.state.minuteCount >= interval) {
      this.state.minuteCount = 0;
      this.fetchData();
    }
  },

  handleBleMessage(data, size) {
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
          this.fetchData();
          return;
        }
      }

      const offset = (u8.length >= 16 && u8[0] === 1 && u8[1] === 1) ? 16 : 0;
      const jsonStr = buf2str(u8.subarray(offset));
      if (!jsonStr || jsonStr.indexOf('{') === -1) return;

      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.data && parsed.data.currentBG) {
        this.processBackgroundReading(parsed.data);
      }
    } catch (e) {
      console.log('ZightScout AppService: handleBleMessage error:', e);
    }
  },

  // ALERT OPEN FIX: onEvent handler for notification action with launchApp + localStorage fallback
  onEvent(e) {
    console.log('[SERVICE] onEvent received: ' + e);

    try {
      // Parse parâmetros da ação da notificação (com fallback seguro caso URLSearchParams não esteja no firmware)
      let action = null;
      let sgv = '';
      let level = 'unknown';

      if (typeof URLSearchParams !== 'undefined') {
        try {
          const params = new URLSearchParams(e || '');
          action = params.get('action');
          sgv = params.get('sgv') || '';
          level = params.get('level') || 'unknown';
        } catch (err) {}
      }

      if (!action && typeof e === 'string') {
        const parts = e.split('&');
        for (let i = 0; i < parts.length; i++) {
          const pair = parts[i].split('=');
          if (pair[0] === 'action') action = decodeURIComponent(pair[1] || '');
          else if (pair[0] === 'sgv') sgv = decodeURIComponent(pair[1] || '');
          else if (pair[0] === 'level') level = decodeURIComponent(pair[1] || '');
        }
      }

      if (action === 'open_app') {
        console.log(`[SERVICE] Open requested via notification. SGV=${sgv}, Level=${level}`);

        // Sinalizar via localStorage para page/index.js (fallback robusto)
        const flag = JSON.stringify({
          openRequested: true,
          timestamp: Date.now(),
          sgv: sgv,
          level: level
        });
        localStorage.setItem('zightscout_open_flag', flag);
        console.log('[SERVICE] Open flag written to localStorage');

        // Tentar launchApp (funciona em alguns firmwares Zepp OS 3.5+)
        try {
          const appModule = require('@zos/app');
          if (appModule && typeof appModule.launchApp === 'function') {
            appModule.launchApp({ appId: 1127123 });
            console.log('[SERVICE] launchApp() called successfully');
          } else {
            console.log('[SERVICE] launchApp not available in this firmware');
          }
        } catch (launchErr) {
          console.log('[SERVICE] launchApp failed: ' + (launchErr && launchErr.message ? launchErr.message : launchErr) + '. Fallback to localStorage flag.');
        }
      }
    } catch (parseErr) {
      console.error('[SERVICE] onEvent parse error: ' + (parseErr && parseErr.message ? parseErr.message : parseErr));
    }
  },

  processBackgroundReading(data) {
    recordBgExecution();
    const s = loadSettings();
    const numBG = parseInt(data.currentBG, 10);
    if (isNaN(numBG)) return;

    const now = Date.now();
    // Debounce alerts for same value within 4 minutes
    if (this.state.lastAlertBG === data.currentBG && (now - this.state.lastAlertTime < 240000)) {
      return;
    }

    const isRed = (numBG < s.lowCritical || numBG > s.highCritical);
    const isYellow = (!isRed && ((numBG >= s.lowCritical && numBG < s.lowWarn) || (numBG > s.highWarn && numBG <= s.highCritical)));
    const statusText = getBGStatus(data.currentBG, s);

    // ALERT OPEN FIX: Correct notify() usage with app-service action
    if (isRed && s.vibrateRed) {
      console.log('ZightScout AppService: Triggering RED alert in background');
      // Vibração forte (preservando regra de debounce de 4 min)
      if (this.state.vibrator) {
        try {
          this.state.vibrator.start({ mode: VIBRATOR_SCENE_STRONG_REMINDER });
          console.log(`[ALERT] Vibrate STRONG_REMINDER OK at ${new Date().toISOString()}`);
          logAlertAudit('vibrate', 'STRONG_REMINDER', 'OK');
        } catch (e) {
          console.log(`[ALERT] Vibrate STRONG_REMINDER FAILED at ${new Date().toISOString()}`);
          logAlertAudit('vibrate', 'STRONG_REMINDER', 'FAILED');
          try {
            this.state.vibrator.start({ mode: VIBRATOR_SCENE_NOTIFICATION });
            console.log(`[ALERT] Vibrate retry NOTIFICATION OK at ${new Date().toISOString()}`);
            logAlertAudit('vibrate_retry', 'NOTIFICATION', 'OK');
          } catch (err) {}
        }
      }

      // ALERT FIX: Using pages/index in actions per official System Notification guide
      const notifId = notify({
        title: '🚨 Glicemia Crítica',
        content: `${numBG} mg/dL - ${statusText}`,
        vibrate: 5,
        actions: [
          {
            text: 'Abrir ZightScout',
            file: 'pages/index', // ← PAGE DIRETA conforme guia oficial System Notification
            param: `alert=critical&sgv=${numBG}`
          }
        ]
      });

      console.log(`[ALERT] RED notify sent id=${notifId}, using pages/index`);
      if (notifId === 0 || notifId === false || notifId === -1) {
        console.error('[ALERT] RED notify FAILED, retrying with simplified title');
        // Retry único com título simplificado (Salvaguarda 6)
        const retryId = notify({
          title: 'Glicemia Critica',
          content: `${numBG} mg/dL`,
          vibrate: 5,
          actions: [
            {
              text: 'Abrir',
              file: 'pages/index',
              param: `alert=critical&sgv=${numBG}`
            }
          ]
        });
        console.log(`[ALERT] RED notify retry id=${retryId}`);
        logAlertAudit('notify_retry', 'Glicemia Critica', (retryId !== 0 && retryId !== false && retryId !== -1) ? 'OK' : 'FAILED');
      } else {
        logAlertAudit('notify', '🚨 Glicemia Crítica', 'OK');
      }

      // ALERT FIX: Alarm fallback for guaranteed page wake-up (medication-style)
      scheduleAlarmFallback(numBG, 'critical');

      this.state.lastAlertBG = data.currentBG;
      this.state.lastAlertTime = now;
    } else if (isYellow && s.vibrateYellow) {
      console.log('ZightScout AppService: Triggering YELLOW alert in background');
      // ALERT FIX: Using pages/index in actions per official System Notification guide
      if (this.state.vibrator) {
        try {
          this.state.vibrator.start({ mode: VIBRATOR_SCENE_NOTIFICATION });
          console.log(`[ALERT] Vibrate NOTIFICATION OK at ${new Date().toISOString()}`);
          logAlertAudit('vibrate', 'NOTIFICATION', 'OK');
        } catch (e) {
          console.log(`[ALERT] Vibrate NOTIFICATION FAILED at ${new Date().toISOString()}`);
          logAlertAudit('vibrate', 'NOTIFICATION', 'FAILED');
          try {
            this.state.vibrator.start({ mode: VIBRATOR_SCENE_STRONG_REMINDER });
            console.log(`[ALERT] Vibrate retry STRONG_REMINDER OK at ${new Date().toISOString()}`);
            logAlertAudit('vibrate_retry', 'STRONG_REMINDER', 'OK');
          } catch (err) {}
        }
      }

      const notifId = notify({
        title: '⚠️ Glicemia Fora do Alvo',
        content: `${numBG} mg/dL - ${statusText}`,
        vibrate: 3,
        actions: [
          {
            text: 'Abrir ZightScout',
            file: 'pages/index', // ← PAGE DIRETA
            param: `alert=warning&sgv=${numBG}`
          }
        ]
      });

      console.log(`[ALERT] YELLOW notify sent id=${notifId}, using pages/index`);
      if (notifId === 0 || notifId === false || notifId === -1) {
        console.error('[ALERT] YELLOW notify FAILED');
        const retryId = notify({
          title: 'Glicemia Fora do Alvo',
          content: `${numBG} mg/dL`,
          vibrate: 3,
          actions: [
            {
              text: 'Abrir',
              file: 'pages/index',
              param: `alert=warning&sgv=${numBG}`
            }
          ]
        });
        console.log(`[ALERT] YELLOW notify retry id=${retryId}`);
        logAlertAudit('notify_retry', 'Glicemia Fora do Alvo', (retryId !== 0 && retryId !== false && retryId !== -1) ? 'OK' : 'FAILED');
      } else {
        logAlertAudit('notify', '⚠️ Glicemia Fora do Alvo', 'OK');
      }

      // ALERT FIX: Alarm fallback for guaranteed page wake-up (medication-style)
      scheduleAlarmFallback(numBG, 'warning');

      this.state.lastAlertBG = data.currentBG;
      this.state.lastAlertTime = now;
    }
  },

  onDestroy() {
    // SERVICE VALIDATION: Heartbeat removal — signals service was cleanly stopped
    console.log('[BG] ===== APP-SERVICE DESTROYED =====');
    try { localStorage.removeItem('zightscout_service_heartbeat'); } catch (_) {}
    try {
      ble.disConnect();
    } catch (e) {}
  }
});
