import './tombola-luxury.css';
import * as jackpotService from './firebase-jackpot-service';
(window as any).JackpotService = jackpotService;
import { regiaStateManager } from './regia-state-manager';
(window as any).RegiaState = regiaStateManager;
import { realtimeSync, type ConnectionStatus, type RealtimeMessage } from './realtime-sync';
import './tombola-controller.js';
import './online-guide-manager';
import { getAppBaseUrl, getWebSocketUrl, resolveRuntimeAppConfig } from './config';
import {
  disconnectWebSocket,
  getTransportState,
  initWebSocket,
  isBroadcastFallbackActive,
  isRelativeFallbackActive,
  reconnectWebSocket,
  resolvePrimaryWsEndpoint,
  sendRealtimeMessage,
  setCustomWebSocketUrl,
  type InitWebSocketOptions,
  type WebSocketTransportState,
} from './websocket';
import {
  computeExponentialBackoffDelay,
  normalizeExponentialBackoffConfig,
  type ExponentialBackoffConfig,
} from './utils/ws-backoff';

/**
 * ============================================================================
 * ORCHESTRATORE REAL-TIME LATO CLIENT (REGIA <-> SCHERMO TV)
 * ============================================================================
 * Coordina il trasporto WebSocket / BroadcastChannel (src/websocket.ts) e
 * delega la sincronizzazione centralizzata di tutte le `.regia-card` UI e
 * del database Firestore al gestore di stato `regiaStateManager`.
 */

const STARTUP_CHECK_TIMEOUT_MS = 6500;
let unsubscribePersistentCardsSync: (() => void) | null = null;

/**
 * Sincronizzazione persistente centralizzata delle `.regia-card`:
 * salva in un unico documento Firestore (`regia_config/main`) i parametri
 * di gioco (difficoltà, soglie, premi) evitando duplicazioni tra le card.
 */
export async function syncRegiaCardsWithFirestore(options: {
  immediate?: boolean;
  source?: string;
} = {}): Promise<boolean> {
  return regiaStateManager.syncRegiaCardsWithFirestore(options);
}

/**
 * Attiva l'osservazione persistente sulle `.regia-card` di configurazione
 * (difficoltà/soglie e premi) dopo l'idratazione iniziale da Firestore.
 */
export function initPersistentRegiaCardsSync(): () => void {
  if (unsubscribePersistentCardsSync) {
    return unsubscribePersistentCardsSync;
  }

  unsubscribePersistentCardsSync = regiaStateManager.subscribe((_state, changedSection) => {
    if (regiaStateManager.getIsApplyingRemoteConfig()) return;
    if (changedSection === 'engine' || changedSection === 'prizes') {
      void syncRegiaCardsWithFirestore({ source: changedSection });
    }
  });

  return unsubscribePersistentCardsSync;
}

if (typeof window !== 'undefined') {
  (window as any).syncRegiaCardsWithFirestore = syncRegiaCardsWithFirestore;
}

interface ExtractionPayload {
  type: string;
  number: number;
  extractedNumbers?: number[];
  extractionCount?: number;
  smorfia?: string;
  timestamp?: number;
  source?: string;
}

export type { ExponentialBackoffConfig };
export { computeExponentialBackoffDelay };

export interface InitializeWebSocketChannelOptions {
  /** Override opzionale del ruolo client ('regia' | 'tv') */
  role?: 'regia' | 'tv';
  /** Override opzionale esplicito dell'endpoint WebSocket */
  wsUrl?: string | null;
  /** Override testabile della costante Vite `__APP_WS_URL__` */
  definedAppWsUrlOverride?: string;
  /** Configurazione opzionale dell'exponential backoff per la riconnessione */
  backoff?: ExponentialBackoffConfig;
  /** Implementazione WebSocket opzionale (es. per test o fallback controllato) */
  WebSocketImpl?: typeof WebSocket | null;
  /** Istanza esplicita di ClientWebSocketManager */
  manager?: ClientWebSocketManager;
  /** Se true, esegue anche il controllo di raggiungibilità all'avvio */
  verifyStartup?: boolean;
}

let activeChannelEpoch = 0;
let activeBackoffTimer: ReturnType<typeof setTimeout> | null = null;
let activeCountdownInterval: ReturnType<typeof setInterval> | null = null;
let activeOnlineListener: (() => void) | null = null;
let lastChannelOptions: InitializeWebSocketChannelOptions = {};

function clearChannelBackoffTimers() {
  if (activeBackoffTimer) {
    clearTimeout(activeBackoffTimer);
    activeBackoffTimer = null;
  }
  if (activeCountdownInterval) {
    clearInterval(activeCountdownInterval);
    activeCountdownInterval = null;
  }
}

function cleanupChannelSessionListeners() {
  clearChannelBackoffTimers();
  if (typeof window !== 'undefined' && activeOnlineListener) {
    window.removeEventListener('online', activeOnlineListener);
    activeOnlineListener = null;
  }
}

/**
 * Inizializza il canale di comunicazione WebSocket in tempo reale tra la
 * Console Regia e lo Schermo TV utilizzando `__APP_WS_URL__` definita in
 * `vite.config.ts`, con riconnessione automatica ad exponential backoff e
 * aggiornamento visivo in tempo reale del badge `regiaWsBadge`.
 */
export function initializeWebSocketChannel(
  options: InitializeWebSocketChannelOptions = {}
): WebSocketTransportState {
  const sessionEpoch = ++activeChannelEpoch;
  cleanupChannelSessionListeners();
  lastChannelOptions = { ...options };

  const targetManager = options.manager ?? clientWsManager;
  const rawDefinedAppWsUrl =
    options.definedAppWsUrlOverride !== undefined
      ? String(options.definedAppWsUrlOverride).trim()
      : typeof __APP_WS_URL__ !== 'undefined' && __APP_WS_URL__
        ? String(__APP_WS_URL__).trim()
        : '';

  const role = options.role ?? targetManager.getClientRole();
  const primaryEndpoint =
    options.wsUrl !== undefined ? options.wsUrl : resolvePrimaryWsEndpoint(rawDefinedAppWsUrl);
  const backoffCfg = normalizeExponentialBackoffConfig(options.backoff);

  let reconnectAttempt = 0;

  const updateBadgeBackoffState = (
    patch: Partial<{
      status: ConnectionStatus;
      reconnecting: boolean;
      reconnectAttempt: number;
      reconnectMaxAttempts: number;
      reconnectDelayMs: number;
      reconnectRemainingSeconds: number;
      reconnectExhausted: boolean;
    }>
  ) => {
    regiaStateManager.syncConnectionState({
      reconnectMaxAttempts: backoffCfg.maxAttempts,
      ...patch,
    });
  };

  const resetBackoffState = () => {
    clearChannelBackoffTimers();
    reconnectAttempt = 0;
    updateBadgeBackoffState({
      reconnecting: false,
      reconnectAttempt: 0,
      reconnectDelayMs: 0,
      reconnectRemainingSeconds: 0,
      reconnectExhausted: false,
    });
  };

  const scheduleExponentialBackoffReconnect = (reason: string) => {
    if (sessionEpoch !== activeChannelEpoch) return;
    if (getTransportState().staticHostMode) return;

    clearChannelBackoffTimers();

    if (reconnectAttempt >= backoffCfg.maxAttempts) {
      updateBadgeBackoffState({
        status: 'disconnected',
        reconnecting: false,
        reconnectAttempt,
        reconnectDelayMs: 0,
        reconnectRemainingSeconds: 0,
        reconnectExhausted: true,
      });
      const exhaustedMsg = `Connessione WebSocket persa definitivamente dopo ${backoffCfg.maxAttempts} tentativi di exponential backoff (${reason}).`;
      console.error(`[WS-Backoff] ${exhaustedMsg}`);
      regiaStateManager.addLog(`❌ ${exhaustedMsg}`, 'error');
      targetManager.notifyServerUnreachable(exhaustedMsg);
      return;
    }

    reconnectAttempt += 1;
    const delayMs = computeExponentialBackoffDelay(reconnectAttempt, backoffCfg);
    const nextRetryAt = Date.now() + delayMs;

    const refreshBadgeCountdown = () => {
      if (sessionEpoch !== activeChannelEpoch) return;
      const remainingMs = Math.max(0, nextRetryAt - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      updateBadgeBackoffState({
        status: 'connecting',
        reconnecting: true,
        reconnectAttempt,
        reconnectDelayMs: delayMs,
        reconnectRemainingSeconds: remainingSeconds,
        reconnectExhausted: false,
      });
    };

    refreshBadgeCountdown();

    console.warn(
      `[WS-Backoff] Caduta segnale: tentativo #${reconnectAttempt}/${backoffCfg.maxAttempts} programmato tra ${delayMs}ms (${reason})`
    );
    regiaStateManager.addLog(
      `🔄 Caduta segnale WebSocket: riconnessione #${reconnectAttempt}/${backoffCfg.maxAttempts} tra ${(delayMs / 1000).toFixed(1)}s.`,
      'warn'
    );

    if (delayMs >= 450) {
      activeCountdownInterval = setInterval(() => {
        if (sessionEpoch !== activeChannelEpoch) {
          clearChannelBackoffTimers();
          return;
        }
        if (Date.now() >= nextRetryAt) {
          if (activeCountdownInterval) {
            clearInterval(activeCountdownInterval);
            activeCountdownInterval = null;
          }
          return;
        }
        refreshBadgeCountdown();
      }, 250);
    }

    activeBackoffTimer = setTimeout(() => {
      if (sessionEpoch !== activeChannelEpoch) return;
      clearChannelBackoffTimers();
      if (getTransportState().staticHostMode) return;

      updateBadgeBackoffState({
        status: 'connecting',
        reconnecting: true,
        reconnectAttempt,
        reconnectDelayMs: delayMs,
        reconnectRemainingSeconds: 0,
        reconnectExhausted: false,
      });

      console.info(
        `[WS-Backoff] Esecuzione tentativo di riconnessione #${reconnectAttempt}/${backoffCfg.maxAttempts}...`
      );
      reconnectWebSocket();
    }, delayMs);
  };

  if (typeof window !== 'undefined') {
    activeOnlineListener = () => {
      if (sessionEpoch !== activeChannelEpoch) return;
      const currentState = getTransportState();
      if (currentState.status !== 'connected' && !currentState.staticHostMode) {
        console.info('[WS-Backoff] Rete tornata online: tentativo immediato di riconnessione WebSocket.');
        regiaStateManager.addLog('🌐 Rete ripristinata: riavvio connessione WebSocket immediata.', 'info');
        resetBackoffState();
        reconnectWebSocket();
      }
    };
    window.addEventListener('online', activeOnlineListener);
  }

  console.info(
    `[WS-Channel] Inizializzazione canale Regia <-> TV | ruolo=${role} | __APP_WS_URL__=${rawDefinedAppWsUrl || 'non definito'} | endpoint=${primaryEndpoint || 'BroadcastChannel locale'} | backoff=${backoffCfg.initialDelayMs}ms..${backoffCfg.maxDelayMs}ms (x${backoffCfg.multiplier}, max ${backoffCfg.maxAttempts})`
  );

  const baseCallbacks = targetManager.buildWebSocketOptions();
  const state = initWebSocket({
    ...baseCallbacks,
    role,
    definedAppWsUrlOverride: rawDefinedAppWsUrl,
    ...(options.wsUrl !== undefined ? { wsUrlOverride: options.wsUrl } : {}),
    ...(options.WebSocketImpl !== undefined ? { WebSocketImpl: options.WebSocketImpl } : {}),
    disableInternalReconnect: true,
    onConnected: (wsUrl: string) => {
      resetBackoffState();
      baseCallbacks.onConnected?.(wsUrl);
    },
    onStaticHostMode: (reason: string) => {
      resetBackoffState();
      baseCallbacks.onStaticHostMode?.(reason);
    },
    onConnectionLost: ({ reason }) => {
      scheduleExponentialBackoffReconnect(reason);
    },
  });

  if (options.verifyStartup) {
    targetManager.verifyWebSocketConnectionOnStartup();
  }

  return state;
}

export class ClientWebSocketManager {
  private startupCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private startupVerified = false;
  private alertDismissedByUser = false;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    this.bindRealtimeBus();

    const boot = () => {
      regiaStateManager.renderAllCardsToDOM();
      void regiaStateManager.initFirestoreSync().finally(() => {
        initPersistentRegiaCardsSync();
      });
      this.wireAlertControls();
      this.connect();
      this.verifyWebSocketConnectionOnStartup();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  private bindRealtimeBus() {
    realtimeSync.bindTransport({
      send: (msg: RealtimeMessage) => this.send(msg),
      connect: () => this.connect(),
      getStatus: () => getTransportState().status,
      getClientCount: () => getTransportState().clientCount,
      getLatency: () => getTransportState().latencyMs,
    });
  }

  private wireAlertControls() {
    const retryBtn = document.getElementById('regiaWsRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.alertDismissedByUser = false;
        regiaStateManager.addLog("Nuovo tentativo di connessione WebSocket avviato dall'operatore...", 'info');
        this.reconnect();
      });
    }

    const dismissBtn = document.getElementById('regiaWsDismissBtn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.alertDismissedByUser = true;
        this.hideUnreachableNotification();
      });
    }
  }

  public resolveTargetWsUrl(): string | null {
    return getWebSocketUrl();
  }

  public getWsUrl(): string | null {
    return getTransportState().wsUrl || this.resolveTargetWsUrl();
  }

  public getHostingUrl(): string {
    return getAppBaseUrl();
  }

  public getConfig() {
    return resolveRuntimeAppConfig();
  }

  public isFallbackActive(): boolean {
    return isBroadcastFallbackActive();
  }

  public getClientRole(): 'tv' | 'regia' {
    if (typeof window === 'undefined') return 'regia';
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'tv' || params.get('mode') === 'tv' ? 'tv' : 'regia';
  }

  public setCustomWsUrl(customUrl: string | null) {
    this.alertDismissedByUser = false;
    cleanupChannelSessionListeners();
    setCustomWebSocketUrl(customUrl);
    initializeWebSocketChannel({ ...lastChannelOptions, manager: this, verifyStartup: true });
  }

  public reconnect() {
    this.clearStartupCheckTimer();
    this.startupVerified = false;
    this.alertDismissedByUser = false;
    initializeWebSocketChannel({ ...lastChannelOptions, manager: this, verifyStartup: true });
  }

  public disconnect() {
    activeChannelEpoch++;
    cleanupChannelSessionListeners();
    this.clearStartupCheckTimer();
    regiaStateManager.syncConnectionState({
      status: 'disconnected',
      reconnecting: false,
      reconnectAttempt: 0,
      reconnectDelayMs: 0,
      reconnectRemainingSeconds: 0,
      reconnectExhausted: false,
    });
    disconnectWebSocket(false);
  }

  public connect(): WebSocketTransportState | undefined {
    if (typeof window === 'undefined') return undefined;
    return initializeWebSocketChannel({ manager: this });
  }

  public buildWebSocketOptions(): Omit<
    InitWebSocketOptions,
    'definedAppWsUrlOverride' | 'wsUrlOverride' | 'role'
  > {
    return {
      onMessage: (data, origin) => this.handleIncomingData(data, origin),
      onStatusChange: (status: ConnectionStatus, clientCount: number, fallbackActive: boolean) => {
        const transport = getTransportState();
        regiaStateManager.syncConnectionState({
          status,
          clientCount,
          fallbackActive,
          staticHostMode: transport.staticHostMode,
          wsUrl: transport.wsUrl,
          latencyMs: status === 'connected' ? transport.latencyMs : 0,
        });
        realtimeSync.notifyStatus(status, clientCount);
      },
      onConnected: (wsUrl: string) => {
        this.startupVerified = true;
        this.clearStartupCheckTimer();
        this.hideUnreachableNotification();
        regiaStateManager.syncConnectionState({
          status: 'connected',
          wsUrl,
          fallbackActive: false,
          staticHostMode: false,
        });
        const usedRelativeFallback = isRelativeFallbackActive();
        console.log(
          `⚡ [WS-Client] Connesso con successo a ${wsUrl}${usedRelativeFallback ? ' (fallback URL relativo)' : ''}`
        );
        regiaStateManager.addLog(
          usedRelativeFallback
            ? `⚡ WebSocket connesso tramite fallback relativo (${wsUrl}).`
            : `⚡ WebSocket connesso in tempo reale (${wsUrl}).`,
          'info'
        );
      },
      onRelativeFallbackActivated: (relativeUrl: string, reason: string) => {
        regiaStateManager.syncConnectionState({
          wsUrl: relativeUrl,
          fallbackActive: false,
          staticHostMode: false,
        });
        console.warn(`[WS-Fallback] ${reason} -> tentativo fallback relativo su ${relativeUrl}`);
        regiaStateManager.addLog(
          `🔄 Server esterno irraggiungibile: fallback automatico su URL relativo (${relativeUrl}).`,
          'warn'
        );
      },
      onStaticHostMode: (reason: string) => {
        this.startupVerified = true;
        this.clearStartupCheckTimer();
        this.hideUnreachableNotification();
        regiaStateManager.syncConnectionState({
          status: 'disconnected',
          fallbackActive: true,
          staticHostMode: true,
          wsUrl: null,
          latencyMs: 0,
        });
        console.info(`[WS-Startup] ${reason}`);
        regiaStateManager.addLog(`📡 ${reason}`, 'info');
      },
      onFallbackActivated: (reason: string) => {
        this.clearStartupCheckTimer();
        const transport = getTransportState();
        if (transport.staticHostMode) return;
        regiaStateManager.syncConnectionState({ fallbackActive: true, staticHostMode: false });
        this.notifyServerUnreachable(reason);
      },
      onLatency: (latencyMs: number) => {
        regiaStateManager.syncConnectionState({ latencyMs });
        realtimeSync.notifyLatency(latencyMs);
      },
      onClientCount: (count: number) => {
        const transport = getTransportState();
        regiaStateManager.syncConnectionState({
          status: transport.status,
          clientCount: count,
          wsUrl: transport.wsUrl,
          fallbackActive: transport.fallbackActive,
          staticHostMode: transport.staticHostMode,
        });
      },
      onRawLog: (message, level) => {
        if (level === 'error') console.error(message);
        else if (level === 'warn') console.warn(message);
        else console.info(message);
      },
    };
  }

  public send(msg: RealtimeMessage) {
    sendRealtimeMessage(msg);
  }

  public syncBoardExtraction(number: number, smorfia: string = '') {
    this.send({
      type: 'REGIA_EXTRACT',
      number,
      smorfia,
      source: this.getClientRole(),
      timestamp: Date.now(),
    });
  }

  /**
   * Verifica la connessione WebSocket all'avvio:
   * - Registra ambiente/URL nel log console e RegiaStateManager
   * - Se il server è irraggiungibile entro timeoutMs (e non siamo su host statico),
   *   conferma fallback BroadcastChannel e mostra la notifica nella UI della Regia.
   */
  public verifyWebSocketConnectionOnStartup(timeoutMs: number = STARTUP_CHECK_TIMEOUT_MS) {
    this.clearStartupCheckTimer();
    const state = getTransportState();
    const cfg = resolveRuntimeAppConfig();
    const targetUrl = state.wsUrl || cfg.wsUrl;

    console.info(
      `[WS-Startup] Verifica connessione all'avvio | ambiente=${cfg.environment} | appUrl=${cfg.appUrl} | wsUrl=${targetUrl || 'non configurato'} | fallback=${state.fallbackActive} | staticHost=${state.staticHostMode}`
    );
    regiaStateManager.addLog(
      `Verifica WebSocket all'avvio (${cfg.environment.toUpperCase()}): ${targetUrl || 'nessun server remoto -> BroadcastChannel'}`,
      'info'
    );

    if (state.status === 'connected' || state.staticHostMode) {
      this.startupVerified = true;
      this.hideUnreachableNotification();
      return;
    }

    if (!targetUrl) return;

    this.startupCheckTimer = setTimeout(() => {
      const current = getTransportState();
      if (!this.startupVerified && current.status !== 'connected' && !current.staticHostMode) {
        this.notifyServerUnreachable(
          `Server WebSocket irraggiungibile su ${targetUrl} (timeout ${Math.round(timeoutMs / 1000)}s). Attivo fallback locale BroadcastChannel.`
        );
      }
    }, timeoutMs);
  }

  private clearStartupCheckTimer() {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }
  }

  public notifyServerUnreachable(reason: string) {
    console.warn(`[WS-Startup] ⚠️ ${reason}`);
    regiaStateManager.addLog(`⚠️ ${reason}`, 'warn');

    if (this.alertDismissedByUser) return;

    const alertBox = document.getElementById('regiaWsAlert');
    const alertMsg = document.getElementById('regiaWsAlertMessage');
    if (alertMsg) {
      alertMsg.textContent = reason;
    }
    if (alertBox) {
      alertBox.hidden = false;
    }

    const regiaSection = document.getElementById('regiaSection');
    const isRegiaVisible = regiaSection?.classList.contains('active');
    const existingToast = document.getElementById('wsStartupToast');
    if (isRegiaVisible) {
      if (existingToast) existingToast.hidden = true;
    } else {
      this.showStartupToast(reason);
    }
  }

  private hideUnreachableNotification() {
    const alertBox = document.getElementById('regiaWsAlert');
    if (alertBox) alertBox.hidden = true;
    const toast = document.getElementById('wsStartupToast');
    if (toast) toast.hidden = true;
  }

  private showStartupToast(message: string) {
    if (typeof document === 'undefined') return;
    let toast = document.getElementById('wsStartupToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'wsStartupToast';
      toast.className = 'ws-startup-toast';
      toast.setAttribute('role', 'alert');
      toast.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="color:#fbbf24;margin-top:2px;flex-shrink:0;"></i>
        <div style="flex:1;min-width:0;">
          <strong style="display:block;color:#fde68a;margin-bottom:2px;">Server WebSocket irraggiungibile</strong>
          <span id="wsStartupToastMsg"></span>
        </div>
        <button type="button" id="wsStartupToastClose" class="regia-ws-alert-close" aria-label="Chiudi">&times;</button>
      `;
      document.body.appendChild(toast);
      const closeBtn = document.getElementById('wsStartupToastClose');
      closeBtn?.addEventListener('click', () => {
        this.alertDismissedByUser = true;
        if (toast) toast.hidden = true;
      });
    }
    const msgEl = document.getElementById('wsStartupToastMsg');
    if (msgEl) msgEl.textContent = message;
    toast.hidden = false;
  }

  private handleIncomingData(data: any, origin: 'websocket' | 'broadcast_channel') {
    if (!data || !data.type) return;

    const handledByController = realtimeSync.dispatchIncomingMessage(data, origin);

    switch (data.type) {
      case 'NUMBER_EXTRACTED':
      case 'REGIA_EXTRACT':
        if (!handledByController) {
          this.handleExtractionEvent(data);
        }
        break;

      case 'TIMER_STARTED':
      case 'REGIA_START_TIMER':
        regiaStateManager.syncExtractionState({ isRunning: true });
        this.handleTimerStatus(true);
        break;

      case 'TIMER_PAUSED':
      case 'REGIA_PAUSE_TIMER':
        regiaStateManager.syncExtractionState({ isRunning: false });
        this.handleTimerStatus(false);
        break;

      case 'GAME_RESET':
      case 'REGIA_RESET_GAME':
        if (!handledByController) {
          this.handleGameReset();
        }
        break;

      case 'WIN_DECLARED':
        if (!handledByController) {
          this.handleWinDeclared(data);
        }
        break;

      case 'UNCLAIMED_UPDATED':
      case 'UPDATE_UNCLAIMED':
        if (!handledByController) {
          this.updateUnclaimedPot(data.unclaimedPot);
        }
        break;

      case 'PRIZE_POOL_UPDATED':
      case 'UPDATE_PRIZES':
      case 'UPDATE_PRIZE_POOL':
        if (!handledByController && typeof data.prizePool === 'number') {
          regiaStateManager.syncPrizesState({
            prizePool: data.prizePool,
            currency: data.currency || undefined,
          });
        }
        break;

      case 'COLORS_UPDATED':
      case 'UPDATE_COLORS':
        if (!handledByController && data.colors && typeof data.colors === 'object') {
          const prevColors = regiaStateManager.getState().colors;
          regiaStateManager.syncColorsState({
            blue: { count: prevColors.blue.count, active: Boolean(data.colors.blue) },
            orange: { count: prevColors.orange.count, active: Boolean(data.colors.orange) },
            green: { count: prevColors.green.count, active: Boolean(data.colors.green) },
            yellow: { count: prevColors.yellow.count, active: Boolean(data.colors.yellow) },
          });
        }
        break;

      case 'GRAPHICS_UPDATED':
      case 'UPDATE_GRAPHICS':
        if (!handledByController && data.tvGraphics && typeof data.tvGraphics === 'object') {
          regiaStateManager.syncGraphicsState(data.tvGraphics);
        }
        break;

      case 'STATE_INIT':
      case 'FULL_STATE_SYNC':
      case 'SYNC_FULL_STATE':
        if (!handledByController && data.state) {
          this.handleStateInit(data.state);
        }
        break;

      default:
        break;
    }
  }

  private handleExtractionEvent(data: ExtractionPayload) {
    const num = Number(data.number);
    if (!num || num < 1 || num > 90) return;

    const tombolaGame = (window as any).__tombolaGame;
    if (tombolaGame && typeof tombolaGame.processExtractedNumber === 'function') {
      tombolaGame.processExtractedNumber(num, true, data.smorfia);
      return;
    }

    this.updateBoardCell(num);
    this.updateCurrentNumberDisplay(num, data.smorfia);
    this.updateGameCounters();
    this.updateLastNumbersStrip(num);
  }

  private updateBoardCell(num: number) {
    const cell = document.getElementById(`number-${num}`);
    if (cell && !cell.classList.contains('extracted')) {
      cell.classList.remove('flip-circle', 'flipping-to-green-phase1', 'flipping-to-green-phase2');
      cell.classList.add('extracted');

      setTimeout(() => {
        if (cell.classList.contains('extracted')) {
          cell.classList.add('flipping-to-green-phase1');
          setTimeout(() => {
            if (cell.classList.contains('extracted')) {
              cell.classList.remove('flipping-to-green-phase1');
              cell.classList.add('flip-circle', 'flipping-to-green-phase2');
              setTimeout(() => {
                if (cell.classList.contains('extracted')) {
                  cell.classList.remove('flipping-to-green-phase2');
                }
              }, 450);
            }
          }, 400);
        }
      }, 2500);
    }

    const regiaCell = document.getElementById(`regia-cell-${num}`);
    if (regiaCell) {
      regiaCell.classList.add('extracted');
    }
  }

  private updateCurrentNumberDisplay(num: number, customSmorfia?: string) {
    const currentNumEl = document.getElementById('currentNumber');
    if (currentNumEl) {
      currentNumEl.textContent = String(num);
      currentNumEl.classList.remove('extract-animation');
      void currentNumEl.offsetWidth;
      currentNumEl.classList.add('extract-animation');
      setTimeout(() => {
        currentNumEl.classList.remove('extract-animation');
      }, 1000);
    }

    if (customSmorfia) {
      const smorfiaEl = document.getElementById('smorfiaText');
      if (smorfiaEl) smorfiaEl.textContent = customSmorfia;
    }
  }

  private updateGameCounters() {
    const extractedCells = document.querySelectorAll('.number.extracted, .number.flip-circle');
    const count = extractedCells.length;
    const remaining = Math.max(0, 90 - count);
    const progress = Math.min(100, Math.round((count / 90) * 100));

    const extractedEl = document.getElementById('extractedCount');
    if (extractedEl) extractedEl.textContent = String(count);

    const remainingEl = document.getElementById('remainingCount');
    if (remainingEl) remainingEl.textContent = String(remaining);

    const progressEl = document.getElementById('extractionProgress');
    if (progressEl) progressEl.style.width = `${progress}%`;

    const progressTextEl = document.getElementById('progressText');
    if (progressTextEl) progressTextEl.textContent = `${progress}%`;
  }

  private updateLastNumbersStrip(num: number) {
    const lastNumbers = document.querySelectorAll<HTMLElement>('.last-number-vertical');
    if (lastNumbers.length > 0) {
      for (let i = lastNumbers.length - 1; i > 0; i--) {
        lastNumbers[i].textContent = lastNumbers[i - 1].textContent;
        lastNumbers[i].style.background = '#1565c0';
        lastNumbers[i].style.transform = 'scale(1)';
        lastNumbers[i].style.border = '2px solid white';
      }
      lastNumbers[0].textContent = String(num);
      lastNumbers[0].style.background = '#2ecc71';
      lastNumbers[0].style.border = '2px solid gold';
      lastNumbers[0].style.transform = 'scale(1.1)';
    }
  }

  private handleTimerStatus(isRunning: boolean) {
    const badge = document.getElementById('countdownStatusBadge');
    const text = document.getElementById('countdownStatusText');
    if (badge && text) {
      if (isRunning) {
        badge.className = 'countdown-status-badge live';
        text.textContent = 'LIVE';
      } else {
        badge.className = 'countdown-status-badge paused';
        text.textContent = 'PAUSA';
      }
    }
  }

  private handleGameReset() {
    const tombolaGame = (window as any).__tombolaGame;
    if (tombolaGame && typeof tombolaGame.resetGame === 'function') {
      tombolaGame.resetGame(true);
      return;
    }

    document.querySelectorAll('.number').forEach((cell) => {
      cell.classList.remove('extracted', 'flip-circle', 'flipping-to-green-phase1', 'flipping-to-green-phase2', 'board-cell-win');
    });

    const currentNumEl = document.getElementById('currentNumber');
    if (currentNumEl) currentNumEl.textContent = '--';

    const smorfiaEl = document.getElementById('smorfiaText');
    if (smorfiaEl) smorfiaEl.textContent = 'In attesa di estrazione...';

    this.updateGameCounters();
  }

  private handleWinDeclared(data: any) {
    const tombolaGame = (window as any).__tombolaGame;
    if (tombolaGame && typeof tombolaGame.highlightWinningElements === 'function') {
      tombolaGame.highlightWinningElements(
        data.winType,
        data.winningCartellaIds || [],
        data.winningNumbers || [],
        data.winningRowIndex
      );
    }
  }

  private updateUnclaimedPot(amount: number) {
    if (typeof amount === 'number') {
      regiaStateManager.syncPrizesState({ unclaimedCurrentGame: amount });
    }
  }

  private handleStateInit(state: any) {
    if (!state) return;
    if (Array.isArray(state.extractedNumbers) && state.extractedNumbers.length > 0) {
      const tombolaGame = (window as any).__tombolaGame;
      if (tombolaGame && typeof tombolaGame.processExtractedNumber === 'function') {
        state.extractedNumbers.forEach((n: number) => tombolaGame.processExtractedNumber(n, true));
      } else {
        state.extractedNumbers.forEach((n: number) => this.updateBoardCell(n));
        this.updateGameCounters();
      }
    }
    if (state.unclaimedPot !== undefined) {
      this.updateUnclaimedPot(state.unclaimedPot);
    }
    if (state.currentNumber) {
      this.updateCurrentNumberDisplay(state.currentNumber);
    }
  }
}

export { regiaStateManager };
export const clientWsManager = new ClientWebSocketManager();
if (typeof window !== 'undefined') {
  (window as any).ClientWsManager = clientWsManager;
  (window as any).initializeWebSocketChannel = initializeWebSocketChannel;
}
