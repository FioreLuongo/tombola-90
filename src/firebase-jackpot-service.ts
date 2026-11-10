import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export interface JackpotBankData {
  accumulatedUnclaimed: number;
  currency: string;
  lastUpdated: string;
  totalGamesRecorded: number;
}

export interface UnclaimedHistoryEntry {
  id?: string;
  timestamp: string;
  gameId: string;
  type: 'deposit_expired' | 'recalled_into_game' | 'manual_adjustment' | 'reset';
  amount: number;
  balanceAfter: number;
  prizeCategory: string;
  note: string;
}

let db: Firestore | null = null;
let isConnected = false;

export async function initFirebaseJackpot(): Promise<boolean> {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    
    // Support custom databaseId if configured in AI Studio
    const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    db = databaseId && databaseId !== '(default)' 
      ? getFirestore(app, databaseId) 
      : getFirestore(app);

    // Validate connection to Firestore as required by skill
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      isConnected = true;
    } catch (e: any) {
      // Even if document does not exist, reaching server without offline error confirms connection
      if (!e?.message?.includes('the client is offline')) {
        isConnected = true;
      } else {
        console.warn('Firebase client is offline, using local cache fallback.');
      }
    }
    return isConnected;
  } catch (error) {
    console.error('Error initializing Firebase Jackpot service:', error);
    return false;
  }
}

export function isFirebaseConnected(): boolean {
  return isConnected && db !== null;
}

const BANK_DOC_ID = 'main';

export async function getJackpotBank(): Promise<JackpotBankData> {
  if (!db) {
    const ok = await initFirebaseJackpot();
    if (!ok || !db) {
      return { accumulatedUnclaimed: 0, currency: '€', lastUpdated: new Date().toISOString(), totalGamesRecorded: 0 };
    }
  }

  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const snap = await getDoc(bankDocRef);
    if (snap.exists()) {
      const data = snap.data() as JackpotBankData;
      return {
        accumulatedUnclaimed: Number(data.accumulatedUnclaimed) || 0,
        currency: data.currency || '€',
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        totalGamesRecorded: Number(data.totalGamesRecorded) || 0
      };
    } else {
      // Seed initial zero state
      const initial: JackpotBankData = {
        accumulatedUnclaimed: 0,
        currency: '€',
        lastUpdated: new Date().toISOString(),
        totalGamesRecorded: 0
      };
      await setDoc(bankDocRef, initial);
      return initial;
    }
  } catch (err) {
    console.error('Failed to get jackpot bank from Firestore:', err);
    return { accumulatedUnclaimed: 0, currency: '€', lastUpdated: new Date().toISOString(), totalGamesRecorded: 0 };
  }
}

export function subscribeToJackpotBank(callback: (bank: JackpotBankData) => void): (() => void) | null {
  if (!db) {
    initFirebaseJackpot().then(ok => {
      if (ok && db) subscribeToJackpotBank(callback);
    });
    return null;
  }

  const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
  return onSnapshot(bankDocRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as JackpotBankData;
      callback({
        accumulatedUnclaimed: Number(data.accumulatedUnclaimed) || 0,
        currency: data.currency || '€',
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        totalGamesRecorded: Number(data.totalGamesRecorded) || 0
      });
    }
  }, (err) => {
    console.warn('Jackpot bank realtime subscription error:', err);
  });
}

export async function saveUnclaimedToDatabase(
  amount: number,
  currency: string = '€',
  prizeCategory: string = 'all',
  gameId: string = 'TOM001',
  note: string = 'Deposito montepremi non vinti'
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (!db) await initFirebaseJackpot();
  if (!db) return { success: false, newBalance: 0, error: 'Database non collegato' };

  if (amount <= 0) {
    const current = await getJackpotBank();
    return { success: true, newBalance: current.accumulatedUnclaimed };
  }

  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const currentBank = await getJackpotBank();
    const newBalance = Math.round((currentBank.accumulatedUnclaimed + amount) * 100) / 100;

    const updatedBank: JackpotBankData = {
      accumulatedUnclaimed: newBalance,
      currency: currency || currentBank.currency,
      lastUpdated: new Date().toISOString(),
      totalGamesRecorded: currentBank.totalGamesRecorded + 1
    };

    await setDoc(bankDocRef, updatedBank, { merge: true });

    // Record in ledger
    const ledgerRef = collection(db, 'unclaimed_history');
    await addDoc(ledgerRef, {
      timestamp: new Date().toISOString(),
      gameId,
      type: 'deposit_expired',
      amount,
      balanceAfter: newBalance,
      prizeCategory,
      note
    });

    return { success: true, newBalance };
  } catch (err: any) {
    console.error('Failed to save unclaimed prize to Firestore:', err);
    return { success: false, newBalance: 0, error: err.message || 'Errore salvataggio' };
  }
}

export async function recallUnclaimedIntoGame(
  amountToRecall: number | null,
  gameId: string = 'TOM001',
  note: string = 'Richiamo montepremi in partita successiva'
): Promise<{ success: boolean; recalledAmount: number; remainingBalance: number; error?: string }> {
  if (!db) await initFirebaseJackpot();
  if (!db) return { success: false, recalledAmount: 0, remainingBalance: 0, error: 'Database non collegato' };

  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const currentBank = await getJackpotBank();
    
    if (currentBank.accumulatedUnclaimed <= 0) {
      return { success: false, recalledAmount: 0, remainingBalance: 0, error: 'Nessun montepremi salvato in Cassa da richiamare.' };
    }

    const actualRecall = amountToRecall !== null && amountToRecall > 0 && amountToRecall <= currentBank.accumulatedUnclaimed
      ? amountToRecall
      : currentBank.accumulatedUnclaimed;

    const remainingBalance = Math.round((currentBank.accumulatedUnclaimed - actualRecall) * 100) / 100;

    const updatedBank: JackpotBankData = {
      accumulatedUnclaimed: remainingBalance,
      currency: currentBank.currency,
      lastUpdated: new Date().toISOString(),
      totalGamesRecorded: currentBank.totalGamesRecorded
    };

    await setDoc(bankDocRef, updatedBank, { merge: true });

    // Record in ledger
    const ledgerRef = collection(db, 'unclaimed_history');
    await addDoc(ledgerRef, {
      timestamp: new Date().toISOString(),
      gameId,
      type: 'recalled_into_game',
      amount: actualRecall,
      balanceAfter: remainingBalance,
      prizeCategory: 'rollover_recall',
      note: `${note} (${currentBank.currency} ${actualRecall.toFixed(2)})`
    });

    return { success: true, recalledAmount: actualRecall, remainingBalance };
  } catch (err: any) {
    console.error('Failed to recall unclaimed prize from Firestore:', err);
    return { success: false, recalledAmount: 0, remainingBalance: 0, error: err.message || 'Errore richiamo' };
  }
}

export async function resetJackpotBank(
  gameId: string = 'TOM001',
  note: string = 'Azziramento manuale cassa da Regia'
): Promise<{ success: boolean; error?: string }> {
  if (!db) await initFirebaseJackpot();
  if (!db) return { success: false, error: 'Database non collegato' };

  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const currentBank = await getJackpotBank();

    const updatedBank: JackpotBankData = {
      accumulatedUnclaimed: 0,
      currency: currentBank.currency,
      lastUpdated: new Date().toISOString(),
      totalGamesRecorded: currentBank.totalGamesRecorded
    };

    await setDoc(bankDocRef, updatedBank, { merge: true });

    // Record in ledger
    const ledgerRef = collection(db, 'unclaimed_history');
    await addDoc(ledgerRef, {
      timestamp: new Date().toISOString(),
      gameId,
      type: 'reset',
      amount: currentBank.accumulatedUnclaimed,
      balanceAfter: 0,
      prizeCategory: 'manual_reset',
      note: `${note} (Precedente saldo: ${currentBank.currency} ${currentBank.accumulatedUnclaimed.toFixed(2)})`
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to reset jackpot bank in Firestore:', err);
    return { success: false, error: err.message || 'Errore azzeramento' };
  }
}

export async function getUnclaimedHistory(limitCount: number = 8): Promise<UnclaimedHistoryEntry[]> {
  if (!db) await initFirebaseJackpot();
  if (!db) return [];

  try {
    const ledgerRef = collection(db, 'unclaimed_history');
    const q = query(ledgerRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    const entries: UnclaimedHistoryEntry[] = [];
    snap.forEach(docSnap => {
      entries.push({ id: docSnap.id, ...(docSnap.data() as any) });
    });
    return entries;
  } catch (err) {
    console.warn('Failed to load unclaimed ledger history:', err);
    return [];
  }
}
