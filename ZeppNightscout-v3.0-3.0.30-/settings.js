import { localStorage } from '@zos/storage';

export const DEFAULT_PRESET_URL = 'https://henriquecgm.azurewebsites.net';

export const DEFAULT_SETTINGS = {
  apiUrl: '',
  apiToken: '',
  lowCritical: 65,
  lowWarn: 75,
  highWarn: 120,
  highCritical: 140,
  vibrateYellow: false,
  vibrateRed: true,
  bgInterval: 10 // 0: Desativado, 5, 10, 30 ou 60 minutos
};

export function resolveUrlInput(input) {
  if (input === undefined || input === null) return '';
  let str = input;
  if (typeof input === 'object') {
    if (input.data !== undefined && input.data !== null) {
      str = input.data;
    } else if (input.text !== undefined && input.text !== null) {
      str = input.text;
    } else if (input.value !== undefined && input.value !== null) {
      str = input.value;
    }
  }
  const trimmed = String(str).trim();
  if (trimmed === '13') {
    return DEFAULT_PRESET_URL;
  }
  if (!trimmed || trimmed === '[object Object]') return '';
  if (trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0) {
    return trimmed;
  }
  return 'https://' + trimmed;
}

const STORAGE_KEY = 'zightscout_settings';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY, null);
    if (raw) {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        apiUrl: (obj.apiUrl !== undefined && obj.apiUrl !== null) ? obj.apiUrl : DEFAULT_SETTINGS.apiUrl,
        apiToken: (obj.apiToken !== undefined && obj.apiToken !== null) ? obj.apiToken : DEFAULT_SETTINGS.apiToken,
        lowCritical: (obj.lowCritical !== undefined) ? parseInt(obj.lowCritical, 10) : DEFAULT_SETTINGS.lowCritical,
        lowWarn: (obj.lowWarn !== undefined) ? parseInt(obj.lowWarn, 10) : DEFAULT_SETTINGS.lowWarn,
        highWarn: (obj.highWarn !== undefined) ? parseInt(obj.highWarn, 10) : DEFAULT_SETTINGS.highWarn,
        highCritical: (obj.highCritical !== undefined) ? parseInt(obj.highCritical, 10) : DEFAULT_SETTINGS.highCritical,
        vibrateYellow: (obj.vibrateYellow !== undefined) ? (obj.vibrateYellow === true || obj.vibrateYellow === 'true') : DEFAULT_SETTINGS.vibrateYellow,
        vibrateRed: (obj.vibrateRed !== undefined) ? (obj.vibrateRed === true || obj.vibrateRed === 'true') : DEFAULT_SETTINGS.vibrateRed,
        bgInterval: (obj.bgInterval !== undefined) ? parseInt(obj.bgInterval, 10) : DEFAULT_SETTINGS.bgInterval
      };
    }
  } catch (e) {
    console.log('Error loading settings:', e && e.message ? e.message : e);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    console.log('Settings successfully saved to localStorage');
  } catch (e) {
    console.log('Error saving settings:', e && e.message ? e.message : e);
  }
}

export function getBGColor(value, settings) {
  const v = parseInt(value, 10);
  if (isNaN(v)) return 0xFFFFFF;
  const cfg = settings || DEFAULT_SETTINGS;
  // AUDIT FIX: Defensive parsing to prevent NaN in threshold comparisons
  const lowCrit = parseInt(cfg.lowCritical, 10) || DEFAULT_SETTINGS.lowCritical;
  const lowW = parseInt(cfg.lowWarn, 10) || DEFAULT_SETTINGS.lowWarn;
  const highW = parseInt(cfg.highWarn, 10) || DEFAULT_SETTINGS.highWarn;
  const highCrit = parseInt(cfg.highCritical, 10) || DEFAULT_SETTINGS.highCritical;

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
  const lowCrit = parseInt(cfg.lowCritical, 10) || DEFAULT_SETTINGS.lowCritical;
  const lowW = parseInt(cfg.lowWarn, 10) || DEFAULT_SETTINGS.lowWarn;
  const highW = parseInt(cfg.highWarn, 10) || DEFAULT_SETTINGS.highWarn;
  const highCrit = parseInt(cfg.highCritical, 10) || DEFAULT_SETTINGS.highCritical;

  if (v < lowCrit) return 'Muito Baixo';
  if (v < lowW) return 'Baixo';
  if (v <= highW) return 'No Alvo';
  if (v <= highCrit) return 'Elevado';
  return 'Muito Alto';
}
