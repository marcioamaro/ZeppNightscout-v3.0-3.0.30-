import { trace, safeUrl } from './debug';
import { localStorage } from './storage';
import { backgroundLog } from './background-log';

export const NIGHTSCOUT_URL = 'https://henriquecgm.azurewebsites.net';
export const DEFAULT_PRESET_URL = NIGHTSCOUT_URL;

export const DEFAULT_SETTINGS = {
  version: 1,
  veryLow: 65,
  low: 85,
  high: 120,
  veryHigh: 185,
  outOfRangeVibration: true,
  criticalVibration: true,
  notificationSound: false,
  backgroundInterval: 5,
  unit: 'mg/dL',
  apiUrl: '',
  // The raw token deliberately never lives in watch localStorage.
  tokenConfigured: false
};

const STORAGE_KEY = 'zightscout_settings';
export const VERIFIED_URL_KEY = 'zightscout_last_verified_url';
const VALID_INTERVALS = [0, 5, 10, 30, 60];

function asNumber(value, fallback) {
  const number = parseInt(value, 10);
  return isNaN(number) ? fallback : number;
}

function asBoolean(value, fallback) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

export function validateSettings(settings) {
  const candidate = settings || {};
  return getSettingsValidationError(candidate) === null;
}

export function getSettingsValidationError(settings) {
  const candidate = settings || {};
  if (!(candidate.veryLow < candidate.low && candidate.low < candidate.high && candidate.high < candidate.veryHigh)) {
    return 'threshold_order';
  }
  if (VALID_INTERVALS.indexOf(candidate.backgroundInterval) === -1) {
    return 'background_interval';
  }
  if (candidate.unit !== 'mg/dL') return 'unit';
  return null;
}

export function formatSettings(settings) {
  const candidate = settings || {};
  return 'thresholds=' + candidate.veryLow + '/' + candidate.low + '/' + candidate.high + '/' + candidate.veryHigh +
    ' vibration=' + (candidate.outOfRangeVibration ? 'out' : 'none') + '/' + (candidate.criticalVibration ? 'critical' : 'none') +
    ' interval=' + candidate.backgroundInterval + 'm unit=' + candidate.unit +
    ' token=' + (candidate.tokenConfigured ? 'configured' : 'none');
}

function normalizeSettings(raw) {
  const obj = raw || {};
  const settings = {
    version: 1,
    veryLow: asNumber(obj.veryLow !== undefined ? obj.veryLow : obj.lowCritical, DEFAULT_SETTINGS.veryLow),
    low: asNumber(obj.low !== undefined ? obj.low : obj.lowWarn, DEFAULT_SETTINGS.low),
    high: asNumber(obj.high !== undefined ? obj.high : obj.highWarn, DEFAULT_SETTINGS.high),
    veryHigh: asNumber(obj.veryHigh !== undefined ? obj.veryHigh : obj.highCritical, DEFAULT_SETTINGS.veryHigh),
    outOfRangeVibration: asBoolean(obj.outOfRangeVibration !== undefined ? obj.outOfRangeVibration : obj.vibrateYellow, DEFAULT_SETTINGS.outOfRangeVibration),
    criticalVibration: asBoolean(obj.criticalVibration !== undefined ? obj.criticalVibration : obj.vibrateRed, DEFAULT_SETTINGS.criticalVibration),
    notificationSound: asBoolean(obj.notificationSound, DEFAULT_SETTINGS.notificationSound),
    backgroundInterval: asNumber(obj.backgroundInterval !== undefined ? obj.backgroundInterval : obj.bgInterval, DEFAULT_SETTINGS.backgroundInterval),
    unit: 'mg/dL',
    apiUrl: typeof obj.apiUrl === 'string' ? obj.apiUrl.trim().replace(/\/+$/, '') : String(localStorage.getItem(VERIFIED_URL_KEY) || ''),
    tokenConfigured: asBoolean(obj.tokenConfigured, DEFAULT_SETTINGS.tokenConfigured)
  };

  if (!validateSettings(settings)) return { ...DEFAULT_SETTINGS, apiUrl: settings.apiUrl };
  return settings;
}

export function markUrlVerified(rawUrl) {
  const url = resolveUrlInput(rawUrl);
  if (!url) return '';
  localStorage.setItem(VERIFIED_URL_KEY, url);
  return url;
}

export function resolveUrlInput(raw) {
  const value = raw === undefined || raw === null ? '' : String(raw).trim();
  if (value === '13') return DEFAULT_PRESET_URL;
  if (!value) return '';
  let url = value.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!/^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[\/?#].*)?$/i.test(url)) return '';
  return url;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const settings = normalizeSettings(obj);
      console.log('[ZIGHTSCOUT][STORAGE] LOAD source=storage ' + formatSettings(settings));
      trace('SETTINGS_LOADED', { settings: { ...settings, apiUrl: safeUrl(settings.apiUrl) } });
      return settings;
    }
  } catch (e) {
    console.log('[ZIGHTSCOUT][STORAGE] LOAD result=error reason=' + (e && e.message ? e.message : e));
  }
  const fallback = normalizeSettings({});
  console.log('[ZIGHTSCOUT][STORAGE] LOAD source=defaults ' + formatSettings(fallback));
  return fallback;
}

export function saveSettings(settings) {
  try {
    if (settings && settings.veryLow !== undefined) {
      const candidate = {
        veryLow: asNumber(settings.veryLow, NaN),
        low: asNumber(settings.low, NaN),
        high: asNumber(settings.high, NaN),
        veryHigh: asNumber(settings.veryHigh, NaN),
        backgroundInterval: asNumber(settings.backgroundInterval, NaN),
        unit: settings.unit
      };
      const candidateError = getSettingsValidationError(candidate);
      if (candidateError) {
        console.log('[ZIGHTSCOUT][STORAGE] SAVE result=rejected reason=' + candidateError + ' ' + formatSettings(settings));
        return false;
      }
    }
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    let existing = {};
    try { existing = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : (existingRaw || {}); } catch (e) {}
    const merged = { ...existing, ...settings };
    // An explicit empty URL is a deliberate clear, not an older draft.
    if (settings && Object.prototype.hasOwnProperty.call(settings, 'apiUrl') && !String(settings.apiUrl || '').trim()) {
      merged.apiUrl = '';
      localStorage.removeItem(VERIFIED_URL_KEY);
    }
    const normalized = normalizeSettings(merged);
    const normalizedError = getSettingsValidationError(normalized);
    if (normalizedError) {
      console.log('[ZIGHTSCOUT][STORAGE] SAVE result=rejected reason=' + normalizedError);
      return false;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    const stored = localStorage.getItem(STORAGE_KEY);
    const saved = stored ? normalizeSettings(typeof stored === 'string' ? JSON.parse(stored) : stored) : null;
    const verified = saved && JSON.stringify(saved) === JSON.stringify(normalized);
    console.log('[ZIGHTSCOUT][STORAGE] SAVE result=' + (verified ? 'verified' : 'failed') + ' ' + formatSettings(normalized));
    backgroundLog('SETTINGS_SAVED', { verified: !!verified, settings: {
      veryLow: normalized.veryLow, low: normalized.low, high: normalized.high, veryHigh: normalized.veryHigh,
      backgroundInterval: normalized.backgroundInterval, outOfRangeVibration: normalized.outOfRangeVibration,
      criticalVibration: normalized.criticalVibration, unit: normalized.unit, urlConfigured: !!normalized.apiUrl
    } });
    trace('SETTINGS_VERIFIED', { verified: !!verified, settings: { ...normalized, apiUrl: safeUrl(normalized.apiUrl) } });
    return verified;
  } catch (e) {
    console.log('[ZIGHTSCOUT][STORAGE] SAVE result=error reason=' + (e && e.message ? e.message : e));
    return false;
  }
}

export function getBGColor(value, settings) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 0xFFFFFF;
  const cfg = settings || DEFAULT_SETTINGS;
  // AUDIT FIX: Defensive parsing to prevent NaN in threshold comparisons
  const lowCrit = asNumber(cfg.veryLow, DEFAULT_SETTINGS.veryLow);
  const lowW = asNumber(cfg.low, DEFAULT_SETTINGS.low);
  const highW = asNumber(cfg.high, DEFAULT_SETTINGS.high);
  const highCrit = asNumber(cfg.veryHigh, DEFAULT_SETTINGS.veryHigh);

  if (v < lowCrit) return 0xFF3333;   // Vermelho (< 65)
  if (v < lowW) return 0xFFAA00;      // Amarelo (< 75)
  if (v <= highW) return 0x00CC66;    // Verde (75 a 120)
  if (v <= highCrit) return 0xFFAA00; // Amarelo (121 a 140)
  return 0xFF3333;                    // Vermelho (> 140)
}

export function getBGStatus(value, settings) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 'Estavel';
  const cfg = settings || DEFAULT_SETTINGS;
  // AUDIT FIX: Defensive parsing to prevent NaN in threshold comparisons
  const lowCrit = asNumber(cfg.veryLow, DEFAULT_SETTINGS.veryLow);
  const lowW = asNumber(cfg.low, DEFAULT_SETTINGS.low);
  const highW = asNumber(cfg.high, DEFAULT_SETTINGS.high);
  const highCrit = asNumber(cfg.veryHigh, DEFAULT_SETTINGS.veryHigh);

  if (v < lowCrit) return 'Muito Baixo';
  if (v < lowW) return 'Baixo';
  if (v <= highW) return 'No Alvo';
  if (v <= highCrit) return 'Elevado';
  return 'Muito Alto';
}
