import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBoardFallbackWidth,
  computeTvStageLayout,
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

test('shouldAutoEnableTvMode enables only on explicit TV or fullscreen URL flags', () => {
  assert.equal(shouldAutoEnableTvMode('?view=tv'), true);
  assert.equal(shouldAutoEnableTvMode('?mode=tv'), true);
  assert.equal(shouldAutoEnableTvMode('?tv=1'), true);
  assert.equal(shouldAutoEnableTvMode('?fullscreen=1'), true);
  assert.equal(shouldAutoEnableTvMode(''), false);
  assert.equal(shouldAutoEnableTvMode('?foo=bar'), false);
});

test('computeTvStageLayout scales 960x540 and 1280x720 TV browsers edge-to-edge without clipping', () => {
  const tv960 = computeTvStageLayout(960, 540, false, 'SMART-TV; Tizen 6.5');
  assert.equal(tv960.shouldScale, true);
  assert.equal(tv960.isTvViewport, true);
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

  const phone = computeTvStageLayout(390, 844, false, 'iPhone');
  assert.equal(phone.shouldScale, false);
});

test('computeBoardFallbackWidth calculates 1.05x square-ish width for older Smart TV engines', () => {
  assert.equal(computeBoardFallbackWidth(640), 672);
  assert.equal(computeBoardFallbackWidth(0), 0);
});
