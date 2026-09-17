import { trace, setDebugContext, errorDetails } from '../shared/debug';
import * as ble from '../shared/page-ble';
import { syncBackground } from '../shared/page-ble';
import { createWidget, deleteWidget, widget, prop, align, createKeyboard, deleteKeyboard, inputType } from '@zos/ui';
import { back } from '@zos/router';
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor';
import { showToast } from '@zos/interaction';
import { loadSettings, saveSettings, validateSettings, formatSettings, NIGHTSCOUT_URL, resolveUrlInput, markUrlVerified, VERIFIED_URL_KEY } from '../shared/settings';
import { getLayout } from '../shared/layout';
import { localStorage } from '../shared/storage';
import { getSnoozeUntil, setAlertSnooze, clearAlertSnooze } from '../shared/background-alert';
import { testAlertNotification } from '../shared/test-alert';
import { getConnectionStatus } from '../shared/connection-status';

const APP_ID = 1127422;
const layout = getLayout();
const W = layout.W;
const H = layout.H;
const CX = layout.CX;

function str2buf(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    } else if (c < 0xD800 || c >= 0xE000) {
      bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    } else {
      i++;
      c = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
      bytes.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
  }
  const buf = new ArrayBuffer(bytes.length);
  const u8 = new Uint8Array(buf);
  for (let j = 0; j < bytes.length; j++) {
    u8[j] = bytes[j];
  }
  return buf;
}

function buf2str(u8) {
  if (!u8 || u8.length === 0) return '';
  let out = '';
  let i = 0;
  while (i < u8.length) {
    let c = u8[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c > 0xBF && c < 0xE0) {
      out += String.fromCharCode(((c & 0x1F) << 6) | (u8[i++] & 0x3F));
    } else if (c > 0xDF && c < 0xF0) {
      out += String.fromCharCode(((c & 0x0F) << 12) | ((u8[i++] & 0x3F) << 6) | (u8[i++] & 0x3F));
    } else {
      let u = (((c & 0x07) << 18) | ((u8[i++] & 0x3F) << 12) | ((u8[i++] & 0x3F) << 6) | (u8[i++] & 0x3F)) - 0x10000;
      out += String.fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 0x3FF));
    }
  }
  return out;
}

Page({
  state: {
    layout: layout,
    appSidePort: 0,
    currentTab: 0, // 0: Faixas, 1: Vibracao, 2: Servidor
    settings: {},
    tabWidgets: [],
    thresholdTextWidgets: {},
    widgets: {},
    vibrator: null,
    pendingVerification: false,
    verificationPending: false,
    testingUrl: '',
    snoozeSyncTimer: null,
    lastSnoozeUntil: 0
  },

  onInit(params) {
    if (String(params || '').indexOf('tab=server') !== -1) this.state.currentTab = 2;
    setDebugContext('settings');
    trace('LIFECYCLE_INIT');
    setDebugContext('settings');
    trace('LIFECYCLE_INIT');
    console.log('[ZIGHTSCOUT][SETTINGS] OPEN screen=page2');
    this.state.layout = getLayout();
    this.state.settings = loadSettings();
    this.state.connectionStatus = getConnectionStatus(this.state.settings);
    console.log('[ZIGHTSCOUT][SETTINGS] OPEN loaded ' + formatSettings(this.state.settings));
    try {
      this.state.vibrator = new Vibrator();
    } catch (e) {
      console.log('Vibrator init error:', e);
    }
  },

  build() {
    console.log('[ZIGHTSCOUT][SETTINGS] UI build tab=thresholds');
    this.createHeader();
    this.renderCurrentTab();
    this.initCommunication();
    this.startSnoozeSync();
  },

  persistDraftSettings() {
    if (!validateSettings(this.state.settings)) return false;
    const saved = saveSettings(this.state.settings);
    if (saved) syncBackground(this.state.settings);
    console.log('[ZIGHTSCOUT][SETTINGS] CHANGE persisted=' + saved + ' ' + formatSettings(this.state.settings));
    return saved;
  },

  createHeader() {
    const l = this.state.layout || getLayout();

    // Title
    createWidget(widget.TEXT, {
      x: 0,
      y: l.p2TitleY,
      w: l.W,
      h: Math.floor(26 * l.scaleY),
      text: 'Ajustes ZightScout',
      text_size: l.p2TitleFontSize,
      color: 0x3388FF,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });

    // 3 Tab Buttons: [Faixas] [Alertas / 2ºP] [Servidor]
    const tabW = l.tabW;
    const tabH = l.tabH;
    const tabY = l.tabY;
    const gap = l.tabGap;
    const startX = l.tabStartX;

    createWidget(widget.BUTTON, {
      x: startX,
      y: tabY,
      w: tabW,
      h: tabH,
      radius: Math.floor(tabH / 2),
      normal_color: 0x1A2A44,
      press_color: 0x2266AA,
      text: 'Faixas',
      text_size: l.tabFontSize,
      color: 0xCCDDEE,
      click_func: () => {
        this.switchTab(0);
      }
    });

    createWidget(widget.BUTTON, {
      x: startX + tabW + gap,
      y: tabY,
      w: tabW,
      h: tabH,
      radius: Math.floor(tabH / 2),
      normal_color: 0x1A2A44,
      press_color: 0x2266AA,
      text: 'Alertas / 2ºP',
      text_size: Math.max(10, l.tabFontSize - 1),
      color: 0xCCDDEE,
      click_func: () => {
        this.switchTab(1);
      }
    });

    createWidget(widget.BUTTON, {
      x: startX + (tabW + gap) * 2,
      y: tabY,
      w: tabW,
      h: tabH,
      radius: Math.floor(tabH / 2),
      normal_color: 0x1A2A44,
      press_color: 0x2266AA,
      text: 'Servidor',
      text_size: l.tabFontSize,
      color: 0xCCDDEE,
      click_func: () => {
        this.switchTab(2);
      }
    });

    // Active tab underline indicator
    this.state.widgets.tabIndicator = createWidget(widget.FILL_RECT, {
      x: startX,
      y: tabY + tabH + 2,
      w: tabW,
      h: 3,
      color: 0x00CC66
    });

    // Save & Return button fixed at bottom
    createWidget(widget.BUTTON, {
      x: l.CX - Math.floor(l.saveBtnW / 2),
      y: l.saveBtnY,
      w: l.saveBtnW,
      h: l.saveBtnH,
      radius: l.saveBtnRadius,
      normal_color: 0x008844,
      press_color: 0x00AA55,
      text: 'Salvar e Voltar',
      text_size: l.saveBtnFontSize,
      color: 0xFFFFFF,
      click_func: () => {
        this.saveAndExit();
      }
    });
  },

  switchTab(tabIndex) {
    if (this.state.currentTab === tabIndex) return;
    this.state.currentTab = tabIndex;

    const l = this.state.layout || getLayout();
    const tabW = l.tabW;
    const gap = l.tabGap;
    const startX = l.tabStartX;

    // Reposition active indicator smoothly
    if (this.state.widgets.tabIndicator) {
      try {
        this.state.widgets.tabIndicator.setProperty(prop.X, startX + tabIndex * (tabW + gap));
      } catch (e) {}
    }

    this.renderCurrentTab();
  },

  clearTabWidgets() {
    for (let i = 0; i < this.state.tabWidgets.length; i++) {
      try {
        const item = this.state.tabWidgets[i];
        if (item) {
          deleteWidget(item);
        }
      } catch (e) {
        console.log('Error deleting widget:', e);
      }
    }
    this.state.tabWidgets = [];
    this.state.thresholdTextWidgets = {};
  },

  renderCurrentTab() {
    this.clearTabWidgets();
    if (this.state.currentTab === 0) {
      this.renderThresholdsTab();
    } else if (this.state.currentTab === 1) {
      this.renderVibrationTab();
    } else {
      this.renderServerTab();
    }
  },

  renderThresholdsTab() {
    const list = this.state.tabWidgets;
    const s = this.state.settings;
    const l = this.state.layout || getLayout();

    const rowH = l.rowH;
    const startY = l.rowStartY;

    const rows = [
      { key: 'veryLow', label: 'Muito Baixo (<)', color: 0xFF3333, defaultVal: 65 },
      { key: 'low', label: 'Baixo (<)', color: 0xFFAA00, defaultVal: 85 },
      { key: 'high', label: 'Elevado (>)', color: 0xFFAA00, defaultVal: 120 },
      { key: 'veryHigh', label: 'Muito Alto (>)', color: 0xFF3333, defaultVal: 185 }
    ];

    rows.forEach((row, idx) => {
      const y = startY + idx * rowH;

      // Row title
      list.push(createWidget(widget.TEXT, {
        x: Math.floor(l.W * 0.08),
        y: y,
        w: Math.floor(l.W * 0.84),
        h: Math.floor(22 * l.scaleY),
        text: row.label,
        text_size: Math.max(12, Math.floor(15 * l.scale)),
        color: row.color,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V
      }));

      const btnY = y + Math.floor(22 * l.scaleY);
      const valW = l.valDisplayW;
      const stepW = l.stepBtnW;
      const stepH = l.stepBtnH;
      const stepR = l.stepBtnRadius;

      // [-] Button
      list.push(createWidget(widget.BUTTON, {
        x: l.CX - Math.floor(valW / 2) - stepW - 6,
        y: btnY,
        w: stepW,
        h: stepH,
        radius: stepR,
        normal_color: 0x222233,
        press_color: 0x444455,
        text: '-',
        text_size: Math.max(16, Math.floor(22 * l.scale)),
        color: 0xFFFFFF,
        click_func: () => {
          const cur = parseInt(s[row.key], 10) || row.defaultVal;
          const candidate = { ...s, [row.key]: Math.max(30, cur - 5) };
          if (!validateSettings(candidate)) return;
          s[row.key] = candidate[row.key];
          this.persistDraftSettings();
          if (this.state.thresholdTextWidgets[row.key]) {
            try {
              this.state.thresholdTextWidgets[row.key].setProperty(prop.TEXT, String(s[row.key]));
            } catch (e) {}
          }
        }
      }));

      // Value display
      const currentVal = parseInt(s[row.key], 10) || row.defaultVal;
      const textWidget = createWidget(widget.TEXT, {
        x: l.CX - Math.floor(valW / 2),
        y: btnY,
        w: valW,
        h: stepH,
        text: String(currentVal),
        text_size: Math.max(16, Math.floor(22 * l.scale)),
        color: 0xFFFFFF,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V
      });
      list.push(textWidget);
      this.state.thresholdTextWidgets[row.key] = textWidget;

      // [+] Button
      list.push(createWidget(widget.BUTTON, {
        x: l.CX + Math.floor(valW / 2) + 6,
        y: btnY,
        w: stepW,
        h: stepH,
        radius: stepR,
        normal_color: 0x222233,
        press_color: 0x444455,
        text: '+',
        text_size: Math.max(16, Math.floor(22 * l.scale)),
        color: 0xFFFFFF,
        click_func: () => {
          const cur = parseInt(s[row.key], 10) || row.defaultVal;
          const candidate = { ...s, [row.key]: Math.min(300, cur + 5) };
          if (!validateSettings(candidate)) return;
          s[row.key] = candidate[row.key];
          this.persistDraftSettings();
          if (this.state.thresholdTextWidgets[row.key]) {
            try {
              this.state.thresholdTextWidgets[row.key].setProperty(prop.TEXT, String(s[row.key]));
            } catch (e) {}
          }
        }
      }));
    });
  },

  renderVibrationTab() {
    const list = this.state.tabWidgets;
    const s = this.state.settings;
    const l = this.state.layout || getLayout();

    const switchW = Math.max(110, Math.floor(140 * l.scaleX));
    const testW = Math.max(66, Math.floor(80 * l.scaleX));
    const btnH = Math.max(28, Math.floor(34 * l.scaleY));
    const btnR = Math.floor(btnH / 2);
    const gap = Math.max(8, Math.floor(10 * l.scaleX));
    const startBtnX = l.CX - Math.floor((switchW + testW + gap) / 2);
    const fontSize = Math.max(11, Math.floor(13 * l.scale));

    // Yellow Zone
    const yelY = l.rowStartY;
    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: yelY,
      w: l.W - 40,
      h: Math.floor(22 * l.scaleY),
      text: 'Fora do Alvo (Amarelo)',
      text_size: Math.max(12, Math.floor(15 * l.scale)),
      color: 0xFFAA00,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const yelText = s.outOfRangeVibration ? 'Vibracao: LIGADA' : 'Vibracao: DESLIGADA';
    const btnYelY = yelY + Math.floor(24 * l.scaleY);

    const btnYel = createWidget(widget.BUTTON, {
      x: startBtnX,
      y: btnYelY,
      w: switchW,
      h: btnH,
      radius: btnR,
      normal_color: s.outOfRangeVibration ? 0x008844 : 0x333344,
      press_color: 0x00AA55,
      text: yelText,
      text_size: fontSize,
      color: 0xFFFFFF,
      click_func: () => {
        s.outOfRangeVibration = !s.outOfRangeVibration;
        this.persistDraftSettings();
        this.renderCurrentTab();
      }
    });
    list.push(btnYel);

    list.push(createWidget(widget.BUTTON, {
      x: startBtnX + switchW + gap,
      y: btnYelY,
      w: testW,
      h: btnH,
      radius: btnR,
      normal_color: 0x223344,
      press_color: 0x334455,
      text: 'Testar',
      text_size: fontSize,
      color: 0xFFAA00,
      click_func: () => {
        if (!testAlertNotification('warning')) {
          showToast({ content: 'Falha ao enviar teste' });
        }
      }
    }));

    // Separator line 1
    const sep1Y = btnYelY + btnH + Math.floor(8 * l.scaleY);
    list.push(createWidget(widget.FILL_RECT, {
      x: Math.floor(l.W * 0.15),
      y: sep1Y,
      w: Math.floor(l.W * 0.70),
      h: 1,
      color: 0x222244
    }));

    // Red Zone
    const redY = sep1Y + Math.floor(8 * l.scaleY);
    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: redY,
      w: l.W - 40,
      h: Math.floor(22 * l.scaleY),
      text: 'Vermelho: 3 avisos',
      text_size: Math.max(12, Math.floor(15 * l.scale)),
      color: 0xFF3333,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const redText = s.criticalVibration ? 'Vibracao: LIGADA' : 'Vibracao: DESLIGADA';
    const btnRedY = redY + Math.floor(24 * l.scaleY);

    const btnRed = createWidget(widget.BUTTON, {
      x: startBtnX,
      y: btnRedY,
      w: switchW,
      h: btnH,
      radius: btnR,
      normal_color: s.criticalVibration ? 0x008844 : 0x333344,
      press_color: 0x00AA55,
      text: redText,
      text_size: fontSize,
      color: 0xFFFFFF,
      click_func: () => {
        s.criticalVibration = !s.criticalVibration;
        this.persistDraftSettings();
        this.renderCurrentTab();
      }
    });
    list.push(btnRed);

    list.push(createWidget(widget.BUTTON, {
      x: startBtnX + switchW + gap,
      y: btnRedY,
      w: testW,
      h: btnH,
      radius: btnR,
      normal_color: 0x223344,
      press_color: 0x334455,
      text: 'Testar 3x',
      text_size: fontSize,
      color: 0xFF3333,
      click_func: () => {
        if (!testAlertNotification('critical')) {
          showToast({ content: 'Falha ao enviar teste' });
        }
      }
    }));

    // Separator line 2
    const sep2Y = btnRedY + btnH + Math.floor(8 * l.scaleY);
    list.push(createWidget(widget.FILL_RECT, {
      x: Math.floor(l.W * 0.15),
      y: sep2Y,
      w: Math.floor(l.W * 0.70),
      h: 1,
      color: 0x222244
    }));

    // Background Interval Section
    const curInterval = parseInt(s.backgroundInterval, 10) || 0;
    const intervalLabel = curInterval > 0 ? `2º Plano: a cada ${curInterval} min` : '2º Plano: Desligado';
    const bgY = sep2Y + Math.floor(8 * l.scaleY);

    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: bgY,
      w: l.W - 40,
      h: Math.floor(22 * l.scaleY),
      text: intervalLabel,
      text_size: Math.max(12, Math.floor(15 * l.scale)),
      color: 0x3388FF,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const options = [
      { label: 'Off', val: 0 },
      { label: '5m', val: 5 },
      { label: '10m', val: 10 },
      { label: '30m', val: 30 },
      { label: '60m', val: 60 }
    ];
    const optW = Math.max(38, Math.floor(46 * l.scaleX));
    const optH = Math.max(26, Math.floor(32 * l.scaleY));
    const optGap = Math.max(3, Math.floor(4 * l.scaleX));
    const optStartX = l.CX - Math.floor((optW * options.length + optGap * (options.length - 1)) / 2);
    const optY = bgY + Math.floor(24 * l.scaleY);

    options.forEach((opt, i) => {
      const isSelected = curInterval === opt.val;
      list.push(createWidget(widget.BUTTON, {
        x: optStartX + i * (optW + optGap),
        y: optY,
        w: optW,
        h: optH,
        radius: Math.floor(optH / 2),
        normal_color: isSelected ? 0x008844 : 0x222233,
        press_color: 0x00AA55,
        text: opt.label,
        text_size: Math.max(10, Math.floor(13 * l.scale)),
        color: isSelected ? 0xFFFFFF : 0x8899AA,
        click_func: () => {
          s.backgroundInterval = opt.val;
          this.persistDraftSettings();
          this.renderCurrentTab();
        }
      }));
    })

    // Snooze belongs to Alerts/Background only. It never changes glucose data.
    const snoozeUntil = getSnoozeUntil();
    const snoozeMinutes = snoozeUntil ? Math.max(1, Math.ceil((snoozeUntil - Date.now()) / 60000)) : 0;
    const snoozeY = optY + optH + Math.floor(10 * l.scaleY);
    this.state.lastSnoozeUntil = snoozeUntil;
    this.state.widgets.snoozeStatus = createWidget(widget.TEXT, { x: 20, y: snoozeY, w: l.W - 40, h: Math.floor(20 * l.scaleY),
      text: snoozeMinutes ? 'Snooze ativo: ' + snoozeMinutes + ' min' : 'Snooze desativado',
      text_size: Math.max(10, Math.floor(12 * l.scale)), color: snoozeMinutes ? 0xFFAA00 : 0x778899, align_h: align.CENTER_H, align_v: align.CENTER_V });
    list.push(this.state.widgets.snoozeStatus);
    const snoozeOptions = snoozeMinutes ? [{ label: 'Cancelar snooze', minutes: 0 }] : [{ label: '15 min', minutes: 15 }, { label: '30 min', minutes: 30 }, { label: '60 min', minutes: 60 }];
    const snoozeW = snoozeMinutes ? Math.max(140, Math.floor(170 * l.scaleX)) : Math.max(58, Math.floor(68 * l.scaleX));
    const snoozeGap = Math.max(5, Math.floor(7 * l.scaleX));
    const snoozeStart = l.CX - Math.floor((snoozeW * snoozeOptions.length + snoozeGap * (snoozeOptions.length - 1)) / 2);
    snoozeOptions.forEach((opt, i) => list.push(createWidget(widget.BUTTON, {
      x: snoozeStart + i * (snoozeW + snoozeGap), y: snoozeY + Math.floor(21 * l.scaleY), w: snoozeW, h: Math.max(25, Math.floor(29 * l.scaleY)), radius: btnR,
      normal_color: opt.minutes ? 0x4A3520 : 0x663333, press_color: 0x885533, text: opt.label, text_size: Math.max(10, Math.floor(12 * l.scale)), color: 0xFFFFFF,
      click_func: () => { if (opt.minutes) setAlertSnooze(opt.minutes); else clearAlertSnooze(); this.renderCurrentTab(); }
    })));;

  },

  renderServerTab() {
    const list = this.state.tabWidgets;
    const s = this.state.settings;
    const l = this.state.layout || getLayout();

    const startY = l.rowStartY;

    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: startY + Math.floor(6 * l.scaleY),
      w: l.W - 40,
      h: Math.floor(22 * l.scaleY),
      text: 'Servidor Nightscout:',
      text_size: Math.max(12, Math.floor(15 * l.scale)),
      color: 0x777777,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const cleanDisplay = (s.apiUrl || localStorage.getItem(VERIFIED_URL_KEY) || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');

    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: startY + Math.floor(30 * l.scaleY),
      w: l.W - 40,
      h: Math.floor(44 * l.scaleY),
      text: cleanDisplay || 'Nenhuma URL configurada',
      text_size: Math.max(12, Math.floor(15 * l.scale)),
      color: 0x00CC66,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    this.state.widgets.testResult = createWidget(widget.TEXT, {
      x: 20,
      y: startY + Math.floor(78 * l.scaleY),
      w: l.W - 40,
      h: Math.floor(46 * l.scaleY),
      text: 'Toque abaixo para testar\nconexao com o servidor',
      text_size: Math.max(11, Math.floor(14 * l.scale)),
      color: 0x888888,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });
    list.push(this.state.widgets.testResult);

    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('zightscout_last_data') || 'null'); } catch (e) {}
    const heartbeat = Number(localStorage.getItem('zightscout_service_heartbeat') || 0);
    const heartbeatAge = heartbeat ? Math.max(0, Math.floor((Date.now() - heartbeat) / 60000)) : -1;
    this.state.widgets.diagnostic = createWidget(widget.TEXT, {
      x: 20, y: startY + Math.floor(126 * l.scaleY), w: l.W - 40, h: Math.floor(36 * l.scaleY),
      text: 'Diagnostico: ' + (cached && cached.currentBG ? ('ultima leitura ' + cached.currentBG + ' mg/dL') : 'sem leitura') + '\n' +
        '2o plano: ' + (heartbeatAge >= 0 ? ('ativo ha ' + heartbeatAge + ' min') : 'sem sinal'),
      text_size: Math.max(10, Math.floor(12 * l.scale)), color: heartbeatAge > 10 ? 0xFF8800 : 0x778899,
      align_h: align.CENTER_H, align_v: align.CENTER_V
    });
    list.push(this.state.widgets.diagnostic);

    const btnW = Math.max(140, Math.floor(170 * l.scaleX));
    const btnH = Math.max(34, Math.floor(40 * l.scaleY));
    const btnR = Math.floor(btnH / 2);
    const btnFontSize = Math.max(12, Math.floor(15 * l.scale));

    // URL input button
    list.push(createWidget(widget.BUTTON, {
      x: l.CX - Math.floor(btnW / 2), y: startY + Math.floor(170 * l.scaleY), w: btnW, h: btnH, radius: btnR,
      normal_color: 0x008844, press_color: 0x00AA55, text: 'Digitar URL', text_size: btnFontSize, color: 0xFFFFFF,
      click_func: () => this.openUrlKeyboard()
    }));

    // Test connection button
    list.push(createWidget(widget.BUTTON, {
      x: l.CX - Math.floor(btnW / 2), y: startY + Math.floor(270 * l.scaleY), w: btnW, h: btnH, radius: btnR,
      normal_color: 0x1A4080, press_color: 0x2266AA, text: 'Testar Conexao', text_size: btnFontSize, color: 0xCCDDFF,
      click_func: () => this.testConnection()
    }));
    list.push(createWidget(widget.BUTTON, {
      x: l.CX - Math.floor(btnW / 2), y: startY + Math.floor(220 * l.scaleY), w: btnW, h: Math.max(26, Math.floor(30 * l.scaleY)), radius: btnR,
      normal_color: s.tokenConfigured ? 0x1A4080 : 0x333344, press_color: 0x2266AA,
      text: s.tokenConfigured ? 'Token: configurado' : 'Token: opcional', text_size: btnFontSize, color: s.tokenConfigured ? 0xCCDDFF : 0x8899AA,
      click_func: () => this.openTokenKeyboard()
    }));
  },

  openUrlKeyboard() {
    try {
      createKeyboard({ inputType: (typeof inputType !== 'undefined' && inputType.CHAR !== undefined) ? inputType.CHAR : 2, text: '',
        onComplete: (keyboard, result) => { this.handleUrlEntered(result); try { if (typeof deleteKeyboard === 'function') deleteKeyboard(); } catch (e) {} },
        onCancel: () => { try { if (typeof deleteKeyboard === 'function') deleteKeyboard(); } catch (e) {} } });
    } catch (e) { console.log('[SETTINGS] keyboard error', e); }
  },

  openTokenKeyboard() {
    try {
      try { showToast({ content: 'Cole o token. Vazio remove.' }); } catch (e) {}
      createKeyboard({ inputType: (typeof inputType !== 'undefined' && inputType.CHAR !== undefined) ? inputType.CHAR : 2, text: '',
        onComplete: (keyboard, result) => { this.handleTokenEntered(result); try { if (typeof deleteKeyboard === 'function') deleteKeyboard(); } catch (e) {} },
        onCancel: () => { try { if (typeof deleteKeyboard === 'function') deleteKeyboard(); } catch (e) {} } });
    } catch (e) {
      console.log('[SETTINGS] token keyboard error', e);
      try { showToast({ content: 'Falha ao abrir token' }); } catch (err) {}
    }
  },

  handleTokenEntered(result) {
    let raw = '';
    if (result && typeof result === 'object') raw = result.data !== undefined ? String(result.data) : (result.text !== undefined ? String(result.text) : String(result.value || ''));
    else if (result !== undefined && result !== null) raw = String(result);
    const token = raw.trim();
    if (token.length > 256 || /\s/.test(token)) {
      try { showToast({ content: 'Token invalido' }); } catch (e) {}
      return;
    }
    // Send the raw value only to the phone. Watch persistence retains only this flag.
    this.state.settings.tokenConfigured = token.length > 0;
    if (!saveSettings(this.state.settings)) {
      try { showToast({ content: 'Falha ao salvar token' }); } catch (e) {}
      return;
    }
    this.sendMessage({ type: 'UPDATE_SETTINGS', settings: { apiUrl: this.state.settings.apiUrl, apiToken: token } });
    try { showToast({ content: token ? 'Token salvo no celular' : 'Token removido' }); } catch (e) {}
    this.renderCurrentTab();
  },

  handleUrlEntered(result) {
    let raw = '';
    if (result && typeof result === 'object') raw = result.data !== undefined ? String(result.data) : (result.text !== undefined ? String(result.text) : String(result.value || ''));
    else if (result !== undefined && result !== null) raw = String(result);
    const resolved = resolveUrlInput(raw.trim());
    if (!resolved) { try { showToast({ content: 'URL invalida' }); } catch (e) {} return; }
    this.state.settings.apiUrl = resolved;
    if (!saveSettings(this.state.settings)) {
      try { showToast({ content: 'Falha ao gravar URL' }); } catch (e) {}
      return;
    }
    this.state.settings = loadSettings();
    console.log('[ZIGHTSCOUT][SETTINGS] URL_SAVED verified=' + (this.state.settings.apiUrl === resolved));
    syncBackground(this.state.settings);
    this.sendMessage({ type: 'UPDATE_SETTINGS', settings: this.state.settings });
    this.sendMessage({ type: 'FETCH_DATA', apiUrl: this.state.settings.apiUrl });
    this.renderCurrentTab();
  },

  saveAndExit() {
    console.log('[ZIGHTSCOUT][SETTINGS] SAVE requested ' + formatSettings(this.state.settings));
    if (!validateSettings(this.state.settings) || !saveSettings(this.state.settings)) {
      console.log('[ZIGHTSCOUT][SETTINGS] SAVE completed result=rejected');
      try { showToast({ content: 'Faixas invalidas' }); } catch (e) {}
      return;
    }
    syncBackground(this.state.settings);
    this.sendMessage({ type: 'UPDATE_SETTINGS', settings: this.state.settings });
    console.log('[ZIGHTSCOUT][SETTINGS] SAVE completed result=success');
    try { showToast({ content: 'Configuracoes salvas' }); } catch (e) {}

    // AUDIT FIX: Allow BLE transmit buffer to flush before triggering page unmount
    setTimeout(() => {
      back();
    }, 150);
  },

  initCommunication() {
    try {
      ble.createConnect((index, data, size) => {
        this.handleResponse(data, size);
      });
      console.log('ZightScout: Settings BLE registered');

      setTimeout(() => {
        this.sendShake();
      }, 300);
    } catch (e) {
      console.log('ZightScout: Settings BLE connect error:', e && e.message ? e.message : e);
    }
  },

  sendShake() {
    const buf = new ArrayBuffer(16 + 1);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    dv.setUint8(0, 1);
    dv.setUint8(1, 1);
    dv.setUint16(2, 1, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint32(8, APP_ID, true);
    dv.setUint32(12, 0, true);
    u8[16] = APP_ID & 0xFF;

    try {
      ble.send(buf, buf.byteLength);
    } catch (e) {}
  },

  sendMessage(msgObj) {
    const jsonStr = JSON.stringify(msgObj);
    const utf8Buf = str2buf(jsonStr);
    const totalLen = 16 + utf8Buf.byteLength;
    const buf = new ArrayBuffer(totalLen);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    dv.setUint8(0, 1);
    dv.setUint8(1, 1);
    dv.setUint16(2, 4, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, this.state.appSidePort, true);
    dv.setUint32(8, APP_ID, true);
    dv.setUint32(12, 0, true);

    const payloadBytes = new Uint8Array(utf8Buf);
    u8.set(payloadBytes, 16);

    try {
      ble.send(buf, buf.byteLength);
    } catch (e) {}
  },

  testConnection() {
    this.state.testingUrl = this.state.settings.apiUrl || localStorage.getItem(VERIFIED_URL_KEY) || '';
    this.state.verificationPending = true;
    setTimeout(() => {
      if (this.state.verificationPending && this.state.widgets.testResult) {
        try { this.state.widgets.testResult.setProperty(prop.TEXT, 'Sem resposta do servidor'); this.state.widgets.testResult.setProperty(prop.COLOR, 0xFF4444); } catch (e) {}
      }
    }, 12000);
    const resWidget = this.state.widgets.testResult;
    if (resWidget) {
      try {
        resWidget.setProperty(prop.TEXT, 'Testando conexao...');
        resWidget.setProperty(prop.COLOR, 0xFFAA00);
      } catch (e) {}
    }

    if (!this.state.appSidePort) {
      this.state.pendingVerification = true;
      this.sendShake();
      setTimeout(() => {
        if (this.state.pendingVerification && resWidget) { try { resWidget.setProperty(prop.TEXT, 'Sem conexao com celular'); resWidget.setProperty(prop.COLOR, 0xFF4444); } catch (e) {} }
      }, 9000);
      return;
    }
    this.sendMessage({ type: 'VERIFY_URL', apiUrl: this.state.settings.apiUrl });
  },

  handleResponse(data, size) {
    try {
      if (!data) return;
      const len = (size && size > 0) ? size : (data.byteLength || 0);
      const u8 = new Uint8Array(data.buffer || data, data.byteOffset || 0, len);
      if (u8.length === 0) return;

      if (u8.length >= 16 && u8[0] === 1 && u8[1] === 1) {
        const dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
        const pType = dv.getUint16(2, true);
        const pPort2 = dv.getUint16(6, true);
        if (pType === 1) {
          this.state.appSidePort = pPort2;
          if (this.state.pendingVerification) { this.state.pendingVerification = false; this.testConnection(); }
          return;
        }
      }

      const offset = (u8.length >= 16 && u8[0] === 1 && u8[1] === 1) ? 16 : 0;
      const jsonStr = buf2str(u8.subarray(offset));
      if (!jsonStr || jsonStr.indexOf('{') === -1) return;

      const parsed = JSON.parse(jsonStr);
      const res = parsed.data || parsed;
      const resWidget = this.state.widgets.testResult;

      if (res.verification) {
        this.state.verificationPending = false;
        if (res.success) {
          const verifiedUrl = markUrlVerified(this.state.testingUrl || this.state.settings.apiUrl);
          if (verifiedUrl && !this.state.settings.apiUrl) { this.state.settings.apiUrl = verifiedUrl; saveSettings(this.state.settings); }
          if (resWidget) {
            resWidget.setProperty(prop.TEXT, 'Conexao OK!\n' + (res.serverInfo ? res.serverInfo.version : 'Online'));
            resWidget.setProperty(prop.COLOR, 0x00CC66);
          }
        } else {
          if (resWidget) {
            resWidget.setProperty(prop.TEXT, 'Falha: ' + (res.message || 'Erro'));
            resWidget.setProperty(prop.COLOR, 0xFF4444);
          }
        }
      } else if (res.secret) {
        if (res.success && res.token) {
          if (resWidget) {
            resWidget.setProperty(prop.TEXT, 'Token obtido!\n' + res.token.substring(0, 14) + '...');
            resWidget.setProperty(prop.COLOR, 0x00CC66);
          }
        } else {
          if (resWidget) {
            resWidget.setProperty(prop.TEXT, 'Falha ao obter token');
            resWidget.setProperty(prop.COLOR, 0xFF4444);
          }
        }
      }
    } catch (e) {
      console.log('ZightScout Settings: handleResponse error:', e);
    }
  },

  startSnoozeSync() {
    if (this.state.snoozeSyncTimer) clearInterval(this.state.snoozeSyncTimer);
    this.state.snoozeSyncTimer = setInterval(() => this.refreshSnoozeStatus(), 1000);
  },

  refreshSnoozeStatus() {
    if (this.state.currentTab !== 1) return;
    const until = getSnoozeUntil();
    const minutes = until ? Math.max(1, Math.ceil((until - Date.now()) / 60000)) : 0;
    if (until !== this.state.lastSnoozeUntil) {
      this.state.lastSnoozeUntil = until;
      console.log('[SETTINGS] Snooze state synchronized: ' + (minutes ? minutes + ' min' : 'off'));
      this.renderCurrentTab();
      return;
    }
    const statusWidget = this.state.widgets.snoozeStatus;
    if (statusWidget) {
      try {
        statusWidget.setProperty(prop.TEXT, minutes ? 'Snooze ativo: ' + minutes + ' min' : 'Snooze desativado');
        statusWidget.setProperty(prop.COLOR, minutes ? 0xFFAA00 : 0x778899);
      } catch (e) {}
    }
  },

  onResume() { this.refreshSnoozeStatus(); },

  onDestroy() {
    console.log('[AUDIT] page2 onDestroy: cleaning up tab widgets (BLE connection kept alive for page/index)');
    if (this.state.snoozeSyncTimer) { clearInterval(this.state.snoozeSyncTimer); this.state.snoozeSyncTimer = null; }
    if (this.state.settings && validateSettings(this.state.settings)) {
      const saved = saveSettings(this.state.settings);
      console.log('[ZIGHTSCOUT][SETTINGS] CLOSE persisted=' + saved + ' ' + formatSettings(this.state.settings));
    }
    syncBackground(loadSettings());
    this.clearTabWidgets();
    // AUDIT FIX: Do NOT call ble.disConnect() here!
    // Calling ble.disConnect() destroys the global BLE listener, killing page/index.js when it resumes.
  }
});