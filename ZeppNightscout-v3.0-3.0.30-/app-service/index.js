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
import { loadServiceState, saveServiceState, resetServiceState } from '../shared/serviceState';
import { set as setAlarm, REPEAT_ONCE } from '@zos/alarm';

const APP_ID = 1127422;
const RESPONSE_WAKE_INTERVAL_MS = 15000;
const RESPONSE_TIMEOUT_MS = 60000;
const CRITICAL_AFTER_MS = 1800000;
const ALERT_SERVICE_FILE = 'app-service/alert-service';
const CONNECTION = { IDLE: 'IDLE', FETCHING: 'FETCHING', RETRY_PENDING: 'RETRY_PENDING', CRITICAL_FAILURE: 'CRITICAL_FAILURE' };
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
  state: { appSidePort: 0, timeSensor: null, pendingSince: 0, cycle: '', responseSequence: 0, lastMailboxTimestamp: 0, retryTimer: null, retry: null, connectionState: CONNECTION.IDLE },

  onInit(params) {
    setDebugContext('service');
    trace('LIFECYCLE_INIT');
    try { trace('RUNTIME_PACKAGE', { package: getPackageInfo() }); } catch (e) { trace('RUNTIME_PACKAGE_ERROR', errorDetails(e)); }
    const settings = loadSettings();
    this.state.retry = loadServiceState();
    this.state.connectionState = this.state.retry.criticalNotifiedAt ? CONNECTION.CRITICAL_FAILURE : (this.state.retry.retryCount ? CONNECTION.RETRY_PENDING : CONNECTION.IDLE);
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
    this._minuteCallback = () => this.runCycle('minute', false);
    this.state.timeSensor.onPerMinute(this._minuteCallback);
    if (this.state.retry.nextRetryAt > Date.now()) this.armRetryTimer(this.state.retry.nextRetryAt - Date.now());
    this.runCycle(params || 'start', false);
    this.sendShake();
  },

  ensureBleReceiver() {
    try {
      if (typeof ble.createConnect !== 'function') throw new Error('ble.createConnect unavailable');
      ble.createConnect((index, data, size) => {
        this.handleBleMessage(data, size);
      });
      backgroundLog('BLE_RECEIVER_READY', { owner: 'app_service', port: this.state.appSidePort });
    } catch (e) {
      backgroundLog('BLE_RECEIVER_ERROR', errorDetails(e));
    }
  },

  persistRetry() { this.state.retry = saveServiceState(this.state.retry); },

  failureDelta(now) { return this.state.retry.lastSuccessTimestamp > 0 ? Math.max(0, now - this.state.retry.lastSuccessTimestamp) : 0; },

  setConnectionState(next, reason) {
    this.state.connectionState = next;
    this.persistRetry();
    backgroundLog('CONNECTION_STATE', { timestamp: Date.now(), state: next, reason: reason, retryCount: this.state.retry.retryCount, deltaTime: this.failureDelta(Date.now()) });
  },

  retryDelay(count) {
    const base = count === 1 ? 5000 : count === 2 ? 15000 : 30000;
    return Math.max(1000, base + Math.floor(Math.random() * 4001) - 2000);
  },

  clearRetryTimer() {
    if (this.state.retryTimer) { clearTimeout(this.state.retryTimer); this.state.retryTimer = null; }
  },

  armRetryTimer(delay) {
    this.clearRetryTimer();
    const wait = Math.max(1000, Number(delay) || 1000);
    this.state.retryTimer = setTimeout(() => { this.state.retryTimer = null; this.runCycle('retry-timer', true); }, wait);
    backgroundLog('RETRY_TIMER_ARMED', { timestamp: Date.now(), state: this.state.connectionState, retryCount: this.state.retry.retryCount, delayMs: wait, deltaTime: this.failureDelta(Date.now()) });
  },

  queueCriticalAlert(minutes) {
    try {
      if (typeof setAlarm !== 'function') throw new Error('alarm.set unavailable');
      const id = setAlarm({ url: ALERT_SERVICE_FILE, time: Math.ceil((Date.now() + 1000) / 1000), repeat_type: REPEAT_ONCE, param: JSON.stringify({ type: 'CONNECTION_LOST', minutes: minutes }), store: true });
      backgroundLog('CONNECTION_LOST_ALERT_QUEUED', { alarmId: id, minutes: minutes });
    } catch (e) { backgroundLog('CONNECTION_LOST_ALERT_ERROR', { error: String(e), minutes: minutes }); }
  },

  registerFailure(reason) {
    const now = Date.now();
    if (!(this.state.retry.lastSuccessTimestamp > 0)) this.state.retry.lastSuccessTimestamp = now;
    this.state.retry.retryCount += 1;
    const delta = this.failureDelta(now);
    if (delta >= CRITICAL_AFTER_MS && !this.state.retry.criticalNotifiedAt) {
      this.state.retry.criticalNotifiedAt = now;
      this.setConnectionState(CONNECTION.CRITICAL_FAILURE, reason);
      this.queueCriticalAlert(Math.floor(delta / 60000));
    } else if (this.state.connectionState !== CONNECTION.CRITICAL_FAILURE) this.setConnectionState(CONNECTION.RETRY_PENDING, reason);
    const delay = this.retryDelay(this.state.retry.retryCount);
    this.state.retry.nextRetryAt = now + delay;
    this.persistRetry();
    backgroundLog('FETCH_FAILURE', { timestamp: now, state: this.state.connectionState, reason: reason, retryCount: this.state.retry.retryCount, delayMs: delay, nextRetryAt: this.state.retry.nextRetryAt, deltaTime: delta });
    this.armRetryTimer(delay);
    schedulePoll(loadSettings(), this.state.retry.nextRetryAt);
  },

  registerSuccess(reading) {
    this.clearRetryTimer();
    this.state.retry = resetServiceState(Date.now());
    this.setConnectionState(CONNECTION.IDLE, 'response-success');
    backgroundLog('FETCH_SUCCESS', { timestamp: Date.now(), state: CONNECTION.IDLE, retryCount: 0, deltaTime: 0, currentBG: reading.currentBG });
  },

  handleNotificationAction(params) {
    let raw = '';
    if (typeof params === 'string') raw = params;
    else if (params && typeof params === 'object') raw = params.param ? String(params.param) : JSON.stringify(params);
    const match = /(?:action=snooze|"action":"snooze").*?(?:minutes=(\d+)|"minutes":(\d+))/.exec(raw) ||
                  /(?:minutes=(\d+)|"minutes":(\d+)).*?(?:action=snooze|"action":"snooze")/.exec(raw);
    if (!match) return false;
    const mins = Number(match[1] || match[2]);
    const until = setAlertSnooze(mins);
    if (until) backgroundLog('SNOOZE_ACTION', { minutes: mins, until: until });
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

  runCycle(trigger, retryDue) {
    this.consumeBleMailbox();
    const now = Date.now();
    const s = loadSettings();
    backgroundLog('WAKE', { timestamp: now, trigger: trigger, cycle: this.state.cycle, state: this.state.connectionState, retryCount: this.state.retry.retryCount, deltaTime: this.failureDelta(now), settings: this.debugSettings(s) });
    if (!(s.backgroundInterval > 0)) { this.clearRetryTimer(); cancelPollAlarm(); backgroundLog('DISABLED', { reason: 'OFF' }); exit(); return; }
    localStorage.setItem('zightscout_service_heartbeat', String(now));
    consumePollAlarm();
    this.ensureBleReceiver();
    const pending = this.getPendingResponse();
    if (pending && now - pending.since >= RESPONSE_TIMEOUT_MS) {
      backgroundLog('FETCH_TIMEOUT', { cycle: pending.cycle });
      this.clearPendingResponse(pending.cycle);
      this.state.appSidePort = 0;
      this.registerFailure('response-timeout');
      return;
    }
    this.flushCommands();
    const retryNow = retryDue || (this.state.retry.nextRetryAt > 0 && now >= this.state.retry.nextRetryAt);
    if (this.state.retry.nextRetryAt > now && !retryNow) { this.armRetryTimer(this.state.retry.nextRetryAt - now); schedulePoll(s, this.state.retry.nextRetryAt); return; }
    if (retryNow && this.state.retry.nextRetryAt > now) { this.armRetryTimer(this.state.retry.nextRetryAt - now); return; }
    let last = Number(localStorage.getItem(LAST_REQUEST_KEY));
    if (!last || last > now) { localStorage.setItem(LAST_REQUEST_KEY, String(now)); last = now; }
    const manualAt = Number(localStorage.getItem(MANUAL_REFRESH_KEY));
    const manualRefresh = manualAt > 0 && now - manualAt < 120000;
    if (!this.state.pendingSince && (retryNow || manualRefresh || now - last >= s.backgroundInterval * 60000)) this.fetchData(retryNow || manualRefresh);
    const next = this.state.retry.nextRetryAt || schedulePoll(s, (this.state.waitingForPort || !s.apiUrl) ? now + 60000 : (this.state.pendingSince ? now + RESPONSE_WAKE_INTERVAL_MS : undefined));
    backgroundLog('NEXT_POLL', { cycle: this.state.cycle, at: next, intervalMinutes: s.backgroundInterval, state: this.state.connectionState, retryCount: this.state.retry.retryCount });
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
      if (typeof ble.send !== 'function') throw new Error('ble.send unavailable');
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
      if (typeof ble.send !== 'function') throw new Error('ble.send unavailable');
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
    if (!this.state.appSidePort) { const storedPort = Number(localStorage.getItem('zightscout_ble_port')); if (storedPort > 0) this.state.appSidePort = storedPort; }
    if (!this.state.appSidePort) { this.state.waitingForPort = true; this.sendShake(); this.registerFailure('ble-port-unavailable'); return; }
    this.state.waitingForPort = false;
    this.state.cycle = String(now);
    this.state.pendingSince = now;
    this.setConnectionState(CONNECTION.FETCHING, 'fetch-sent');
    backgroundLog('FETCH_SENT', { cycle: this.state.cycle, settings: this.debugSettings(s) });
    if (this.sendDataMessage({ type: 'FETCH_DATA', apiUrl: s.apiUrl, backgroundCycle: this.state.cycle })) {
      localStorage.setItem(LAST_REQUEST_KEY, String(now));
      localStorage.setItem(PENDING_RESPONSE_KEY, JSON.stringify({ cycle: this.state.cycle, since: now }));
      if (force) localStorage.removeItem(MANUAL_REFRESH_KEY);
      schedulePoll(s, now + RESPONSE_WAKE_INTERVAL_MS);
    } else { this.state.pendingSince = 0; this.state.appSidePort = 0; this.state.waitingForPort = true; this.registerFailure('ble-send-failed'); }
  },

  onEvent(params) { if (!this.handleNotificationAction(params)) this.runCycle(params || 'event', false); },

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
          this.registerFailure('ble-disconnect');
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
          if (reading.backgroundCycle) this.registerFailure('phone-http-error');
        } else if (reading.currentBG || (reading.sgv !== undefined && reading.sgv !== null)) {
          const receivedAt = Date.now();
          const currentBG = String(reading.currentBG || reading.sgv);
          const normalizedReading = { ...reading, currentBG: currentBG, receivedAt: receivedAt };
          localStorage.setItem('zightscout_last_data', JSON.stringify(normalizedReading));
          localStorage.setItem('zightscout_last_fetch_at', String(receivedAt));
          localStorage.removeItem('zightscout_last_fetch_error');
          if (reading.backgroundCycle) this.registerSuccess(normalizedReading);
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
    this.clearRetryTimer();
    localStorage.removeItem('zightscout_service_heartbeat');
    if (this.state.timeSensor && typeof this.state.timeSensor.offPerMinute === 'function') this.state.timeSensor.offPerMinute(this._minuteCallback);
    try { if (typeof ble.disConnect === 'function') ble.disConnect(); } catch (e) { backgroundLog('BLE_RECEIVER_CLOSE_ERROR', errorDetails(e)); }
    // Preserve a short wake-up while an asynchronous phone response is in flight.
    const pending = this.getPendingResponse();
    schedulePoll(s, this.state.retry && this.state.retry.nextRetryAt > Date.now() ? this.state.retry.nextRetryAt : (pending ? Date.now() + RESPONSE_WAKE_INTERVAL_MS : undefined));
  }
});
