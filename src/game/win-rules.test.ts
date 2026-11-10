import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getCurrentActivePrize,
    evaluateCartellaForPrize,
    checkSequentialWins,
    getNextPrizeStage,
    GamePrizesProgress,
    CartellaEntity
} from './win-rules.js';

test('Tombola Sequential Prize Rules', async (t) => {
    // Sample cartella with numbers:
    // Row 0: 5, 12, 33, 54, 78 (5 numbers)
    // Row 1: 8, 22, 45, 61, 89 (5 numbers)
    // Row 2: 1, 19, 39, 58, 90 (5 numbers)
    const cartellaSample: CartellaEntity = {
        id: 'G1-C1-B',
        numbers: [
            { number: 5, row: 0, column: 0 },
            { number: 12, row: 0, column: 1 },
            { number: 33, row: 0, column: 3 },
            { number: 54, row: 0, column: 5 },
            { number: 78, row: 0, column: 7 },

            { number: 8, row: 1, column: 0 },
            { number: 22, row: 1, column: 2 },
            { number: 45, row: 1, column: 4 },
            { number: 61, row: 1, column: 6 },
            { number: 89, row: 1, column: 8 },

            { number: 1, row: 2, column: 0 },
            { number: 19, row: 2, column: 1 },
            { number: 39, row: 2, column: 3 },
            { number: 58, row: 2, column: 5 },
            { number: 90, row: 2, column: 8 }
        ],
        isActive: true
    };

    const initialProgress: GamePrizesProgress = {
        ambo: { won: false },
        terno: { won: false },
        quaterna: { won: false },
        cinquina: { won: false },
        tombola: { won: false }
    };

    await t.test('Initial active prize must be Ambo (2 numbers on same row)', () => {
        assert.equal(getCurrentActivePrize(initialProgress), 'ambo');
    });

    await t.test('Next prize progression follows: ambo -> terno -> quaterna -> cinquina -> tombola', () => {
        assert.equal(getNextPrizeStage('ambo'), 'terno');
        assert.equal(getNextPrizeStage('terno'), 'quaterna');
        assert.equal(getNextPrizeStage('quaterna'), 'cinquina');
        assert.equal(getNextPrizeStage('cinquina'), 'tombola');
        assert.equal(getNextPrizeStage('tombola'), null);
    });

    await t.test('Cannot win Terno before Ambo is won or expired', () => {
        // Even if 3 numbers on row 0 are drawn (5, 12, 33), since Ambo is still active, only Ambo can be claimed!
        const drawn = [5, 12, 33];
        const res = checkSequentialWins([cartellaSample], drawn, 33, initialProgress);
        
        assert.equal(res.won, true);
        assert.equal(res.prizeType, 'ambo'); // NOT terno!
        assert.equal(res.winningRow, 0);
        assert.deepEqual(res.winningNumbers, [5, 12]);
    });

    await t.test('When Ambo is won, active stage advances to Terno', () => {
        const amboWonProgress: GamePrizesProgress = {
            ...initialProgress,
            ambo: { won: true, cartellaId: 'G1-C1-B', numbers: [5, 12] }
        };
        assert.equal(getCurrentActivePrize(amboWonProgress), 'terno');

        // Drawing 33 now triggers Terno
        const drawn = [5, 12, 33];
        const res = checkSequentialWins([cartellaSample], drawn, 33, amboWonProgress);
        assert.equal(res.won, true);
        assert.equal(res.prizeType, 'terno');
        assert.equal(res.winningRow, 0);
        assert.deepEqual(res.winningNumbers, [5, 12, 33]);
    });

    await t.test('When Ambo expired, active stage still advances to Terno', () => {
        const amboExpiredProgress: GamePrizesProgress = {
            ...initialProgress,
            ambo: { won: false, expired: true }
        };
        assert.equal(getCurrentActivePrize(amboExpiredProgress), 'terno');
    });

    await t.test('Quaterna only activates after Terno is won or expired', () => {
        const ternoWonProgress: GamePrizesProgress = {
            ...initialProgress,
            ambo: { won: true },
            terno: { won: true }
        };
        assert.equal(getCurrentActivePrize(ternoWonProgress), 'quaterna');

        // Drawing 54 gives 4 numbers on row 0
        const drawn = [5, 12, 33, 54];
        const res = checkSequentialWins([cartellaSample], drawn, 54, ternoWonProgress);
        assert.equal(res.won, true);
        assert.equal(res.prizeType, 'quaterna');
        assert.equal(res.winningRow, 0);
        assert.deepEqual(res.winningNumbers, [5, 12, 33, 54]);
    });

    await t.test('Cinquina only activates after Quaterna is won or expired', () => {
        const quaternaWonProgress: GamePrizesProgress = {
            ...initialProgress,
            ambo: { won: true },
            terno: { won: true },
            quaterna: { won: true }
        };
        assert.equal(getCurrentActivePrize(quaternaWonProgress), 'cinquina');

        // Drawing 78 gives all 5 numbers on row 0
        const drawn = [5, 12, 33, 54, 78];
        const res = checkSequentialWins([cartellaSample], drawn, 78, quaternaWonProgress);
        assert.equal(res.won, true);
        assert.equal(res.prizeType, 'cinquina');
        assert.equal(res.winningRow, 0);
        assert.deepEqual(res.winningNumbers, [5, 12, 33, 54, 78]);
    });

    await t.test('Tombola only activates after Cinquina is won or expired', () => {
        const cinquinaWonProgress: GamePrizesProgress = {
            ...initialProgress,
            ambo: { won: true },
            terno: { won: true },
            quaterna: { won: true },
            cinquina: { won: true }
        };
        assert.equal(getCurrentActivePrize(cinquinaWonProgress), 'tombola');

        // All 15 numbers drawn
        const all15 = [5, 12, 33, 54, 78, 8, 22, 45, 61, 89, 1, 19, 39, 58, 90];
        const res = checkSequentialWins([cartellaSample], all15, 90, cinquinaWonProgress);
        assert.equal(res.won, true);
        assert.equal(res.prizeType, 'tombola');
        assert.equal(res.winningRow, -1);
        assert.equal(res.winningNumbers.length, 15);
    });

    await t.test('After Tombola is won, no further prizes are awarded', () => {
        const allWonProgress: GamePrizesProgress = {
            ambo: { won: true },
            terno: { won: true },
            quaterna: { won: true },
            cinquina: { won: true },
            tombola: { won: true }
        };
        assert.equal(getCurrentActivePrize(allWonProgress), null);

        const drawn = [5, 12, 33];
        const res = checkSequentialWins([cartellaSample], drawn, 33, allWonProgress);
        assert.equal(res.won, false);
        assert.equal(res.prizeType, null);
    });
});
