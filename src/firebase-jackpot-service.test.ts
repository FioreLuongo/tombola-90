import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultRegiaGameConfig,
  buildRegiaGameConfigSignature,
  DEFAULT_REGIA_PROFILES,
  sanitizeProfileId,
  sanitizeRegiaGameConfig,
} from './firebase-jackpot-service';

test('sanitizeProfileId normalizes spaces, casing, and unsafe characters', () => {
  assert.equal(sanitizeProfileId('  Serata Sabato VIP!! '), 'serata_sabato_vip');
  assert.equal(sanitizeProfileId('profilo-custom_1'), 'profilo-custom_1');
  assert.ok(sanitizeProfileId('   ').startsWith('profilo_'));
});

test('DEFAULT_REGIA_PROFILES includes all 4 base presets with valid thresholds', () => {
  const ids = DEFAULT_REGIA_PROFILES.map((p) => p.id);
  assert.deepEqual(ids, ['high', 'medium', 'normal', 'random']);

  for (const profile of DEFAULT_REGIA_PROFILES) {
    assert.equal(profile.isPreset, true);
    assert.ok(profile.forcedMinAmbo >= 1 && profile.forcedMinAmbo <= 90);
    assert.ok(profile.forcedMinTombola >= profile.forcedMinAmbo);
    assert.ok(profile.delayMaxGold >= 5 && profile.delayMaxGold <= 90);
    assert.ok(profile.delayMaxTombola >= 5 && profile.delayMaxTombola <= 90);
  }
});

test('sanitizeRegiaGameConfig enforces bounds and buildRegiaGameConfigSignature ignores timestamps', () => {
  const defaults = buildDefaultRegiaGameConfig();
  assert.equal(defaults.id, 'main');
  assert.equal(defaults.prizes.currency, '€');

  const sanitizedA = sanitizeRegiaGameConfig({
    id: 'other',
    activeProfileId: 'Custom Event!',
    difficulty: {
      enabled: false,
      level: 'custom',
      forcedMinAmbo: 999,
      forcedMinTerno: -4,
      forcedMinQuaterna: 40,
      forcedMinCinquina: 55,
      forcedMinTombola: 70,
    },
    thresholds: {
      delayMaxGold: 1,
      delayMaxAmbo: 20,
      delayMaxTerno: 35,
      delayMaxQuaterna: 50,
      delayMaxCinquina: 65,
      delayMaxTombola: 200,
    },
    prizes: {
      prizePool: 125.5,
      currency: '$',
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(sanitizedA.id, 'main');
  assert.equal(sanitizedA.activeProfileId, 'custom_event');
  assert.equal(sanitizedA.difficulty.forcedMinAmbo, 90);
  assert.equal(sanitizedA.difficulty.forcedMinTerno, 1);
  assert.equal(sanitizedA.thresholds.delayMaxGold, 5);
  assert.equal(sanitizedA.thresholds.delayMaxTombola, 90);
  assert.equal(sanitizedA.prizes.prizePool, 125.5);
  assert.equal(sanitizedA.prizes.currency, '$');

  const sanitizedB = sanitizeRegiaGameConfig({
    ...sanitizedA,
    updatedAt: '2026-12-31T23:59:59.000Z',
  });
  assert.equal(
    buildRegiaGameConfigSignature(sanitizedA),
    buildRegiaGameConfigSignature(sanitizedB)
  );
});
