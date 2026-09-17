import { notify } from '@zos/notification';
import { backgroundLog } from './background-log';
import { scheduleAlertRepeats, cancelAlertRepeats } from './alert-repeat';

// Does not change glucose readings, snooze, or real-alert deduplication.
export function testAlertNotification(level) {
  if (level !== 'warning' && level !== 'critical') return false;
  try {
    cancelAlertRepeats(true);
    const options = {
      title: level === 'critical' ? 'TESTE - Vermelho' : 'TESTE - Amarelo',
      content: 'Teste de som e notificacao. Nao e uma leitura de glicemia.',
      vibrate: level === 'critical' ? 5 : 4,
      actions: []
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
