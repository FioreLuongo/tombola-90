import {
  buildEmptyJackpotBank,
  sanitizeJackpotBankData,
  sanitizeRegiaGameConfig,
  type JackpotBankData,
  type RegiaGameConfigDoc,
  type UnclaimedHistoryEntry,
} from './firebase-jackpot-service';

let serverDbConnected = false;
let staticOnlyHostDetected = false;

async function fetchJsonSafe<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data: T | null }> {
  if (typeof fetch === 'undefined' || typeof window === 'undefined' || staticOnlyHostDetected) {
    return { ok: false, data: null };
  }
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers || {}),
      },
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (res.status === 404 || contentType.includes('text/html')) {
        staticOnlyHostDetected = true;
      }
      serverDbConnected = false;
      return { ok: false, data: null };
    }
    const data = (await res.json()) as T;
    serverDbConnected = true;
    return { ok: true, data };
  } catch {
    serverDbConnected = false;
    return { ok: false, data: null };
  }
}

export function isServerDbConnected(): boolean {
  return serverDbConnected && !staticOnlyHostDetected;
}

export async function initServerDb(): Promise<boolean> {
  staticOnlyHostDetected = false;
  const res = await fetchJsonSafe<{ ok?: boolean }>('/api/db/status');
  serverDbConnected = Boolean(res.ok && res.data?.ok);
  return serverDbConnected;
}

export async function getServerDbJackpotAndHistory(limitCount: number = 8): Promise<{
  ok: boolean;
  bank: JackpotBankData;
  history: UnclaimedHistoryEntry[];
}> {
  const res = await fetchJsonSafe<{
    ok?: boolean;
    bank?: Partial<JackpotBankData>;
    history?: UnclaimedHistoryEntry[];
  }>(`/api/db/bank?limit=${encodeURIComponent(String(limitCount))}`);

  if (!res.ok || !res.data?.ok) {
    return { ok: false, bank: buildEmptyJackpotBank(), history: [] };
  }
  return {
    ok: true,
    bank: sanitizeJackpotBankData(res.data.bank),
    history: Array.isArray(res.data.history) ? res.data.history : [],
  };
}

export async function syncServerDbSnapshot(bank: JackpotBankData): Promise<{ ok: boolean }> {
  const res = await fetchJsonSafe<{ ok?: boolean }>('/api/db/bank/sync', {
    method: 'POST',
    body: JSON.stringify(bank),
  });
  return { ok: Boolean(res.ok && res.data?.ok) };
}

export async function saveCurrentGameUnclaimedToServerDb(
  currentGameUnclaimed: number,
  currency: string = '€'
): Promise<{ success: boolean; bank?: JackpotBankData }> {
  const res = await fetchJsonSafe<{ ok?: boolean; bank?: JackpotBankData }>('/api/db/current-unclaimed', {
    method: 'PUT',
    body: JSON.stringify({ currentGameUnclaimed, currency }),
  });
  if (!res.ok || !res.data?.ok) return { success: false };
  return { success: true, bank: sanitizeJackpotBankData(res.data.bank) };
}

export async function depositUnclaimedToServerDb(
  amount: number,
  currency: string = '€',
  prizeCategory: string = 'all',
  gameId: string = 'TOM001',
  note: string = 'Deposito montepremi non vinti'
): Promise<{ success: boolean; newBalance: number }> {
  const res = await fetchJsonSafe<{ success?: boolean; newBalance?: number }>('/api/db/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount, currency, prizeCategory, gameId, note }),
  });
  if (!res.ok || !res.data?.success) return { success: false, newBalance: 0 };
  return { success: true, newBalance: Number(res.data.newBalance) || 0 };
}

export async function recallUnclaimedFromServerDb(
  amountToRecall: number | null,
  gameId: string = 'TOM001',
  note: string = 'Richiamo montepremi in partita successiva'
): Promise<{ success: boolean; recalledAmount: number; remainingBalance: number; error?: string }> {
  const res = await fetchJsonSafe<{
    success?: boolean;
    recalledAmount?: number;
    remainingBalance?: number;
    error?: string;
  }>('/api/db/recall', {
    method: 'POST',
    body: JSON.stringify({ amountToRecall, gameId, note }),
  });
  if (!res.ok || !res.data?.success) {
    return {
      success: false,
      recalledAmount: 0,
      remainingBalance: 0,
      error: res.data?.error || 'Server DB offline',
    };
  }
  return {
    success: true,
    recalledAmount: Number(res.data.recalledAmount) || 0,
    remainingBalance: Number(res.data.remainingBalance) || 0,
  };
}

export async function resetServerDbBank(
  gameId: string = 'TOM001',
  note: string = 'Azzeramento manuale cassa da Regia'
): Promise<{ success: boolean }> {
  const res = await fetchJsonSafe<{ success?: boolean }>('/api/db/reset', {
    method: 'POST',
    body: JSON.stringify({ gameId, note }),
  });
  return { success: Boolean(res.ok && res.data?.success) };
}

export async function getServerDbRegiaConfig(): Promise<RegiaGameConfigDoc | null> {
  const res = await fetchJsonSafe<{ ok?: boolean; config?: RegiaGameConfigDoc | null }>('/api/db/regia-config');
  if (!res.ok || !res.data?.ok || !res.data.config) return null;
  return sanitizeRegiaGameConfig(res.data.config);
}

export async function saveServerDbRegiaConfig(cfg: Partial<RegiaGameConfigDoc>): Promise<boolean> {
  const res = await fetchJsonSafe<{ ok?: boolean }>('/api/db/regia-config', {
    method: 'PUT',
    body: JSON.stringify(cfg),
  });
  return Boolean(res.ok && res.data?.ok);
}
