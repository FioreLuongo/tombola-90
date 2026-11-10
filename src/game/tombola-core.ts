/**
 * LUONGO Tombola 90 Italia - GOLD EDITION
 * Core Game Logic & Mathematical Engine
 */

export interface CartellaNumber {
  number: number;
  column: number;
  row: number;
}

export interface CartellaData {
  id: string;
  gameId: string;
  sheetNumber: number;
  cartellaNumber: number;
  color: string;
  colorType: string;
  playerNumber: number;
  numbers: CartellaNumber[];
  extractedNumbers: number[];
  wins: {
    ambo: boolean;
    terno: boolean;
    quaterna: boolean;
    cinquina: boolean;
    tombola: boolean;
  };
  winningNumbers: number[];
}

export const PRIZE_PERCENTAGES = {
  gold: 0.05,
  ambo: 0.05,
  terno: 0.10,
  quaterna: 0.15,
  cinquina: 0.20,
  tombola: 0.45,
} as const;

export function calculatePrizes(totalPrize: number) {
  if (isNaN(totalPrize) || totalPrize <= 0) {
    return {
      gold: 0,
      ambo: 0,
      terno: 0,
      quaterna: 0,
      cinquina: 0,
      tombola: 0,
    };
  }
  return {
    gold: totalPrize * PRIZE_PERCENTAGES.gold,
    ambo: totalPrize * PRIZE_PERCENTAGES.ambo,
    terno: totalPrize * PRIZE_PERCENTAGES.terno,
    quaterna: totalPrize * PRIZE_PERCENTAGES.quaterna,
    cinquina: totalPrize * PRIZE_PERCENTAGES.cinquina,
    tombola: totalPrize * PRIZE_PERCENTAGES.tombola,
  };
}

/**
 * Generates valid numbers for a complete sheet of 6 cartelle (90 numbers total).
 * Strict adherence to original algorithm in Tombola-StudioAI.v15.0.1.html
 */
export function generateCartellaNumbersForSheet(): CartellaNumber[][] {
  const columns: number[][] = [];
  // Column 0: 1 to 9 (9 numbers)
  columns.push(Array.from({ length: 9 }, (_, i) => i + 1));
  // Columns 1 to 7: 10 numbers each (10-19, 20-29, ..., 70-79)
  for (let c = 1; c <= 7; c++) {
    columns.push(Array.from({ length: 10 }, (_, i) => c * 10 + i));
  }
  // Column 8: 80 to 90 (11 numbers)
  columns.push(Array.from({ length: 11 }, (_, i) => 80 + i));

  // Shuffle numbers in each column
  columns.forEach((col) => {
    for (let i = col.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [col[i], col[j]] = [col[j], col[i]];
    }
  });

  const layout: number[][] = Array(6)
    .fill(0)
    .map(() => Array(9).fill(0));

  const colDistributions = [
    [2, 2, 2, 1, 1, 1], // col 0 (9 numbers)
    [2, 2, 2, 2, 1, 1], // col 1 (10 numbers)
    [2, 2, 2, 2, 1, 1], // col 2 (10 numbers)
    [2, 2, 2, 2, 1, 1], // col 3 (10 numbers)
    [2, 2, 2, 2, 1, 1], // col 4 (10 numbers)
    [2, 2, 2, 2, 1, 1], // col 5 (10 numbers)
    [2, 2, 2, 2, 1, 1], // col 6 (10 numbers)
    [2, 2, 2, 2, 1, 1], // col 7 (10 numbers)
    [2, 2, 2, 2, 2, 1], // col 8 (11 numbers)
  ];

  for (let c = 0; c < 9; c++) {
    const dist = [...colDistributions[c]];
    for (let i = dist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dist[i], dist[j]] = [dist[j], dist[i]];
    }
    for (let r = 0; r < 6; r++) layout[r][c] = dist[r];
  }

  let balanced = false;
  let balanceAttempts = 0;
  while (!balanced && balanceAttempts < 500) {
    balanceAttempts++;
    balanced = true;
    for (let i = 0; i < 6; i++) {
      const sum = layout[i].reduce((a, b) => a + b, 0);
      if (sum !== 15) {
        balanced = false;
        const diff = 15 - sum;
        for (let j = 0; j < 6; j++) {
          if (i === j) continue;
          const sumJ = layout[j].reduce((a, b) => a + b, 0);
          if ((diff > 0 && sumJ > 15) || (diff < 0 && sumJ < 15)) {
            for (let c = 0; c < 9; c++) {
              if (diff > 0 && layout[j][c] > layout[i][c]) {
                const temp = layout[i][c];
                layout[i][c] = layout[j][c];
                layout[j][c] = temp;
                break;
              } else if (diff < 0 && layout[i][c] > layout[j][c]) {
                const temp = layout[i][c];
                layout[i][c] = layout[j][c];
                layout[j][c] = temp;
                break;
              }
            }
          }
        }
        break;
      }
    }
  }

  const sheetOutput: CartellaNumber[][] = [];
  for (let i = 0; i < 6; i++) {
    const cardLayout = layout[i];
    const cardRawNumbers: { number: number; column: number }[] = [];

    for (let c = 0; c < 9; c++) {
      const count = cardLayout[c];
      for (let k = 0; k < count; k++) {
        const val = columns[c].pop();
        if (val !== undefined) {
          cardRawNumbers.push({ number: val, column: c });
        }
      }
    }

    const colsInCard: { [col: number]: { number: number; column: number }[] } = {};
    cardRawNumbers.forEach((n) => {
      if (!colsInCard[n.column]) colsInCard[n.column] = [];
      colsInCard[n.column].push(n);
    });

    let success = false;
    let assignedRows: CartellaNumber[] = [];
    let attempts = 0;

    while (!success && attempts < 2000) {
      attempts++;
      const rowCounts = [0, 0, 0];
      const finalAssignment: CartellaNumber[] = [];
      let possible = true;

      for (let c = 0; c < 9; c++) {
        if (!colsInCard[c]) continue;
        const nums = colsInCard[c];
        const availableRows = [0, 1, 2];
        availableRows.sort(() => Math.random() - 0.5);

        for (let nIdx = 0; nIdx < nums.length; nIdx++) {
          const numObj = nums[nIdx];
          let placed = false;
          for (let rIdx = 0; rIdx < availableRows.length; rIdx++) {
            const r = availableRows[rIdx];
            if (rowCounts[r] < 5) {
              rowCounts[r]++;
              finalAssignment.push({
                number: numObj.number,
                column: numObj.column,
                row: r,
              });
              availableRows.splice(rIdx, 1);
              rIdx--;
              placed = true;
              break;
            }
          }
          if (!placed) {
            possible = false;
            break;
          }
        }
        if (!possible) break;
      }

      if (possible && rowCounts[0] === 5 && rowCounts[1] === 5 && rowCounts[2] === 5) {
        success = true;
        assignedRows = finalAssignment;
      }
    }

    if (!success) {
      return generateCartellaNumbersForSheet();
    }

    assignedRows.sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.column - b.column;
    });

    sheetOutput.push(assignedRows);
  }

  return sheetOutput;
}

export function createCartella(
  gameId: string,
  sheetNumber: number,
  cartellaNumber: number,
  colorCode: string,
  playerNumber: number,
  numbers: CartellaNumber[]
): CartellaData {
  const playerLetter = 'G' + playerNumber;
  const cartellaId = `${gameId}.${playerLetter}.F${sheetNumber
    .toString()
    .padStart(3, '0')}.C${cartellaNumber
    .toString()
    .padStart(2, '0')}.${colorCode.charAt(0).toUpperCase() + colorCode.slice(1)}${playerLetter}`;

  return {
    id: cartellaId,
    gameId,
    sheetNumber,
    cartellaNumber,
    color: `${colorCode.charAt(0).toUpperCase() + colorCode.slice(1)}${playerLetter}`,
    colorType: colorCode,
    playerNumber,
    numbers,
    extractedNumbers: [],
    wins: { ambo: false, terno: false, quaterna: false, cinquina: false, tombola: false },
    winningNumbers: [],
  };
}

export function checkGoldExpiration(
  extractedCount: number,
  extractedNumbers: number[],
  goldNumber: number | null,
  goldWon: boolean,
  goldExpired: boolean
): boolean {
  if (goldWon || goldExpired || goldNumber === null) return false;
  return extractedCount === 7 && !extractedNumbers.includes(goldNumber);
}
