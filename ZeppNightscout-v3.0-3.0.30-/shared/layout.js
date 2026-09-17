import { getDeviceInfo } from '@zos/device';

/**
 * ZightScout Responsive Layout Subsystem (v2.0.2)
 *
 * Dynamically computes proportional dimensions and positions based on
 * the reference resolution of 466x466 (Amazfit Active 2 / GTR series).
 *
 * 5 Salvaguardas v2.0.2:
 * 1. Runtime Block for unsupported low-resolution screens (< 390px)
 * 2. Mathematical fallback for screenShape on early Zepp OS 3.0 firmwares
 * 3. Anti-clipping layout tuning for rectangular displays (390x450)
 * 4. Stable glyph metrics for glucose trend arrows
 * 5. Official ZightScout Owl asset branding
 */

/**
 * Validates whether the device meets minimum medical display requirements (>= 390x400)
 */
export function isDeviceSupported() {
  let dev = null;
  try {
    dev = getDeviceInfo();
  } catch (e) {
    if (typeof hmSetting !== 'undefined' && typeof hmSetting.getDeviceInfo === 'function') {
      dev = hmSetting.getDeviceInfo();
    }
  }
  const W = (dev && dev.width) || 466;
  const H = (dev && dev.height) || 466;

  // Reject devices with low resolution (e.g. Active Edge 360x360, Bip 5 Unity 320x380)
  if (W < 390 || H < 400) {
    return false;
  }
  return true;
}

export function getLayout() {
  let dev = null;
  try {
    dev = getDeviceInfo();
  } catch (e) {
    if (typeof hmSetting !== 'undefined' && typeof hmSetting.getDeviceInfo === 'function') {
      dev = hmSetting.getDeviceInfo();
    }
  }

  if (!dev || !dev.width || !dev.height) {
    dev = { width: 466, height: 466, screenShape: 1 };
  }

  const W = dev.width || 466;
  const H = dev.height || 466;
  const BASE = 466; // Reference base resolution

  const scaleX = W / BASE;
  const scaleY = H / BASE;
  const scale = Math.min(scaleX, scaleY); // Uniform scale to preserve aspect ratio
  const CX = Math.floor(W / 2);
  const CY = Math.floor(H / 2);

  // Salvaguarda 2: Fallback screenShape para firmwares Zepp OS 3.0 iniciais
  let isRound = true;
  if (dev.screenShape !== undefined && dev.screenShape !== null) {
    isRound = (dev.screenShape === 1);
  } else {
    // Se largura == altura, o display físico é circular (466x466, 480x480)
    isRound = (W === H);
  }

  // -------------------------------------------------------------
  // Page 1: Main Glucose Monitor (page/index.js)
  // Salvaguarda 3: Anti-clipping em telas retangulares (390x450)
  // -------------------------------------------------------------
  const headerY = isRound ? Math.max(14, Math.floor(36 * scaleY)) : Math.max(10, Math.floor(26 * scaleY));
  const headerFontSize = Math.max(16, Math.floor(22 * scale));

  const glucoseY = isRound ? Math.max(48, Math.floor(72 * scaleY)) : Math.max(38, Math.floor(54 * scaleY));
  const glucoseH = isRound ? Math.max(50, Math.floor(96 * scaleY)) : Math.max(44, Math.floor(82 * scaleY));
  // Keep glucose reading prominently readable on smaller displays (min 36px)
  const glucoseFontSize = Math.max(36, Math.floor(76 * scale));
  const arrowSize = Math.max(28, Math.floor(40 * scale));
  const arrowY = glucoseY + Math.floor((glucoseH - arrowSize) / 2);

  const deltaY = isRound 
    ? Math.max(glucoseY + glucoseH + 4, Math.floor(172 * scaleY))
    : Math.max(glucoseY + glucoseH + 2, Math.floor(140 * scaleY));
  const deltaFontSize = Math.max(12, Math.floor(16 * scale));

  const statusY = isRound
    ? Math.max(deltaY + 24, Math.floor(206 * scaleY))
    : Math.max(deltaY + 20, Math.floor(168 * scaleY));
  const statusFontSize = Math.max(13, Math.floor(16 * scale));

  // Compact connection state occupies the space reclaimed from the graph.
  const connectionY = statusY + Math.floor(25 * scaleY);
  const connectionH = Math.max(19, Math.floor(22 * scaleY));
  const connectionFontSize = Math.max(10, Math.floor(13 * scale));

  // Graph card: approximately 55–70px shorter so the connection state remains visible.
  const graphY = isRound
    ? Math.max(connectionY + connectionH + 4, Math.floor(H * 0.50))
    : Math.max(connectionY + connectionH + 4, Math.floor(H * 0.48));
  const graphH = isRound
    ? Math.max(54, Math.floor(H * 0.15))
    : Math.max(58, Math.floor(H * 0.21));
  const graphW = Math.floor(W * (isRound ? 0.84 : 0.92));
  const graphX = Math.floor((W - graphW) / 2);

  // Bottom action buttons (Refresh and Settings)
  const btnBottomY = Math.floor(H * (isRound ? 0.85 : 0.89));
  const btnW = Math.max(80, Math.floor(120 * scaleX));
  const btnH = Math.max(32, Math.floor(38 * scaleY));
  const btnRadius = Math.floor(btnH / 2);
  const btnFontSize = Math.max(12, Math.floor(16 * scale));
  const btnGap = Math.max(10, Math.floor(20 * scaleX));

  // -------------------------------------------------------------
  // Page 2: Settings Panel (page/page2.js)
  // -------------------------------------------------------------
  const p2TitleY = Math.max(10, Math.floor(18 * scaleY));
  const p2TitleFontSize = Math.max(15, Math.floor(20 * scale));

  // 3-tab navigation bar
  const tabW = Math.max(76, Math.floor(104 * scaleX));
  const tabH = Math.max(26, Math.floor(32 * scaleY));
  const tabY = Math.max(p2TitleY + 24, Math.floor(48 * scaleY));
  const tabGap = Math.max(4, Math.floor(8 * scaleX));
  const tabStartX = CX - Math.floor((tabW * 3 + tabGap * 2) / 2);
  const tabFontSize = Math.max(11, Math.floor(14 * scale));

  // Fixed "Salvar e Voltar" button at bottom
  const saveBtnW = Math.max(120, Math.floor(180 * scaleX));
  const saveBtnH = Math.max(34, Math.floor(40 * scaleY));
  const saveBtnY = H - saveBtnH - Math.max(8, Math.floor(isRound ? 16 * scaleY : 8 * scaleY));
  const saveBtnRadius = Math.floor(saveBtnH / 2);
  const saveBtnFontSize = Math.max(13, Math.floor(16 * scale));

  // Thresholds tab (Aba 1: Faixas)
  const rowStartY = tabY + tabH + Math.max(8, Math.floor(12 * scaleY));
  const rowH = Math.max(48, Math.floor(64 * scaleY));
  const stepBtnW = Math.max(36, Math.floor(48 * scaleX));
  const stepBtnH = Math.max(26, Math.floor(36 * scaleY));
  const stepBtnRadius = Math.floor(stepBtnH / 2);
  const valDisplayW = Math.max(54, Math.floor(72 * scaleX));

  return {
    W,
    H,
    CX,
    CY,
    BASE,
    scale,
    scaleX,
    scaleY,
    isRound,

    // Page 1 metrics
    headerY,
    headerFontSize,
    glucoseY,
    glucoseH,
    glucoseFontSize,
    arrowSize,
    arrowY,
    deltaY,
    deltaFontSize,
    statusY,
    statusFontSize,
    connectionY,
    connectionH,
    connectionFontSize,
    graphBox: {
      x: graphX,
      y: graphY,
      w: graphW,
      h: graphH
    },
    btnBottomY,
    btnW,
    btnH,
    btnRadius,
    btnFontSize,
    btnGap,

    // Page 2 metrics
    p2TitleY,
    p2TitleFontSize,
    tabW,
    tabH,
    tabY,
    tabGap,
    tabStartX,
    tabFontSize,
    saveBtnW,
    saveBtnH,
    saveBtnY,
    saveBtnRadius,
    saveBtnFontSize,
    rowStartY,
    rowH,
    stepBtnW,
    stepBtnH,
    stepBtnRadius,
    valDisplayW
  };
}
