import {
  Vibrator,
  VIBRATOR_SCENE_NOTIFICATION,
  VIBRATOR_SCENE_STRONG_REMINDER
} from '@zos/sensor';
import { backgroundLog } from './background-log';

let sharedVibrator = null;

export function getSharedVibrator() {
  if (!sharedVibrator) {
    try {
      if (typeof Vibrator !== 'undefined') {
        sharedVibrator = new Vibrator();
      }
    } catch (e) {
      sharedVibrator = null;
    }
  }
  return sharedVibrator;
}

/**
 * Triggers physical vibration on the watch haptic motor across Zepp OS 2.0, 3.0, and 3.6+.
 * Works both in foreground pages and background AppService.
 *
 * @param {'critical'|'warning'|number} levelOrMode Alert severity or numeric scene constant
 * @param {object} [instance] Optional existing Vibrator instance bound to current page
 * @returns {boolean} true if vibration was successfully initiated
 */
export function triggerVibration(levelOrMode, instance) {
  try {
    const v = instance || getSharedVibrator() || (typeof Vibrator !== 'undefined' ? new Vibrator() : null);
    if (!v) {
      backgroundLog('VIBRATOR_SKIPPED', { reason: 'NO_VIBRATOR_CLASS' });
      return false;
    }

    const mode = typeof levelOrMode === 'number'
      ? levelOrMode
      : (levelOrMode === 'critical'
          ? (typeof VIBRATOR_SCENE_STRONG_REMINDER !== 'undefined' ? VIBRATOR_SCENE_STRONG_REMINDER : 2)
          : (typeof VIBRATOR_SCENE_NOTIFICATION !== 'undefined' ? VIBRATOR_SCENE_NOTIFICATION : 1));

    try {
      if (typeof v.stop === 'function') v.stop();
    } catch (e) {}

    let modeSet = false;
    if (typeof v.setMode === 'function') {
      try {
        v.setMode(mode);
        modeSet = true;
      } catch (e) {
        try {
          v.setMode({ mode: mode });
          modeSet = true;
        } catch (e2) {}
      }
    }
    if (!modeSet) {
      try { v.scene = mode; } catch (e) {}
    }

    try {
      v.start({ mode: mode });
    } catch (e) {
      try {
        v.start();
      } catch (e2) {}
    }

    backgroundLog('ALERT_VIBRATED', { level: levelOrMode, mode: mode });
    return true;
  } catch (ve) {
    backgroundLog('VIBRATOR_ERROR', { error: String(ve) });
    return false;
  }
}
