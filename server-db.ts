import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEmptyJackpotBank,
  sanitizeJackpotBankData,
  sanitizeRegiaGameConfig,
  type JackpotBankData,
  type RegiaGameConfigDoc,
  type UnclaimedHistoryEntry,
} from './src/firebase-jackpot-service';
import {
  sanitizeActiveSheetsList,
  sanitizeTavoloGameId,
  sanitizeTavoloSetRecord,
  type TavoloSetMeta,
  type TavoloSetRecord,
} from './src/tavolo-cards-service';

interface PersistedServerDbPayload {
  bank: JackpotBankData;
  history: UnclaimedHistoryEntry[];
  regiaConfig: RegiaGameConfigDoc | null;
  tavoloSets: Record<string, TavoloSetRecord>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_FILE = path.resolve(__dirname, '.data', 'tombola-db.json');

export class ServerPersistentDb {
  private readonly filePath: string;
  private state: PersistedServerDbPayload;

  constructor(filePath: string = DEFAULT_DB_FILE) {
    this.filePath = filePath;
    this.state = this.loadFromDisk();
  }

  private createDefaultPayload(): PersistedServerDbPayload {
    return {
      bank: buildEmptyJackpotBank('€'),
      history: [],
      regiaConfig: null,
      tavoloSets: {},
    };
  }

  private loadFromDisk(): PersistedServerDbPayload {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedServerDbPayload>;
        const rawSets = parsed.tavoloSets && typeof parsed.tavoloSets === 'object' ? parsed.tavoloSets : {};
        const cleanSets: Record<string, TavoloSetRecord> = {};
        for (const [k, val] of Object.entries(rawSets)) {
          const clean = sanitizeTavoloSetRecord(val);
          if (clean) {
            cleanSets[clean.id || k] = clean;
          }
        }
        return {
          bank: sanitizeJackpotBankData(parsed.bank),
          history: Array.isArray(parsed.history) ? parsed.history.slice(0, 100) : [],
          regiaConfig: parsed.regiaConfig ? sanitizeRegiaGameConfig(parsed.regiaConfig) : null,
          tavoloSets: cleanSets,
        };
      }
    } catch (err) {
      console.warn('[ServerDB] Impossibile leggere file DB su disco, inizializzo stato pulito:', err);
    }
    const fresh = this.createDefaultPayload();
    this.writeToDisk(fresh);
    return fresh;
  }

  private writeToDisk(payload: PersistedServerDbPayload): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  public getBank(): JackpotBankData {
    return sanitizeJackpotBankData(this.state.bank);
  }

  public getHistory(limitCount: number = 8): UnclaimedHistoryEntry[] {
    const safeLimit = Math.max(1, Math.min(50, Math.round(Number(limitCount) || 8)));
    return this.state.history.slice(0, safeLimit);
  }

  public getStatus(): { ok: boolean; engine: string; updatedAt: string; historyCount: number } {
    return {
      ok: true,
      engine: 'ServerDB-PersistentJSON',
      updatedAt: this.state.bank.lastUpdated,
      historyCount: this.state.history.length,
    };
  }

  public syncBankSnapshot(incoming: Partial<JackpotBankData>): JackpotBankData {
    const cleanIncoming = sanitizeJackpotBankData(incoming);
    const currentMs = Date.parse(this.state.bank.lastUpdated || '') || 0;
    const incomingMs = Date.parse(cleanIncoming.lastUpdated || '') || 0;
    if (incomingMs >= currentMs) {
      this.state.bank = cleanIncoming;
      this.writeToDisk(this.state);
    }
    return this.getBank();
  }

  public saveCurrentGameUnclaimed(currentGameUnclaimed: number, currency: string = '€'): JackpotBankData {
    const safeCurrent =
      Number.isFinite(currentGameUnclaimed) && currentGameUnclaimed >= 0
        ? Math.round(currentGameUnclaimed * 100) / 100
        : 0;
    this.state.bank = sanitizeJackpotBankData({
      ...this.state.bank,
      currentGameUnclaimed: safeCurrent,
      currency: currency || this.state.bank.currency,
      lastUpdated: new Date().toISOString(),
    });
    this.writeToDisk(this.state);
    return this.getBank();
  }

  public depositUnclaimed(
    amount: number,
    currency: string = '€',
    prizeCategory: string = 'all',
    gameId: string = 'TOM001',
    note: string = 'Deposito montepremi non vinti'
  ): { success: boolean; newBalance: number; bank: JackpotBankData } {
    const safeAmount = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
    if (safeAmount <= 0) {
      return { success: true, newBalance: this.state.bank.accumulatedUnclaimed, bank: this.getBank() };
    }

    const newBalance = Math.round((this.state.bank.accumulatedUnclaimed + safeAmount) * 100) / 100;
    const timestamp = new Date().toISOString();
    this.state.bank = sanitizeJackpotBankData({
      accumulatedUnclaimed: newBalance,
      currentGameUnclaimed: 0,
      currency: currency || this.state.bank.currency,
      lastUpdated: timestamp,
      totalGamesRecorded: this.state.bank.totalGamesRecorded + 1,
    });

    const entry: UnclaimedHistoryEntry = {
      id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      gameId: String(gameId || 'TOM001').slice(0, 64),
      type: 'deposit_expired',
      amount: safeAmount,
      balanceAfter: newBalance,
      prizeCategory: String(prizeCategory || 'all').slice(0, 64),
      note: String(note || '').slice(0, 250),
    };
    this.state.history = [entry, ...this.state.history].slice(0, 100);
    this.writeToDisk(this.state);

    return { success: true, newBalance, bank: this.getBank() };
  }

  public recallUnclaimed(
    amountToRecall: number | null,
    gameId: string = 'TOM001',
    note: string = 'Richiamo montepremi in partita successiva'
  ): { success: boolean; recalledAmount: number; remainingBalance: number; bank: JackpotBankData; error?: string } {
    const available = this.state.bank.accumulatedUnclaimed;
    if (available <= 0) {
      return {
        success: false,
        recalledAmount: 0,
        remainingBalance: 0,
        bank: this.getBank(),
        error: 'Nessun montepremi salvato nel Server DB da richiamare.',
      };
    }

    const actualRecall =
      amountToRecall !== null && amountToRecall > 0 && amountToRecall <= available
        ? Math.round(amountToRecall * 100) / 100
        : available;
    const remainingBalance = Math.round((available - actualRecall) * 100) / 100;
    const timestamp = new Date().toISOString();

    this.state.bank = sanitizeJackpotBankData({
      ...this.state.bank,
      accumulatedUnclaimed: remainingBalance,
      lastUpdated: timestamp,
    });

    const entry: UnclaimedHistoryEntry = {
      id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      gameId: String(gameId || 'TOM001').slice(0, 64),
      type: 'recalled_into_game',
      amount: actualRecall,
      balanceAfter: remainingBalance,
      prizeCategory: 'rollover_recall',
      note: `${String(note || '').slice(0, 180)} (${this.state.bank.currency} ${actualRecall.toFixed(2)})`,
    };
    this.state.history = [entry, ...this.state.history].slice(0, 100);
    this.writeToDisk(this.state);

    return {
      success: true,
      recalledAmount: actualRecall,
      remainingBalance,
      bank: this.getBank(),
    };
  }

  public resetBank(
    gameId: string = 'TOM001',
    note: string = 'Azzeramento manuale cassa da Regia'
  ): { success: boolean; bank: JackpotBankData } {
    const prevBalance = this.state.bank.accumulatedUnclaimed;
    const timestamp = new Date().toISOString();
    this.state.bank = sanitizeJackpotBankData({
      ...this.state.bank,
      accumulatedUnclaimed: 0,
      lastUpdated: timestamp,
    });
    const entry: UnclaimedHistoryEntry = {
      id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      gameId: String(gameId || 'TOM001').slice(0, 64),
      type: 'reset',
      amount: prevBalance,
      balanceAfter: 0,
      prizeCategory: 'manual_reset',
      note: `${String(note || '').slice(0, 160)} (Precedente saldo: ${this.state.bank.currency} ${prevBalance.toFixed(2)})`,
    };
    this.state.history = [entry, ...this.state.history].slice(0, 100);
    this.writeToDisk(this.state);

    return { success: true, bank: this.getBank() };
  }

  public getRegiaConfig(): RegiaGameConfigDoc | null {
    return this.state.regiaConfig ? sanitizeRegiaGameConfig(this.state.regiaConfig) : null;
  }

  public saveRegiaConfig(cfg: Partial<RegiaGameConfigDoc>): RegiaGameConfigDoc {
    const clean = sanitizeRegiaGameConfig({
      ...cfg,
      id: 'main',
      updatedAt: new Date().toISOString(),
    });
    this.state.regiaConfig = clean;
    this.writeToDisk(this.state);
    return clean;
  }

  public listTavoloSets(): TavoloSetMeta[] {
    const sets = this.state.tavoloSets || {};
    return Object.values(sets)
      .map((s) => ({
        id: s.id,
        gameId: s.gameId,
        name: s.name,
        totalSheets: s.totalSheets,
        activeSheets: s.activeSheets,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  public getTavoloSet(rawSetId: string): TavoloSetRecord | null {
    const setId = sanitizeTavoloGameId(rawSetId);
    const existing = this.state.tavoloSets?.[setId];
    return existing ? sanitizeTavoloSetRecord(existing) : null;
  }

  public saveTavoloSet(rawSet: Partial<TavoloSetRecord>): TavoloSetRecord | null {
    const clean = sanitizeTavoloSetRecord(rawSet);
    if (!clean) return null;
    if (!this.state.tavoloSets) {
      this.state.tavoloSets = {};
    }
    if (!rawSet.updatedAt) {
      clean.updatedAt = new Date().toISOString();
    }
    this.state.tavoloSets[clean.id] = clean;
    this.writeToDisk(this.state);
    return clean;
  }

  public updateTavoloActiveSheets(
    rawSetId: string,
    rawActiveSheets: number[],
    updatedAt?: string
  ): { success: boolean; activeSheets: number[] } {
    const setId = sanitizeTavoloGameId(rawSetId);
    const existing = this.state.tavoloSets?.[setId];
    if (!existing) {
      return { success: false, activeSheets: sanitizeActiveSheetsList(rawActiveSheets) };
    }
    const cleanList = sanitizeActiveSheetsList(rawActiveSheets, existing.totalSheets);
    existing.activeSheets = cleanList;
    existing.updatedAt =
      typeof updatedAt === 'string' && updatedAt.length >= 10 && updatedAt.length <= 40
        ? updatedAt
        : new Date().toISOString();
    this.writeToDisk(this.state);
    return { success: true, activeSheets: cleanList };
  }
}
