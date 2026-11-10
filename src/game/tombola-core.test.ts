import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrizes,
  PRIZE_PERCENTAGES,
  generateCartellaNumbersForSheet,
  createCartella,
  checkGoldExpiration,
} from './tombola-core';

test('Prize percentages sum up to 100%', () => {
  const sum =
    PRIZE_PERCENTAGES.gold +
    PRIZE_PERCENTAGES.ambo +
    PRIZE_PERCENTAGES.terno +
    PRIZE_PERCENTAGES.quaterna +
    PRIZE_PERCENTAGES.cinquina +
    PRIZE_PERCENTAGES.tombola;
  assert.equal(Math.round(sum * 100), 100);
});

test('calculatePrizes calculates exact allocation for €1000 prize pool', () => {
  const prizes = calculatePrizes(1000);
  assert.equal(prizes.gold, 50); // 5%
  assert.equal(prizes.ambo, 50); // 5%
  assert.equal(prizes.terno, 100); // 10%
  assert.equal(prizes.quaterna, 150); // 15%
  assert.equal(prizes.cinquina, 200); // 20%
  assert.equal(prizes.tombola, 450); // 45%
});

test('generateCartellaNumbersForSheet generates 6 cartelle with 15 numbers each', () => {
  const sheet = generateCartellaNumbersForSheet();
  assert.equal(sheet.length, 6, 'A sheet must contain 6 cartelle');

  const allNumbersInSheet = new Set<number>();

  sheet.forEach((card, idx) => {
    assert.equal(card.length, 15, `Cartella ${idx + 1} must have 15 numbers`);

    const rowCounts = [0, 0, 0];
    card.forEach((numObj) => {
      assert.ok(numObj.number >= 1 && numObj.number <= 90, `Number ${numObj.number} out of range`);
      assert.ok(numObj.row >= 0 && numObj.row <= 2, `Row ${numObj.row} out of range`);
      assert.ok(numObj.column >= 0 && numObj.column <= 8, `Column ${numObj.column} out of range`);
      rowCounts[numObj.row]++;
      allNumbersInSheet.add(numObj.number);

      // Verify column bounds
      if (numObj.column === 0) {
        assert.ok(numObj.number >= 1 && numObj.number <= 9);
      } else if (numObj.column === 8) {
        assert.ok(numObj.number >= 80 && numObj.number <= 90);
      } else {
        const expectedTen = numObj.column * 10;
        assert.ok(numObj.number >= expectedTen && numObj.number <= expectedTen + 9);
      }
    });

    // Each row must have exactly 5 numbers
    assert.deepEqual(rowCounts, [5, 5, 5], `Cartella ${idx + 1} must have 5 numbers in each of the 3 rows`);
  });

  // All 90 numbers must be present across the 6 cartelle without duplicates
  assert.equal(allNumbersInSheet.size, 90, 'The 6 cartelle in a sheet must contain all numbers 1 to 90 without duplicates');
});

test('createCartella formats identifier properly', () => {
  const card = createCartella('TOM001', 1, 3, 'blue', 1, []);
  assert.equal(card.id, 'TOM001.G1.F001.C03.BlueG1');
  assert.equal(card.playerNumber, 1);
  assert.equal(card.sheetNumber, 1);
  assert.equal(card.cartellaNumber, 3);
  assert.equal(card.colorType, 'blue');
});

test('checkGoldExpiration triggers on 7th extraction if gold is not extracted', () => {
  const goldNumber = 42;
  const notExpiredAt6 = checkGoldExpiration(6, [1, 2, 3, 4, 5, 6], goldNumber, false, false);
  assert.equal(notExpiredAt6, false);

  const expiredAt7 = checkGoldExpiration(7, [1, 2, 3, 4, 5, 6, 7], goldNumber, false, false);
  assert.equal(expiredAt7, true);

  const notExpiredIfExtracted = checkGoldExpiration(7, [1, 2, 3, 4, 5, 6, 42], goldNumber, false, false);
  assert.equal(notExpiredIfExtracted, false);

  const notExpiredIfAlreadyWon = checkGoldExpiration(7, [1, 2, 3, 4, 5, 6, 7], goldNumber, true, false);
  assert.equal(notExpiredIfAlreadyWon, false);
});
