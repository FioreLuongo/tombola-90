import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfilePayloadFromEngine,
  computeEstimatedDifficultyIndex,
  computePrizeBreakdown,
  createInitialRegiaState,
  profileToEngineState,
  RegiaStateManager,
  stateToUnifiedGameConfig,
  unifiedGameConfigToStatePatches,
} from './regia-state-manager';
import type { RegiaProfileData } from './firebase-jackpot-service';

test('computePrizeBreakdown calculates official percentage splits and handles zero/invalid inputs', () => {
  const split = computePrizeBreakdown(100);
  assert.deepEqual(split, {
    gold: 5,
    ambo: 5,
    terno: 10,
    quaterna: 15,
    cinquina: 20,
    tombola: 45,
  });

  const zeroSplit = computePrizeBreakdown(0);
  assert.deepEqual(zeroSplit, {
    gold: 0,
    ambo: 0,
    terno: 0,
    quaterna: 0,
    cinquina: 0,
    tombola: 0,
  });

  const nanSplit = computePrizeBreakdown(Number.NaN);
  assert.equal(nanSplit.tombola, 0);
});

test('computeEstimatedDifficultyIndex returns 0 when disabled or random, and scales between 25 and 98 otherwise', () => {
  assert.equal(
    computeEstimatedDifficultyIndex(false, 'high', {
      ambo: 15,
      terno: 28,
      quaterna: 42,
      cinquina: 58,
      tombola: 75,
    }),
    0
  );

  assert.equal(
    computeEstimatedDifficultyIndex(true, 'random', {
      ambo: 15,
      terno: 28,
      quaterna: 42,
      cinquina: 58,
      tombola: 75,
    }),
    0
  );

  const highIdx = computeEstimatedDifficultyIndex(true, 'high', {
    ambo: 15,
    terno: 28,
    quaterna: 42,
    cinquina: 58,
    tombola: 75,
  });
  assert.ok(highIdx >= 25 && highIdx <= 98, `Expected ${highIdx} between 25 and 98`);
});

test('profileToEngineState and buildProfilePayloadFromEngine roundtrip engine configuration cleanly', () => {
  const sampleProfile: RegiaProfileData = {
    id: 'serata_vip',
    name: 'Serata VIP',
    isPreset: false,
    enabled: true,
    difficultyLevel: 'custom',
    forcedMinAmbo: 12,
    forcedMinTerno: 24,
    forcedMinQuaterna: 38,
    forcedMinCinquina: 54,
    forcedMinTombola: 72,
    delayMaxGold: 22,
    delayMaxAmbo: 18,
    delayMaxTerno: 32,
    delayMaxQuaterna: 46,
    delayMaxCinquina: 62,
    delayMaxTombola: 82,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const base = createInitialRegiaState();
  const engineSlice = profileToEngineState(sampleProfile, base.engine.delays);
  assert.equal(engineSlice.activeProfileId, 'serata_vip');
  assert.equal(engineSlice.forcedMin.ambo, 12);
  assert.equal(engineSlice.delays.tombola.max, 82);

  const rebuiltPayload = buildProfilePayloadFromEngine(
    { ...base.engine, ...engineSlice },
    'serata_vip',
    'Serata VIP ',
    false
  );
  assert.equal(rebuiltPayload.name, 'Serata VIP');
  assert.equal(rebuiltPayload.forcedMinTombola, 72);
  assert.equal(rebuiltPayload.delayMaxGold, 22);
});

test('RegiaStateManager centralizes card state updates, logs, and notifications', () => {
  const manager = new RegiaStateManager();
  const notifiedSections: Array<string | undefined> = [];
  const unsub = manager.subscribe((_state, section) => {
    notifiedSections.push(section);
  });

  manager.syncExtractionState({
    extractedNumbers: [12, 47],
    smorfiaText: '#47 - Morto che parla',
    isRunning: true,
  });
  assert.equal(manager.getState().extraction.currentNumber, 47);
  assert.equal(manager.getState().extraction.remainingCount, 88);

  manager.syncPrizesState({ prizePool: 200, currency: '$', unclaimedCurrentGame: 15 });
  assert.equal(manager.getState().prizes.breakdown.tombola, 90);
  assert.equal(manager.getState().prizes.currency, '$');

  manager.syncColorsState({
    blue: { count: 6, active: true },
    orange: { count: 6, active: false },
    green: { count: 6, active: true },
    yellow: { count: 0, active: false },
  });
  assert.equal(manager.getState().colors.totalActiveColors, 2);

  manager.syncWinsState([{ type: 'AMBO', cartellaId: 'C-01', winCount: 1 }]);
  assert.equal(manager.getState().wins.totalWins, 1);

  manager.syncConnectionState({ status: 'connected', clientCount: 3, latencyMs: 24 });
  assert.equal(manager.getState().connection.status, 'connected');
  assert.equal(manager.getState().connection.clientCount, 3);

  manager.addLog('Evento test', 'win');
  assert.ok(manager.getState().logs.some((l) => l.text === 'Evento test' && l.level === 'win'));

  manager.clearLogs();
  assert.equal(manager.getState().logs.length, 1);
  assert.equal(manager.getState().logs[0].text, 'Log eventi pulito.');

  let syncedEngineName = '';
  const unsubEngine = manager.onEngineConfigSync((eng) => {
    syncedEngineName = eng.profileNameInput;
  });
  manager.syncEngineState({ profileNameInput: 'Profilo Sync Test' }, { render: false, notifyEngineSync: true });
  assert.equal(syncedEngineName, 'Profilo Sync Test');

  assert.deepEqual(notifiedSections, [
    'extraction',
    'prizes',
    'colors',
    'wins',
    'connection',
    'logs',
    'logs',
    'engine',
  ]);
  unsubEngine();
  unsub();
});

test('stateToUnifiedGameConfig and applyUnifiedGameConfig keep difficulty, thresholds, and prizes in a single document without duplicates', () => {
  const manager = new RegiaStateManager();
  manager.syncEngineState({
    enabled: true,
    level: 'medium',
    activeProfileId: 'medium',
    forcedMin: { ambo: 14, terno: 25, quaterna: 39, cinquina: 52, tombola: 70 },
    delays: {
      gold: { max: 28, expired: false },
      ambo: { max: 22, expired: false },
      terno: { max: 36, expired: false },
      quaterna: { max: 51, expired: false },
      cinquina: { max: 66, expired: false },
      tombola: { max: 88, expired: false },
    },
  });
  manager.syncPrizesState({ prizePool: 300, currency: '$' });

  const unified = stateToUnifiedGameConfig(manager.getState());
  assert.equal(unified.id, 'main');
  assert.equal(unified.difficulty.level, 'medium');
  assert.equal(unified.difficulty.forcedMinAmbo, 14);
  assert.equal(unified.thresholds.delayMaxGold, 28);
  assert.equal(unified.prizes.prizePool, 300);
  assert.equal(unified.prizes.currency, '$');

  const patches = unifiedGameConfigToStatePatches(unified);
  assert.equal(patches.enginePatch.forcedMin?.tombola, 70);
  assert.equal(patches.enginePatch.delays?.gold.max, 28);
  assert.equal(patches.prizesPatch.prizePool, 300);

  const receiver = new RegiaStateManager();
  let prizesSyncedCount = 0;
  const unsubPrizes = receiver.onPrizesConfigSync((p) => {
    prizesSyncedCount++;
    assert.equal(p.prizePool, 300);
    assert.equal(p.currency, '$');
  });

  const firstApplied = receiver.applyUnifiedGameConfig(unified, { logSource: 'Unit Test' });
  const secondApplied = receiver.applyUnifiedGameConfig(unified, { logSource: 'Duplicate Snapshot' });

  assert.equal(firstApplied, true);
  assert.equal(secondApplied, false);
  assert.equal(prizesSyncedCount, 1);
  assert.equal(receiver.getState().engine.delays.gold.max, 28);
  assert.equal(receiver.getState().prizes.breakdown.tombola, 135);
  unsubPrizes();
});
