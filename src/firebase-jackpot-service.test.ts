import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REGIA_PROFILES, sanitizeProfileId } from './firebase-jackpot-service';

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
