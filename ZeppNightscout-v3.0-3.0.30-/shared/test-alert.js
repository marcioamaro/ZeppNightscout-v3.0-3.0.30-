import { notify } from '@zos/notification';
import { backgroundLog } from './background-log';
import { scheduleAlertRepeats, cancelAlertRepeats } from './alert-repeat';
import { triggerVibration } from './vibrator';

// Does not change glucose readings, snooze, or real-alert deduplication.
export function testAlertNotification(level, vibratorInstance) {
  if (level !== 'warning' && level !== 'critical') return false;
  try {
    cancelAlertRepeats(true);
    triggerVibration(level, vibratorInstance);
    const options = {
      title: level === 'critical' ? 'TESTE - Vermelho' : 'TESTE - Amarelo',
      content: 'Teste de vibracao e notificacao.',
      vibrate: level === 'critical' ? 5 : 4,
      actions: [
        { text: '15 min', file: 'page/page2', param: 'action=snooze&minutes=15&tab=alerts' },
        { text: '30 min', file: 'page/page2', param: 'action=snooze&minutes=30&tab=alerts' },
        { text: '60 min', file: 'page/page2', param: 'action=snooze&minutes=60&tab=alerts' },
        { text: 'Abrir', file: 'page/index', param: 'alert=' + level }
      ]
    };
    const id = notify(options);
    const accepted = typeof id === 'number' && id > 0;
    backgroundLog('TEST_NOTIFY_RESULT', { level: level, notificationId: id, accepted: accepted });
    if (accepted) {
      if (level === 'critical') scheduleAlertRepeats(options, 'manual', true);
    }
    return accepted;
  } catch (e) {
    backgroundLog('TEST_NOTIFY_ERROR', { error: String(e) });
    return false;
  }
}

