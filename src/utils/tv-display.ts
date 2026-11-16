/**
 * Helper dedicati alla compatibilità Smart TV (Samsung Tizen, LG webOS, Android TV)
 * per adattamento proporzionale a pieno schermo, Dark Mode garantita, Kiosk Mode 4K/1080p e Fullscreen cross-browser.
 */

export type TvResolutionTier = '4k' | '1080p' | 'hd';

export interface TvStageLayout {
  shouldScale: boolean;
  scale: number;
  virtualWidth: number;
  virtualHeight: number;
  isTvViewport: boolean;
  resolutionTier: TvResolutionTier;
}

export interface KioskViewportResult {
  updated: boolean;
  content: string;
  resolutionTier: TvResolutionTier;
}

export interface EnterKioskModeOptions {
  doc?: Document | null;
  win?: Window | null;
  userAgent?: string;
  requestFullscreen?: boolean;
}

export interface EnterKioskModeResult {
  kioskActive: boolean;
  fullscreenRequested: boolean;
  fullscreenEntered: boolean;
  resolutionTier: TvResolutionTier;
  viewportContent: string;
  stageLayout: TvStageLayout;
}

export const REFERENCE_STAGE_WIDTH = 1360;
export const REFERENCE_STAGE_HEIGHT = 760;
export const FHD_STAGE_WIDTH = 1920;
export const FHD_STAGE_HEIGHT = 1080;
export const UHD_MIN_WIDTH = 2560;
export const UHD_MIN_HEIGHT = 1440;
export const MIN_LANDSCAPE_STAGE_WIDTH = 640;

export const KIOSK_VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

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
 * Determina la fascia di risoluzione dello schermo TV (4K UHD, 1080p Full HD, HD/Standard).
 */
export function detectTvResolutionTier(viewportWidth: number, viewportHeight: number): TvResolutionTier {
  const vw = Math.max(1, Math.floor(Number(viewportWidth) || 0));
  const vh = Math.max(1, Math.floor(Number(viewportHeight) || 0));
  if (vw >= UHD_MIN_WIDTH && vh >= UHD_MIN_HEIGHT) {
    return '4k';
  }
  if (vw >= 1680 && vh >= 960) {
    return '1080p';
  }
  return 'hd';
}

/**
 * Costruisce il valore ottimizzato del meta tag viewport per modalità Kiosk TV senza zoom o barre di scorrimento.
 */
export function buildKioskViewportContent(
  viewportWidth: number = FHD_STAGE_WIDTH,
  viewportHeight: number = FHD_STAGE_HEIGHT
): string {
  // Mantiene device-width bloccato a 1.0x con viewport-fit=cover per riempimento bordo-bordo su 4K e 1080p
  void viewportWidth;
  void viewportHeight;
  return KIOSK_VIEWPORT_CONTENT;
}

/**
 * Verifica se la URL o il contesto richiedono l'attivazione automatica della Modalità TV / Kiosk.
 */
export function shouldAutoEnableTvMode(search: string = '', _userAgent: string = ''): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search);
    const view = (params.get('view') || '').toLowerCase();
    const mode = (params.get('mode') || '').toLowerCase();
    const tv = (params.get('tv') || '').toLowerCase();
    const fs = (params.get('fullscreen') || '').toLowerCase();
    const kiosk = (params.get('kiosk') || '').toLowerCase();
    return (
      view === 'tv' ||
      mode === 'tv' ||
      tv === '1' ||
      tv === 'true' ||
      fs === '1' ||
      fs === 'true' ||
      kiosk === '1' ||
      kiosk === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * Calcola la scala virtuale proporzionale per far rientrare l'intera interfaccia bordo-bordo
 * su qualsiasi risoluzione Smart TV (960x540, 1280x720, 1920x1080 1080p, 3840x2160 4K)
 * senza tagliare nessun box e senza barre di scorrimento.
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
  const resolutionTier = detectTvResolutionTier(vw, vh);

  // Gli smartphone verticali (<640px) usano il layout impilato mobile
  if (vw < MIN_LANDSCAPE_STAGE_WIDTH) {
    return {
      shouldScale: false,
      scale: 1,
      virtualWidth: vw,
      virtualHeight: vh,
      isTvViewport: isTvUa,
      resolutionTier,
    };
  }

  // Su risoluzioni 4K UHD (>= 2560x1440) in modalità TV/Kiosk scaliamo lo stage Full-HD 1920x1080
  // proporzionalmente (es. 2.0x su 3840x2160) per mantenere proporzioni broadcast nitide bordo-bordo.
  if ((isTvUa || isTvStudioMode) && resolutionTier === '4k') {
    const rawUpScale = Math.min(vw / FHD_STAGE_WIDTH, vh / FHD_STAGE_HEIGHT);
    const scale = Math.max(1, Math.floor(rawUpScale * 10000) / 10000);
    const virtualWidth = Math.max(FHD_STAGE_WIDTH, Math.round(vw / scale));
    const virtualHeight = Math.max(FHD_STAGE_HEIGHT, Math.round(vh / scale));
    return {
      shouldScale: true,
      scale,
      virtualWidth,
      virtualHeight,
      isTvViewport: true,
      resolutionTier,
    };
  }

  const needsDownScale = vw < REFERENCE_STAGE_WIDTH || vh < REFERENCE_STAGE_HEIGHT;
  if (!needsDownScale) {
    return {
      shouldScale: false,
      scale: 1,
      virtualWidth: vw,
      virtualHeight: vh,
      isTvViewport: isTvUa || isTvStudioMode,
      resolutionTier,
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
    resolutionTier,
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
 * Aggiorna o crea i meta tag viewport e fullscreen per rimuovere barre di scorrimento
 * e ottimizzare la resa su schermi TV 4K/1080p.
 */
export function applyKioskViewportMeta(
  doc: Document | null | undefined,
  viewportWidth: number = FHD_STAGE_WIDTH,
  viewportHeight: number = FHD_STAGE_HEIGHT
): KioskViewportResult {
  const resolutionTier = detectTvResolutionTier(viewportWidth, viewportHeight);
  const content = buildKioskViewportContent(viewportWidth, viewportHeight);

  if (!doc || typeof doc.querySelector !== 'function') {
    return { updated: false, content, resolutionTier };
  }

  let viewportMeta = doc.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (!viewportMeta && doc.head && typeof doc.createElement === 'function') {
    viewportMeta = doc.createElement('meta');
    viewportMeta.setAttribute('name', 'viewport');
    doc.head.appendChild(viewportMeta);
  }

  if (viewportMeta) {
    if (viewportMeta.dataset && !viewportMeta.dataset.defaultViewportContent) {
      viewportMeta.dataset.defaultViewportContent = viewportMeta.getAttribute('content') || '';
    }
    viewportMeta.setAttribute('content', content);
    if (viewportMeta.dataset) {
      viewportMeta.dataset.kioskResolution = resolutionTier;
    }
  }

  // Imposta anche meta tag full-screen web app per browser TV / mobile kiosk
  const ensureMeta = (name: string, val: string) => {
    let el = doc.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
    if (!el && doc.head && typeof doc.createElement === 'function') {
      el = doc.createElement('meta');
      el.setAttribute('name', name);
      doc.head.appendChild(el);
    }
    if (el) el.setAttribute('content', val);
  };
  ensureMeta('mobile-web-app-capable', 'yes');
  ensureMeta('apple-mobile-web-app-capable', 'yes');

  return { updated: Boolean(viewportMeta), content, resolutionTier };
}

/**
 * Ripristina il meta tag viewport predefinito quando si esce manualmente dalla modalità Kiosk su desktop.
 */
export function restoreDefaultViewportMeta(doc: Document | null | undefined): void {
  if (!doc || typeof doc.querySelector !== 'function') return;
  const viewportMeta = doc.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (viewportMeta?.dataset?.defaultViewportContent) {
    viewportMeta.setAttribute('content', viewportMeta.dataset.defaultViewportContent);
    delete viewportMeta.dataset.kioskResolution;
  }
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
 * Richiede fullscreen in modo sicuro su browser PC, Samsung Tizen e LG webOS tramite `requestFullscreen()`.
 * Ritorna true se una API fullscreen è stata invocata senza errori sincroni/asincroni.
 */
export async function requestVendorFullscreen(el: HTMLElement | null | undefined): Promise<boolean> {
  if (!el) return false;
  const anyEl = el as HTMLElement & {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  if (typeof anyEl.requestFullscreen === 'function') {
    try {
      const result = anyEl.requestFullscreen({ navigationUI: 'hide' });
      if (result && typeof result.then === 'function') {
        await result;
      }
      return true;
    } catch (err) {
      if (err instanceof TypeError) {
        try {
          const retryResult = anyEl.requestFullscreen();
          if (retryResult && typeof retryResult.then === 'function') {
            await retryResult;
          }
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  const vendorFn =
    anyEl.webkitRequestFullscreen ||
    anyEl.webkitRequestFullScreen ||
    anyEl.mozRequestFullScreen ||
    anyEl.msRequestFullscreen;

  if (typeof vendorFn !== 'function') return false;
  try {
    const result = vendorFn.call(anyEl);
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

/**
 * Attiva la modalità Kiosk TV:
 * - Imposta i meta tag viewport dedicati per eliminare zoom accidentali e barre di scorrimento
 * - Ottimizza layout e classi CSS per risoluzioni 4K / 1080p / HD garantendo il riempimento totale
 * - Invoca l'API `requestFullscreen()` sull'elemento radice del documento
 */
export async function enterKioskMode(options: EnterKioskModeOptions = {}): Promise<EnterKioskModeResult> {
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
  const win = options.win ?? (typeof window !== 'undefined' ? window : null);
  const ua =
    options.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');

  const vw = Math.max(
    1,
    Math.floor(
      win?.innerWidth ||
        doc?.documentElement?.clientWidth ||
        FHD_STAGE_WIDTH
    )
  );
  const vh = Math.max(
    1,
    Math.floor(
      win?.innerHeight ||
        doc?.documentElement?.clientHeight ||
        FHD_STAGE_HEIGHT
    )
  );

  const stageLayout = computeTvStageLayout(vw, vh, true, ua);
  const { content: viewportContent, resolutionTier } = applyKioskViewportMeta(doc, vw, vh);

  if (doc?.documentElement) {
    doc.documentElement.classList.add('tv-kiosk-html');
    doc.documentElement.style.overflow = 'hidden';
    doc.documentElement.style.overflowX = 'hidden';
    doc.documentElement.style.overflowY = 'hidden';
    doc.documentElement.style.width = '100%';
    doc.documentElement.style.height = '100%';
  }

  if (doc?.body) {
    doc.body.classList.add('tv-kiosk-mode', 'tv-studio-active', 'tv-device');
    doc.body.classList.toggle('tv-res-4k', resolutionTier === '4k');
    doc.body.classList.toggle('tv-res-1080p', resolutionTier === '1080p' || resolutionTier === '4k');
    doc.body.classList.toggle('tv-res-hd', resolutionTier === 'hd');
    doc.body.style.overflow = 'hidden';
    doc.body.style.overflowX = 'hidden';
    doc.body.style.overflowY = 'hidden';

    if (stageLayout.shouldScale) {
      doc.body.classList.add('tv-scaled');
      doc.body.style.setProperty('--tv-stage-scale', String(stageLayout.scale));
      doc.body.style.setProperty('--tv-stage-width', `${stageLayout.virtualWidth}px`);
      doc.body.style.setProperty('--tv-stage-height', `${stageLayout.virtualHeight}px`);
    } else {
      doc.body.classList.remove('tv-scaled');
      doc.body.style.removeProperty('--tv-stage-scale');
      doc.body.style.removeProperty('--tv-stage-width');
      doc.body.style.removeProperty('--tv-stage-height');
    }
  }

  let fullscreenEntered = Boolean(getFullscreenElement(doc));
  const shouldRequestFs = options.requestFullscreen !== false;
  if (shouldRequestFs && doc?.documentElement && !fullscreenEntered) {
    fullscreenEntered = await requestVendorFullscreen(doc.documentElement);
  }

  return {
    kioskActive: true,
    fullscreenRequested: shouldRequestFs,
    fullscreenEntered,
    resolutionTier,
    viewportContent,
    stageLayout,
  };
}

/**
 * Disattiva la modalità Kiosk TV e ripristina viewport e fullscreen.
 */
export async function exitKioskMode(
  doc: Document | null | undefined = typeof document !== 'undefined' ? document : null
): Promise<void> {
  if (doc?.documentElement) {
    doc.documentElement.classList.remove('tv-kiosk-html');
    doc.documentElement.style.removeProperty('overflow');
    doc.documentElement.style.removeProperty('overflow-x');
    doc.documentElement.style.removeProperty('overflow-y');
    doc.documentElement.style.removeProperty('width');
    doc.documentElement.style.removeProperty('height');
  }
  if (doc?.body) {
    doc.body.classList.remove('tv-kiosk-mode', 'tv-res-4k', 'tv-res-1080p', 'tv-res-hd');
    doc.body.style.removeProperty('overflow');
    doc.body.style.removeProperty('overflow-x');
    doc.body.style.removeProperty('overflow-y');
  }
  restoreDefaultViewportMeta(doc);
  if (getFullscreenElement(doc)) {
    await exitVendorFullscreen(doc);
  }
}
