import { getPackageInfo } from '@zos/app';
import { trace, setDebugContext, errorDetails } from '../shared/debug';
import * as ble from '@zos/ble';
import { Time } from '@zos/sensor';
import { processBackgroundReading, setAlertSnooze } from '../shared/background-alert';
import { exit } from '@zos/app-service';
import { localStorage } from '../shared/storage';
import { loadSettings, getBGStatus } from '../shared/settings';
import { schedulePoll, consumePollAlarm, cancelPollAlarm, LAST_REQUEST_KEY, PENDING_RESPONSE_KEY, MANUAL_REFRESH_KEY } from '../shared/background';
import { backgroundLog } from '../shared/background-log';

const APP_ID = 1127422;
const RESPONSE_WAKE_INTERVAL_MS = 15000;
const RESPONSE_TIMEOUT_MS = 60000;
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
  state: { appSidePort: 0, timeSensor: null, pendingSince: 0, cycle: '', responseSequence: 0, lastMailboxTimestamp: 0 },

  onInit(params) {
    setDebugContext('service');
    trace('LIFECYCLE_INIT');
    try { trace('RUNTIME_PACKAGE', { package: getPackageInfo() }); } catch (e) { trace('RUNTIME_PACKAGE_ERROR', errorDetails(e)); }
    const settings = loadSettings();
    this.handleNotificationAction(params);
    backgroundLog('SERVICE_STARTED', { trigger: params || 'start', settings: this.debugSettings(settings) });
    if (!(settings.backgroundInterval > 0)) { cancelPollAlarm(); exit(); return; }
    localStorage.setItem('zightscout_service_heartbeat', String(Date.now()));
    const pending = this.getPendingResponse();
    this.state.pendingSince = pending ? pending.since : 0;
    const storedPort = Number(localStorage.getItem('zightscout_ble_port'));
    if (storedPort > 0) this.state.appSidePort = storedPort;
    this.ensureBleReceiver();
    this.consumeBleMailbox();
    this.state.timeSensor = new Time();
    this._minuteCallback = () => this.runCycle('minute');
    this.state.timeSensor.onPerMinute(this._minuteCallback);
    this.runCycle(params || 'start');
    this.sendShake();
  },

  ensureBleReceiver() {
    try {
      ble.createConnect((index, data, size) => {
        this.handleBleMessage(data, size);
      });
      backgroundLog('BLE_RECEIVER_READY', { owner: 'app_service', port: this.state.appSidePort });
    } catch (e) {
      backgroundLog('BLE_RECEIVER_ERROR', errorDetails(e));
    }
  },

  handleNotificationAction(params) {
    const raw = typeof params === 'string' ? params : (params && params.param ? String(params.param) : '');
    const match = /(?:^|[?&])action=snooze(?:&|$)/.test(raw) && raw.match(/(?:^|[?&])minutes=(15|30|60)(?:&|$)/);
    if (!match) return false;
    const until = setAlertSnooze(Number(match[1]));
    if (until) backgroundLog('SNOOZE_ACTION', { minutes: Number(match[1]), until: until });
    return !!until;
  },

  debugSettings(s) {
    return { veryLow: s.veryLow, low: s.low, high: s.high, veryHigh: s.veryHigh,
      backgroundInterval: s.backgroundInterval, outOfRangeVibration: s.outOfRangeVibration,
      criticalVibration: s.criticalVibration, unit: s.unit, urlConfigured: !!s.apiUrl };
  },

  getPendingResponse() {
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_RESPONSE_KEY) || 'null');
      return pending && pending.cycle && Number(pending.since) ? pending : null;
    } catch (e) {
      localStorage.removeItem(PENDING_RESPONSE_KEY);
      return null;
    }
  },

  clearPendingResponse(cycle) {
    const pending = this.getPendingResponse();
    if (pending && (!cycle || pending.cycle === cycle)) {
      localStorage.removeItem(PENDING_RESPONSE_KEY);
      this.state.pendingSince = 0;
      return true;
    }
    return false;
  },

  consumeBleMailbox() {
    try {
      const mailbox = JSON.parse(localStorage.getItem('zightscout_ble_mailbox') || 'null');
      if (!mailbox || !Array.isArray(mailbox.bytes) || !(Number(mailbox.timestamp) > this.state.lastMailboxTimestamp)) return false;
      this.state.lastMailboxTimestamp = Number(mailbox.timestamp);
      const bytes = Uint8Array.from(mailbox.bytes);
      trace('BLE_MAILBOX_CONSUMED', { bytes: bytes.length, timestamp: this.state.lastMailboxTimestamp });
      this.handleBleMessage(bytes.buffer, bytes.length);
      return true;
    } catch (e) { backgroundLog('BLE_MAILBOX_ERROR', errorDetails(e)); return false; }
  },

  runCycle(trigger) {
    this.consumeBleMailbox();
    const now = Date.now();
    const s = loadSettings();
    backgroundLog('WAKE', { trigger: trigger, cycle: this.state.cycle, settings: this.debugSettings(s) });
    if (!(s.backgroundInterval > 0)) {
      cancelPollAlarm();
      backgroundLog('DISABLED', { reason: 'OFF' });
      exit();
      return;
    }
    localStorage.setItem('zightscout_service_heartbeat', String(now));
    consumePollAlarm();
    this.ensureBleReceiver();
    const pending = this.getPendingResponse();
    if (pending && now - pending.since >= RESPONSE_TIMEOUT_MS) {
      backgroundLog('FETCH_TIMEOUT', { cycle: pending.cycle });
      this.clearPendingResponse(pending.cycle);
      this.state.appSidePort = 0;
    }
    this.flushCommands();
    let last = Number(localStorage.getItem(LAST_REQUEST_KEY));
    if (!last || last > now) {
      localStorage.setItem(LAST_REQUEST_KEY, String(now));
      last = now;
    }
    const manualAt = Number(localStorage.getItem(MANUAL_REFRESH_KEY));
    const manualRefresh = manualAt > 0 && now - manualAt < 120000;
    if (!this.state.pendingSince && (manualRefresh || now - last >= s.backgroundInterval * 60000)) this.fetchData(manualRefresh);
    const awaitingResponse = !!this.getPendingResponse();
    const next = schedulePoll(s, (this.state.waitingForPort || !s.apiUrl) ? now + 60000 :
      (awaitingResponse ? now + RESPONSE_WAKE_INTERVAL_MS : undefined));
    backgroundLog('NEXT_POLL', { cycle: this.state.cycle, at: next, intervalMinutes: s.backgroundInterval });
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
      const result = ble.send(buf, buf.byteLength);
      trace('BLE_SEND', { bytes: buf.byteLength, result: String(result), port: this.state.appSidePort });
      return result !== false;
    } catch (e) { backgroundLog('BLE_SEND_FAILED', { error: String(e) }); return false; }
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
      return ble.send(buf, buf.byteLength) !== false;
    } catch (e) { backgroundLog('BLE_SEND_FAILED', { error: String(e) }); return false; }
  },

  flushCommands() {
    const raw = localStorage.getItem('zightscout_commands');
    trace('COMMAND_QUEUE_CHECK', { queued: !!raw, port: this.state.appSidePort });
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (!queue.length) return;
    if (!this.state.appSidePort) { this.sendShake(); return; }
    localStorage.removeItem('zightscout_commands');
    trace('COMMAND_QUEUE_FLUSH', { count: queue.length, port: this.state.appSidePort });
    for (let i = 0; i < queue.length; i++) {
      const bytes = new Uint8Array(queue[i]);
      new DataView(bytes.buffer).setUint16(6, this.state.appSidePort, true);
      try { const result = ble.send(bytes.buffer, bytes.length); trace('COMMAND_BLE_SEND', { bytes: bytes.length, result: String(result), port: this.state.appSidePort }); }
      catch (e) { backgroundLog('COMMAND_FAILED', { error: String(e) }); }
    }
  },

  fetchData(force) {
    const s = loadSettings();
    if (!(s.backgroundInterval > 0) || this.state.pendingSince) return;
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_REQUEST_KEY));
    if (!force && last && now - last < s.backgroundInterval * 60000) return;
    if (!s.apiUrl) { backgroundLog('FETCH_SKIPPED', { reason: 'URL_NOT_CONFIGURED' }); return; }
    if (!this.state.appSidePort) {
      const storedPort = Number(localStorage.getItem('zightscout_ble_port'));
      if (storedPort > 0) this.state.appSidePort = storedPort;
    }
    if (!this.state.appSidePort) {
      this.state.waitingForPort = true;
      backgroundLog('WAITING_BLE');
      this.sendShake();
      return;
    }
    this.state.waitingForPort = false;
    this.state.cycle = String(now);
    this.state.pendingSince = now;
    backgroundLog('FETCH_SENT', { cycle: this.state.cycle, settings: this.debugSettings(s) });
    if (this.sendDataMessage({ type: 'FETCH_DATA', apiUrl: s.apiUrl, backgroundCycle: this.state.cycle })) {
      localStorage.setItem(LAST_REQUEST_KEY, String(now));
      localStorage.setItem(PENDING_RESPONSE_KEY, JSON.stringify({ cycle: this.state.cycle, since: now }));
      if (force) localStorage.removeItem(MANUAL_REFRESH_KEY);
      schedulePoll(s, now + RESPONSE_WAKE_INTERVAL_MS);
    } else {
      this.state.pendingSince = 0;
      this.state.appSidePort = 0;
      this.state.waitingForPort = true;
    }
  },

  onEvent(params) { if (!this.handleNotificationAction(params)) this.runCycle(params || 'event'); },

  handleBleMessage(data, size) {
    try {
      if (!data) return;
      const bytes = new Uint8Array(data.buffer || data, data.byteOffset || 0, size || data.byteLength);
      trace('BLE_RECEIVE', { bytes: bytes.length, pendingSince: this.state.pendingSince, cycle: this.state.cycle });
      const framed = bytes.length >= 16 && bytes[0] === 1 && bytes[1] === 1;
      if (framed) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
        const type = view.getUint16(2, true);
        if (type === 1) {
          this.state.appSidePort = view.getUint16(6, true);
          localStorage.setItem('zightscout_ble_port', String(this.state.appSidePort));
          localStorage.setItem('zightscout_ble_last_contact', String(Date.now()));
          trace('BLE_HANDSHAKE', { port: this.state.appSidePort });
          this.flushCommands();
          // A manual refresh can require this handshake first. Preserve its
          // force flag here; otherwise fetchData() sees the normal interval as
          // not due and the tap never reaches the phone/HTTP request.
          const manualAt = Number(localStorage.getItem(MANUAL_REFRESH_KEY));
          this.fetchData(manualAt > 0 && Date.now() - manualAt < 120000);
          return;
        }
        if (type === 2) {
          this.state.appSidePort = 0;
          localStorage.setItem('zightscout_ble_last_disconnect', String(Date.now()));
          this.sendShake();
          return;
        }
      }
      const parsed = JSON.parse(buf2str(bytes.subarray(framed ? 16 : 0)));
      trace('BLE_RESPONSE_PARSED', { type: parsed.type, keys: Object.keys(parsed.data || {}), currentBG: parsed.data && parsed.data.currentBG, cycle: parsed.data && parsed.data.backgroundCycle });
      localStorage.setItem('zightscout_response', JSON.stringify({
        timestamp: Date.now(), sequence: ++this.state.responseSequence, bytes: Array.from(bytes)
      }));
      if (parsed && parsed.data) {
        const reading = parsed.data;
        if (reading.backgroundCycle && this.clearPendingResponse(reading.backgroundCycle)) {
          backgroundLog('FETCH_RESPONSE', { cycle: reading.backgroundCycle, currentBG: reading.currentBG || '' });
        }
        if (reading.error) {
          localStorage.setItem('zightscout_last_fetch_error', JSON.stringify({ timestamp: Date.now(), message: String(reading.message || 'Falha ao consultar o Nightscout') }));
          backgroundLog('FETCH_ERROR', { cycle: reading.backgroundCycle || 'foreground', message: reading.message });
        } else if (reading.currentBG || (reading.sgv !== undefined && reading.sgv !== null)) {
          const receivedAt = Date.now();
          const currentBG = String(reading.currentBG || reading.sgv);
          const normalizedReading = { ...reading, currentBG: currentBG, receivedAt: receivedAt };
          localStorage.setItem('zightscout_last_data', JSON.stringify(normalizedReading));
          localStorage.setItem('zightscout_last_fetch_at', String(receivedAt));
          localStorage.removeItem('zightscout_last_fetch_error');
          this.processBackgroundReading(normalizedReading);
        }
      }
    } catch (e) { backgroundLog('RESPONSE_ERROR', errorDetails(e)); }
  },

  processBackgroundReading(data) {
    processBackgroundReading(data);
  },

  onDestroy() {
    const s = loadSettings();
    backgroundLog('SERVICE_DESTROYED', { intervalMinutes: s.backgroundInterval, monitoringEnabled: s.backgroundInterval > 0 });
    localStorage.removeItem('zightscout_service_heartbeat');
    if (this.state.timeSensor && typeof this.state.timeSensor.offPerMinute === 'function') this.state.timeSensor.offPerMinute(this._minuteCallback);
    try { ble.disConnect(); } catch (e) { backgroundLog('BLE_RECEIVER_CLOSE_ERROR', errorDetails(e)); }
    // Preserve a short wake-up while an asynchronous phone response is in flight.
    const pending = this.getPendingResponse();
    schedulePoll(s, pending ? Date.now() + RESPONSE_WAKE_INTERVAL_MS : undefined);
  }
});
