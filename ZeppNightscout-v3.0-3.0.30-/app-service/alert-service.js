import { Vibrator, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor';
import { notify } from '@zos/notification';
import { processBackgroundReading } from '../shared/background-alert';
import { backgroundLog } from '../shared/background-log';
import { handleAlertRepeat } from '../shared/alert-repeat';

function parseParams(params) {
  try { return JSON.parse(params || '{}'); }
  catch (e) {
    const data = {};
    String(params || '').split('&').forEach(pair => { const parts = pair.split('='); data[parts[0]] = decodeURIComponent(parts.slice(1).join('=')); });
    return data;
  }
}

function connectionLost(data) {
  const minutes = Math.max(30, Number(data.minutes) || 30);
  try { new Vibrator().start({ mode: VIBRATOR_SCENE_STRONG_REMINDER }); }
  catch (e) { backgroundLog('CONNECTION_LOST_VIBRATE_ERROR', { error: String(e) }); }
  let id = 0;
  try {
    id = notify({ title: '⚠️ ZightScout Offline', content: 'Sem dados há ' + minutes + ' min. Verifique Bluetooth/Zeppe App', priority: 'high', sound: true, vibrate: 5 });
  } catch (e) { backgroundLog('CONNECTION_LOST_NOTIFY_ERROR', { error: String(e), minutes: minutes }); }
  backgroundLog(typeof id === 'number' && id > 0 ? 'CONNECTION_LOST_NOTIFY_ACCEPTED' : 'CONNECTION_LOST_NOTIFY_FAILED', { minutes: minutes, notificationId: id });
}

function handle(params) {
  try {
    const data = parseParams(params);
    backgroundLog('ALERT_SERVICE_WAKE', { type: data.type || data.action || '' });
    if (data.type === 'CONNECTION_LOST') { connectionLost(data); return; }
    if (data.action === 'critical-repeat') { handleAlertRepeat(data); return; }
    processBackgroundReading({ ...data, currentBG: data.currentBG || data.sgv });
  } catch (e) { backgroundLog('ALERT_SERVICE_ERROR', { error: String(e) }); }
}
AppService({ onInit: handle, onEvent: handle });
