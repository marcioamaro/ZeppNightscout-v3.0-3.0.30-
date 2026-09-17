import { processBackgroundReading } from '../shared/background-alert';
import { backgroundLog } from '../shared/background-log';
import { handleAlertRepeat } from '../shared/alert-repeat';

function handle(params) {
  try {
    let data;
    try { data = JSON.parse(params || '{}'); }
    catch (e) {
      data = {};
      String(params || '').split('&').forEach(pair => {
        const parts = pair.split('=');
        data[parts[0]] = decodeURIComponent(parts.slice(1).join('='));
      });
    }
    backgroundLog('ALERT_SERVICE_WAKE');
    if (data.action === 'critical-repeat') { handleAlertRepeat(data); return; }
    processBackgroundReading({ ...data, currentBG: data.currentBG || data.sgv });
  } catch (e) { backgroundLog('ALERT_SERVICE_ERROR', { error: String(e) }); }
}
AppService({ onInit: handle, onEvent: handle });
