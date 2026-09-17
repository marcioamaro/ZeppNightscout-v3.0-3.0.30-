import { set, cancel, REPEAT_ONCE } from '@zos/alarm';
import { notify } from '@zos/notification';
import { localStorage } from './storage';
import { loadSettings } from './settings';
import { backgroundLog } from './background-log';
import { triggerVibration } from './vibrator';

const REAL_KEY = 'zightscout_critical_repeat';
const TEST_KEY = 'zightscout_test_repeat';
function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

export function cancelAlertRepeats(testOnly) {
  const keys = testOnly === true ? [TEST_KEY] : testOnly === false ? [REAL_KEY] : [REAL_KEY, TEST_KEY];
  keys.forEach(key => {
    const state = read(key);
    // Invalidate first: a racing wake cannot deliver an old sequence.
    localStorage.removeItem(key);
    if (state && state.alarmId > 0) {
      try { cancel(state.alarmId); } catch (e) { backgroundLog('REPEAT_CANCEL_ERROR', { error: String(e) }); }
    }
  });
}

function schedule(state, key) {
  const due = Math.ceil((Date.now() + 5000) / 1000);
  const alarmId = set({ url: 'app-service/alert-service', time: due,
    repeat_type: REPEAT_ONCE, store: true,
    param: JSON.stringify({ action: 'critical-repeat', test: state.test, token: state.token, step: state.step }) });
  if (!(alarmId > 0)) { localStorage.removeItem(key); backgroundLog('REPEAT_SCHEDULE_FAILED'); return false; }
  state.alarmId = alarmId;
  localStorage.setItem(key, JSON.stringify(state));
  backgroundLog('REPEAT_SCHEDULED', { test: state.test, step: state.step, at: due * 1000 });
  return true;
}

export function scheduleAlertRepeats(options, readingKey, test) {
  const isTest = test === true;
  cancelAlertRepeats(isTest);
  try {
    return schedule({ options: options, readingKey: readingKey, test: isTest,
      token: String(Date.now()) + ':' + String(readingKey), step: 2, expires: Date.now() + 20000 }, isTest ? TEST_KEY : REAL_KEY);
  } catch (e) { backgroundLog('REPEAT_SCHEDULE_ERROR', { error: String(e) }); return false; }
}

export function handleAlertRepeat(data) {
  const key = data.test === true ? TEST_KEY : REAL_KEY;
  const state = read(key);
  if (!state || state.token !== data.token || state.step !== data.step) return false;
  const settings = loadSettings();
  const blocked = Date.now() > state.expires || (!state.test && (
    !(settings.backgroundInterval > 0) || !settings.criticalVibration ||
    Number(localStorage.getItem('zightscout_alert_snooze_until')) > Date.now() ||
    localStorage.getItem('zightscout_notified_reading') !== state.readingKey));
  if (blocked) { cancelAlertRepeats(state.test); return false; }
  localStorage.removeItem(key);
  try {
    triggerVibration('critical');
    const notificationId = notify({ ...state.options, title: state.options.title + ' (' + state.step + '/3)' });
    backgroundLog('REPEAT_NOTIFY_RESULT', { step: state.step, test: state.test, notificationId: notificationId });
    if (typeof notificationId !== 'number' || notificationId <= 0) return false;
    if (state.step < 3) { state.step++; schedule(state, key); }
    return true;
  } catch (e) { backgroundLog('REPEAT_NOTIFY_ERROR', { error: String(e) }); return false; }
}
