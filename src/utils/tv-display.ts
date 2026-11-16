/**
 * Helper dedicati alla compatibilità Smart TV (Samsung Tizen, LG webOS, Android TV)
 * per adattamento proporzionale a pieno schermo, Dark Mode garantita e Fullscreen cross-browser.
 */

export interface TvStageLayout {
  shouldScale: boolean;
  scale: number;
  virtualWidth: number;
  virtualHeight: number;
  isTvViewport: boolean;
}

export const REFERENCE_STAGE_WIDTH = 1360;
export const REFERENCE_STAGE_HEIGHT = 760;
export const MIN_LANDSCAPE_STAGE_WIDTH = 640;

/**
 * Rileva User-Agent di Smart TV (Samsung Tizen, LG webOS, Android TV, Fire TV, Hisense, Philips).
 */
export function isSmartTvUserAgent(userAgent: string = ''): boolean {
  if (!userAgent) return false;
  return /(tizen|smart-tv|smarttv|web0s|webos|lg browser|netcast|hbbtv|viera|bravia|vidaa|aft[a-z0-9]|googletv|android tv|crkey)/i.test(
    userAgent
  );
}

/**
 * Verifica se la URL o il contesto richiedono l'attivazione automatica della Modalità TV.
 */
export function shouldAutoEnableTvMode(search: string = '', _userAgent: string = ''): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search);
    const view = (params.get('view') || '').toLowerCase();
    const mode = (params.get('mode') || '').toLowerCase();
    const tv = (params.get('tv') || '').toLowerCase();
    const fs = (params.get('fullscreen') || '').toLowerCase();
    return view === 'tv' || mode === 'tv' || tv === '1' || tv === 'true' || fs === '1' || fs === 'true';
  } catch {
    return false;
  }
}

/**
 * Calcola la scala virtuale proporzionale per far rientrare l'intera interfaccia PC (1360x760+)
 * esattamente bordo-bordo in qualsiasi risoluzione Smart TV (es. 960x540, 1280x720, 1280x640, 1920x1080)
 * senza tagliare nessun box (Pedina, Montepremi, Colori, Countdown, Vincite, Tabellone).
 */
export function computeTvStageLayout(
  viewportWidth: number,
  viewportHeight: number,
  isTvStudioMode: boolean = false,
  userAgent: string = ''
): TvStageLayout {
  const vw = Math.max(1, Math.floor(Number(viewportWidth) || 0));
  const vh = Math.max(1, Math.floor(Number(viewportHeight) || 0));
  const isTvUa = isSmartTvUserAgent(userAgent);

  // Gli smartphone verticali (<640px) usano il layout impilato mobile
  if (vw < MIN_LANDSCAPE_STAGE_WIDTH) {
    return {
      shouldScale: false,
      scale: 1,
      virtualWidth: vw,
      virtualHeight: vh,
      isTvViewport: isTvUa,
    };
  }

  const needsScale = vw < REFERENCE_STAGE_WIDTH || vh < REFERENCE_STAGE_HEIGHT;
  if (!needsScale) {
    return {
      shouldScale: false,
      scale: 1,
      virtualWidth: vw,
      virtualHeight: vh,
      isTvViewport: isTvUa || isTvStudioMode,
    };
  }

  const rawScale = Math.min(vw / REFERENCE_STAGE_WIDTH, vh / REFERENCE_STAGE_HEIGHT);
  const scale = Math.max(0.4, Math.min(1, Math.floor(rawScale * 10000) / 10000));
  const virtualWidth = Math.max(REFERENCE_STAGE_WIDTH, Math.ceil(vw / scale));
  const virtualHeight = Math.max(REFERENCE_STAGE_HEIGHT, Math.ceil(vh / scale));

  return {
    shouldScale: true,
    scale,
    virtualWidth,
    virtualHeight,
    isTvViewport: true,
  };
}

/**
 * Fallback di larghezza per .board-container sui browser TV meno recenti
 * (Samsung Tizen / LG webOS con Chromium < 88 privi di CSS aspect-ratio).
 */
export function computeBoardFallbackWidth(containerHeightPx: number, aspectRatio: number = 1.05): number {
  if (!Number.isFinite(containerHeightPx) || containerHeightPx <= 0) return 0;
  return Math.round(containerHeightPx * aspectRatio);
}

/**
 * Restituisce l'elemento attualmente in fullscreen includendo i prefissi vendor Smart TV.
 */
export function getFullscreenElement(doc: Document | null | undefined): Element | null {
  if (!doc) return null;
  const anyDoc = doc as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    anyDoc.fullscreenElement ||
    anyDoc.webkitFullscreenElement ||
    anyDoc.mozFullScreenElement ||
    anyDoc.msFullscreenElement ||
    null
  );
}

/**
 * Richiede fullscreen in modo sicuro su browser PC, Samsung Tizen e LG webOS.
 * Ritorna true se una API fullscreen è stata invocata senza errori sincroni.
 */
export async function requestVendorFullscreen(el: HTMLElement | null | undefined): Promise<boolean> {
  if (!el) return false;
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  const fn =
    anyEl.requestFullscreen ||
    anyEl.webkitRequestFullscreen ||
    anyEl.webkitRequestFullScreen ||
    anyEl.mozRequestFullScreen ||
    anyEl.msRequestFullscreen;

  if (typeof fn !== 'function') return false;
  try {
    const result = fn.call(anyEl);
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Esce dal fullscreen in modo sicuro su browser PC, Samsung Tizen e LG webOS.
 */
export async function exitVendorFullscreen(doc: Document | null | undefined): Promise<boolean> {
  if (!doc) return false;
  const anyDoc = doc as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitCancelFullScreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  const fn =
    anyDoc.exitFullscreen ||
    anyDoc.webkitExitFullscreen ||
    anyDoc.webkitCancelFullScreen ||
    anyDoc.mozCancelFullScreen ||
    anyDoc.msExitFullscreen;

  if (typeof fn !== 'function') return false;
  try {
    const result = fn.call(anyDoc);
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }
    return true;
  } catch {
    return false;
  }
}
