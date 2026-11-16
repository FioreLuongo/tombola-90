import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIOSK_VIEWPORT_CONTENT,
  computeBoardFallbackWidth,
  computeTvStageLayout,
  detectTvResolutionTier,
  enterKioskMode,
  exitKioskMode,
  isSmartTvUserAgent,
  shouldAutoEnableTvMode,
} from './tv-display';

test('isSmartTvUserAgent identifies Samsung Tizen, LG webOS, and Android TV browsers', () => {
  assert.equal(
    isSmartTvUserAgent(
      'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36'
    ),
    true
  );
  assert.equal(
    isSmartTvUserAgent(
      'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager'
    ),
    true
  );
  assert.equal(
    isSmartTvUserAgent(
      'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K VH2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.85 Safari/537.36'
    ),
    true
  );
  assert.equal(
    isSmartTvUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ),
    false
  );
});

test('shouldAutoEnableTvMode enables only on explicit TV, kiosk, or fullscreen URL flags', () => {
  assert.equal(shouldAutoEnableTvMode('?view=tv'), true);
  assert.equal(shouldAutoEnableTvMode('?mode=tv'), true);
  assert.equal(shouldAutoEnableTvMode('?tv=1'), true);
  assert.equal(shouldAutoEnableTvMode('?fullscreen=1'), true);
  assert.equal(shouldAutoEnableTvMode('?kiosk=1'), true);
  assert.equal(shouldAutoEnableTvMode('?kiosk=true'), true);
  assert.equal(shouldAutoEnableTvMode(''), false);
  assert.equal(shouldAutoEnableTvMode('?foo=bar'), false);
});

test('detectTvResolutionTier classifies 4K, 1080p, and HD viewports accurately', () => {
  assert.equal(detectTvResolutionTier(3840, 2160), '4k');
  assert.equal(detectTvResolutionTier(2560, 1440), '4k');
  assert.equal(detectTvResolutionTier(1920, 1080), '1080p');
  assert.equal(detectTvResolutionTier(1280, 720), 'hd');
  assert.equal(detectTvResolutionTier(960, 540), 'hd');
});

test('computeTvStageLayout scales 960x540, 1280x720, 1080p, and 4K TV browsers edge-to-edge without clipping', () => {
  const tv960 = computeTvStageLayout(960, 540, false, 'SMART-TV; Tizen 6.5');
  assert.equal(tv960.shouldScale, true);
  assert.equal(tv960.isTvViewport, true);
  assert.equal(tv960.resolutionTier, 'hd');
  assert.ok(tv960.scale > 0.69 && tv960.scale <= 0.71);
  assert.ok(tv960.virtualWidth >= 1360);
  assert.ok(tv960.virtualHeight >= 760);
  // Scaled result must never exceed actual TV viewport width/height by more than 1px rounding
  assert.ok(Math.floor(tv960.virtualWidth * tv960.scale) <= 961);
  assert.ok(Math.floor(tv960.virtualHeight * tv960.scale) <= 541);

  const tv1280Bar = computeTvStageLayout(1280, 640, true, 'Web0S; SmartTV');
  assert.equal(tv1280Bar.shouldScale, true);
  assert.ok(tv1280Bar.virtualWidth >= 1360);
  assert.ok(tv1280Bar.virtualHeight >= 760);

  const hd1920 = computeTvStageLayout(1920, 1080, true, 'SMART-TV; Tizen 7.0');
  assert.equal(hd1920.shouldScale, false);
  assert.equal(hd1920.scale, 1);
  assert.equal(hd1920.resolutionTier, '1080p');

  const uhd4k = computeTvStageLayout(3840, 2160, true, 'SMART-TV; Tizen 7.0');
  assert.equal(uhd4k.shouldScale, true);
  assert.equal(uhd4k.scale, 2);
  assert.equal(uhd4k.virtualWidth, 1920);
  assert.equal(uhd4k.virtualHeight, 1080);
  assert.equal(uhd4k.resolutionTier, '4k');

  const phone = computeTvStageLayout(390, 844, false, 'iPhone');
  assert.equal(phone.shouldScale, false);
});

test('computeBoardFallbackWidth calculates 1.05x square-ish width for older Smart TV engines', () => {
  assert.equal(computeBoardFallbackWidth(640), 672);
  assert.equal(computeBoardFallbackWidth(0), 0);
});

function createMockElement(tag = 'div') {
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const props = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const styleObj: Record<string, unknown> = {
    overflow: '',
    overflowX: '',
    overflowY: '',
    width: '',
    height: '',
    setProperty: (k: string, v: string) => props.set(k, v),
    removeProperty: (k: string) => {
      props.delete(k);
      if (k === 'overflow') styleObj.overflow = '';
      if (k === 'overflow-x') styleObj.overflowX = '';
      if (k === 'overflow-y') styleObj.overflowY = '';
      if (k === 'width') styleObj.width = '';
      if (k === 'height') styleObj.height = '';
    },
    getPropertyValue: (k: string) => props.get(k) || '',
  };
  return {
    tagName: tag.toUpperCase(),
    dataset,
    style: styleObj,
    classList: {
      add: (...list: string[]) => list.forEach((c) => classes.add(c)),
      remove: (...list: string[]) => list.forEach((c) => classes.delete(c)),
      toggle: (c: string, force?: boolean) => {
        const next = typeof force === 'boolean' ? force : !classes.has(c);
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      },
      contains: (c: string) => classes.has(c),
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    _props: props,
  };
}

test('enterKioskMode invokes requestFullscreen, updates viewport meta, removes scrollbars, and optimizes 4K/1080p', async () => {
  const viewportMeta = createMockElement('meta');
  viewportMeta.setAttribute('name', 'viewport');
  viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0');

  const mobileMeta = createMockElement('meta');
  const appleMeta = createMockElement('meta');
  const htmlEl = createMockElement('html') as ReturnType<typeof createMockElement> & {
    clientWidth: number;
    clientHeight: number;
    requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
  };
  const bodyEl = createMockElement('body');
  const headEl = { appendChild: (_el: unknown) => {} };

  let fsCalls = 0;
  let fsElement: unknown = null;
  htmlEl.clientWidth = 3840;
  htmlEl.clientHeight = 2160;
  htmlEl.requestFullscreen = async () => {
    fsCalls += 1;
    fsElement = htmlEl;
  };

  const mockDoc = {
    head: headEl,
    documentElement: htmlEl,
    body: bodyEl,
    get fullscreenElement() {
      return fsElement;
    },
    exitFullscreen: async () => {
      fsElement = null;
    },
    querySelector: (sel: string) => {
      if (sel === 'meta[name="viewport"]') return viewportMeta;
      if (sel === 'meta[name="mobile-web-app-capable"]') return mobileMeta;
      if (sel === 'meta[name="apple-mobile-web-app-capable"]') return appleMeta;
      return null;
    },
    createElement: (tag: string) => createMockElement(tag),
  } as unknown as Document;

  const mockWin4k = { innerWidth: 3840, innerHeight: 2160 } as Window;
  const res4k = await enterKioskMode({
    doc: mockDoc,
    win: mockWin4k,
    userAgent: 'SMART-TV; LINUX; Tizen 7.0',
  });

  assert.equal(res4k.kioskActive, true);
  assert.equal(res4k.fullscreenRequested, true);
  assert.equal(res4k.fullscreenEntered, true);
  assert.equal(fsCalls, 1);
  assert.equal(res4k.resolutionTier, '4k');
  assert.equal(res4k.viewportContent, KIOSK_VIEWPORT_CONTENT);
  assert.equal(viewportMeta.getAttribute('content'), KIOSK_VIEWPORT_CONTENT);
  assert.equal(viewportMeta.dataset.kioskResolution, '4k');
  assert.equal(htmlEl.style.overflow, 'hidden');
  assert.equal(bodyEl.style.overflow, 'hidden');
  assert.equal(htmlEl.classList.contains('tv-kiosk-html'), true);
  assert.equal(bodyEl.classList.contains('tv-kiosk-mode'), true);
  assert.equal(bodyEl.classList.contains('tv-res-4k'), true);
  assert.equal(bodyEl.classList.contains('tv-scaled'), true);
  assert.equal(bodyEl._props.get('--tv-stage-scale'), '2');
  assert.equal(bodyEl._props.get('--tv-stage-width'), '1920px');
  assert.equal(bodyEl._props.get('--tv-stage-height'), '1080px');

  await exitKioskMode(mockDoc);
  assert.equal(fsElement, null);
  assert.equal(bodyEl.classList.contains('tv-kiosk-mode'), false);
  assert.equal(viewportMeta.getAttribute('content'), 'width=device-width, initial-scale=1.0');
});

