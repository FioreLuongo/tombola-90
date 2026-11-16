import { Client, Databases, Account, ID, Query, AppwriteException } from 'appwrite';
import {
  buildEmptyJackpotBank,
  sanitizeJackpotBankData,
  sanitizeRegiaGameConfig,
  type JackpotBankData,
  type RegiaGameConfigDoc,
  type UnclaimedHistoryEntry,
} from './firebase-jackpot-service';

export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  databaseId: string;
  bankCollectionId: string;
  historyCollectionId: string;
  configCollectionId: string;
  useAnonymousSession: boolean;
}

export interface AppwriteStatusSnapshot {
  configured: boolean;
  connected: boolean;
  lastError: string | null;
  config: AppwriteConfig;
}

export const APPWRITE_CONFIG_STORAGE_KEY = 'tombola_appwrite_config_v1';
const APPWRITE_BANK_DOC_ID = 'main';
const APPWRITE_CONFIG_DOC_ID = 'main';

function readEnvString(key: string): string {
  try {
    const env = (import.meta as any)?.env;
    if (env && typeof env[key] === 'string') {
      return env[key].trim();
    }
  } catch {
    // Non-Vite context (e.g. node:test)
  }
  return '';
}

export function getDefaultAppwriteConfig(): AppwriteConfig {
  return {
    endpoint: readEnvString('VITE_APPWRITE_ENDPOINT') || 'https://cloud.appwrite.io/v1',
    projectId: readEnvString('VITE_APPWRITE_PROJECT_ID') || '',
    databaseId: readEnvString('VITE_APPWRITE_DATABASE_ID') || '',
    bankCollectionId: readEnvString('VITE_APPWRITE_BANK_COLLECTION_ID') || 'jackpot_bank',
    historyCollectionId: readEnvString('VITE_APPWRITE_HISTORY_COLLECTION_ID') || 'unclaimed_history',
    configCollectionId: readEnvString('VITE_APPWRITE_CONFIG_COLLECTION_ID') || 'regia_config',
    useAnonymousSession: false,
  };
}

export function normalizeAppwriteConfig(raw?: Partial<AppwriteConfig> | null): AppwriteConfig {
  const defaults = getDefaultAppwriteConfig();
  const cleanEndpoint = (raw?.endpoint || defaults.endpoint).trim().replace(/\/+$/, '');
  return {
    endpoint: cleanEndpoint || 'https://cloud.appwrite.io/v1',
    projectId: (raw?.projectId ?? defaults.projectId).trim(),
    databaseId: (raw?.databaseId ?? defaults.databaseId).trim(),
    bankCollectionId: (raw?.bankCollectionId || defaults.bankCollectionId).trim() || 'jackpot_bank',
    historyCollectionId: (raw?.historyCollectionId || defaults.historyCollectionId).trim() || 'unclaimed_history',
    configCollectionId: (raw?.configCollectionId || defaults.configCollectionId).trim() || 'regia_config',
    useAnonymousSession: Boolean(raw?.useAnonymousSession),
  };
}

export function isAppwriteConfigured(cfg: AppwriteConfig): boolean {
  return Boolean(cfg.endpoint && cfg.projectId && cfg.databaseId && cfg.bankCollectionId);
}

export function loadStoredAppwriteConfig(): AppwriteConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(APPWRITE_CONFIG_STORAGE_KEY);
      if (raw) {
        return normalizeAppwriteConfig(JSON.parse(raw));
      }
    }
  } catch {
    // Ignore storage error
  }
  return getDefaultAppwriteConfig();
}

export function saveStoredAppwriteConfig(raw: Partial<AppwriteConfig>): AppwriteConfig {
  const clean = normalizeAppwriteConfig(raw);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(APPWRITE_CONFIG_STORAGE_KEY, JSON.stringify(clean));
    }
  } catch {
    // Ignore storage error
  }
  return clean;
}

export function clearStoredAppwriteConfig(): AppwriteConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(APPWRITE_CONFIG_STORAGE_KEY);
    }
  } catch {
    // Ignore storage error
  }
  return getDefaultAppwriteConfig();
}

export function mapAppwriteDocToJackpotBank(docData: Record<string, any> | null | undefined): JackpotBankData {
  if (!docData) return buildEmptyJackpotBank();
  return sanitizeJackpotBankData({
    accumulatedUnclaimed: Number(docData.accumulatedUnclaimed) || 0,
    currentGameUnclaimed: Number(docData.currentGameUnclaimed) || 0,
    currency: typeof docData.currency === 'string' ? docData.currency : '€',
    lastUpdated: typeof docData.lastUpdated === 'string' ? docData.lastUpdated : new Date().toISOString(),
    totalGamesRecorded: Number(docData.totalGamesRecorded) || 0,
  });
}

export function mapAppwriteDocToHistoryEntry(docData: Record<string, any>): UnclaimedHistoryEntry {
  return {
    id: String(docData.$id || docData.id || ''),
    timestamp: String(docData.timestamp || docData.$createdAt || new Date().toISOString()),
    gameId: String(docData.gameId || 'TOM001'),
    type: (docData.type as UnclaimedHistoryEntry['type']) || 'deposit_expired',
    amount: Number(docData.amount) || 0,
    balanceAfter: Number(docData.balanceAfter) || 0,
    prizeCategory: String(docData.prizeCategory || 'all'),
    note: String(docData.note || ''),
  };
}

function formatAppwriteError(err: unknown, contextLabel?: string): string {
  const prefix = contextLabel ? `[${contextLabel}] ` : '';
  if (err instanceof AppwriteException) {
    const rawMsg = (err.message || '').toLowerCase();
    const errType = ((err as any).type || '').toLowerCase();
    if (err.code === 401 || err.code === 403) {
      return `${prefix}Permessi Appwrite insufficienti (${err.code}): imposta ruolo "Any" con Read/Create/Update in Settings -> Permissions.`;
    }
    if (err.code === 404) {
      if (errType.includes('database') || rawMsg.includes('database')) {
        return `${prefix}Database "${activeConfig.databaseId}" non trovato (404): crealo in Appwrite -> Databases impostando Database ID esatto "${activeConfig.databaseId}".`;
      }
      if (errType.includes('collection') || errType.includes('table') || rawMsg.includes('collection') || rawMsg.includes('table')) {
        return `${prefix}Tabella/Collection non trovata (404) in "${activeConfig.databaseId}": verifica ID esatti (${activeConfig.bankCollectionId}, ${activeConfig.historyCollectionId}, ${activeConfig.configCollectionId}).`;
      }
      return `${prefix}Risorsa Appwrite non trovata (404): verifica Database ID e Table/Collection ID.`;
    }
    if (err.code === 400) {
      return `${prefix}Struttura colonne/attributi non valida (400): ${err.message}. Controlla nomi (camelCase) nella Guida PDF.`;
    }
    if (!err.code || err.code === 0) {
      return `${prefix}Blocco CORS o rete: aggiungi Platform -> Web -> Hostname "*" in Appwrite Console -> Overview.`;
    }
    return `${prefix}Appwrite (${err.code}): ${err.message}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror')) {
    return `${prefix}Connessione bloccata (CORS/Rete): verifica Endpoint (${activeConfig.endpoint}) e Web Platform "*" in Appwrite Console.`;
  }
  return `${prefix}${msg}`;
}

let awClient: Client | null = null;
let awDatabases: Databases | null = null;
let awAccount: Account | null = null;
let activeConfig: AppwriteConfig = loadStoredAppwriteConfig();
let awConnected = false;
let awLastError: string | null = null;

function buildAppwriteSdk(cfg: AppwriteConfig): { client: Client; databases: Databases; account: Account } {
  const client = new Client().setEndpoint(cfg.endpoint).setProject(cfg.projectId);
  return {
    client,
    databases: new Databases(client),
    account: new Account(client),
  };
}

export function getAppwriteStatus(): AppwriteStatusSnapshot {
  return {
    configured: isAppwriteConfigured(activeConfig),
    connected: awConnected && awDatabases !== null,
    lastError: awLastError,
    config: { ...activeConfig },
  };
}

export function isAppwriteConnected(): boolean {
  return awConnected && awDatabases !== null && isAppwriteConfigured(activeConfig);
}

export async function initAppwriteDb(overrideConfig?: Partial<AppwriteConfig>): Promise<AppwriteStatusSnapshot> {
  if (overrideConfig) {
    activeConfig = saveStoredAppwriteConfig(overrideConfig);
  } else {
    activeConfig = loadStoredAppwriteConfig();
  }

  if (!isAppwriteConfigured(activeConfig)) {
    awClient = null;
    awDatabases = null;
    awAccount = null;
    awConnected = false;
    awLastError = null;
    return getAppwriteStatus();
  }

  try {
    const sdk = buildAppwriteSdk(activeConfig);
    awClient = sdk.client;
    awDatabases = sdk.databases;
    awAccount = sdk.account;

    if (activeConfig.useAnonymousSession) {
      try {
        await awAccount.get();
      } catch {
        try {
          await awAccount.createAnonymousSession();
        } catch (sessionErr) {
          console.warn('[Appwrite] Anonymous session creation skipped/failed:', sessionErr);
        }
      }
    }

    // Probe connection by checking bank, history, and config collections so any missing resource is reported clearly
    try {
      await awDatabases.getDocument(
        activeConfig.databaseId,
        activeConfig.bankCollectionId,
        APPWRITE_BANK_DOC_ID
      );
    } catch (probeErr: any) {
      if (probeErr instanceof AppwriteException && probeErr.code === 404) {
        const msg = (probeErr.message || '').toLowerCase();
        const errType = ((probeErr as any).type || '').toLowerCase();
        if (msg.includes('database') || errType.includes('database') || msg.includes('collection') || msg.includes('table')) {
          awConnected = false;
          awLastError = formatAppwriteError(probeErr, activeConfig.bankCollectionId);
          return getAppwriteStatus();
        }
        // Document 'main' does not exist yet -> create initial bank document cleanly
        try {
          await awDatabases.createDocument(
            activeConfig.databaseId,
            activeConfig.bankCollectionId,
            APPWRITE_BANK_DOC_ID,
            buildEmptyJackpotBank()
          );
        } catch (createErr) {
          awConnected = false;
          awLastError = formatAppwriteError(createErr, activeConfig.bankCollectionId);
          return getAppwriteStatus();
        }
      } else {
        awConnected = false;
        awLastError = formatAppwriteError(probeErr, activeConfig.bankCollectionId);
        return getAppwriteStatus();
      }
    }

    // Verify optional history & regia_config collections if configured
    if (activeConfig.historyCollectionId) {
      try {
        await awDatabases.listDocuments(activeConfig.databaseId, activeConfig.historyCollectionId, [Query.limit(1)]);
      } catch (histErr) {
        awConnected = false;
        awLastError = formatAppwriteError(histErr, activeConfig.historyCollectionId);
        return getAppwriteStatus();
      }
    }

    if (activeConfig.configCollectionId) {
      try {
        await awDatabases.getDocument(activeConfig.databaseId, activeConfig.configCollectionId, APPWRITE_CONFIG_DOC_ID);
      } catch (cfgErr: any) {
        const cfgMsg = (cfgErr?.message || '').toLowerCase();
        const cfgType = (cfgErr?.type || '').toLowerCase();
        const isOnlyMissingDoc =
          cfgErr instanceof AppwriteException &&
          cfgErr.code === 404 &&
          !cfgMsg.includes('database') &&
          !cfgMsg.includes('collection') &&
          !cfgMsg.includes('table') &&
          !cfgType.includes('database') &&
          !cfgType.includes('collection');
        if (!isOnlyMissingDoc) {
          awConnected = false;
          awLastError = formatAppwriteError(cfgErr, activeConfig.configCollectionId);
          return getAppwriteStatus();
        }
      }
    }

    awConnected = true;
    awLastError = null;
  } catch (err) {
    awConnected = false;
    awLastError = formatAppwriteError(err);
  }

  return getAppwriteStatus();
}

async function upsertBankDocument(bank: JackpotBankData): Promise<JackpotBankData> {
  if (!awDatabases || !isAppwriteConfigured(activeConfig)) {
    throw new Error('Appwrite non configurato');
  }
  const clean = sanitizeJackpotBankData(bank);
  const payload = {
    accumulatedUnclaimed: clean.accumulatedUnclaimed,
    currentGameUnclaimed: clean.currentGameUnclaimed,
    currency: clean.currency,
    lastUpdated: clean.lastUpdated,
    totalGamesRecorded: clean.totalGamesRecorded,
  };

  try {
    await awDatabases.updateDocument(
      activeConfig.databaseId,
      activeConfig.bankCollectionId,
      APPWRITE_BANK_DOC_ID,
      payload
    );
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      await awDatabases.createDocument(
        activeConfig.databaseId,
        activeConfig.bankCollectionId,
        APPWRITE_BANK_DOC_ID,
        payload
      );
    } else {
      throw err;
    }
  }
  awConnected = true;
  awLastError = null;
  return clean;
}

export async function getAppwriteJackpotBank(): Promise<{ bank: JackpotBankData; ok: boolean; error?: string }> {
  if (!isAppwriteConfigured(activeConfig)) {
    return { bank: buildEmptyJackpotBank(), ok: false, error: 'Appwrite non configurato' };
  }
  if (!awDatabases) {
    await initAppwriteDb();
  }
  if (!awDatabases) {
    return { bank: buildEmptyJackpotBank(), ok: false, error: awLastError || 'Appwrite offline' };
  }

  try {
    const docData = await awDatabases.getDocument(
      activeConfig.databaseId,
      activeConfig.bankCollectionId,
      APPWRITE_BANK_DOC_ID
    );
    awConnected = true;
    awLastError = null;
    return { bank: mapAppwriteDocToJackpotBank(docData), ok: true };
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      const msg = (err.message || '').toLowerCase();
      if (!msg.includes('database') && !msg.includes('collection')) {
        try {
          const initial = await upsertBankDocument(buildEmptyJackpotBank());
          return { bank: initial, ok: true };
        } catch (createErr) {
          awConnected = false;
          awLastError = formatAppwriteError(createErr);
          return { bank: buildEmptyJackpotBank(), ok: false, error: awLastError };
        }
      }
    }
    awConnected = false;
    awLastError = formatAppwriteError(err);
    return { bank: buildEmptyJackpotBank(), ok: false, error: awLastError };
  }
}

export async function syncAppwriteJackpotSnapshot(bank: JackpotBankData): Promise<{ ok: boolean; error?: string }> {
  if (!isAppwriteConfigured(activeConfig)) return { ok: false, error: 'Appwrite non configurato' };
  if (!awDatabases) await initAppwriteDb();
  if (!awDatabases) return { ok: false, error: awLastError || 'Appwrite offline' };

  try {
    await upsertBankDocument(bank);
    return { ok: true };
  } catch (err) {
    awConnected = false;
    awLastError = formatAppwriteError(err);
    return { ok: false, error: awLastError };
  }
}

async function appendAppwriteHistory(entry: Omit<UnclaimedHistoryEntry, 'id'>): Promise<void> {
  if (!awDatabases || !activeConfig.historyCollectionId) return;
  try {
    await awDatabases.createDocument(
      activeConfig.databaseId,
      activeConfig.historyCollectionId,
      ID.unique(),
      {
        timestamp: entry.timestamp,
        gameId: entry.gameId.slice(0, 64),
        type: entry.type,
        amount: Number(entry.amount) || 0,
        balanceAfter: Number(entry.balanceAfter) || 0,
        prizeCategory: (entry.prizeCategory || 'all').slice(0, 64),
        note: (entry.note || '').slice(0, 250),
      }
    );
  } catch (err) {
    console.warn('[Appwrite] Failed to write history ledger entry:', formatAppwriteError(err));
  }
}

export async function saveCurrentGameUnclaimedToAppwrite(
  currentGameUnclaimed: number,
  currency: string = '€'
): Promise<{ success: boolean; bank?: JackpotBankData; error?: string }> {
  if (!isAppwriteConfigured(activeConfig)) return { success: false, error: 'Appwrite non configurato' };
  const currentRes = await getAppwriteJackpotBank();
  if (!currentRes.ok) return { success: false, error: currentRes.error };

  try {
    const safeCurrent =
      Number.isFinite(currentGameUnclaimed) && currentGameUnclaimed >= 0
        ? Math.round(currentGameUnclaimed * 100) / 100
        : 0;
    const saved = await upsertBankDocument({
      ...currentRes.bank,
      currentGameUnclaimed: safeCurrent,
      currency: currency || currentRes.bank.currency,
      lastUpdated: new Date().toISOString(),
    });
    return { success: true, bank: saved };
  } catch (err) {
    awConnected = false;
    awLastError = formatAppwriteError(err);
    return { success: false, error: awLastError };
  }
}

export async function depositUnclaimedToAppwrite(
  amount: number,
  currency: string = '€',
  prizeCategory: string = 'all',
  gameId: string = 'TOM001',
  note: string = 'Deposito montepremi non vinti'
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (!isAppwriteConfigured(activeConfig)) return { success: false, newBalance: 0, error: 'Appwrite non configurato' };
  const currentRes = await getAppwriteJackpotBank();
  if (!currentRes.ok) return { success: false, newBalance: 0, error: currentRes.error };

  if (amount <= 0) {
    return { success: true, newBalance: currentRes.bank.accumulatedUnclaimed };
  }

  try {
    const newBalance = Math.round((currentRes.bank.accumulatedUnclaimed + amount) * 100) / 100;
    const timestamp = new Date().toISOString();
    await upsertBankDocument({
      accumulatedUnclaimed: newBalance,
      currentGameUnclaimed: 0,
      currency: currency || currentRes.bank.currency,
      lastUpdated: timestamp,
      totalGamesRecorded: currentRes.bank.totalGamesRecorded + 1,
    });
    await appendAppwriteHistory({
      timestamp,
      gameId,
      type: 'deposit_expired',
      amount,
      balanceAfter: newBalance,
      prizeCategory,
      note,
    });
    return { success: true, newBalance };
  } catch (err) {
    awConnected = false;
    awLastError = formatAppwriteError(err);
    return { success: false, newBalance: 0, error: awLastError };
  }
}

export async function recallUnclaimedFromAppwrite(
  amountToRecall: number | null,
  gameId: string = 'TOM001',
  note: string = 'Richiamo montepremi in partita successiva'
): Promise<{ success: boolean; recalledAmount: number; remainingBalance: number; error?: string }> {
  if (!isAppwriteConfigured(activeConfig)) {
    return { success: false, recalledAmount: 0, remainingBalance: 0, error: 'Appwrite non configurato' };
  }
  const currentRes = await getAppwriteJackpotBank();
  if (!currentRes.ok) {
    return { success: false, recalledAmount: 0, remainingBalance: 0, error: currentRes.error };
  }

  if (currentRes.bank.accumulatedUnclaimed <= 0) {
    return {
      success: false,
      recalledAmount: 0,
      remainingBalance: 0,
      error: 'Nessun montepremi salvato in Cassa Appwrite da richiamare.',
    };
  }

  try {
    const actualRecall =
      amountToRecall !== null && amountToRecall > 0 && amountToRecall <= currentRes.bank.accumulatedUnclaimed
        ? amountToRecall
        : currentRes.bank.accumulatedUnclaimed;
    const remainingBalance = Math.round((currentRes.bank.accumulatedUnclaimed - actualRecall) * 100) / 100;
    const timestamp = new Date().toISOString();

    await upsertBankDocument({
      accumulatedUnclaimed: remainingBalance,
      currentGameUnclaimed: currentRes.bank.currentGameUnclaimed,
      currency: currentRes.bank.currency,
      lastUpdated: timestamp,
      totalGamesRecorded: currentRes.bank.totalGamesRecorded,
    });

    await appendAppwriteHistory({
      timestamp,
      gameId,
      type: 'recalled_into_game',
      amount: actualRecall,
      balanceAfter: remainingBalance,
      prizeCategory: 'rollover_recall',
      note: `${note} (${currentRes.bank.currency} ${actualRecall.toFixed(2)})`,
    });

    return { success: true, recalledAmount: actualRecall, remainingBalance };
  } catch (err) {
    awConnected = false;
    awLastError = formatAppwriteError(err);
    return { success: false, recalledAmount: 0, remainingBalance: 0, error: awLastError };
  }
}

export async function resetAppwriteBank(
  gameId: string = 'TOM001',
  note: string = 'Azzeramento manuale cassa da Regia'
): Promise<{ success: boolean; error?: string }> {
  if (!isAppwriteConfigured(activeConfig)) return { success: false, error: 'Appwrite non configurato' };
  const currentRes = await getAppwriteJackpotBank();
  if (!currentRes.ok) return { success: false, error: currentRes.error };

  try {
    const timestamp = new Date().toISOString();
    await upsertBankDocument({
      accumulatedUnclaimed: 0,
      currentGameUnclaimed: currentRes.bank.currentGameUnclaimed,
      currency: currentRes.bank.currency,
      lastUpdated: timestamp,
      totalGamesRecorded: currentRes.bank.totalGamesRecorded,
    });
    await appendAppwriteHistory({
      timestamp,
      gameId,
      type: 'reset',
      amount: currentRes.bank.accumulatedUnclaimed,
      balanceAfter: 0,
      prizeCategory: 'manual_reset',
      note: `${note} (Precedente saldo: ${currentRes.bank.currency} ${currentRes.bank.accumulatedUnclaimed.toFixed(2)})`,
    });
    return { success: true };
  } catch (err) {
    awConnected = false;
    awLastError = formatAppwriteError(err);
    return { success: false, error: awLastError };
  }
}

export async function getAppwriteUnclaimedHistory(limitCount: number = 8): Promise<UnclaimedHistoryEntry[]> {
  if (!isAppwriteConfigured(activeConfig) || !activeConfig.historyCollectionId) return [];
  if (!awDatabases) await initAppwriteDb();
  if (!awDatabases) return [];

  try {
    const res = await awDatabases.listDocuments(activeConfig.databaseId, activeConfig.historyCollectionId, [
      Query.orderDesc('$createdAt'),
      Query.limit(limitCount),
    ]);
    return (res.documents || []).map((d) => mapAppwriteDocToHistoryEntry(d));
  } catch (err) {
    console.warn('[Appwrite] Failed to read unclaimed history:', formatAppwriteError(err, activeConfig.historyCollectionId));
    return [];
  }
}

export async function getAppwriteRegiaGameConfig(): Promise<RegiaGameConfigDoc | null> {
  if (!isAppwriteConfigured(activeConfig) || !activeConfig.configCollectionId) return null;
  if (!awDatabases) await initAppwriteDb();
  if (!awDatabases) return null;

  try {
    const docData = await awDatabases.getDocument(
      activeConfig.databaseId,
      activeConfig.configCollectionId,
      APPWRITE_CONFIG_DOC_ID
    );
    if (typeof (docData as any).payloadJson === 'string') {
      return sanitizeRegiaGameConfig(JSON.parse((docData as any).payloadJson));
    }
    return sanitizeRegiaGameConfig(docData as any);
  } catch {
    return null;
  }
}

export async function saveAppwriteRegiaGameConfig(
  cfg: RegiaGameConfigDoc
): Promise<{ savedToAppwrite: boolean; error?: string }> {
  if (!isAppwriteConfigured(activeConfig) || !activeConfig.configCollectionId) {
    return { savedToAppwrite: false, error: 'Appwrite non configurato' };
  }
  if (!awDatabases) await initAppwriteDb();
  if (!awDatabases) return { savedToAppwrite: false, error: awLastError || 'Appwrite offline' };

  const clean = sanitizeRegiaGameConfig(cfg);
  const payload = {
    activeProfileId: clean.activeProfileId,
    payloadJson: JSON.stringify(clean),
    updatedAt: clean.updatedAt,
  };

  try {
    await awDatabases.updateDocument(
      activeConfig.databaseId,
      activeConfig.configCollectionId,
      APPWRITE_CONFIG_DOC_ID,
      payload
    );
    return { savedToAppwrite: true };
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      try {
        await awDatabases.createDocument(
          activeConfig.databaseId,
          activeConfig.configCollectionId,
          APPWRITE_CONFIG_DOC_ID,
          payload
        );
        return { savedToAppwrite: true };
      } catch (createErr) {
        return { savedToAppwrite: false, error: formatAppwriteError(createErr) };
      }
    }
    return { savedToAppwrite: false, error: formatAppwriteError(err) };
  }
}
