import { localStorage } from './storage';

const STORAGE_KEY = 'zightscout_service_retry_state';

const DEFAULT_STATE = {
  retryCount: 0,
  nextRetryAt: 0,
  lastSuccessTimestamp: 0,
  criticalNotifiedAt: null
};

function numberOr(value, fallback) {
  const number = Number(value);
  return isFinite(number) && number >= 0 ? number : fallback;
}

function normalize(value) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    retryCount: Math.floor(numberOr(state.retryCount, 0)),
    nextRetryAt: numberOr(state.nextRetryAt, 0),
    lastSuccessTimestamp: numberOr(state.lastSuccessTimestamp, 0),
    criticalNotifiedAt: state.criticalNotifiedAt === null || state.criticalNotifiedAt === undefined ? null : numberOr(state.criticalNotifiedAt, null)
  };
}

export function loadServiceState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY, '');
    return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_STATE };
  } catch (error) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (ignore) {}
    return { ...DEFAULT_STATE };
  }
}

export function saveServiceState(state) {
  const safeState = normalize(state);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState)); }
  catch (error) { console.log('[ZIGHTSCOUT][RETRY] persistence error: ' + String(error)); }
  return safeState;
}

export function resetServiceState(timestamp) {
  return saveServiceState({ retryCount: 0, nextRetryAt: 0, lastSuccessTimestamp: Number(timestamp) || Date.now(), criticalNotifiedAt: null });
}
