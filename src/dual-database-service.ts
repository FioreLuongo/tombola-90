import {
  buildEmptyJackpotBank,
  getJackpotBank as getFirebaseBank,
  getRegiaGameConfig as getFirebaseGameConfig,
  getUnclaimedHistory as getFirebaseHistory,
  initFirebaseJackpot,
  isFirebaseConnected,
  readJackpotBankCache,
  recallUnclaimedIntoGame as recallFirebaseBank,
  resetJackpotBank as resetFirebaseBank,
  sanitizeJackpotBankData,
  sanitizeRegiaGameConfig,
  saveCurrentGameUnclaimedToFirestore,
  saveRegiaGameConfig as saveFirebaseGameConfig,
  saveUnclaimedToDatabase as depositFirebaseBank,
  writeJackpotBankCache,
  type JackpotBankData,
  type RegiaGameConfigDoc,
  type UnclaimedHistoryEntry,
} from './firebase-jackpot-service';
import {
  getAppwriteJackpotBank,
  getAppwriteRegiaGameConfig,
  getAppwriteStatus,
  getAppwriteUnclaimedHistory,
  initAppwriteDb,
  isAppwriteConnected,
  saveAppwriteRegiaGameConfig,
  saveCurrentGameUnclaimedToAppwrite,
  depositUnclaimedToAppwrite,
  recallUnclaimedFromAppwrite,
  resetAppwriteBank,
  syncAppwriteJackpotSnapshot,
  type AppwriteConfig,
  type AppwriteStatusSnapshot,
} from './appwrite-db-service';
import {
  depositUnclaimedToServerDb,
  getServerDbJackpotAndHistory,
  getServerDbRegiaConfig,
  initServerDb,
  isServerDbConnected,
  recallUnclaimedFromServerDb,
  resetServerDbBank,
  saveCurrentGameUnclaimedToServerDb,
  saveServerDbRegiaConfig,
  syncServerDbSnapshot,
} from './server-db-service';

export type DatabaseMode = 'dual' | 'server' | 'firebase' | 'appwrite';

export const DUAL_DB_MODE_STORAGE_KEY = 'tombola_dual_db_mode_v1';
const LOCAL_HISTORY_CACHE_KEY = 'tombola_unclaimed_history_cache_v1';

export interface DualDatabaseStatus {
  mode: DatabaseMode;
  firebaseConnected: boolean;
  serverConnected: boolean;
  appwriteConnected: boolean;
  appwriteConfigured: boolean;
  appwriteError: string | null;
  anyCloudConnected: boolean;
  statusLabel: string;
}

export function resolveDatabaseMode(raw?: string | null): DatabaseMode {
  if (raw === 'firebase' || raw === 'appwrite' || raw === 'server' || raw === 'dual') return raw;
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DUAL_DB_MODE_STORAGE_KEY);
      if (stored === 'firebase' || stored === 'appwrite' || stored === 'server' || stored === 'dual') {
        return stored;
      }
    }
  } catch {
    // Ignore storage error
  }
  return 'dual';
}

export function saveDatabaseMode(mode: DatabaseMode): DatabaseMode {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DUAL_DB_MODE_STORAGE_KEY, mode);
    }
  } catch {
    // Ignore storage error
  }
  return mode;
}

export function shouldUseFirebase(mode: DatabaseMode): boolean {
  return mode === 'dual' || mode === 'firebase';
}

export function shouldUseServerDb(mode: DatabaseMode): boolean {
  return mode === 'dual' || mode === 'server';
}

export function shouldUseAppwrite(mode: DatabaseMode): boolean {
  return mode === 'dual' || mode === 'appwrite';
}

export function parseIsoMillis(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export type BankCandidateSource = 'firebase' | 'server' | 'appwrite' | 'local';

export function selectMostRecentBank(
  candidates: Array<{ source: BankCandidateSource; bank: JackpotBankData } | null | undefined>
): { bank: JackpotBankData; source: BankCandidateSource } {
  const valid = candidates.filter(
    (c): c is { source: BankCandidateSource; bank: JackpotBankData } => Boolean(c && c.bank)
  );
  if (valid.length === 0) {
    return { bank: buildEmptyJackpotBank(), source: 'local' };
  }

  // Prefer active databases over local cache on close timestamps; otherwise newest timestamp wins
  valid.sort((a, b) => {
    const msDiff = parseIsoMillis(b.bank.lastUpdated) - parseIsoMillis(a.bank.lastUpdated);
    if (Math.abs(msDiff) > 1000) return msDiff;
    const rank: Record<BankCandidateSource, number> = {
      firebase: 4,
      server: 3,
      appwrite: 2,
      local: 1,
    };
    return rank[b.source] - rank[a.source];
  });

  return {
    bank: sanitizeJackpotBankData(valid[0].bank),
    source: valid[0].source,
  };
}

export function mergeUnclaimedHistory(
  listA: UnclaimedHistoryEntry[],
  listB: UnclaimedHistoryEntry[],
  limitCount: number = 8
): UnclaimedHistoryEntry[] {
  const combined: UnclaimedHistoryEntry[] = [];
  for (const item of [...(listA || []), ...(listB || [])]) {
    if (!item) continue;
    const itemMs = parseIsoMillis(item.timestamp);
    const isDuplicate = combined.some((existing) => {
      if (existing.type !== item.type || existing.gameId !== item.gameId) return false;
      if (Math.abs(Number(existing.amount) - Number(item.amount)) >= 0.005) return false;
      return Math.abs(parseIsoMillis(existing.timestamp) - itemMs) <= 15000;
    });
    if (isDuplicate) continue;
    combined.push(item);
  }
  combined.sort((a, b) => parseIsoMillis(b.timestamp) - parseIsoMillis(a.timestamp));
  return combined.slice(0, limitCount);
}

function readLocalHistoryCache(): UnclaimedHistoryEntry[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_HISTORY_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {
    // Ignore storage error
  }
  return [];
}

function appendLocalHistoryCache(entry: UnclaimedHistoryEntry): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const next = mergeUnclaimedHistory([entry], readLocalHistoryCache(), 20);
      localStorage.setItem(LOCAL_HISTORY_CACHE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage error
  }
}

export function buildDualDatabaseStatus(modeOverride?: DatabaseMode): DualDatabaseStatus {
  const mode = modeOverride || resolveDatabaseMode();
  const aw = getAppwriteStatus();
  const fbConnected = shouldUseFirebase(mode) && isFirebaseConnected();
  const srvConnected = shouldUseServerDb(mode) && isServerDbConnected();
  const awConnected = shouldUseAppwrite(mode) && aw.connected;
  const anyCloudConnected = fbConnected || srvConnected || awConnected;

  const activeCount = [fbConnected, srvConnected, awConnected].filter(Boolean).length;
  let statusLabel = 'Offline (Cache Locale)';
  if (activeCount >= 2) {
    statusLabel = fbConnected && srvConnected && awConnected ? 'Multi-DB (3/3)' : 'Dual-DB Attivo';
  } else if (fbConnected) {
    statusLabel = 'Firebase Cloud';
  } else if (srvConnected) {
    statusLabel = 'Server DB Attivo';
  } else if (awConnected) {
    statusLabel = 'Appwrite Cloud';
  }

  return {
    mode,
    firebaseConnected: fbConnected,
    serverConnected: srvConnected,
    appwriteConnected: awConnected,
    appwriteConfigured: aw.configured,
    appwriteError: aw.lastError,
    anyCloudConnected,
    statusLabel,
  };
}

export async function initDualDatabases(
  appwriteOverride?: Partial<AppwriteConfig>
): Promise<DualDatabaseStatus> {
  const mode = resolveDatabaseMode();
  const tasks: Array<Promise<unknown>> = [];

  if (shouldUseFirebase(mode)) {
    tasks.push(initFirebaseJackpot().catch(() => false));
  }
  if (shouldUseServerDb(mode)) {
    tasks.push(initServerDb().catch(() => false));
  }
  if (shouldUseAppwrite(mode) || appwriteOverride) {
    tasks.push(initAppwriteDb(appwriteOverride).catch(() => getAppwriteStatus()));
  }

  await Promise.allSettled(tasks);
  return buildDualDatabaseStatus(mode);
}

export async function getDualJackpotBankAndHistory(limitCount: number = 8): Promise<{
  bank: JackpotBankData;
  history: UnclaimedHistoryEntry[];
  status: DualDatabaseStatus;
}> {
  const mode = resolveDatabaseMode();
  const candidates: Array<{ source: BankCandidateSource; bank: JackpotBankData }> = [];
  let fbHistory: UnclaimedHistoryEntry[] = [];
  let srvHistory: UnclaimedHistoryEntry[] = [];
  let awHistory: UnclaimedHistoryEntry[] = [];

  const fbWanted = shouldUseFirebase(mode);
  const srvWanted = shouldUseServerDb(mode);
  const awStatus = getAppwriteStatus();
  const awWanted = shouldUseAppwrite(mode) && awStatus.configured;

  const [fbRes, srvRes, awRes] = await Promise.all([
    fbWanted
      ? Promise.all([getFirebaseBank(), getFirebaseHistory(limitCount)])
          .then(([bank, history]) => ({ ok: isFirebaseConnected(), bank, history }))
          .catch(() => ({ ok: false, bank: readJackpotBankCache(), history: [] as UnclaimedHistoryEntry[] }))
      : Promise.resolve({ ok: false, bank: readJackpotBankCache(), history: [] as UnclaimedHistoryEntry[] }),
    srvWanted
      ? getServerDbJackpotAndHistory(limitCount).catch(() => ({
          ok: false,
          bank: buildEmptyJackpotBank(),
          history: [] as UnclaimedHistoryEntry[],
        }))
      : Promise.resolve({ ok: false, bank: buildEmptyJackpotBank(), history: [] as UnclaimedHistoryEntry[] }),
    awWanted
      ? Promise.all([getAppwriteJackpotBank(), getAppwriteUnclaimedHistory(limitCount)])
          .then(([bankRes, history]) => ({ ok: bankRes.ok, bank: bankRes.bank, history }))
          .catch(() => ({ ok: false, bank: buildEmptyJackpotBank(), history: [] as UnclaimedHistoryEntry[] }))
      : Promise.resolve({ ok: false, bank: buildEmptyJackpotBank(), history: [] as UnclaimedHistoryEntry[] }),
  ]);

  if (fbRes.ok) {
    candidates.push({ source: 'firebase', bank: fbRes.bank });
    fbHistory = fbRes.history;
  }
  if (srvRes.ok) {
    candidates.push({ source: 'server', bank: srvRes.bank });
    srvHistory = srvRes.history;
  }
  if (awRes.ok) {
    candidates.push({ source: 'appwrite', bank: awRes.bank });
    awHistory = awRes.history;
  }
  candidates.push({ source: 'local', bank: readJackpotBankCache() });

  const chosen = selectMostRecentBank(candidates);
  writeJackpotBankCache(chosen.bank);

  // Quietly replicate newest snapshot across connected backends if lagging
  if (mode === 'dual') {
    const chosenMs = parseIsoMillis(chosen.bank.lastUpdated);
    if (srvRes.ok && chosen.source !== 'server' && chosenMs - parseIsoMillis(srvRes.bank.lastUpdated) > 1500) {
      void syncServerDbSnapshot(chosen.bank);
    }
    if (awRes.ok && chosen.source !== 'appwrite' && chosenMs - parseIsoMillis(awRes.bank.lastUpdated) > 1500) {
      void syncAppwriteJackpotSnapshot(chosen.bank);
    }
  }

  let mergedHistory = mergeUnclaimedHistory(fbHistory, srvHistory, limitCount);
  mergedHistory = mergeUnclaimedHistory(mergedHistory, awHistory, limitCount);
  mergedHistory = mergeUnclaimedHistory(mergedHistory, readLocalHistoryCache(), limitCount);

  return {
    bank: chosen.bank,
    history: mergedHistory,
    status: buildDualDatabaseStatus(mode),
  };
}

export async function saveDualCurrentGameUnclaimed(
  currentGameUnclaimed: number,
  currency: string = '€'
): Promise<{ success: boolean; bank: JackpotBankData; savedToCloud: boolean }> {
  const mode = resolveDatabaseMode();
  const safeCurrent =
    Number.isFinite(currentGameUnclaimed) && currentGameUnclaimed >= 0
      ? Math.round(currentGameUnclaimed * 100) / 100
      : 0;

  const currentLocal = readJackpotBankCache();
  const localUpdated: JackpotBankData = {
    ...currentLocal,
    currentGameUnclaimed: safeCurrent,
    currency: currency || currentLocal.currency,
    lastUpdated: new Date().toISOString(),
  };
  writeJackpotBankCache(localUpdated);

  const writes: Array<Promise<boolean>> = [];

  if (shouldUseFirebase(mode)) {
    writes.push(
      saveCurrentGameUnclaimedToFirestore(safeCurrent, currency)
        .then((r) => r.success)
        .catch(() => false)
    );
  }
  if (shouldUseServerDb(mode)) {
    writes.push(
      saveCurrentGameUnclaimedToServerDb(safeCurrent, currency)
        .then((r) => r.success)
        .catch(() => false)
    );
  }
  if (shouldUseAppwrite(mode) && getAppwriteStatus().configured) {
    writes.push(
      saveCurrentGameUnclaimedToAppwrite(safeCurrent, currency)
        .then((r) => r.success)
        .catch(() => false)
    );
  }

  const results = await Promise.all(writes);
  const savedToCloud = results.some(Boolean);
  return { success: true, bank: readJackpotBankCache(), savedToCloud };
}

export async function depositDualUnclaimed(
  amount: number,
  currency: string = '€',
  prizeCategory: string = 'all',
  gameId: string = 'TOM001',
  note: string = 'Deposito montepremi non vinti'
): Promise<{ success: boolean; newBalance: number; savedToCloud: boolean; error?: string }> {
  const mode = resolveDatabaseMode();
  const safeAmount = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;

  if (safeAmount <= 0) {
    const cur = readJackpotBankCache();
    return { success: true, newBalance: cur.accumulatedUnclaimed, savedToCloud: false };
  }

  const [fbResult, srvResult, awResult] = await Promise.all([
    shouldUseFirebase(mode)
      ? depositFirebaseBank(safeAmount, currency, prizeCategory, gameId, note).catch(() => ({
          success: false,
          newBalance: 0,
        }))
      : Promise.resolve({ success: false, newBalance: 0 }),
    shouldUseServerDb(mode)
      ? depositUnclaimedToServerDb(safeAmount, currency, prizeCategory, gameId, note).catch(() => ({
          success: false,
          newBalance: 0,
        }))
      : Promise.resolve({ success: false, newBalance: 0 }),
    shouldUseAppwrite(mode) && getAppwriteStatus().configured
      ? depositUnclaimedToAppwrite(safeAmount, currency, prizeCategory, gameId, note).catch(() => ({
          success: false,
          newBalance: 0,
        }))
      : Promise.resolve({ success: false, newBalance: 0 }),
  ]);

  const fbBalance = fbResult.success ? fbResult.newBalance : null;
  const srvBalance = srvResult.success ? srvResult.newBalance : null;
  const awBalance = awResult.success ? awResult.newBalance : null;

  const savedToCloud = fbBalance !== null || srvBalance !== null || awBalance !== null;
  const cached = readJackpotBankCache();
  const resolvedBalance =
    fbBalance ?? srvBalance ?? awBalance ?? Math.round((cached.accumulatedUnclaimed + safeAmount) * 100) / 100;

  const timestamp = new Date().toISOString();
  writeJackpotBankCache({
    accumulatedUnclaimed: resolvedBalance,
    currentGameUnclaimed: 0,
    currency: currency || cached.currency,
    lastUpdated: timestamp,
    totalGamesRecorded: cached.totalGamesRecorded + 1,
  });

  appendLocalHistoryCache({
    id: `local_${Date.now()}`,
    timestamp,
    gameId,
    type: 'deposit_expired',
    amount: safeAmount,
    balanceAfter: resolvedBalance,
    prizeCategory,
    note,
  });

  return { success: true, newBalance: resolvedBalance, savedToCloud };
}

export async function recallDualUnclaimed(
  amountToRecall: number | null,
  gameId: string = 'TOM001',
  note: string = 'Richiamo montepremi in partita successiva'
): Promise<{
  success: boolean;
  recalledAmount: number;
  remainingBalance: number;
  savedToCloud: boolean;
  error?: string;
}> {
  const mode = resolveDatabaseMode();
  const [fbResult, srvResult, awResult] = await Promise.all([
    shouldUseFirebase(mode)
      ? recallFirebaseBank(amountToRecall, gameId, note).catch(() => ({
          success: false,
          recalledAmount: 0,
          remainingBalance: 0,
          error: 'Firebase offline',
        }))
      : Promise.resolve({ success: false, recalledAmount: 0, remainingBalance: 0, error: 'Skipped' }),
    shouldUseServerDb(mode)
      ? recallUnclaimedFromServerDb(amountToRecall, gameId, note).catch(() => ({
          success: false,
          recalledAmount: 0,
          remainingBalance: 0,
          error: 'Server DB offline',
        }))
      : Promise.resolve({ success: false, recalledAmount: 0, remainingBalance: 0, error: 'Skipped' }),
    shouldUseAppwrite(mode) && getAppwriteStatus().configured
      ? recallUnclaimedFromAppwrite(amountToRecall, gameId, note).catch(() => ({
          success: false,
          recalledAmount: 0,
          remainingBalance: 0,
          error: 'Appwrite offline',
        }))
      : Promise.resolve({ success: false, recalledAmount: 0, remainingBalance: 0, error: 'Skipped' }),
  ]);

  const winningCloud = fbResult.success
    ? fbResult
    : srvResult.success
      ? srvResult
      : awResult.success
        ? awResult
        : null;
  const savedToCloud = Boolean(winningCloud);

  if (winningCloud) {
    const cached = readJackpotBankCache();
    const timestamp = new Date().toISOString();
    writeJackpotBankCache({
      ...cached,
      accumulatedUnclaimed: winningCloud.remainingBalance,
      lastUpdated: timestamp,
    });
    appendLocalHistoryCache({
      id: `local_${Date.now()}`,
      timestamp,
      gameId,
      type: 'recalled_into_game',
      amount: winningCloud.recalledAmount,
      balanceAfter: winningCloud.remainingBalance,
      prizeCategory: 'rollover_recall',
      note: `${note} (${cached.currency} ${winningCloud.recalledAmount.toFixed(2)})`,
    });
    return {
      success: true,
      recalledAmount: winningCloud.recalledAmount,
      remainingBalance: winningCloud.remainingBalance,
      savedToCloud: true,
    };
  }

  // Fallback on local cache if all remote DB providers are unavailable
  const cached = readJackpotBankCache();
  if (cached.accumulatedUnclaimed <= 0) {
    return {
      success: false,
      recalledAmount: 0,
      remainingBalance: 0,
      savedToCloud: false,
      error: 'Nessun montepremi salvato in Cassa da richiamare.',
    };
  }

  const actualRecall =
    amountToRecall !== null && amountToRecall > 0 && amountToRecall <= cached.accumulatedUnclaimed
      ? amountToRecall
      : cached.accumulatedUnclaimed;
  const remainingBalance = Math.round((cached.accumulatedUnclaimed - actualRecall) * 100) / 100;
  const timestamp = new Date().toISOString();

  writeJackpotBankCache({
    ...cached,
    accumulatedUnclaimed: remainingBalance,
    lastUpdated: timestamp,
  });
  appendLocalHistoryCache({
    id: `local_${Date.now()}`,
    timestamp,
    gameId,
    type: 'recalled_into_game',
    amount: actualRecall,
    balanceAfter: remainingBalance,
    prizeCategory: 'rollover_recall',
    note: `${note} (${cached.currency} ${actualRecall.toFixed(2)})`,
  });

  return {
    success: true,
    recalledAmount: actualRecall,
    remainingBalance,
    savedToCloud,
  };
}

export async function resetDualJackpotBank(
  gameId: string = 'TOM001',
  note: string = 'Azzeramento manuale cassa da Regia'
): Promise<{ success: boolean; savedToCloud: boolean; error?: string }> {
  const mode = resolveDatabaseMode();
  const cachedBefore = readJackpotBankCache();

  const [fbRes, srvRes, awRes] = await Promise.all([
    shouldUseFirebase(mode)
      ? resetFirebaseBank(gameId, note).catch(() => ({ success: false }))
      : Promise.resolve({ success: false }),
    shouldUseServerDb(mode)
      ? resetServerDbBank(gameId, note).catch(() => ({ success: false }))
      : Promise.resolve({ success: false }),
    shouldUseAppwrite(mode) && getAppwriteStatus().configured
      ? resetAppwriteBank(gameId, note).catch(() => ({ success: false }))
      : Promise.resolve({ success: false }),
  ]);

  const timestamp = new Date().toISOString();
  writeJackpotBankCache({
    ...cachedBefore,
    accumulatedUnclaimed: 0,
    lastUpdated: timestamp,
  });
  appendLocalHistoryCache({
    id: `local_${Date.now()}`,
    timestamp,
    gameId,
    type: 'reset',
    amount: cachedBefore.accumulatedUnclaimed,
    balanceAfter: 0,
    prizeCategory: 'manual_reset',
    note: `${note} (Precedente saldo: ${cachedBefore.currency} ${cachedBefore.accumulatedUnclaimed.toFixed(2)})`,
  });

  return {
    success: true,
    savedToCloud: fbRes.success || srvRes.success || awRes.success,
  };
}

export async function saveDualRegiaGameConfig(
  cfg: Partial<RegiaGameConfigDoc>
): Promise<{ success: boolean; config: RegiaGameConfigDoc; savedToCloud: boolean }> {
  const mode = resolveDatabaseMode();
  const clean = sanitizeRegiaGameConfig({
    ...cfg,
    id: 'main',
    updatedAt: new Date().toISOString(),
  });
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tombola_regia_unified_config_v1', JSON.stringify(clean));
    }
  } catch {
    // Ignore storage error
  }

  const writes: Array<Promise<boolean>> = [];
  if (shouldUseFirebase(mode)) {
    writes.push(saveFirebaseGameConfig(clean).then((r) => r.savedToCloud).catch(() => false));
  }
  if (shouldUseServerDb(mode)) {
    writes.push(saveServerDbRegiaConfig(clean).catch(() => false));
  }
  if (shouldUseAppwrite(mode) && getAppwriteStatus().configured) {
    writes.push(saveAppwriteRegiaGameConfig(clean).then((r) => r.savedToAppwrite).catch(() => false));
  }

  const results = await Promise.all(writes);
  const savedToCloud = results.some(Boolean);

  return {
    success: true,
    config: clean,
    savedToCloud,
  };
}

export async function getDualRegiaGameConfig(): Promise<{
  config: RegiaGameConfigDoc | null;
  fromCloud: boolean;
}> {
  const mode = resolveDatabaseMode();
  if (shouldUseFirebase(mode)) {
    const fb = await getFirebaseGameConfig();
    if (fb.fromCloud && fb.config) return fb;
  }
  if (shouldUseServerDb(mode)) {
    const srvCfg = await getServerDbRegiaConfig();
    if (srvCfg) return { config: srvCfg, fromCloud: true };
  }
  if (shouldUseAppwrite(mode) && getAppwriteStatus().configured) {
    const awCfg = await getAppwriteRegiaGameConfig();
    if (awCfg) return { config: awCfg, fromCloud: true };
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('tombola_regia_unified_config_v1');
      if (raw) {
        return { config: sanitizeRegiaGameConfig(JSON.parse(raw)), fromCloud: false };
      }
    }
  } catch {
    // Ignore storage error
  }
  return { config: null, fromCloud: false };
}

export type { AppwriteConfig, AppwriteStatusSnapshot };
export { getAppwriteStatus, isAppwriteConnected };
