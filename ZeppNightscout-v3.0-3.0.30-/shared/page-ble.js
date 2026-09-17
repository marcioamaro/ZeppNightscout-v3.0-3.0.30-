import { trace } from './debug';
// The visible page owns BLE while it is open so a manual refresh receives its
// real phone response. AppService retakes BLE after page destruction.
import * as nativeBle from '@zos/ble';
import { localStorage } from './storage';
import { set, REPEAT_ONCE } from '@zos/alarm';
import { loadSettings } from './settings';
import { SERVICE_FILE, syncBackground as syncService, requestBackgroundRefresh } from './background';

let callback = null;
let timer = null;
let nativeMode = false;
let lastResponse = '';
let serviceStopping = false;

function enabled() { return Number(loadSettings().backgroundInterval) > 0; }

function deliverShake() {
  const packet = new ArrayBuffer(17);
  const view = new DataView(packet);
  view.setUint8(0, 1); view.setUint8(1, 1);
  view.setUint16(2, 1, true); view.setUint16(6, 20, true);
  if (callback) callback(0, packet, packet.byteLength);
}

export function syncBackground(settings) {
  if (Number(settings.backgroundInterval) > 0) {
    // Do not disconnect the visible page: its foreground request must retain
    // the phone-side port and deliver the response directly to UI.
    syncService(settings);
  } else {
    serviceStopping = true;
    syncService(settings, () => { serviceStopping = false; });
  }
}

export function createConnect(listener) {
  callback = listener;
  if (timer) clearInterval(timer);
  lastResponse = localStorage.getItem('zightscout_response') || '';
  nativeMode = !serviceStopping;
  if (nativeMode) nativeBle.createConnect(listener);
  timer = setInterval(() => {
    const raw = localStorage.getItem('zightscout_response');
    if (raw && raw !== lastResponse && callback) {
      lastResponse = raw;
      try {
        const response = JSON.parse(raw);
        const bytes = new Uint8Array(response.bytes);
        trace('UI_RESPONSE_DELIVER', { bytes: bytes.length, responseTimestamp: response.timestamp });
        callback(0, bytes.buffer, bytes.length);
      } catch (e) { console.log('[PAGE] Response delivery failed', e); }
    }
  }, 200);
}

export function send(buffer, size) {
  if (serviceStopping) { setTimeout(() => { if (callback) send(buffer, size); }, 50); return true; }
  if (!nativeMode) { nativeBle.createConnect(callback); nativeMode = true; }
  // Foreground fetch is sent directly. The caller receives the actual response
  // through its callback, rather than treating a scheduled wake as success.
  const result = nativeBle.send(buffer, size);
  trace("UI_BLE_SEND_DIRECT", { bytes: size || buffer.byteLength, result: String(result) });
  return result;
}

export function disConnect() {
  if (timer) clearInterval(timer);
  timer = null;
  callback = null;
  if (nativeMode) nativeBle.disConnect();
  nativeMode = false;
}
