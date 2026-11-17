import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ServerPersistentDb } from '../server-db';
import {
  DEFAULT_TAVOLO_GAME_ID,
  DEFAULT_TAVOLO_SHEETS_COUNT,
  formatItalianDateTime,
  formatSheetLabel,
  formatTavoloSheetSerial,
  generatePermanentTavoloSet,
  hydrateRuntimeCartelleFromTavoloSet,
  isCardActiveForMode,
  withTimeout,
} from './tavolo-cards-service';

test('generatePermanentTavoloSet produces 30 authentic A4 sheets (TAV-G001, Foglio 01..30)', () => {
  const set = generatePermanentTavoloSet(DEFAULT_TAVOLO_GAME_ID, DEFAULT_TAVOLO_SHEETS_COUNT);

  assert.equal(set.id, 'TAV-G001');
  assert.equal(set.gameId, 'TAV-G001');
  assert.equal(set.totalSheets, 30);
  assert.equal(set.sheets.length, 30);
  assert.deepEqual(set.activeSheets, []);
  assert.equal(formatSheetLabel(1), '01');
  assert.equal(formatSheetLabel(30), '30');
  assert.equal(formatTavoloSheetSerial('TAV-G001', 1), 'TAV-G001-F01');
  assert.equal(formatTavoloSheetSerial('TAV-G001', 30), 'TAV-G001-F30');

  // Verify Foglio 01 and Foglio 30 structure
  assert.equal(set.sheets[0].sheetNumber, 1);
  assert.equal(set.sheets[0].sheetLabel, '01');
  assert.equal(set.sheets[29].sheetNumber, 30);
  assert.equal(set.sheets[29].sheetLabel, '30');

  // Every sheet must have 24 cards (4 color strips x 6 cards), and each color strip covers 1..90
  for (const sheet of set.sheets) {
    assert.equal(sheet.cards.length, 24);
    for (const color of ['blue', 'orange', 'green', 'yellow']) {
      const stripCards = sheet.cards.filter((c) => c.colorType === color);
      assert.equal(stripCards.length, 6);
      const allNums = new Set<number>();
      for (const card of stripCards) {
        assert.equal(card.numbers.length, 15);
        assert.equal(card.gameId, 'TAV-G001');
        assert.equal(card.sheetNumber, sheet.sheetNumber);
        for (const row of [0, 1, 2]) {
          assert.equal(card.numbers.filter((n) => n.row === row).length, 5);
        }
        card.numbers.forEach((n) => allNums.add(n.number));
      }
      assert.equal(allNums.size, 90);
    }
  }
});

test('isCardActiveForMode restricts extraction checks strictly to selected Tavolo sheets and gameId', () => {
  const set = generatePermanentTavoloSet('TAV-G001', 5);
  const runtimeCards = hydrateRuntimeCartelleFromTavoloSet(set);
  assert.equal(runtimeCards.length, 120);

  const cardSheet1 = runtimeCards.find((c) => c.sheetNumber === 1)!;
  const cardSheet2 = runtimeCards.find((c) => c.sheetNumber === 2)!;
  const cardSheet5 = runtimeCards.find((c) => c.sheetNumber === 5)!;
  const foreignGameCard = { ...cardSheet2, gameId: 'TAV-G999' };

  const activeAllColors = () => true;
  const activeSheets = [2, 5];

  assert.equal(
    isCardActiveForMode({
      card: cardSheet2,
      mode: 'tavolo',
      selectedTavoloGameId: 'TAV-G001',
      activeTavoloSheets: set.activeSheets,
      participatingGiocatori: 0,
      isColorActive: activeAllColors,
    }),
    false
  );

  assert.equal(
    isCardActiveForMode({
      card: cardSheet1,
      mode: 'tavolo',
      selectedTavoloGameId: 'TAV-G001',
      activeTavoloSheets: activeSheets,
      participatingGiocatori: 0,
      isColorActive: activeAllColors,
    }),
    false
  );

  assert.equal(
    isCardActiveForMode({
      card: cardSheet2,
      mode: 'tavolo',
      selectedTavoloGameId: 'TAV-G001',
      activeTavoloSheets: activeSheets,
      participatingGiocatori: 0,
      isColorActive: activeAllColors,
    }),
    true
  );

  assert.equal(
    isCardActiveForMode({
      card: cardSheet5,
      mode: 'tavolo',
      selectedTavoloGameId: 'TAV-G001',
      activeTavoloSheets: activeSheets,
      participatingGiocatori: 0,
      isColorActive: activeAllColors,
    }),
    true
  );

  assert.equal(
    isCardActiveForMode({
      card: foreignGameCard,
      mode: 'tavolo',
      selectedTavoloGameId: 'TAV-G001',
      activeTavoloSheets: activeSheets,
      participatingGiocatori: 0,
      isColorActive: activeAllColors,
    }),
    false
  );

  // Disabled color still blocks card in tavolo mode
  assert.equal(
    isCardActiveForMode({
      card: cardSheet2,
      mode: 'tavolo',
      selectedTavoloGameId: 'TAV-G001',
      activeTavoloSheets: activeSheets,
      participatingGiocatori: 0,
      isColorActive: (c) => c !== cardSheet2.colorType,
    }),
    false
  );
});

test('ServerPersistentDb persists permanent 30-sheet TAV-G001 set and activeSheets selection across restarts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tombola-tavolo-db-'));
  const dbPath = path.join(tmpDir, 'db.json');

  try {
    const db1 = new ServerPersistentDb(dbPath);
    const set = generatePermanentTavoloSet('TAV-G001', 30);
    const firstCardSnapshot = JSON.stringify(set.sheets[0].cards[0].numbers);

    const saved = db1.saveTavoloSet(set);
    assert.ok(saved);
    assert.equal(saved.sheets.length, 30);

    const upd = db1.updateTavoloActiveSheets('TAV-G001', [1, 4, 12, 30]);
    assert.equal(upd.success, true);
    assert.deepEqual(upd.activeSheets, [1, 4, 12, 30]);

    // Simulate restart
    const db2 = new ServerPersistentDb(dbPath);
    const metas = db2.listTavoloSets();
    assert.equal(metas.length, 1);
    assert.equal(metas[0].id, 'TAV-G001');
    assert.equal(metas[0].totalSheets, 30);
    assert.deepEqual(metas[0].activeSheets, [1, 4, 12, 30]);

    const loaded = db2.getTavoloSet('TAV-G001');
    assert.ok(loaded);
    assert.equal(loaded.sheets.length, 30);
    assert.equal(JSON.stringify(loaded.sheets[0].cards[0].numbers), firstCardSnapshot);
    assert.equal(loaded.updatedAt, saved.updatedAt);

    const formatted = formatItalianDateTime(loaded.updatedAt);
    assert.match(formatted, /\d{2}\/\d{2}\/\d{4}/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('withTimeout resolves fast promises, preserves rejections, and rejects stalled promises', async () => {
  const fastResult = await withTimeout(Promise.resolve('ok-value'), 100, 'Fast op');
  assert.equal(fastResult, 'ok-value');

  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('boom')), 100, 'Fail op'),
    /boom/
  );

  const neverSettles = new Promise<string>(() => {});
  await assert.rejects(
    () => withTimeout(neverSettles, 25, 'Firestore test'),
    /Firestore test timeout dopo 25ms/
  );
});
