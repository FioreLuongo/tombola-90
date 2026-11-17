import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { ServerPersistentDb } from '../server-db';
import {
  buildDefaultRegiaGameConfig,
  buildEmptyJackpotBank,
  sanitizeJackpotBankData,
  type JackpotBankData,
} from './firebase-jackpot-service';
import { APPWRITE_GUIDE_PDF_BASE64 } from './appwrite-guide-pdf-data';
import {
  isAppwriteConfigured,
  mapAppwriteDocToHistoryEntry,
  mapAppwriteDocToJackpotBank,
  normalizeAppwriteConfig,
} from './appwrite-db-service';
import {
  depositDualUnclaimed,
  mergeUnclaimedHistory,
  recallDualUnclaimed,
  resetDualJackpotBank,
  resolveDatabaseMode,
  saveDualCurrentGameUnclaimed,
  selectMostRecentBank,
  shouldUseAppwrite,
  shouldUseFirebase,
  shouldUseServerDb,
} from './dual-database-service';

test('sanitizeJackpotBankData handles currentGameUnclaimed and accumulatedUnclaimed safely', () => {
  const empty = buildEmptyJackpotBank();
  assert.equal(empty.accumulatedUnclaimed, 0);
  assert.equal(empty.currentGameUnclaimed, 0);
  assert.equal(empty.currency, '£');

  const cleaned = sanitizeJackpotBankData({
    accumulatedUnclaimed: 125.456,
    currentGameUnclaimed: 32.129,
    currency: '$',
    lastUpdated: '2026-05-01T10:00:00.000Z',
    totalGamesRecorded: 4,
  });
  assert.equal(cleaned.accumulatedUnclaimed, 125.46);
  assert.equal(cleaned.currentGameUnclaimed, 32.13);
  assert.equal(cleaned.currency, '$');
  assert.equal(cleaned.totalGamesRecorded, 4);

  const clamped = sanitizeJackpotBankData({
    accumulatedUnclaimed: -50,
    currentGameUnclaimed: Number.NaN,
    currency: 'INVALID' as any,
    totalGamesRecorded: -3,
  });
  assert.equal(clamped.accumulatedUnclaimed, 0);
  assert.equal(clamped.currentGameUnclaimed, 0);
  assert.equal(clamped.currency, '£');
  assert.equal(clamped.totalGamesRecorded, 0);
});

test('Appwrite config normalization, readiness check, and document mappers work cleanly', () => {
  const emptyCfg = normalizeAppwriteConfig({
    endpoint: 'https://fra.cloud.appwrite.io/v1/',
    projectId: '',
    databaseId: '',
  });
  assert.equal(emptyCfg.endpoint, 'https://fra.cloud.appwrite.io/v1');
  assert.equal(isAppwriteConfigured(emptyCfg), false);

  const readyCfg = normalizeAppwriteConfig({
    endpoint: 'https://cloud.appwrite.io/v1',
    projectId: 'proj_123',
    databaseId: 'db_tombola',
    bankCollectionId: 'jackpot_bank',
  });
  assert.equal(isAppwriteConfigured(readyCfg), true);

  const mappedBank = mapAppwriteDocToJackpotBank({
    $id: 'main',
    accumulatedUnclaimed: 80.5,
    currentGameUnclaimed: 15.25,
    currency: '£',
    lastUpdated: '2026-05-01T12:00:00.000Z',
    totalGamesRecorded: 2,
  });
  assert.equal(mappedBank.accumulatedUnclaimed, 80.5);
  assert.equal(mappedBank.currentGameUnclaimed, 15.25);
  assert.equal(mappedBank.currency, '£');

  const mappedHistory = mapAppwriteDocToHistoryEntry({
    $id: 'doc_1',
    timestamp: '2026-05-01T12:00:00.000Z',
    gameId: 'TOM099',
    type: 'deposit_expired',
    amount: 45,
    balanceAfter: 125.5,
    prizeCategory: 'all',
    note: 'Fine partita',
  });
  assert.equal(mappedHistory.id, 'doc_1');
  assert.equal(mappedHistory.gameId, 'TOM099');
  assert.equal(mappedHistory.balanceAfter, 125.5);
});

test('Dual-database routing helpers respect dual, server, firebase, and appwrite modes', () => {
  assert.equal(resolveDatabaseMode('dual'), 'dual');
  assert.equal(resolveDatabaseMode('server'), 'server');
  assert.equal(resolveDatabaseMode('appwrite'), 'appwrite');
  assert.equal(resolveDatabaseMode('firebase'), 'firebase');

  assert.equal(shouldUseFirebase('dual'), true);
  assert.equal(shouldUseFirebase('firebase'), true);
  assert.equal(shouldUseFirebase('server'), false);
  assert.equal(shouldUseFirebase('appwrite'), false);

  assert.equal(shouldUseServerDb('dual'), true);
  assert.equal(shouldUseServerDb('server'), true);
  assert.equal(shouldUseServerDb('firebase'), false);
  assert.equal(shouldUseServerDb('appwrite'), false);

  assert.equal(shouldUseAppwrite('dual'), true);
  assert.equal(shouldUseAppwrite('appwrite'), true);
  assert.equal(shouldUseAppwrite('server'), false);
  assert.equal(shouldUseAppwrite('firebase'), false);
});

test('selectMostRecentBank selects newest snapshot and prefers cloud providers on ties', () => {
  const oldFb: JackpotBankData = {
    accumulatedUnclaimed: 40,
    currentGameUnclaimed: 10,
    currency: '€',
    lastUpdated: '2026-05-01T10:00:00.000Z',
    totalGamesRecorded: 1,
  };
  const newerAw: JackpotBankData = {
    accumulatedUnclaimed: 95,
    currentGameUnclaimed: 0,
    currency: '€',
    lastUpdated: '2026-05-01T10:05:00.000Z',
    totalGamesRecorded: 2,
  };
  const pickedNewer = selectMostRecentBank([
    { source: 'firebase', bank: oldFb },
    { source: 'appwrite', bank: newerAw },
  ]);
  assert.equal(pickedNewer.source, 'appwrite');
  assert.equal(pickedNewer.bank.accumulatedUnclaimed, 95);

  const tiedTs = '2026-05-01T11:00:00.000Z';
  const pickedCloudOverLocal = selectMostRecentBank([
    { source: 'local', bank: { ...newerAw, lastUpdated: tiedTs, accumulatedUnclaimed: 50 } },
    { source: 'appwrite', bank: { ...newerAw, lastUpdated: tiedTs, accumulatedUnclaimed: 95 } },
  ]);
  assert.equal(pickedCloudOverLocal.source, 'appwrite');
  assert.equal(pickedCloudOverLocal.bank.accumulatedUnclaimed, 95);
});

test('mergeUnclaimedHistory deduplicates identical movements and sorts newest first', () => {
  const entryA = {
    id: 'a1',
    timestamp: '2026-05-01T10:00:00.000Z',
    gameId: 'TOM1',
    type: 'deposit_expired' as const,
    amount: 25,
    balanceAfter: 25,
    prizeCategory: 'all',
    note: 'Deposito',
  };
  const entryB = {
    id: 'b1',
    timestamp: '2026-05-01T10:05:00.000Z',
    gameId: 'TOM2',
    type: 'recalled_into_game' as const,
    amount: 25,
    balanceAfter: 0,
    prizeCategory: 'rollover_recall',
    note: 'Richiamo',
  };
  const entryAFirebaseJitter = {
    ...entryA,
    id: 'fb_a1',
    timestamp: '2026-05-01T10:00:00.250Z',
  };
  const merged = mergeUnclaimedHistory([entryA], [entryAFirebaseJitter, entryB], 8);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].gameId, 'TOM2');
  assert.equal(merged[1].gameId, 'TOM1');
});

test('Dual rollover lifecycle persists current game unclaimed, accumulates on end, and recalls into next game using local cache fallback', async () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };

  // Switch explicitly to 'appwrite' without configuring endpoint so it stays deterministic in local cache (no Firebase network calls)
  store.set('tombola_dual_db_mode_v1', 'appwrite');
  await resetDualJackpotBank('TOM001', 'Test clean');

  // 1. Mid-game prize expiration saved live in currentGameUnclaimed
  const midGame = await saveDualCurrentGameUnclaimed(27.5, '€');
  assert.equal(midGame.success, true);
  assert.equal(midGame.bank.currentGameUnclaimed, 27.5);
  assert.equal(midGame.bank.accumulatedUnclaimed, 0);

  // 2. Game ends: currentGameUnclaimed moves & accumulates into accumulatedUnclaimed, currentGameUnclaimed resets to 0
  const deposit = await depositDualUnclaimed(27.5, '€', 'all', 'TOM001', 'Fine partita test');
  assert.equal(deposit.success, true);
  assert.equal(deposit.newBalance, 27.5);

  const cachedAfterDeposit = JSON.parse(store.get('tombola_jackpot_bank_cache_v1') || '{}');
  assert.equal(cachedAfterDeposit.currentGameUnclaimed, 0);
  assert.equal(cachedAfterDeposit.accumulatedUnclaimed, 27.5);

  // 3. Second game adds another 12.5 -> accumulates to 40
  const deposit2 = await depositDualUnclaimed(12.5, '€', 'all', 'TOM002', 'Fine partita 2');
  assert.equal(deposit2.newBalance, 40);

  // 4. Next game automatically recalls Total (40) into Prize Pool
  const recall = await recallDualUnclaimed(null, 'TOM003', 'Auto-richiamo partita 3');
  assert.equal(recall.success, true);
  assert.equal(recall.recalledAmount, 40);
  assert.equal(recall.remainingBalance, 0);

  delete (globalThis as any).localStorage;
});

test('ServerPersistentDb persists current game unclaimed, rollover accumulation, recall, reset, and regia config across restarts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tombola-srv-db-'));
  const dbPath = path.join(tmpDir, 'db.json');

  try {
    const db1 = new ServerPersistentDb(dbPath);
    assert.equal(db1.getBank().accumulatedUnclaimed, 0);
    assert.equal(db1.getBank().currentGameUnclaimed, 0);

    // Mid-game save
    const mid = db1.saveCurrentGameUnclaimed(18.75, '€');
    assert.equal(mid.currentGameUnclaimed, 18.75);
    assert.equal(mid.accumulatedUnclaimed, 0);

    // End game deposit -> accumulates and zeroes currentGameUnclaimed
    const dep = db1.depositUnclaimed(18.75, '€', 'all', 'TOM100', 'Fine partita 1');
    assert.equal(dep.success, true);
    assert.equal(dep.newBalance, 18.75);
    assert.equal(dep.bank.currentGameUnclaimed, 0);

    // Regia config save
    db1.saveRegiaConfig({ prizes: { prizePool: 150, currency: '€' } });

    // Simulate server restart by creating a new instance on the same file
    const db2 = new ServerPersistentDb(dbPath);
    assert.equal(db2.getBank().accumulatedUnclaimed, 18.75);
    assert.equal(db2.getHistory(5).length, 1);
    assert.equal(db2.getHistory(5)[0].gameId, 'TOM100');
    assert.equal(db2.getRegiaConfig()?.prizes.prizePool, 150);

    // Recall into next game
    const rec = db2.recallUnclaimed(null, 'TOM101', 'Richiamo automatico');
    assert.equal(rec.success, true);
    assert.equal(rec.recalledAmount, 18.75);
    assert.equal(rec.remainingBalance, 0);

    // Deposit + manual reset
    db2.depositUnclaimed(22, '€', 'ambo', 'TOM102', 'Deposito 2');
    assert.equal(db2.getBank().accumulatedUnclaimed, 22);
    const rst = db2.resetBank('TOM102', 'Azzeramento test');
    assert.equal(rst.success, true);
    assert.equal(rst.bank.accumulatedUnclaimed, 0);

    const db3 = new ServerPersistentDb(dbPath);
    assert.equal(db3.getBank().accumulatedUnclaimed, 0);
    assert.equal(db3.getHistory(10).length, 4);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Appwrite step-by-step PDF asset is valid, 3 pages, and matches public static PDF', async () => {
  const decoded = Buffer.from(APPWRITE_GUIDE_PDF_BASE64, 'base64');
  assert.ok(decoded.length > 5000, 'PDF buffer must not be empty');
  assert.equal(decoded.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(decoded.subarray(-32).toString('ascii').includes('%%EOF'));

  const publicPdfPath = path.resolve(process.cwd(), 'public/Guida_Configurazione_Appwrite_Tombola90.pdf');
  const publicBytes = fs.readFileSync(publicPdfPath);
  assert.equal(Buffer.compare(decoded, publicBytes), 0, 'Base64 TS asset must match public PDF byte-for-byte');

  const parsed = await PDFDocument.load(decoded);
  assert.equal(parsed.getPageCount(), 3);
  assert.match(parsed.getTitle() || '', /Appwrite Cloud/i);
});

test('RegiaGameConfigDoc serialized payloadJson fits safely within Appwrite column size (4000)', () => {
  const defaultConfig = buildDefaultRegiaGameConfig();
  assert.equal(defaultConfig.prizes.currency, '£');
  assert.equal(defaultConfig.prizes.prizePool, 0);
  const json = JSON.stringify(defaultConfig);
  assert.ok(json.length < 4000, `Expected payloadJson < 4000 chars, got ${json.length}`);
});


