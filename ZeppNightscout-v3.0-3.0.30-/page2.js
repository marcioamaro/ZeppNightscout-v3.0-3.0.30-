import * as ble from '@zos/ble';
import { createWidget, deleteWidget, widget, prop, align, createKeyboard, deleteKeyboard, inputType } from '@zos/ui';
import { back } from '@zos/router';
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor';
import { start, stop } from '@zos/app-service';
import { loadSettings, saveSettings, resolveUrlInput, DEFAULT_PRESET_URL } from '../shared/settings';
import { getLayout } from '../shared/layout';

const APP_ID = 1127123;
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
    vibrator: null
  },

  onInit() {
    console.log('ZightScout: Settings onInit');
    this.state.layout = getLayout();
    this.state.settings = loadSettings();
    try {
      this.state.vibrator = new Vibrator();
    } catch (e) {
      console.log('Vibrator init error:', e);
    }
  },

  build() {
    console.log('ZightScout: Settings build');
    this.createHeader();
    this.renderCurrentTab();
    this.initCommunication();
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
      { key: 'lowCritical', label: 'Muito Baixo (<)', color: 0xFF3333, defaultVal: 65 },
      { key: 'lowWarn', label: 'Baixo (<)', color: 0xFFAA00, defaultVal: 75 },
      { key: 'highWarn', label: 'Elevado (>)', color: 0xFFAA00, defaultVal: 120 },
      { key: 'highCritical', label: 'Muito Alto (>)', color: 0xFF3333, defaultVal: 140 }
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
          s[row.key] = Math.max(30, cur - 5);
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
          s[row.key] = Math.min(300, cur + 5);
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

    const yelText = s.vibrateYellow ? 'Vibracao: LIGADA' : 'Vibracao: DESLIGADA';
    const btnYelY = yelY + Math.floor(24 * l.scaleY);

    const btnYel = createWidget(widget.BUTTON, {
      x: startBtnX,
      y: btnYelY,
      w: switchW,
      h: btnH,
      radius: btnR,
      normal_color: s.vibrateYellow ? 0x008844 : 0x333344,
      press_color: 0x00AA55,
      text: yelText,
      text_size: fontSize,
      color: 0xFFFFFF,
      click_func: () => {
        s.vibrateYellow = !s.vibrateYellow;
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
        if (this.state.vibrator) {
          try {
            this.state.vibrator.start({ mode: VIBRATOR_SCENE_NOTIFICATION });
          } catch (e) {
            console.log('Vibrator test yellow error:', e);
          }
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
      text: 'Alerta Critico (Vermelho)',
      text_size: Math.max(12, Math.floor(15 * l.scale)),
      color: 0xFF3333,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const redText = s.vibrateRed ? 'Vibracao: LIGADA' : 'Vibracao: DESLIGADA';
    const btnRedY = redY + Math.floor(24 * l.scaleY);

    const btnRed = createWidget(widget.BUTTON, {
      x: startBtnX,
      y: btnRedY,
      w: switchW,
      h: btnH,
      radius: btnR,
      normal_color: s.vibrateRed ? 0x008844 : 0x333344,
      press_color: 0x00AA55,
      text: redText,
      text_size: fontSize,
      color: 0xFFFFFF,
      click_func: () => {
        s.vibrateRed = !s.vibrateRed;
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
      text: 'Testar',
      text_size: fontSize,
      color: 0xFF3333,
      click_func: () => {
        if (this.state.vibrator) {
          try {
            this.state.vibrator.start({ mode: VIBRATOR_SCENE_STRONG_REMINDER });
          } catch (e) {
            console.log('Vibrator test red error:', e);
          }
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
    const curInterval = parseInt(s.bgInterval, 10) || 0;
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
          s.bgInterval = opt.val;
          this.renderCurrentTab();
        }
      }));
    });

    // Explanatory note
    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: optY + optH + Math.floor(4 * l.scaleY),
      w: l.W - 40,
      h: Math.floor(40 * l.scaleY),
      text: 'Consulta Nightscout e alerta\nmesmo com app fechado.',
      text_size: Math.max(11, Math.floor(13 * l.scale)),
      color: 0x778899,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));
  },

  renderServerTab() {
    const list = this.state.tabWidgets;
    const s = this.state.settings;
    const l = this.state.layout || getLayout();

    const startY = l.rowStartY;

    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: startY + Math.floor(4 * l.scaleY),
      w: l.W - 40,
      h: Math.floor(22 * l.scaleY),
      text: 'Servidor Nightscout:',
      text_size: Math.max(12, Math.floor(14 * l.scale)),
      color: 0x8899AA,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const hasUrl = Boolean(s.apiUrl && s.apiUrl.trim());
    const displayUrl = hasUrl
      ? s.apiUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : 'Nao configurada';

    list.push(createWidget(widget.TEXT, {
      x: 16,
      y: startY + Math.floor(26 * l.scaleY),
      w: l.W - 32,
      h: Math.floor(24 * l.scaleY),
      text: displayUrl,
      text_size: Math.max(11, Math.floor(14 * l.scale)),
      color: hasUrl ? 0x00CC66 : 0xFFAA00,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const btnW = Math.max(150, Math.floor(180 * l.scaleX));
    const btnH = Math.max(34, Math.floor(38 * l.scaleY));
    const btnR = Math.floor(btnH / 2);
    const btnFontSize = Math.max(12, Math.floor(15 * l.scale));

    // Botão "Digitar URL"
    list.push(createWidget(widget.BUTTON, {
      x: l.CX - Math.floor(btnW / 2),
      y: startY + Math.floor(58 * l.scaleY),
      w: btnW,
      h: btnH,
      radius: btnR,
      normal_color: 0x008844,
      press_color: 0x00AA55,
      text: 'Digitar URL',
      text_size: btnFontSize,
      color: 0xFFFFFF,
      click_func: () => {
        this.openUrlKeyboard();
      }
    }));

    // Botão "Testar Conexao"
    list.push(createWidget(widget.BUTTON, {
      x: l.CX - Math.floor(btnW / 2),
      y: startY + Math.floor(104 * l.scaleY),
      w: btnW,
      h: btnH,
      radius: btnR,
      normal_color: 0x1A4080,
      press_color: 0x2266AA,
      text: 'Testar Conexao',
      text_size: btnFontSize,
      color: 0xCCDDFF,
      click_func: () => {
        this.testConnection();
      }
    }));

    // Status / Resultado do teste
    this.state.widgets.testResult = createWidget(widget.TEXT, {
      x: 20,
      y: startY + Math.floor(150 * l.scaleY),
      w: l.W - 40,
      h: Math.floor(44 * l.scaleY),
      text: 'Toque em Digitar URL ou\nTestar Conexao',
      text_size: Math.max(11, Math.floor(13 * l.scale)),
      color: 0x888888,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });
    list.push(this.state.widgets.testResult);
  },

  openUrlKeyboard() {
    console.log('[PAGE2] openUrlKeyboard clicked');
    if (typeof createKeyboard === 'function') {
      try {
        const kbType = (typeof inputType !== 'undefined' && inputType && inputType.CHAR !== undefined) ? inputType.CHAR : 2;
        createKeyboard({
          inputType: kbType,
          text: '', // A URL NÃO deve vir preenchida no input do texto
          onComplete: (keyboardWidget, result) => {
            console.log('[PAGE2] Keyboard onComplete result:', result);
            this.handleUrlEntered(result);
            try {
              if (typeof deleteKeyboard === 'function') deleteKeyboard();
            } catch (e) {}
          },
          onCancel: (keyboardWidget, result) => {
            console.log('[PAGE2] Keyboard onCancel');
            try {
              if (typeof deleteKeyboard === 'function') deleteKeyboard();
            } catch (e) {}
            this.renderCurrentTab();
          }
        });
        return;
      } catch (e) {
        console.log('[PAGE2] createKeyboard exception:', e);
      }
    }
    this.openFallbackInput();
  },

  handleUrlEntered(result) {
    let raw = '';
    if (result !== undefined && result !== null) {
      if (typeof result === 'object') {
        if (result.data !== undefined && result.data !== null) {
          raw = String(result.data);
        } else if (result.text !== undefined && result.text !== null) {
          raw = String(result.text);
        } else if (result.value !== undefined && result.value !== null) {
          raw = String(result.value);
        } else {
          try {
            raw = JSON.stringify(result);
          } catch (e) {
            raw = String(result);
          }
        }
      } else {
        raw = String(result);
      }
    }
    raw = raw.trim();
    console.log('[PAGE2] handleUrlEntered extracted text: [' + raw + ']');

    if (!raw || raw === '[object Object]') {
      this.renderCurrentTab();
      return;
    }

    const resolved = resolveUrlInput(raw);
    console.log('[PAGE2] URL resolved: ' + resolved);
    this.state.settings.apiUrl = resolved;
    saveSettings(this.state.settings);
    this.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: this.state.settings
    });
    this.renderCurrentTab();
    if (this.state.widgets.testResult) {
      try {
        const shortUrl = resolved.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        this.state.widgets.testResult.setProperty(prop.TEXT, 'URL salva com sucesso!\n' + shortUrl);
        this.state.widgets.testResult.setProperty(prop.COLOR, 0x00CC66);
      } catch (e) {}
    }
  },

  openFallbackInput() {
    console.log('[PAGE2] Opening fallback on-screen input');
    this.clearTabWidgets();
    const list = this.state.tabWidgets;
    const l = this.state.layout || getLayout();

    let typedBuffer = '';

    list.push(createWidget(widget.FILL_RECT, {
      x: 10,
      y: 40,
      w: l.W - 20,
      h: l.H - 80,
      radius: 16,
      color: 0x111625
    }));

    list.push(createWidget(widget.TEXT, {
      x: 20,
      y: 45,
      w: l.W - 40,
      h: 24,
      text: 'Digitar URL (13 = padrao)',
      text_size: 13,
      color: 0x88AACC,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    }));

    const displayWidget = createWidget(widget.TEXT, {
      x: 20,
      y: 72,
      w: l.W - 40,
      h: 30,
      text: '_',
      text_size: 16,
      color: 0x00FF88,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V
    });
    list.push(displayWidget);

    const updateDisplay = () => {
      try {
        displayWidget.setProperty(prop.TEXT, typedBuffer.length > 0 ? typedBuffer : '_');
      } catch (e) {}
    };

    const btnSize = 46;
    const btnY1 = 110;
    const padStartX = l.CX - Math.floor((btnSize * 4 + 18) / 2);

    const keys = ['1', '3', 'CLR', 'OK'];
    keys.forEach((key, idx) => {
      const kx = padStartX + idx * (btnSize + 6);
      list.push(createWidget(widget.BUTTON, {
        x: kx,
        y: btnY1,
        w: btnSize,
        h: btnSize,
        radius: Math.floor(btnSize / 2),
        normal_color: key === 'OK' ? 0x008844 : (key === 'CLR' ? 0x882222 : 0x223344),
        press_color: 0x446688,
        text: key,
        text_size: 14,
        color: 0xFFFFFF,
        click_func: () => {
          if (key === 'OK') {
            this.handleUrlEntered(typedBuffer);
          } else if (key === 'CLR') {
            typedBuffer = '';
            updateDisplay();
          } else {
            typedBuffer += key;
            updateDisplay();
          }
        }
      }));
    });

    list.push(createWidget(widget.BUTTON, {
      x: l.CX - 90,
      y: 170,
      w: 180,
      h: 36,
      radius: 18,
      normal_color: 0x1A4080,
      press_color: 0x2266AA,
      text: 'Usar Atalho 13',
      text_size: 13,
      color: 0xCCDDFF,
      click_func: () => {
        this.handleUrlEntered('13');
      }
    }));

    list.push(createWidget(widget.BUTTON, {
      x: l.CX - 60,
      y: 215,
      w: 120,
      h: 32,
      radius: 16,
      normal_color: 0x333333,
      press_color: 0x555555,
      text: 'Cancelar',
      text_size: 12,
      color: 0xAAAAAA,
      click_func: () => {
        this.renderCurrentTab();
      }
    }));
  },

  saveAndExit() {
    console.log('[AUDIT] page2 saveAndExit: saving settings to localStorage:', JSON.stringify(this.state.settings));
    saveSettings(this.state.settings);

    // Synchronize to side service via BLE
    console.log('[AUDIT] page2 saveAndExit: sending UPDATE_SETTINGS to app-side');
    this.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: this.state.settings
    });

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
    const resWidget = this.state.widgets.testResult;
    if (resWidget) {
      try {
        resWidget.setProperty(prop.TEXT, 'Testando conexao...');
        resWidget.setProperty(prop.COLOR, 0xFFAA00);
      } catch (e) {}
    }

    this.sendMessage({
      type: 'VERIFY_URL',
      apiUrl: this.state.settings.apiUrl,
      apiToken: this.state.settings.apiToken
    });
  },

  getSecret() {
    const resWidget = this.state.widgets.testResult;
    if (resWidget) {
      try {
        resWidget.setProperty(prop.TEXT, 'Buscando token...');
        resWidget.setProperty(prop.COLOR, 0xFFAA00);
      } catch (e) {}
    }

    this.sendMessage({
      type: 'GET_SECRET'
    });
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
        if (res.success) {
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
          this.state.settings.apiToken = res.token;
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

  onDestroy() {
    console.log('[AUDIT] page2 onDestroy: cleaning up tab widgets (BLE connection kept alive for page/index)');
    this.clearTabWidgets();
    // AUDIT FIX: Do NOT call ble.disConnect() here!
    // Calling ble.disConnect() destroys the global BLE listener, killing page/index.js when it resumes.
  }
});