import {
  buildRegiaGameConfigSignature,
  DEFAULT_REGIA_PROFILES,
  deleteRegiaProfile,
  getActiveRegiaProfileId,
  getJackpotBank,
  getRegiaGameConfig,
  getRegiaProfiles,
  getUnclaimedHistory,
  initFirebaseJackpot,
  recallUnclaimedIntoGame,
  resetJackpotBank,
  sanitizeProfileId,
  sanitizeRegiaGameConfig,
  saveRegiaGameConfig,
  saveRegiaProfile,
  saveUnclaimedToDatabase,
  setActiveRegiaProfileId,
  subscribeToActiveRegiaProfile,
  subscribeToJackpotBank,
  subscribeToRegiaGameConfig,
  subscribeToRegiaProfiles,
  type DifficultyLevel,
  type JackpotBankData,
  type RegiaGameConfigDoc,
  type RegiaProfileData,
  type UnclaimedHistoryEntry,
} from './firebase-jackpot-service';
import type { ConnectionStatus } from './realtime-sync';

export type RegiaLogLevel = 'info' | 'win' | 'error' | 'warn' | 'success';
export type PrizeDelayKey = 'gold' | 'ambo' | 'terno' | 'quaterna' | 'cinquina' | 'tombola';
export type ColorKey = 'blue' | 'orange' | 'green' | 'yellow';

export interface ForcedMinThresholds {
  ambo: number;
  terno: number;
  quaterna: number;
  cinquina: number;
  tombola: number;
}

export interface DelayThresholdState {
  max: number;
  expired: boolean;
}

export type PrizeDelaysMap = Record<PrizeDelayKey, DelayThresholdState>;

export interface RegiaLogEntry {
  id: number;
  time: string;
  text: string;
  level: RegiaLogLevel;
}

export interface RegiaWinEntry {
  type: string;
  cartellaId: string;
  winCount?: number;
}

export interface RegiaStateSnapshot {
  extraction: {
    currentNumber: number | null;
    extractedNumbers: number[];
    remainingCount: number;
    smorfiaText: string;
    isRunning: boolean;
    timerSeconds: number;
    remainingSeconds: number;
    winHandlingMode: string;
    voiceEnabled: boolean;
    aiEnabled: boolean;
  };
  prizes: {
    prizePool: number;
    currency: string;
    unclaimedCurrentGame: number;
    breakdown: Record<PrizeDelayKey, number>;
  };
  cloudBank: {
    connected: boolean;
    statusLabel: string;
    balance: number;
    currency: string;
    lastUpdated: string;
    history: UnclaimedHistoryEntry[];
    isSyncing: boolean;
  };
  colors: Record<ColorKey, { count: number; active: boolean }> & {
    totalActiveColors: number;
  };
  engine: {
    enabled: boolean;
    level: DifficultyLevel;
    forcedMin: ForcedMinThresholds;
    delays: PrizeDelaysMap;
    activeProfileId: string;
    profileNameInput: string;
    profiles: RegiaProfileData[];
    profilesFromCloud: boolean;
    isSavingProfile: boolean;
    monitoredCardsCount: number;
    blockedNumbersCount: number;
    difficultyIndex: number;
  };
  graphics: {
    enabled: boolean;
    src: string;
    preset: string;
    position: string;
    scale: number;
    opacity: number;
    borderStyle: string;
  };
  wins: {
    entries: RegiaWinEntry[];
    totalWins: number;
  };
  connection: {
    status: ConnectionStatus;
    clientCount: number;
    latencyMs: number;
    wsUrl: string | null;
    fallbackActive: boolean;
    staticHostMode: boolean;
  };
  logs: RegiaLogEntry[];
}

export type RegiaCardSection =
  | 'extraction'
  | 'prizes'
  | 'cloudBank'
  | 'colors'
  | 'engine'
  | 'graphics'
  | 'wins'
  | 'connection'
  | 'logs';

export type RegiaStateListener = (state: RegiaStateSnapshot, changedSection?: RegiaCardSection) => void;
export type EngineConfigSyncListener = (engine: RegiaStateSnapshot['engine']) => void;
export type PrizesConfigSyncListener = (prizes: RegiaStateSnapshot['prizes']) => void;

const PRIZE_PERCENTAGES: Record<PrizeDelayKey, number> = {
  gold: 0.05,
  ambo: 0.05,
  terno: 0.1,
  quaterna: 0.15,
  cinquina: 0.2,
  tombola: 0.45,
};

const MAX_LOG_ENTRIES = 150;

export function computePrizeBreakdown(prizePool: number): Record<PrizeDelayKey, number> {
  const safePool = Number.isFinite(prizePool) && prizePool > 0 ? prizePool : 0;
  return {
    gold: Math.round(safePool * PRIZE_PERCENTAGES.gold * 100) / 100,
    ambo: Math.round(safePool * PRIZE_PERCENTAGES.ambo * 100) / 100,
    terno: Math.round(safePool * PRIZE_PERCENTAGES.terno * 100) / 100,
    quaterna: Math.round(safePool * PRIZE_PERCENTAGES.quaterna * 100) / 100,
    cinquina: Math.round(safePool * PRIZE_PERCENTAGES.cinquina * 100) / 100,
    tombola: Math.round(safePool * PRIZE_PERCENTAGES.tombola * 100) / 100,
  };
}

export function computeEstimatedDifficultyIndex(
  enabled: boolean,
  level: DifficultyLevel,
  forcedMin: ForcedMinThresholds
): number {
  if (!enabled || level === 'random') return 0;
  const avgRatio =
    (forcedMin.ambo / 20 +
      forcedMin.terno / 35 +
      forcedMin.quaterna / 50 +
      forcedMin.cinquina / 65 +
      forcedMin.tombola / 85) /
    5;
  return Math.min(98, Math.max(25, Math.round(avgRatio * 88)));
}

export function profileToEngineState(
  profile: RegiaProfileData,
  currentDelays?: PrizeDelaysMap
): Pick<
  RegiaStateSnapshot['engine'],
  'enabled' | 'level' | 'forcedMin' | 'delays' | 'activeProfileId' | 'profileNameInput' | 'difficultyIndex'
> {
  const forcedMin: ForcedMinThresholds = {
    ambo: Number(profile.forcedMinAmbo) || 15,
    terno: Number(profile.forcedMinTerno) || 28,
    quaterna: Number(profile.forcedMinQuaterna) || 42,
    cinquina: Number(profile.forcedMinCinquina) || 58,
    tombola: Number(profile.forcedMinTombola) || 75,
  };
  const delays: PrizeDelaysMap = {
    gold: { max: Number(profile.delayMaxGold) || 25, expired: Boolean(currentDelays?.gold?.expired) },
    ambo: { max: Number(profile.delayMaxAmbo) || 20, expired: Boolean(currentDelays?.ambo?.expired) },
    terno: { max: Number(profile.delayMaxTerno) || 35, expired: Boolean(currentDelays?.terno?.expired) },
    quaterna: { max: Number(profile.delayMaxQuaterna) || 50, expired: Boolean(currentDelays?.quaterna?.expired) },
    cinquina: { max: Number(profile.delayMaxCinquina) || 65, expired: Boolean(currentDelays?.cinquina?.expired) },
    tombola: { max: Number(profile.delayMaxTombola) || 85, expired: Boolean(currentDelays?.tombola?.expired) },
  };
  const level = profile.difficultyLevel || 'custom';
  const enabled = Boolean(profile.enabled);

  return {
    enabled,
    level,
    forcedMin,
    delays,
    activeProfileId: profile.id,
    profileNameInput: profile.name || profile.id,
    difficultyIndex: computeEstimatedDifficultyIndex(enabled, level, forcedMin),
  };
}

export function buildProfilePayloadFromEngine(
  engine: RegiaStateSnapshot['engine'],
  targetId: string,
  name: string,
  isPreset: boolean
): Partial<RegiaProfileData> & { id: string } {
  return {
    id: targetId,
    name: name.trim(),
    isPreset,
    enabled: engine.enabled,
    difficultyLevel: engine.level,
    forcedMinAmbo: engine.forcedMin.ambo,
    forcedMinTerno: engine.forcedMin.terno,
    forcedMinQuaterna: engine.forcedMin.quaterna,
    forcedMinCinquina: engine.forcedMin.cinquina,
    forcedMinTombola: engine.forcedMin.tombola,
    delayMaxGold: engine.delays.gold.max,
    delayMaxAmbo: engine.delays.ambo.max,
    delayMaxTerno: engine.delays.terno.max,
    delayMaxQuaterna: engine.delays.quaterna.max,
    delayMaxCinquina: engine.delays.cinquina.max,
    delayMaxTombola: engine.delays.tombola.max,
  };
}

export function stateToUnifiedGameConfig(state: RegiaStateSnapshot): RegiaGameConfigDoc {
  return sanitizeRegiaGameConfig({
    id: 'main',
    activeProfileId: state.engine.activeProfileId,
    difficulty: {
      enabled: state.engine.enabled,
      level: state.engine.level,
      forcedMinAmbo: state.engine.forcedMin.ambo,
      forcedMinTerno: state.engine.forcedMin.terno,
      forcedMinQuaterna: state.engine.forcedMin.quaterna,
      forcedMinCinquina: state.engine.forcedMin.cinquina,
      forcedMinTombola: state.engine.forcedMin.tombola,
    },
    thresholds: {
      delayMaxGold: state.engine.delays.gold.max,
      delayMaxAmbo: state.engine.delays.ambo.max,
      delayMaxTerno: state.engine.delays.terno.max,
      delayMaxQuaterna: state.engine.delays.quaterna.max,
      delayMaxCinquina: state.engine.delays.cinquina.max,
      delayMaxTombola: state.engine.delays.tombola.max,
    },
    prizes: {
      prizePool: state.prizes.prizePool,
      currency: state.prizes.currency,
    },
  });
}

export function unifiedGameConfigToStatePatches(
  config: RegiaGameConfigDoc,
  currentDelays?: PrizeDelaysMap
): {
  enginePatch: Partial<RegiaStateSnapshot['engine']>;
  prizesPatch: Partial<Omit<RegiaStateSnapshot['prizes'], 'breakdown'>>;
} {
  const clean = sanitizeRegiaGameConfig(config);
  const forcedMin: ForcedMinThresholds = {
    ambo: clean.difficulty.forcedMinAmbo,
    terno: clean.difficulty.forcedMinTerno,
    quaterna: clean.difficulty.forcedMinQuaterna,
    cinquina: clean.difficulty.forcedMinCinquina,
    tombola: clean.difficulty.forcedMinTombola,
  };
  const delays: PrizeDelaysMap = {
    gold: { max: clean.thresholds.delayMaxGold, expired: Boolean(currentDelays?.gold?.expired) },
    ambo: { max: clean.thresholds.delayMaxAmbo, expired: Boolean(currentDelays?.ambo?.expired) },
    terno: { max: clean.thresholds.delayMaxTerno, expired: Boolean(currentDelays?.terno?.expired) },
    quaterna: { max: clean.thresholds.delayMaxQuaterna, expired: Boolean(currentDelays?.quaterna?.expired) },
    cinquina: { max: clean.thresholds.delayMaxCinquina, expired: Boolean(currentDelays?.cinquina?.expired) },
    tombola: { max: clean.thresholds.delayMaxTombola, expired: Boolean(currentDelays?.tombola?.expired) },
  };
  return {
    enginePatch: {
      activeProfileId: clean.activeProfileId,
      enabled: clean.difficulty.enabled,
      level: clean.difficulty.level,
      forcedMin,
      delays,
      difficultyIndex: computeEstimatedDifficultyIndex(
        clean.difficulty.enabled,
        clean.difficulty.level,
        forcedMin
      ),
    },
    prizesPatch: {
      prizePool: clean.prizes.prizePool,
      currency: clean.prizes.currency,
    },
  };
}

export function createInitialRegiaState(): RegiaStateSnapshot {
  const defaultProfile = DEFAULT_REGIA_PROFILES[0];
  const enginePatch = profileToEngineState(defaultProfile);

  return {
    extraction: {
      currentNumber: null,
      extractedNumbers: [],
      remainingCount: 90,
      smorfiaText: "In attesa dell'inizio partita",
      isRunning: false,
      timerSeconds: 5,
      remainingSeconds: 5,
      winHandlingMode: 'autoresume_5',
      voiceEnabled: true,
      aiEnabled: true,
    },
    prizes: {
      prizePool: 0,
      currency: '€',
      unclaimedCurrentGame: 0,
      breakdown: computePrizeBreakdown(0),
    },
    cloudBank: {
      connected: false,
      statusLabel: 'Inizializzazione...',
      balance: 0,
      currency: '€',
      lastUpdated: '--',
      history: [],
      isSyncing: false,
    },
    colors: {
      blue: { count: 0, active: false },
      orange: { count: 0, active: false },
      green: { count: 0, active: false },
      yellow: { count: 0, active: false },
      totalActiveColors: 0,
    },
    engine: {
      ...enginePatch,
      profiles: [...DEFAULT_REGIA_PROFILES],
      profilesFromCloud: false,
      isSavingProfile: false,
      monitoredCardsCount: 0,
      blockedNumbersCount: 0,
    },
    graphics: {
      enabled: false,
      src: '/assets/aistudio/image_5b55ca57.png',
      preset: 'screenshot',
      position: 'header_box1',
      scale: 100,
      opacity: 100,
      borderStyle: 'gold',
    },
    wins: {
      entries: [],
      totalWins: 0,
    },
    connection: {
      status: 'disconnected',
      clientCount: 1,
      latencyMs: 0,
      wsUrl: null,
      fallbackActive: false,
      staticHostMode: false,
    },
    logs: [
      {
        id: 1,
        time: 'LIVE',
        text: 'Regia Broadcast inizializzata. Sistema pronto.',
        level: 'info',
      },
    ],
  };
}

function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class RegiaStateManager {
  private state: RegiaStateSnapshot = createInitialRegiaState();
  private listeners: Set<RegiaStateListener> = new Set();
  private engineSyncListeners: Set<EngineConfigSyncListener> = new Set();
  private prizesSyncListeners: Set<PrizesConfigSyncListener> = new Set();
  private firestoreInitPromise: Promise<boolean> | null = null;
  private unsubBank: (() => void) | null = null;
  private unsubProfiles: (() => void) | null = null;
  private unsubActiveProfile: (() => void) | null = null;
  private unsubGameConfig: (() => void) | null = null;
  private lastSavedConfigSig: string | null = null;
  private configSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private isApplyingRemoteConfig = false;
  private nextLogId = 2;

  public getState(): RegiaStateSnapshot {
    return this.state;
  }

  public getIsApplyingRemoteConfig(): boolean {
    return this.isApplyingRemoteConfig;
  }

  public subscribe(listener: RegiaStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onEngineConfigSync(listener: EngineConfigSyncListener): () => void {
    this.engineSyncListeners.add(listener);
    return () => this.engineSyncListeners.delete(listener);
  }

  public onPrizesConfigSync(listener: PrizesConfigSyncListener): () => void {
    this.prizesSyncListeners.add(listener);
    return () => this.prizesSyncListeners.delete(listener);
  }

  private emit(section?: RegiaCardSection) {
    this.listeners.forEach((cb) => {
      try {
        cb(this.state, section);
      } catch (err) {
        console.error('[RegiaStateManager] Listener error:', err);
      }
    });
  }

  private emitEngineSync() {
    this.engineSyncListeners.forEach((cb) => {
      try {
        cb(this.state.engine);
      } catch (err) {
        console.error('[RegiaStateManager] Engine sync listener error:', err);
      }
    });
  }

  private emitPrizesSync() {
    this.prizesSyncListeners.forEach((cb) => {
      try {
        cb(this.state.prizes);
      } catch (err) {
        console.error('[RegiaStateManager] Prizes sync listener error:', err);
      }
    });
  }

  // --------------------------------------------------------------------------
  // CENTRALIZED LOGGING (REGOLE / REGIA EVENT LOG)
  // --------------------------------------------------------------------------
  public addLog(text: string, level: RegiaLogLevel = 'info') {
    const time =
      typeof Date !== 'undefined'
        ? new Date().toLocaleTimeString('it-IT')
        : '--:--:--';
    const entry: RegiaLogEntry = {
      id: this.nextLogId++,
      time,
      text,
      level,
    };
    const nextLogs = [...this.state.logs, entry];
    if (nextLogs.length > MAX_LOG_ENTRIES) {
      nextLogs.splice(0, nextLogs.length - MAX_LOG_ENTRIES);
    }
    this.state = { ...this.state, logs: nextLogs };
    this.renderLogsToDOM(entry);
    this.emit('logs');
  }

  public clearLogs() {
    this.state = {
      ...this.state,
      logs: [
        {
          id: this.nextLogId++,
          time: new Date().toLocaleTimeString('it-IT'),
          text: 'Log eventi pulito.',
          level: 'info',
        },
      ],
    };
    this.renderLogsToDOM(null);
    this.emit('logs');
  }

  // --------------------------------------------------------------------------
  // SECTION STATE UPDATERS (UI <-> STATE)
  // --------------------------------------------------------------------------
  public syncExtractionState(partial: Partial<RegiaStateSnapshot['extraction']>) {
    const extractedNumbers = partial.extractedNumbers ?? this.state.extraction.extractedNumbers;
    const remainingCount =
      partial.remainingCount ?? Math.max(0, 90 - extractedNumbers.length);
    const currentNumber =
      partial.currentNumber !== undefined
        ? partial.currentNumber
        : extractedNumbers.length > 0
          ? extractedNumbers[extractedNumbers.length - 1]
          : null;

    this.state = {
      ...this.state,
      extraction: {
        ...this.state.extraction,
        ...partial,
        extractedNumbers,
        remainingCount,
        currentNumber,
      },
    };
    this.renderExtractionCardToDOM();
    this.emit('extraction');
  }

  public syncPrizesState(
    partial: Partial<Omit<RegiaStateSnapshot['prizes'], 'breakdown'>>
  ) {
    const prizePool = partial.prizePool ?? this.state.prizes.prizePool;
    const currency = partial.currency ?? this.state.prizes.currency;
    const unclaimedCurrentGame =
      partial.unclaimedCurrentGame ?? this.state.prizes.unclaimedCurrentGame;

    this.state = {
      ...this.state,
      prizes: {
        prizePool,
        currency,
        unclaimedCurrentGame,
        breakdown: computePrizeBreakdown(prizePool),
      },
    };
    this.renderPrizesCardToDOM();
    this.emit('prizes');
  }

  public syncColorsState(
    colorsMap: Record<ColorKey, { count: number; active: boolean }>
  ) {
    const totalActiveColors = (['blue', 'orange', 'green', 'yellow'] as ColorKey[]).filter(
      (c) => colorsMap[c]?.active
    ).length;

    this.state = {
      ...this.state,
      colors: {
        blue: colorsMap.blue || { count: 0, active: false },
        orange: colorsMap.orange || { count: 0, active: false },
        green: colorsMap.green || { count: 0, active: false },
        yellow: colorsMap.yellow || { count: 0, active: false },
        totalActiveColors,
      },
    };
    this.renderColorsCardToDOM();
    this.emit('colors');
  }

  public syncEngineState(
    partial: Partial<RegiaStateSnapshot['engine']>,
    options: { render?: boolean; notifyEngineSync?: boolean } = {}
  ) {
    const mergedForcedMin = partial.forcedMin
      ? { ...this.state.engine.forcedMin, ...partial.forcedMin }
      : this.state.engine.forcedMin;
    const mergedDelays = partial.delays
      ? { ...this.state.engine.delays, ...partial.delays }
      : this.state.engine.delays;

    const enabled = partial.enabled ?? this.state.engine.enabled;
    const level = partial.level ?? this.state.engine.level;
    const difficultyIndex =
      partial.difficultyIndex !== undefined
        ? partial.difficultyIndex
        : this.state.extraction.extractedNumbers.length === 0
          ? computeEstimatedDifficultyIndex(enabled, level, mergedForcedMin)
          : this.state.engine.difficultyIndex;

    this.state = {
      ...this.state,
      engine: {
        ...this.state.engine,
        ...partial,
        forcedMin: mergedForcedMin,
        delays: mergedDelays,
        difficultyIndex,
      },
    };

    if (options.render !== false) {
      this.renderEngineCardToDOM();
    }
    if (options.notifyEngineSync) {
      this.emitEngineSync();
    }
    this.emit('engine');
  }

  public syncGraphicsState(partial: Partial<RegiaStateSnapshot['graphics']>) {
    this.state = {
      ...this.state,
      graphics: {
        ...this.state.graphics,
        ...partial,
      },
    };
    this.renderGraphicsCardToDOM();
    this.emit('graphics');
  }

  public syncWinsState(entries: RegiaWinEntry[]) {
    this.state = {
      ...this.state,
      wins: {
        entries,
        totalWins: entries.length,
      },
    };
    this.renderWinsCardToDOM();
    this.emit('wins');
  }

  public syncConnectionState(partial: Partial<RegiaStateSnapshot['connection']>) {
    this.state = {
      ...this.state,
      connection: {
        ...this.state.connection,
        ...partial,
      },
    };
    this.renderConnectionHeaderToDOM();
    this.emit('connection');
  }

  // --------------------------------------------------------------------------
  // FIRESTORE SYNCHRONIZATION LAYER (JACKPOT BANK + PROFILES + SETTINGS)
  // --------------------------------------------------------------------------
  public async initFirestoreSync(forceReinit = false): Promise<boolean> {
    if (this.firestoreInitPromise && !forceReinit) {
      return this.firestoreInitPromise;
    }

    this.firestoreInitPromise = (async () => {
      this.updateCloudBankState({ statusLabel: 'Connessione...', isSyncing: true });
      try {
        const connected = await initFirebaseJackpot();

        // 1. Load Jackpot Bank + History
        if (connected) {
          try {
            const [bankData, history] = await Promise.all([
              getJackpotBank(),
              getUnclaimedHistory(8),
            ]);
            this.applyJackpotBankData(bankData, true, history);
          } catch (bankErr) {
            console.warn('[RegiaState] Initial bank load error:', bankErr);
            this.updateCloudBankState({
              connected: false,
              statusLabel: 'Offline',
              isSyncing: false,
            });
          }
        } else {
          this.updateCloudBankState({
            connected: false,
            statusLabel: 'Offline',
            isSyncing: false,
          });
        }

        // 2. Load Regia Profiles + Active Profile ID
        await this.loadProfilesFromFirestore();

        // 3. Load Unified Game Config Document (regia_config/main: difficoltà, soglie, premi)
        try {
          const unifiedRes = await getRegiaGameConfig();
          if (unifiedRes.config) {
            this.applyUnifiedGameConfig(unifiedRes.config, {
              logSource: unifiedRes.fromCloud ? 'Firestore Cloud (regia_config/main)' : 'Cache Locale',
            });
          } else {
            await this.syncRegiaCardsWithFirestore({ immediate: true, source: 'init_seed' });
          }
        } catch (cfgErr) {
          console.warn('[RegiaState] Initial unified config load error:', cfgErr);
        }

        // 4. Attach real-time Firestore listeners (idempotent)
        this.attachFirestoreSubscriptions();

        return connected;
      } catch (err) {
        console.error('[RegiaState] Error initializing Firestore sync:', err);
        this.updateCloudBankState({
          connected: false,
          statusLabel: 'Errore',
          isSyncing: false,
        });
        await this.loadProfilesFromFirestore();
        return false;
      }
    })();

    return this.firestoreInitPromise;
  }

  public applyUnifiedGameConfig(
    config: RegiaGameConfigDoc,
    options: { logSource?: string } = {}
  ): boolean {
    const clean = sanitizeRegiaGameConfig(config);
    const sig = buildRegiaGameConfigSignature(clean);
    if (sig === this.lastSavedConfigSig) {
      return false;
    }

    this.isApplyingRemoteConfig = true;
    this.lastSavedConfigSig = sig;
    try {
      const { enginePatch, prizesPatch } = unifiedGameConfigToStatePatches(
        clean,
        this.state.engine.delays
      );
      const matchedProfile = this.state.engine.profiles.find((p) => p.id === clean.activeProfileId);

      this.syncEngineState(
        {
          ...enginePatch,
          ...(matchedProfile ? { profileNameInput: matchedProfile.name || matchedProfile.id } : {}),
        },
        { render: true, notifyEngineSync: true }
      );
      this.syncPrizesState(prizesPatch);
      this.emitPrizesSync();

      if (options.logSource) {
        this.addLog(
          `Configurazione partita unificata caricata (${options.logSource}): difficoltà ${clean.difficulty.level.toUpperCase()}, montepremi ${clean.prizes.currency} ${clean.prizes.prizePool.toFixed(2)}.`,
          'info'
        );
      }
      return true;
    } finally {
      this.isApplyingRemoteConfig = false;
    }
  }

  public async syncRegiaCardsWithFirestore(
    options: { immediate?: boolean; source?: string } = {}
  ): Promise<boolean> {
    if (this.isApplyingRemoteConfig) {
      return false;
    }

    const payload = stateToUnifiedGameConfig(this.state);
    const sig = buildRegiaGameConfigSignature(payload);
    if (sig === this.lastSavedConfigSig) {
      return false;
    }

    const performPersist = async (targetPayload: RegiaGameConfigDoc, targetSig: string): Promise<boolean> => {
      this.lastSavedConfigSig = targetSig;
      try {
        const res = await saveRegiaGameConfig(targetPayload);
        if (options.immediate && options.source !== 'init_seed') {
          this.addLog(
            res.savedToCloud
              ? `Configurazione unificata salvata su Firestore (regia_config/main).`
              : `Configurazione unificata salvata in cache locale (Cloud offline).`,
            res.savedToCloud ? 'info' : 'warn'
          );
        }
        return res.savedToCloud;
      } catch (err) {
        console.warn('[RegiaState] Unified config sync error:', err);
        return false;
      }
    };

    if (this.configSyncTimer) {
      clearTimeout(this.configSyncTimer);
      this.configSyncTimer = null;
    }

    if (options.immediate) {
      return performPersist(payload, sig);
    }

    return new Promise((resolve) => {
      this.configSyncTimer = setTimeout(() => {
        this.configSyncTimer = null;
        const latestPayload = stateToUnifiedGameConfig(this.state);
        const latestSig = buildRegiaGameConfigSignature(latestPayload);
        void performPersist(latestPayload, latestSig).then(resolve);
      }, 350);
    });
  }

  private attachFirestoreSubscriptions() {
    if (!this.unsubBank) {
      this.unsubBank = subscribeToJackpotBank((bankData) => {
        this.applyJackpotBankData(bankData, true);
        void this.refreshCloudHistoryFromFirestore();
      });
    }

    if (!this.unsubProfiles) {
      this.unsubProfiles = subscribeToRegiaProfiles((profiles) => {
        if (!Array.isArray(profiles) || profiles.length === 0) return;
        const active =
          profiles.find((p) => p.id === this.state.engine.activeProfileId) || profiles[0];
        const currentUnifiedSig = this.lastSavedConfigSig;
        this.isApplyingRemoteConfig = true;
        try {
          this.syncEngineState(
            {
              profiles,
              profilesFromCloud: true,
              ...(currentUnifiedSig === null && active
                ? profileToEngineState(active, this.state.engine.delays)
                : {}),
            },
            { render: true, notifyEngineSync: currentUnifiedSig === null }
          );
        } finally {
          this.isApplyingRemoteConfig = false;
        }
      });
    }

    if (!this.unsubActiveProfile) {
      this.unsubActiveProfile = subscribeToActiveRegiaProfile((activeId) => {
        if (!activeId || activeId === this.state.engine.activeProfileId) return;
        const found = this.state.engine.profiles.find((p) => p.id === activeId);
        if (found) {
          this.isApplyingRemoteConfig = true;
          try {
            this.syncEngineState(
              profileToEngineState(found, this.state.engine.delays),
              { render: true, notifyEngineSync: true }
            );
          } finally {
            this.isApplyingRemoteConfig = false;
          }
        }
      });
    }

    if (!this.unsubGameConfig) {
      this.unsubGameConfig = subscribeToRegiaGameConfig((config) => {
        this.applyUnifiedGameConfig(config);
      });
    }
  }

  private applyJackpotBankData(
    bankData: JackpotBankData,
    connected: boolean,
    history?: UnclaimedHistoryEntry[]
  ) {
    let formattedTime = this.state.cloudBank.lastUpdated;
    if (bankData.lastUpdated) {
      try {
        formattedTime = new Date(bankData.lastUpdated).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      } catch {
        formattedTime = bankData.lastUpdated;
      }
    }

    this.updateCloudBankState({
      connected,
      statusLabel: connected ? 'Connesso Cloud' : 'Offline',
      balance: Number(bankData.accumulatedUnclaimed) || 0,
      currency: bankData.currency || '€',
      lastUpdated: formattedTime,
      history: history ?? this.state.cloudBank.history,
      isSyncing: false,
    });
  }

  private updateCloudBankState(partial: Partial<RegiaStateSnapshot['cloudBank']>) {
    this.state = {
      ...this.state,
      cloudBank: {
        ...this.state.cloudBank,
        ...partial,
      },
    };
    this.renderCloudBankCardToDOM();
    this.emit('cloudBank');
  }

  public async refreshCloudHistoryFromFirestore(): Promise<UnclaimedHistoryEntry[]> {
    const history = await getUnclaimedHistory(8);
    this.updateCloudBankState({ history });
    return history;
  }

  public async syncBankFromFirestore(): Promise<JackpotBankData> {
    this.updateCloudBankState({ isSyncing: true });
    const [bankData, history] = await Promise.all([
      getJackpotBank(),
      getUnclaimedHistory(8),
    ]);
    this.applyJackpotBankData(bankData, true, history);
    return bankData;
  }

  public async depositUnclaimedToFirestore(
    amount: number,
    currency: string,
    prizeCategory: string,
    gameId: string,
    note: string
  ) {
    const res = await saveUnclaimedToDatabase(amount, currency, prizeCategory, gameId, note);
    if (res.success) {
      await this.syncBankFromFirestore();
    }
    return res;
  }

  public async recallUnclaimedFromFirestore(
    amountToRecall: number | null,
    gameId: string,
    note: string
  ) {
    const res = await recallUnclaimedIntoGame(amountToRecall, gameId, note);
    if (res.success) {
      await this.syncBankFromFirestore();
    }
    return res;
  }

  public async resetBankInFirestore(gameId: string, note: string) {
    const res = await resetJackpotBank(gameId, note);
    if (res.success) {
      await this.syncBankFromFirestore();
    }
    return res;
  }

  public async loadProfilesFromFirestore(): Promise<{
    profiles: RegiaProfileData[];
    fromCloud: boolean;
    chosen: RegiaProfileData;
  }> {
    const [{ profiles, fromCloud }, activeId] = await Promise.all([
      getRegiaProfiles(),
      getActiveRegiaProfileId(),
    ]);
    const list = profiles.length > 0 ? profiles : [...DEFAULT_REGIA_PROFILES];
    const chosen = list.find((p) => p.id === activeId) || list[0];

    this.syncEngineState(
      {
        profiles: list,
        profilesFromCloud: fromCloud,
        ...profileToEngineState(chosen, this.state.engine.delays),
      },
      { render: true, notifyEngineSync: true }
    );
    this.addLog(
      `Profilo Regia caricato (${fromCloud ? 'Firestore Cloud' : 'Cache Locale'}): "${chosen.name}".`,
      'info'
    );
    return { profiles: list, fromCloud, chosen };
  }

  public async selectProfile(profileId: string, persistToFirestore = true): Promise<RegiaProfileData | null> {
    const found = this.state.engine.profiles.find((p) => p.id === profileId);
    if (!found) return null;

    this.syncEngineState(
      profileToEngineState(found, this.state.engine.delays),
      { render: true, notifyEngineSync: true }
    );
    this.addLog(`Profilo "${found.name}" caricato e applicato.`, 'info');

    if (persistToFirestore) {
      await setActiveRegiaProfileId(found.id);
      await this.syncRegiaCardsWithFirestore({ immediate: true, source: 'profile_select' });
    }
    return found;
  }

  public createDraftProfile(currentEngineOverrides?: Partial<RegiaStateSnapshot['engine']>): RegiaProfileData {
    if (currentEngineOverrides) {
      this.syncEngineState(currentEngineOverrides, { render: false, notifyEngineSync: false });
    }
    const { engine } = this.state;
    const customCount = engine.profiles.filter((p) => !p.isPreset).length + 1;
    const newName = `Profilo Personalizzato ${customCount}`;
    const newId = sanitizeProfileId(`custom_${customCount}_${Date.now().toString(36)}`);

    const draftProfile: RegiaProfileData = {
      id: newId,
      name: newName,
      isPreset: false,
      enabled: engine.enabled,
      difficultyLevel: 'custom',
      forcedMinAmbo: engine.forcedMin.ambo,
      forcedMinTerno: engine.forcedMin.terno,
      forcedMinQuaterna: engine.forcedMin.quaterna,
      forcedMinCinquina: engine.forcedMin.cinquina,
      forcedMinTombola: engine.forcedMin.tombola,
      delayMaxGold: engine.delays.gold.max,
      delayMaxAmbo: engine.delays.ambo.max,
      delayMaxTerno: engine.delays.terno.max,
      delayMaxQuaterna: engine.delays.quaterna.max,
      delayMaxCinquina: engine.delays.cinquina.max,
      delayMaxTombola: engine.delays.tombola.max,
      updatedAt: new Date().toISOString(),
    };

    const nextProfiles = [...engine.profiles, draftProfile];
    this.syncEngineState(
      {
        profiles: nextProfiles,
        ...profileToEngineState(draftProfile, engine.delays),
      },
      { render: true, notifyEngineSync: true }
    );
    this.addLog(
      `Nuovo profilo bozza creato: "${newName}". Modifica i valori e premi "Salva DB".`,
      'info'
    );
    return draftProfile;
  }

  public async saveCurrentProfileToFirestore(
    enteredName: string,
    currentEngineOverrides?: Partial<RegiaStateSnapshot['engine']>
  ) {
    if (currentEngineOverrides) {
      this.syncEngineState(currentEngineOverrides, { render: false, notifyEngineSync: false });
    }

    const { engine } = this.state;
    const existing = engine.profiles.find((p) => p.id === engine.activeProfileId);
    let targetId = engine.activeProfileId;
    let isPreset = existing ? Boolean(existing.isPreset) : false;

    if (isPreset && existing && enteredName !== existing.name) {
      const slug = sanitizeProfileId(enteredName);
      targetId = ['high', 'medium', 'normal', 'random'].includes(slug)
        ? `${slug}_custom_${Date.now().toString(36)}`
        : slug;
      isPreset = false;
    }

    const payload = buildProfilePayloadFromEngine(engine, targetId, enteredName, isPreset);
    this.syncEngineState({ isSavingProfile: true }, { render: true, notifyEngineSync: false });

    try {
      const res = await saveRegiaProfile(payload);
      const savedProf = res.profile;
      const nextProfiles = [...this.state.engine.profiles];
      const idx = nextProfiles.findIndex((p) => p.id === savedProf.id);
      if (idx >= 0) nextProfiles[idx] = savedProf;
      else nextProfiles.push(savedProf);

      this.syncEngineState(
        {
          profiles: nextProfiles,
          profilesFromCloud: res.savedToCloud,
          isSavingProfile: false,
          ...profileToEngineState(savedProf, this.state.engine.delays),
        },
        { render: true, notifyEngineSync: true }
      );

      this.addLog(
        res.savedToCloud
          ? `Profilo "${savedProf.name}" salvato e sincronizzato nel database Firestore.`
          : `Profilo "${savedProf.name}" salvato in cache locale (Cloud non disponibile).`,
        res.savedToCloud ? 'win' : 'warn'
      );

      await this.syncRegiaCardsWithFirestore({ immediate: true, source: 'profile_save' });

      return res;
    } catch (err) {
      this.syncEngineState({ isSavingProfile: false }, { render: true, notifyEngineSync: false });
      throw err;
    }
  }

  public async deleteProfileFromFirestore(profileId: string) {
    const res = await deleteRegiaProfile(profileId);
    const remaining = this.state.engine.profiles.filter((p) => p.id !== profileId);
    const list = remaining.length > 0 ? remaining : [...DEFAULT_REGIA_PROFILES];
    const fallback = list.find((p) => p.id === 'high') || list[0];

    this.syncEngineState(
      {
        profiles: list,
        ...profileToEngineState(fallback, this.state.engine.delays),
      },
      { render: true, notifyEngineSync: true }
    );
    await setActiveRegiaProfileId(fallback.id);
    await this.syncRegiaCardsWithFirestore({ immediate: true, source: 'profile_delete' });
    return { ...res, fallback };
  }

  // --------------------------------------------------------------------------
  // CENTRALIZED .regia-card DOM RENDERERS
  // --------------------------------------------------------------------------
  public renderAllCardsToDOM() {
    if (typeof document === 'undefined') return;
    this.renderConnectionHeaderToDOM();
    this.renderExtractionCardToDOM();
    this.renderPrizesCardToDOM();
    this.renderCloudBankCardToDOM();
    this.renderColorsCardToDOM();
    this.renderEngineCardToDOM();
    this.renderGraphicsCardToDOM();
    this.renderWinsCardToDOM();
    this.renderLogsToDOM(null);
  }

  private renderConnectionHeaderToDOM() {
    if (typeof document === 'undefined') return;
    const { status, clientCount, latencyMs, wsUrl, fallbackActive, staticHostMode } = this.state.connection;

    const badge = document.getElementById('regiaWsBadge');
    const txt = document.getElementById('regiaWsText');
    const bars = document.getElementById('wsSignalBars');
    const pill = document.getElementById('wsLatencyPill');
    const val = document.getElementById('wsLatencyVal');
    const dot = document.getElementById('wsHeartbeatDot');

    const badgeState: 'active' | 'local-sync' | 'connecting' | 'offline' =
      status === 'connected'
        ? 'active'
        : staticHostMode
          ? 'local-sync'
          : status === 'connecting'
            ? 'connecting'
            : 'offline';
    const label =
      status === 'connected'
        ? `WS Live (${clientCount} ${clientCount === 1 ? 'schermo' : 'schermi'})`
        : staticHostMode
          ? 'Sync Locale (Attivo)'
          : status === 'connecting'
            ? 'Connessione WS...'
            : fallbackActive
              ? 'WS Locale (Fallback)'
              : 'WS In Riconnessione...';

    if (badge) {
      badge.className = `regia-ws-badge ${badgeState}`;
      if (staticHostMode) {
        badge.title =
          'Modalità Host Statico: Regia e TV Studio (2° Monitor) sincronizzati via BroadcastChannel nello stesso browser. Per WebSocket multi-dispositivo pubblica come Node Web Service (render.yaml).';
      } else if (wsUrl) {
        badge.title = `WebSocket Live: ${wsUrl}`;
      }
    }
    if (txt) txt.textContent = label;

    if (badgeState === 'local-sync') {
      if (bars) bars.className = 'ws-signal-bars local-sync';
      if (pill) pill.className = 'ws-latency-pill local-sync';
      if (val) val.textContent = 'Locale';
    } else if (badgeState === 'offline') {
      if (bars) bars.className = 'ws-signal-bars offline';
      if (pill) pill.className = 'ws-latency-pill offline';
      if (val) val.textContent = '-- ms';
    } else if (badgeState === 'connecting') {
      if (bars) bars.className = 'ws-signal-bars';
      if (pill) pill.className = 'ws-latency-pill';
      if (val) val.textContent = '... ms';
    } else {
      let quality: 'excellent' | 'good' | 'fair' = 'excellent';
      if (latencyMs >= 160) quality = 'fair';
      else if (latencyMs >= 60) quality = 'good';

      if (bars) bars.className = `ws-signal-bars ${quality}`;
      if (pill) pill.className = `ws-latency-pill ${quality}`;
      if (val && latencyMs > 0) val.textContent = `${latencyMs} ms`;
      if (dot && latencyMs > 0) {
        dot.classList.remove('beat');
        void dot.offsetWidth;
        dot.classList.add('beat');
      }
    }
  }

  private renderExtractionCardToDOM() {
    if (typeof document === 'undefined') return;
    const ext = this.state.extraction;

    const curNumEl = document.getElementById('regiaCurrentNumber');
    const curSmorfiaEl = document.getElementById('regiaSmorfiaText');
    const extStatEl = document.getElementById('regiaExtractedStat');
    const cdEl = document.getElementById('regiaCountdownDisplay');

    if (curNumEl) curNumEl.textContent = ext.currentNumber !== null ? String(ext.currentNumber) : '--';
    if (curSmorfiaEl) curSmorfiaEl.textContent = ext.smorfiaText;
    if (extStatEl) extStatEl.textContent = `${ext.extractedNumbers.length} / 90 Estratti`;
    if (cdEl) cdEl.textContent = `${ext.remainingSeconds}s`;

    const startBtn = document.getElementById('regiaStartBtn') as HTMLButtonElement | null;
    const pauseBtn = document.getElementById('regiaPauseBtn') as HTMLButtonElement | null;
    const extractBtn = document.getElementById('regiaExtractBtn') as HTMLButtonElement | null;
    if (startBtn) startBtn.disabled = ext.isRunning || ext.extractedNumbers.length >= 90;
    if (pauseBtn) pauseBtn.disabled = !ext.isRunning;
    if (extractBtn) extractBtn.disabled = ext.isRunning || ext.extractedNumbers.length >= 90;

    document.querySelectorAll<HTMLElement>('.regia-time-chips .regia-time-chip').forEach((chip) => {
      const t = parseInt(chip.dataset.time || '0', 10);
      chip.classList.toggle('active', t === ext.timerSeconds);
    });

    const vState = document.getElementById('regiaVoiceState');
    const vBtn = document.getElementById('regiaVoiceBtn');
    if (vState) vState.textContent = ext.voiceEnabled ? 'ON' : 'OFF';
    if (vBtn) vBtn.classList.toggle('active', ext.voiceEnabled);

    const aiState = document.getElementById('regiaAiState');
    const aiBtn = document.getElementById('regiaAiBtn');
    if (aiState) aiState.textContent = ext.aiEnabled ? 'ON' : 'OFF';
    if (aiBtn) aiBtn.classList.toggle('active', ext.aiEnabled);

    const winModeSel = document.getElementById('regiaWinModeSelect') as HTMLSelectElement | null;
    if (winModeSel && document.activeElement !== winModeSel) {
      winModeSel.value = ext.winHandlingMode;
    }
  }

  private renderPrizesCardToDOM() {
    if (typeof document === 'undefined') return;
    const { prizePool, currency, unclaimedCurrentGame, breakdown } = this.state.prizes;

    const poolInput = document.getElementById('regiaPrizePoolInput') as HTMLInputElement | null;
    const currSelect = document.getElementById('regiaCurrencySelect') as HTMLSelectElement | null;
    if (poolInput && document.activeElement !== poolInput) poolInput.value = String(prizePool);
    if (currSelect && document.activeElement !== currSelect) currSelect.value = currency;

    const mapIds: Array<[PrizeDelayKey, string]> = [
      ['gold', 'regiaGoldPrize'],
      ['ambo', 'regiaAmboPrize'],
      ['terno', 'regiaTernoPrize'],
      ['quaterna', 'regiaQuaternaPrize'],
      ['cinquina', 'regiaCinquinaPrize'],
      ['tombola', 'regiaTombolaPrize'],
    ];
    mapIds.forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = prizePool > 0 ? `${currency}${breakdown[key].toFixed(2)}` : '--';
      }
    });

    const formattedUnclaimed = `${currency} ${unclaimedCurrentGame.toFixed(2)}`;
    const unclaimedEl = document.getElementById('regiaUnclaimedVal');
    if (unclaimedEl) unclaimedEl.textContent = formattedUnclaimed;
    const tvUnclaimedEl = document.getElementById('unclaimedPotDisplay');
    if (tvUnclaimedEl) tvUnclaimedEl.textContent = formattedUnclaimed;
  }

  private renderCloudBankCardToDOM() {
    if (typeof document === 'undefined') return;
    const { connected, statusLabel, balance, currency, lastUpdated, history } = this.state.cloudBank;

    const statusEl = document.getElementById('regiaCloudStatus');
    const balanceEl = document.getElementById('regiaCloudBalance');
    const updatedEl = document.getElementById('regiaCloudLastUpdated');
    const historyListEl = document.getElementById('regiaCloudHistoryList');

    if (statusEl) {
      const dotClass = connected || statusLabel === 'Connessione...' ? 'online' : 'offline';
      statusEl.innerHTML = `<span class="cloud-dot ${dotClass}"></span> ${escapeHtml(statusLabel)}`;
    }
    if (balanceEl) {
      balanceEl.textContent = `${currency} ${balance.toFixed(2)}`;
    }
    if (updatedEl) {
      updatedEl.textContent = lastUpdated || '--';
    }
    if (historyListEl) {
      if (!history || history.length === 0) {
        historyListEl.innerHTML = '<div class="history-empty">Nessun movimento registrato finora</div>';
      } else {
        historyListEl.innerHTML = history
          .map((item) => {
            const dateStr = item.timestamp
              ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '--:--';
            let typeClass = 'deposit';
            let sign = '+';
            let label = 'Deposito';
            if (item.type === 'recalled_into_game') {
              typeClass = 'recall';
              sign = '-';
              label = 'Richiamo';
            } else if (item.type === 'reset') {
              typeClass = 'reset';
              sign = '';
              label = 'Azzera';
            }
            return `
              <div class="history-entry ${typeClass}">
                <div class="entry-left">
                  <span class="entry-time"><i class="far fa-clock"></i> ${escapeHtml(dateStr)} - ${label} [${escapeHtml(item.gameId || 'TOM')}]</span>
                  <span class="entry-note">${escapeHtml(item.note || '')}</span>
                </div>
                <span class="entry-amount">${sign}€ ${(item.amount || 0).toFixed(2)}</span>
              </div>
            `;
          })
          .join('');
      }
    }
  }

  private renderColorsCardToDOM() {
    if (typeof document === 'undefined') return;
    const { colors } = this.state;

    const map: Array<[ColorKey, string, string]> = [
      ['blue', 'regiaBlueCount', 'regiaToggleBlue'],
      ['orange', 'regiaOrangeCount', 'regiaToggleOrange'],
      ['green', 'regiaGreenCount', 'regiaToggleGreen'],
      ['yellow', 'regiaYellowCount', 'regiaToggleYellow'],
    ];

    map.forEach(([key, countId, toggleId]) => {
      const item = colors[key];
      const countEl = document.getElementById(countId);
      const toggleEl = document.getElementById(toggleId) as HTMLInputElement | null;
      if (countEl) countEl.textContent = `${item.count} cartelle (${item.active ? 'ATTIVO' : 'DISATTIVO'})`;
      if (toggleEl) toggleEl.checked = item.active;
    });

    const colorsBadge = document.getElementById('regiaActiveColorsBadge');
    if (colorsBadge) {
      if (colors.totalActiveColors === 0) {
        colorsBadge.textContent = '0 Colori (Tutti Inattivi)';
        colorsBadge.style.color = '#f87171';
        colorsBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      } else {
        colorsBadge.textContent = `${colors.totalActiveColors} Colori Attivi`;
        colorsBadge.style.color = '#4ade80';
        colorsBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      }
    }
  }

  private renderEngineCardToDOM() {
    if (typeof document === 'undefined') return;
    const { engine, extraction, wins } = this.state;
    const extCount = extraction.extractedNumbers.length;

    // Cloud DB status pill
    const cloudBadgeEl = document.getElementById('regiaProfileCloudStatus');
    if (cloudBadgeEl) {
      cloudBadgeEl.innerHTML = `<i class="fas fa-database"></i> ${engine.profilesFromCloud ? 'Cloud DB' : 'Cache Locale'}`;
      cloudBadgeEl.style.color = engine.profilesFromCloud ? '#4ade80' : '#facc15';
    }

    // Populate saved profiles dropdown
    const profileSelectEl = document.getElementById('regiaProfileSelect') as HTMLSelectElement | null;
    if (profileSelectEl && engine.profiles.length > 0 && document.activeElement !== profileSelectEl) {
      const optionsMarkup = engine.profiles
        .map((p) => {
          const suffix = p.isPreset ? '' : ' ★';
          return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}${suffix}</option>`;
        })
        .join('');
      if (profileSelectEl.innerHTML !== optionsMarkup) {
        profileSelectEl.innerHTML = optionsMarkup;
      }
      if (engine.profiles.some((p) => p.id === engine.activeProfileId)) {
        profileSelectEl.value = engine.activeProfileId;
      }
    }

    const nameInput = document.getElementById('regiaProfileNameInput') as HTMLInputElement | null;
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = engine.profileNameInput;
    }

    const deleteProfileBtn = document.getElementById('regiaDeleteProfileBtn') as HTMLButtonElement | null;
    if (deleteProfileBtn) {
      const currentProf = engine.profiles.find((p) => p.id === engine.activeProfileId);
      const isPreset = currentProf
        ? Boolean(currentProf.isPreset)
        : ['high', 'medium', 'normal', 'random'].includes(engine.activeProfileId);
      deleteProfileBtn.disabled = isPreset;
      deleteProfileBtn.title = isPreset
        ? 'I profili predefiniti non possono essere eliminati (puoi modificarli e salvarli come nuovo profilo)'
        : 'Elimina il profilo personalizzato dal database Firestore';
    }

    const saveProfileBtn = document.getElementById('regiaSaveProfileBtn') as HTMLButtonElement | null;
    if (saveProfileBtn) {
      saveProfileBtn.disabled = engine.isSavingProfile;
      saveProfileBtn.innerHTML = engine.isSavingProfile
        ? '<i class="fas fa-spinner fa-spin"></i> Salvataggio...'
        : '<i class="fas fa-cloud-upload-alt"></i> Salva DB';
    }

    // Master toggle & Strategy select
    const masterToggle = document.getElementById('regiaDifficultyMasterToggle') as HTMLInputElement | null;
    const levelSelect = document.getElementById('regiaDifficultyLevelSelect') as HTMLSelectElement | null;
    if (masterToggle) masterToggle.checked = engine.enabled;
    if (levelSelect && document.activeElement !== levelSelect) levelSelect.value = engine.level;

    // Min thresholds
    const minFields: Array<[keyof ForcedMinThresholds, string]> = [
      ['ambo', 'forcedMinAmbo'],
      ['terno', 'forcedMinTerno'],
      ['quaterna', 'forcedMinQuaterna'],
      ['cinquina', 'forcedMinCinquina'],
      ['tombola', 'forcedMinTombola'],
    ];
    minFields.forEach(([key, id]) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el && document.activeElement !== el) el.value = String(engine.forcedMin[key]);
    });

    // Delay Max thresholds & status badges
    const wonTypes = new Set(wins.entries.map((w) => w.type.toLowerCase()));
    const prizeDelayKeys: PrizeDelayKey[] = ['gold', 'ambo', 'terno', 'quaterna', 'cinquina', 'tombola'];
    prizeDelayKeys.forEach((k) => {
      const conf = engine.delays[k];
      if (!conf) return;
      const capKey = k.charAt(0).toUpperCase() + k.slice(1);
      const inp = document.getElementById(`delayInput${capKey}`) as HTMLInputElement | null;
      const prog = document.getElementById(`delayProgress${capKey}`);
      const stat = document.getElementById(`delayStatus${capKey}`);

      if (inp && document.activeElement !== inp) inp.value = String(conf.max);
      if (prog) prog.textContent = `${extCount} / ${conf.max}`;
      if (stat) {
        if (wonTypes.has(k)) {
          stat.className = 'delay-status-badge won';
          stat.textContent = 'VINTO';
        } else if (conf.expired) {
          stat.className = 'delay-status-badge expired';
          stat.textContent = 'SCADUTO ➜ Cassa';
        } else {
          stat.className = 'delay-status-badge';
          stat.textContent = `Entro ${conf.max}`;
        }
      }
    });

    // Live monitor
    const monitoredEl = document.getElementById('regiaMonitoredCards');
    const blockedEl = document.getElementById('regiaBlockedNumbersCount');
    const diffIdxEl = document.getElementById('regiaDifficultyIndex');
    const diffBadge = document.getElementById('regiaDifficultyBadge');

    if (monitoredEl) {
      monitoredEl.textContent = `${engine.monitoredCardsCount} cartelle (${engine.monitoredCardsCount * 15} numeri)`;
    }
    if (blockedEl) blockedEl.textContent = `${engine.blockedNumbersCount} numeri`;
    if (diffIdxEl) {
      diffIdxEl.textContent = `${engine.difficultyIndex}% (${engine.level.toUpperCase()})`;
    }
    if (diffBadge) {
      diffBadge.textContent = engine.enabled ? engine.level.toUpperCase() : 'DISATTIVO';
      diffBadge.style.color = engine.enabled ? '#facc15' : '#94a3b8';
    }
  }

  private renderGraphicsCardToDOM() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('regiaTvGraphicBadge');
    if (badge) {
      badge.className = 'regia-card-badge';
      if (this.state.graphics.enabled) {
        badge.style.background = '#10b981';
        badge.style.color = '#ffffff';
        badge.textContent = 'TV LIVE';
      } else {
        badge.style.background = 'rgba(255,255,255,0.1)';
        badge.style.color = '#94a3b8';
        badge.textContent = 'TV Disattivo';
      }
    }
  }

  private renderWinsCardToDOM() {
    if (typeof document === 'undefined') return;
    const winsContent = document.getElementById('regiaWinsContent');
    const winsBadge = document.getElementById('regiaTotalWinsBadge');
    const { entries, totalWins } = this.state.wins;

    if (winsBadge) winsBadge.textContent = `${totalWins} Vincite`;
    if (winsContent) {
      if (entries.length === 0) {
        winsContent.innerHTML = '<div class="regia-empty-state">In attesa delle prime vincite...</div>';
      } else {
        winsContent.innerHTML = entries
          .map(
            (item) => `
              <div class="regia-win-entry">
                <span><b>${escapeHtml(item.type)}</b>: ${escapeHtml(item.cartellaId)}</span>
                <span>Assegnato</span>
              </div>
            `
          )
          .join('');
      }
    }
  }

  private renderLogsToDOM(newEntry: RegiaLogEntry | null) {
    if (typeof document === 'undefined') return;
    const logContent = document.getElementById('regiaLogContent');
    if (!logContent) return;

    if (!newEntry) {
      logContent.innerHTML = this.state.logs
        .map(
          (entry) =>
            `<div class="log-entry ${entry.level}"><span class="log-time">[${escapeHtml(entry.time)}]</span> ${entry.text}</div>`
        )
        .join('');
    } else {
      const div = document.createElement('div');
      div.className = `log-entry ${newEntry.level}`;
      div.innerHTML = `<span class="log-time">[${escapeHtml(newEntry.time)}]</span> ${newEntry.text}`;
      logContent.appendChild(div);
    }
    logContent.scrollTop = logContent.scrollHeight;
  }
}

export const regiaStateManager = new RegiaStateManager();

if (typeof window !== 'undefined') {
  (window as any).RegiaState = regiaStateManager;
}
