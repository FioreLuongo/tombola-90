/**
 * Tombola Official Win Rules - Sequential Ascending Order Progression
 * 
 * I Premi: durante la partita si assegnano in ordine strettamente crescente:
 * • Ambo: 2 numeri sulla stessa riga
 * • Terno: 3 numeri sulla stessa riga (solo dopo Ambo vinto o scaduto)
 * • Quaterna: 4 numeri sulla stessa riga (solo dopo Terno vinto o scaduto)
 * • Cinquina: 5 numeri sulla stessa riga (solo dopo Quaterna vinta o scaduta)
 * • Tombola: tutti i 15 numeri della cartella coperti (solo dopo Cinquina vinta o scaduta)
 */

export type PrizeType = 'ambo' | 'terno' | 'quaterna' | 'cinquina' | 'tombola';

export const PRIZE_SEQUENCE: PrizeType[] = ['ambo', 'terno', 'quaterna', 'cinquina', 'tombola'];

export const PRIZE_ROW_REQUIREMENTS: Record<PrizeType, number> = {
    ambo: 2,
    terno: 3,
    quaterna: 4,
    cinquina: 5,
    tombola: 15 // Full cartella (3 rows x 5 numbers = 15)
};

export interface PrizeStatus {
    won: boolean;
    expired?: boolean;
    cartellaId?: string | null;
    numbers?: number[];
    winningRow?: number | null;
}

export interface GamePrizesProgress {
    ambo: PrizeStatus;
    terno: PrizeStatus;
    quaterna: PrizeStatus;
    cinquina: PrizeStatus;
    tombola: PrizeStatus;
}

export interface CartellaNumberData {
    number: number;
    row: number; // 0, 1, 2
    column: number; // 0..8
}

export interface CartellaEntity {
    id: string;
    numbers: CartellaNumberData[];
    extractedNumbers?: number[];
    wins?: Partial<Record<PrizeType, boolean>>;
    isActive?: boolean;
}

export interface WinCheckResult {
    won: boolean;
    prizeType: PrizeType | null;
    cartellaId: string | null;
    winningRow: number | null; // 0, 1, 2 or -1 for tombola
    winningNumbers: number[];
    nextStageAfterWin: PrizeType | null;
}

/**
 * Returns the currently active prize stage in the game according to sequential progression.
 * Returns null if all prizes have been won or expired.
 */
export function getCurrentActivePrize(progress: GamePrizesProgress): PrizeType | null {
    for (const prize of PRIZE_SEQUENCE) {
        const status = progress[prize];
        // La Tombola (15 numeri) non scade mai prima che una cartella completi tutti i 15 numeri
        const isClosed = status && (status.won || (prize !== 'tombola' && status.expired));
        if (!isClosed) {
            return prize;
        }
    }
    return null;
}

/**
 * Checks if a cartella meets the requirement for a specific prize stage.
 */
export function evaluateCartellaForPrize(
    cartella: CartellaEntity,
    targetPrize: PrizeType,
    drawnNumbers: number[],
    justDrawnNumber?: number
): { qualified: boolean; row: number | null; numbers: number[] } {
    const extractedSet = new Set(drawnNumbers);

    if (targetPrize === 'tombola') {
        const allCartellaNumbers = cartella.numbers.map(n => n.number);
        const covered = allCartellaNumbers.filter(num => extractedSet.has(num));
        if (allCartellaNumbers.length > 0 && covered.length === allCartellaNumbers.length) {
            return { qualified: true, row: -1, numbers: covered };
        }
        return { qualified: false, row: null, numbers: [] };
    }

    // If justDrawnNumber is provided, ensure this cartella actually contains the new number
    if (justDrawnNumber !== undefined) {
        const containsNew = cartella.numbers.some(n => n.number === justDrawnNumber);
        if (!containsNew) {
            return { qualified: false, row: null, numbers: [] };
        }
    }

    const requiredInRow = PRIZE_ROW_REQUIREMENTS[targetPrize];

    // Check rows 0, 1, 2
    for (let row = 0; row < 3; row++) {
        const rowNumbers = cartella.numbers.filter(n => n.row === row).map(n => n.number);
        const extractedInRow = rowNumbers.filter(n => extractedSet.has(n));
        
        // If justDrawnNumber is provided, the just-drawn number must belong to this row to trigger the win now
        if (justDrawnNumber !== undefined && !rowNumbers.includes(justDrawnNumber)) {
            continue;
        }

        if (extractedInRow.length >= requiredInRow) {
            return {
                qualified: true,
                row,
                numbers: extractedInRow.slice(0, requiredInRow)
            };
        }
    }

    return { qualified: false, row: null, numbers: [] };
}

/**
 * Evaluates all active cartelle for the current sequential prize stage upon a newly drawn number.
 */
export function checkSequentialWins(
    cartelle: CartellaEntity[],
    drawnNumbers: number[],
    newNumber: number,
    progress: GamePrizesProgress,
    canAwardPrizeFilter?: (prize: PrizeType, cartellaId: string) => boolean
): WinCheckResult {
    const activeStage = getCurrentActivePrize(progress);
    if (!activeStage) {
        return {
            won: false,
            prizeType: null,
            cartellaId: null,
            winningRow: null,
            winningNumbers: [],
            nextStageAfterWin: null
        };
    }

    const activeCartelle = cartelle.filter(c => c.isActive !== false);

    if (activeStage === 'tombola') {
        // Prefer cards containing newNumber first, then any active card that already covered all 15 numbers
        const orderedCandidates = [
            ...activeCartelle.filter(c => c.numbers.some(n => n.number === newNumber)),
            ...activeCartelle.filter(c => !c.numbers.some(n => n.number === newNumber))
        ];

        for (const cartella of orderedCandidates) {
            const evalResult = evaluateCartellaForPrize(cartella, 'tombola', drawnNumbers, newNumber);
            if (evalResult.qualified) {
                return {
                    won: true,
                    prizeType: 'tombola',
                    cartellaId: cartella.id,
                    winningRow: -1,
                    winningNumbers: evalResult.numbers,
                    nextStageAfterWin: null
                };
            }
        }
    } else {
        // Evaluate cartelle in order for row prizes (ambo -> terno -> quaterna -> cinquina)
        for (const cartella of activeCartelle) {
            const evalResult = evaluateCartellaForPrize(cartella, activeStage, drawnNumbers, newNumber);
            if (evalResult.qualified) {
                if (canAwardPrizeFilter && !canAwardPrizeFilter(activeStage, cartella.id)) {
                    continue;
                }

                const nextStage = getNextPrizeStage(activeStage);
                return {
                    won: true,
                    prizeType: activeStage,
                    cartellaId: cartella.id,
                    winningRow: evalResult.row,
                    winningNumbers: evalResult.numbers,
                    nextStageAfterWin: nextStage
                };
            }
        }
    }

    return {
        won: false,
        prizeType: null,
        cartellaId: null,
        winningRow: null,
        winningNumbers: [],
        nextStageAfterWin: activeStage
    };
}

export function getNextPrizeStage(currentStage: PrizeType): PrizeType | null {
    const idx = PRIZE_SEQUENCE.indexOf(currentStage);
    if (idx >= 0 && idx < PRIZE_SEQUENCE.length - 1) {
        return PRIZE_SEQUENCE[idx + 1];
    }
    return null;
}
