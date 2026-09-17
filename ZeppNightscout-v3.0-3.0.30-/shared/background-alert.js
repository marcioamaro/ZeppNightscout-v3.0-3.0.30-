import { localStorage } from './storage';
import { notify } from '@zos/notification';
import { triggerVibration } from './vibrator';
import { loadSettings, getBGStatus } from './settings';
import { scheduleAlertRepeats, cancelAlertRepeats } from './alert-repeat';
export const SNOOZE_UNTIL_KEY = 'zightscout_alert_snooze_until';

export function getSnoozeUntil() {
  const until = Number(localStorage.getItem(SNOOZE_UNTIL_KEY));
  if (!(until > Date.now())) {
    if (until) localStorage.removeItem(SNOOZE_UNTIL_KEY);
    return 0;
  }
  return until;
}

export function setAlertSnooze(minutes) {
  const duration = Number(minutes);
  if ([15, 30, 60].indexOf(duration) === -1) return 0;
  const until = Date.now() + duration * 60000;
  localStorage.setItem(SNOOZE_UNTIL_KEY, String(until));
  cancelAlertRepeats();
  backgroundLog('SNOOZE_SET', { minutes: duration, until: until });
  return until;
}

import { backgroundLog } from './background-log';
export function clearAlertSnooze() {
  localStorage.removeItem(SNOOZE_UNTIL_KEY);
  backgroundLog('SNOOZE_CLEARED');
}


function debugSettings(s) {
    return { veryLow: s.veryLow, low: s.low, high: s.high, veryHigh: s.veryHigh,
      backgroundInterval: s.backgroundInterval, outOfRangeVibration: s.outOfRangeVibration,
      criticalVibration: s.criticalVibration, unit: s.unit, urlConfigured: !!s.apiUrl };
}
export function processBackgroundReading(data) {
    const s = loadSettings();
    const value = Number(data.currentBG);
    const cycle = data.backgroundCycle || 'foreground';
    backgroundLog('GLUCOSE_RECEIVED', { cycle: cycle, glucose: data.currentBG,
      readingTimestamp: data.readingTimestamp, settings: debugSettings(s) });
    if (!(s.backgroundInterval > 0) || !isFinite(value) || value <= 0) {
      if (!(s.backgroundInterval > 0)) cancelAlertRepeats();
      backgroundLog('ALERT_SKIPPED', { cycle: cycle, reason: s.backgroundInterval > 0 ? 'INVALID_READING' : 'OFF' });
      return;
    }
    const readingTime = Number(data.readingTimestamp) || Date.parse(data.readingTimestamp || '') || 0;
    const staleAfterMs = Math.max(10, Number(s.backgroundInterval) * 2) * 60000;
    if (readingTime && Date.now() - readingTime >= staleAfterMs) {
      backgroundLog('STALE_READING', { cycle: cycle, glucose: value, ageMinutes: Math.floor((Date.now() - readingTime) / 60000) });
      cancelAlertRepeats(false);
      return;
    }
    const snoozeUntil = getSnoozeUntil();
    if (snoozeUntil) {
      backgroundLog('ALERT_SKIPPED', { cycle: cycle, glucose: value, reason: 'SNOOZED', snoozeUntil: snoozeUntil });
      return;
    }

    localStorage.setItem('lastBgExecution', String(Date.now()));
    const level = value < s.veryLow || value > s.veryHigh ? 'critical' :
      (value < s.low || value > s.high ? 'warning' : 'normal');
    const enabled = level === 'critical' ? s.criticalVibration : level === 'warning' && s.outOfRangeVibration;
    // One compact record makes the actual alert decision auditable in bridge logs.
    backgroundLog('ALERT_EVALUATE', { cycle: cycle, glucose: value, level: level, enabled: !!enabled,
      readingAgeMinutes: readingTime ? Math.floor((Date.now() - readingTime) / 60000) : -1, settings: debugSettings(s) });
    if (level !== 'critical' || !enabled) cancelAlertRepeats(false);
    if (!enabled) {
      backgroundLog('ALERT_SKIPPED', { cycle: cycle, glucose: value, level: level,
        reason: level === 'normal' ? 'IN_TARGET' : 'VIBRATION_DISABLED' });
      return;
    }
    const key = String(data.readingTimestamp || cycle) + ':' + value + ':' + level;
    if (localStorage.getItem('zightscout_notified_reading') === key) {
      backgroundLog('ALERT_SKIPPED', { cycle: cycle, reason: 'READING_ALREADY_NOTIFIED' });
      return;
    }
    backgroundLog('ALERT_MATCH', { cycle: cycle, glucose: value, level: level });
    triggerVibration(level);
    const trend = data.trend || data.directionArrow || '';
    const delta = data.delta && data.delta !== '--' ? ' ' + data.delta : '';
    const detail = (trend ? ' ' + trend : '') + delta;

    let id = 0;
    try {
      const options = { title: level === 'critical' ? 'Glicemia Critica' : 'Glicemia Fora do Alvo',
        content: value + ' mg/dL' + detail + ' - ' + getBGStatus(value, s), vibrate: level === 'critical' ? 5 : 4,
        actions: [
          { text: '15 min', file: 'page/page2', param: 'action=snooze&minutes=15&tab=alerts' },
          { text: '30 min', file: 'page/page2', param: 'action=snooze&minutes=30&tab=alerts' },
          { text: '60 min', file: 'page/page2', param: 'action=snooze&minutes=60&tab=alerts' },
          { text: 'Abrir', file: 'page/index', param: 'alert=' + level + '&sgv=' + value }
        ] };
      id = notify(options);
      if (typeof id === 'number' && id > 0 && level === 'critical') scheduleAlertRepeats(options, key, false);
    } catch (e) { backgroundLog('NOTIFY_ERROR', { cycle: cycle, error: String(e) }); }
    const accepted = typeof id === 'number' && id > 0;
    backgroundLog(accepted ? 'NOTIFY_ACCEPTED' : 'NOTIFY_FAILED', { cycle: cycle, glucose: value, level: level, notificationId: id });
    if (accepted) {
      localStorage.setItem('zightscout_notified_reading', key);
    }
}
