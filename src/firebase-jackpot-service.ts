import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
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

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

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

export type DifficultyLevel = 'high' | 'medium' | 'normal' | 'random' | 'custom';

export interface RegiaProfileData {
  id: string;
  name: string;
  isPreset: boolean;
  enabled: boolean;
  difficultyLevel: DifficultyLevel;
  forcedMinAmbo: number;
  forcedMinTerno: number;
  forcedMinQuaterna: number;
  forcedMinCinquina: number;
  forcedMinTombola: number;
  delayMaxGold: number;
  delayMaxAmbo: number;
  delayMaxTerno: number;
  delayMaxQuaterna: number;
  delayMaxCinquina: number;
  delayMaxTombola: number;
  updatedAt: string;
}

export const DEFAULT_REGIA_PROFILES: RegiaProfileData[] = [
  {
    id: 'high',
    name: 'Massima Difficoltà (Anti-Vincita)',
    isPreset: true,
    enabled: true,
    difficultyLevel: 'high',
    forcedMinAmbo: 15,
    forcedMinTerno: 28,
    forcedMinQuaterna: 42,
    forcedMinCinquina: 58,
    forcedMinTombola: 75,
    delayMaxGold: 25,
    delayMaxAmbo: 20,
    delayMaxTerno: 35,
    delayMaxQuaterna: 50,
    delayMaxCinquina: 65,
    delayMaxTombola: 85,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'medium',
    name: 'Medio (Distribuzione Bilanciata)',
    isPreset: true,
    enabled: true,
    difficultyLevel: 'medium',
    forcedMinAmbo: 10,
    forcedMinTerno: 20,
    forcedMinQuaterna: 34,
    forcedMinCinquina: 48,
    forcedMinTombola: 65,
    delayMaxGold: 30,
    delayMaxAmbo: 25,
    delayMaxTerno: 40,
    delayMaxQuaterna: 55,
    delayMaxCinquina: 70,
    delayMaxTombola: 86,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'normal',
    name: 'Standard (Classico)',
    isPreset: true,
    enabled: true,
    difficultyLevel: 'normal',
    forcedMinAmbo: 6,
    forcedMinTerno: 14,
    forcedMinQuaterna: 24,
    forcedMinCinquina: 36,
    forcedMinTombola: 55,
    delayMaxGold: 35,
    delayMaxAmbo: 30,
    delayMaxTerno: 45,
    delayMaxQuaterna: 60,
    delayMaxCinquina: 75,
    delayMaxTombola: 88,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'random',
    name: 'Casuale Puro (Nessun Filtro)',
    isPreset: true,
    enabled: false,
    difficultyLevel: 'random',
    forcedMinAmbo: 2,
    forcedMinTerno: 3,
    forcedMinQuaterna: 4,
    forcedMinCinquina: 5,
    forcedMinTombola: 15,
    delayMaxGold: 25,
    delayMaxAmbo: 20,
    delayMaxTerno: 35,
    delayMaxQuaterna: 50,
    delayMaxCinquina: 65,
    delayMaxTombola: 85,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const PROFILES_LOCAL_CACHE_KEY = 'tombola_regia_profiles_cache_v1';
const ACTIVE_PROFILE_LOCAL_KEY = 'tombola_regia_active_profile_v1';

let db: Firestore | null = null;
let authInstance: ReturnType<typeof getAuth> | null = null;
let isConnected = false;

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const user = authInstance?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid ?? null,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      tenantId: user?.tenantId ?? null,
      providerInfo:
        user?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function clampThreshold(value: unknown, minVal: number, maxVal: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maxVal, Math.max(minVal, Math.round(parsed)));
}

export function sanitizeProfileId(rawId: string): string {
  const cleaned = (rawId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || `profilo_${Date.now()}`;
}

function sanitizeRegiaProfile(input: Partial<RegiaProfileData> & { id: string }): RegiaProfileData {
  const safeId = sanitizeProfileId(input.id);
  const safeName = (input.name || safeId).trim().slice(0, 60) || safeId;
  const allowedLevels: DifficultyLevel[] = ['high', 'medium', 'normal', 'random', 'custom'];
  const safeLevel: DifficultyLevel = allowedLevels.includes(input.difficultyLevel as DifficultyLevel)
    ? (input.difficultyLevel as DifficultyLevel)
    : 'custom';

  return {
    id: safeId,
    name: safeName,
    isPreset: Boolean(input.isPreset),
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
    difficultyLevel: safeLevel,
    forcedMinAmbo: clampThreshold(input.forcedMinAmbo, 1, 90, 15),
    forcedMinTerno: clampThreshold(input.forcedMinTerno, 1, 90, 28),
    forcedMinQuaterna: clampThreshold(input.forcedMinQuaterna, 1, 90, 42),
    forcedMinCinquina: clampThreshold(input.forcedMinCinquina, 1, 90, 58),
    forcedMinTombola: clampThreshold(input.forcedMinTombola, 1, 90, 75),
    delayMaxGold: clampThreshold(input.delayMaxGold, 5, 90, 25),
    delayMaxAmbo: clampThreshold(input.delayMaxAmbo, 5, 90, 20),
    delayMaxTerno: clampThreshold(input.delayMaxTerno, 5, 90, 35),
    delayMaxQuaterna: clampThreshold(input.delayMaxQuaterna, 5, 90, 50),
    delayMaxCinquina: clampThreshold(input.delayMaxCinquina, 5, 90, 65),
    delayMaxTombola: clampThreshold(input.delayMaxTombola, 5, 90, 85),
    updatedAt: new Date().toISOString(),
  };
}

function readProfilesCache(): RegiaProfileData[] {
  try {
    const raw = localStorage.getItem(PROFILES_LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Ignore storage error
  }
  return [...DEFAULT_REGIA_PROFILES];
}

function writeProfilesCache(profiles: RegiaProfileData[]) {
  try {
    localStorage.setItem(PROFILES_LOCAL_CACHE_KEY, JSON.stringify(profiles));
  } catch {
    // Ignore storage error
  }
}

export async function initFirebaseJackpot(): Promise<boolean> {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(app);

    const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    db = databaseId && databaseId !== '(default)'
      ? getFirestore(app, databaseId)
      : getFirestore(app);

    // Validate connection to Firestore as required by skill
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      isConnected = true;
    } catch (e: any) {
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

  const path = `jackpot_bank/${BANK_DOC_ID}`;
  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const snap = await getDoc(bankDocRef);
    if (snap.exists()) {
      const data = snap.data() as JackpotBankData;
      return {
        accumulatedUnclaimed: Number(data.accumulatedUnclaimed) || 0,
        currency: data.currency || '€',
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        totalGamesRecorded: Number(data.totalGamesRecorded) || 0,
      };
    } else {
      const initial: JackpotBankData = {
        accumulatedUnclaimed: 0,
        currency: '€',
        lastUpdated: new Date().toISOString(),
        totalGamesRecorded: 0,
      };
      await setDoc(bankDocRef, initial);
      return initial;
    }
  } catch (err) {
    console.error('Failed to get jackpot bank from Firestore:', err);
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch {
      // Return safe fallback after structured error log
    }
    return { accumulatedUnclaimed: 0, currency: '€', lastUpdated: new Date().toISOString(), totalGamesRecorded: 0 };
  }
}

export function subscribeToJackpotBank(callback: (bank: JackpotBankData) => void): (() => void) | null {
  if (!db) {
    initFirebaseJackpot().then((ok) => {
      if (ok && db) subscribeToJackpotBank(callback);
    });
    return null;
  }

  const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
  return onSnapshot(
    bankDocRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as JackpotBankData;
        callback({
          accumulatedUnclaimed: Number(data.accumulatedUnclaimed) || 0,
          currency: data.currency || '€',
          lastUpdated: data.lastUpdated || new Date().toISOString(),
          totalGamesRecorded: Number(data.totalGamesRecorded) || 0,
        });
      }
    },
    (err) => {
      console.warn('Jackpot bank realtime subscription error:', err);
    }
  );
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

  const path = `jackpot_bank/${BANK_DOC_ID}`;
  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const currentBank = await getJackpotBank();
    const newBalance = Math.round((currentBank.accumulatedUnclaimed + amount) * 100) / 100;

    const updatedBank: JackpotBankData = {
      accumulatedUnclaimed: newBalance,
      currency: currency || currentBank.currency,
      lastUpdated: new Date().toISOString(),
      totalGamesRecorded: currentBank.totalGamesRecorded + 1,
    };

    await setDoc(bankDocRef, updatedBank, { merge: true });

    const ledgerRef = collection(db, 'unclaimed_history');
    await addDoc(ledgerRef, {
      timestamp: new Date().toISOString(),
      gameId,
      type: 'deposit_expired',
      amount,
      balanceAfter: newBalance,
      prizeCategory,
      note,
    });

    return { success: true, newBalance };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Logged in structured format
    }
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

  const path = `jackpot_bank/${BANK_DOC_ID}`;
  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const currentBank = await getJackpotBank();

    if (currentBank.accumulatedUnclaimed <= 0) {
      return {
        success: false,
        recalledAmount: 0,
        remainingBalance: 0,
        error: 'Nessun montepremi salvato in Cassa da richiamare.',
      };
    }

    const actualRecall =
      amountToRecall !== null && amountToRecall > 0 && amountToRecall <= currentBank.accumulatedUnclaimed
        ? amountToRecall
        : currentBank.accumulatedUnclaimed;

    const remainingBalance = Math.round((currentBank.accumulatedUnclaimed - actualRecall) * 100) / 100;

    const updatedBank: JackpotBankData = {
      accumulatedUnclaimed: remainingBalance,
      currency: currentBank.currency,
      lastUpdated: new Date().toISOString(),
      totalGamesRecorded: currentBank.totalGamesRecorded,
    };

    await setDoc(bankDocRef, updatedBank, { merge: true });

    const ledgerRef = collection(db, 'unclaimed_history');
    await addDoc(ledgerRef, {
      timestamp: new Date().toISOString(),
      gameId,
      type: 'recalled_into_game',
      amount: actualRecall,
      balanceAfter: remainingBalance,
      prizeCategory: 'rollover_recall',
      note: `${note} (${currentBank.currency} ${actualRecall.toFixed(2)})`,
    });

    return { success: true, recalledAmount: actualRecall, remainingBalance };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Logged in structured format
    }
    return { success: false, recalledAmount: 0, remainingBalance: 0, error: err.message || 'Errore richiamo' };
  }
}

export async function resetJackpotBank(
  gameId: string = 'TOM001',
  note: string = 'Azzeramento manuale cassa da Regia'
): Promise<{ success: boolean; error?: string }> {
  if (!db) await initFirebaseJackpot();
  if (!db) return { success: false, error: 'Database non collegato' };

  const path = `jackpot_bank/${BANK_DOC_ID}`;
  try {
    const bankDocRef = doc(db, 'jackpot_bank', BANK_DOC_ID);
    const currentBank = await getJackpotBank();

    const updatedBank: JackpotBankData = {
      accumulatedUnclaimed: 0,
      currency: currentBank.currency,
      lastUpdated: new Date().toISOString(),
      totalGamesRecorded: currentBank.totalGamesRecorded,
    };

    await setDoc(bankDocRef, updatedBank, { merge: true });

    const ledgerRef = collection(db, 'unclaimed_history');
    await addDoc(ledgerRef, {
      timestamp: new Date().toISOString(),
      gameId,
      type: 'reset',
      amount: currentBank.accumulatedUnclaimed,
      balanceAfter: 0,
      prizeCategory: 'manual_reset',
      note: `${note} (Precedente saldo: ${currentBank.currency} ${currentBank.accumulatedUnclaimed.toFixed(2)})`,
    });

    return { success: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Logged in structured format
    }
    return { success: false, error: err.message || 'Errore azzeramento' };
  }
}

export async function getUnclaimedHistory(limitCount: number = 8): Promise<UnclaimedHistoryEntry[]> {
  if (!db) await initFirebaseJackpot();
  if (!db) return [];

  const path = 'unclaimed_history';
  try {
    const ledgerRef = collection(db, 'unclaimed_history');
    const q = query(ledgerRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    const entries: UnclaimedHistoryEntry[] = [];
    snap.forEach((docSnap) => {
      entries.push({ id: docSnap.id, ...(docSnap.data() as any) });
    });
    return entries;
  } catch (err) {
    console.warn('Failed to load unclaimed ledger history:', err);
    return [];
  }
}

// ============================================================================
// PROFILI DIFFICOLTÀ & SOGLIE REGIA (SALVATI SU FIRESTORE)
// ============================================================================

export async function getRegiaProfiles(): Promise<{ profiles: RegiaProfileData[]; fromCloud: boolean }> {
  if (!db) await initFirebaseJackpot();
  if (!db) {
    return { profiles: readProfilesCache(), fromCloud: false };
  }

  const path = 'regia_profiles';
  try {
    const profilesRef = collection(db, path);
    const snap = await getDocs(profilesRef);

    if (snap.empty) {
      // Seed default profiles cleanly into Firestore on first access
      const seeded: RegiaProfileData[] = [];
      for (const preset of DEFAULT_REGIA_PROFILES) {
        const clean = sanitizeRegiaProfile(preset);
        await setDoc(doc(db, path, clean.id), clean);
        seeded.push(clean);
      }
      writeProfilesCache(seeded);
      return { profiles: seeded, fromCloud: true };
    }

    const loaded: RegiaProfileData[] = [];
    snap.forEach((docSnap) => {
      loaded.push(sanitizeRegiaProfile({ ...(docSnap.data() as Partial<RegiaProfileData>), id: docSnap.id }));
    });

    // Sort presets first (in defined order), then custom profiles alphabetically
    const presetOrder = ['high', 'medium', 'normal', 'random'];
    loaded.sort((a, b) => {
      const ia = presetOrder.indexOf(a.id);
      const ib = presetOrder.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    writeProfilesCache(loaded);
    return { profiles: loaded, fromCloud: true };
  } catch (err) {
    console.warn('Failed to load regia profiles from Firestore:', err);
    try {
      handleFirestoreError(err, OperationType.LIST, path);
    } catch {
      // Logged structured error; return cached fallback
    }
    return { profiles: readProfilesCache(), fromCloud: false };
  }
}

export async function getActiveRegiaProfileId(): Promise<string> {
  let localActive = 'high';
  try {
    localActive = localStorage.getItem(ACTIVE_PROFILE_LOCAL_KEY) || 'high';
  } catch {
    localActive = 'high';
  }

  if (!db) await initFirebaseJackpot();
  if (!db) return localActive;

  const path = 'regia_settings/active_profile';
  try {
    const snap = await getDoc(doc(db, 'regia_settings', 'active_profile'));
    if (snap.exists() && snap.data()?.activeProfileId) {
      const id = String(snap.data().activeProfileId);
      try {
        localStorage.setItem(ACTIVE_PROFILE_LOCAL_KEY, id);
      } catch {
        // Ignore storage error
      }
      return id;
    }
  } catch (err) {
    console.warn('Failed to fetch active Regia profile setting:', err);
  }
  return localActive;
}

export async function setActiveRegiaProfileId(profileId: string): Promise<boolean> {
  const safeId = sanitizeProfileId(profileId);
  try {
    localStorage.setItem(ACTIVE_PROFILE_LOCAL_KEY, safeId);
  } catch {
    // Ignore storage error
  }

  if (!db) await initFirebaseJackpot();
  if (!db) return false;

  const path = 'regia_settings/active_profile';
  try {
    await setDoc(doc(db, 'regia_settings', 'active_profile'), {
      activeProfileId: safeId,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Structured error logged
    }
    return false;
  }
}

export async function saveRegiaProfile(
  profileInput: Partial<RegiaProfileData> & { id: string }
): Promise<{ success: boolean; profile: RegiaProfileData; savedToCloud: boolean; error?: string }> {
  const clean = sanitizeRegiaProfile(profileInput);

  // Update local cache immediately
  const cached = readProfilesCache();
  const idx = cached.findIndex((p) => p.id === clean.id);
  if (idx >= 0) cached[idx] = clean;
  else cached.push(clean);
  writeProfilesCache(cached);
  try {
    localStorage.setItem(ACTIVE_PROFILE_LOCAL_KEY, clean.id);
  } catch {
    // Ignore storage error
  }

  if (!db) await initFirebaseJackpot();
  if (!db) {
    return {
      success: false,
      profile: clean,
      savedToCloud: false,
      error: 'Database Firestore non connesso: salvato solo in cache locale.',
    };
  }

  const path = `regia_profiles/${clean.id}`;
  try {
    await setDoc(doc(db, 'regia_profiles', clean.id), clean);
    await setActiveRegiaProfileId(clean.id);
    return { success: true, profile: clean, savedToCloud: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Structured error logged
    }
    return {
      success: false,
      profile: clean,
      savedToCloud: false,
      error: err?.message || 'Errore salvataggio profilo su Firestore.',
    };
  }
}

export async function deleteRegiaProfile(
  profileId: string
): Promise<{ success: boolean; error?: string }> {
  const safeId = sanitizeProfileId(profileId);
  const cached = readProfilesCache().filter((p) => p.id !== safeId);
  writeProfilesCache(cached);

  if (!db) await initFirebaseJackpot();
  if (!db) return { success: false, error: 'Database Firestore non collegato.' };

  const path = `regia_profiles/${safeId}`;
  try {
    await deleteDoc(doc(db, 'regia_profiles', safeId));
    return { success: true };
  } catch (err: any) {
    try {
      handleFirestoreError(err, OperationType.DELETE, path);
    } catch {
      // Structured error logged
    }
    return { success: false, error: err?.message || 'Errore eliminazione profilo.' };
  }
}
