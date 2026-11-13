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
  sendRealtimeMessage,
  setCustomWebSocketUrl,
} from './websocket';

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

class ClientWebSocketManager {
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
    setCustomWebSocketUrl(customUrl);
    this.verifyWebSocketConnectionOnStartup();
  }

  public reconnect() {
    this.clearStartupCheckTimer();
    this.startupVerified = false;
    reconnectWebSocket();
    this.verifyWebSocketConnectionOnStartup();
  }

  public disconnect() {
    this.clearStartupCheckTimer();
    disconnectWebSocket(false);
  }

  public connect() {
    if (typeof window === 'undefined') return;

    initWebSocket({
      role: this.getClientRole(),
      onMessage: (data, origin) => this.handleIncomingData(data, origin),
      onStatusChange: (status: ConnectionStatus, clientCount: number, fallbackActive: boolean) => {
        const transport = getTransportState();
        regiaStateManager.syncConnectionState({
          status,
          clientCount,
          fallbackActive,
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
        });
        console.warn(`[WS-Fallback] ${reason} -> tentativo fallback relativo su ${relativeUrl}`);
        regiaStateManager.addLog(
          `🔄 Server esterno irraggiungibile: fallback automatico su URL relativo (${relativeUrl}).`,
          'warn'
        );
      },
      onFallbackActivated: (reason: string) => {
        this.clearStartupCheckTimer();
        regiaStateManager.syncConnectionState({ fallbackActive: true });
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
        });
      },
      onRawLog: (message, level) => {
        if (level === 'error') console.error(message);
        else if (level === 'warn') console.warn(message);
        else console.info(message);
      },
    });
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
   * - Se il server è irraggiungibile entro timeoutMs, conferma fallback BroadcastChannel
   *   e mostra la notifica nella UI della Regia.
   */
  public verifyWebSocketConnectionOnStartup(timeoutMs: number = STARTUP_CHECK_TIMEOUT_MS) {
    this.clearStartupCheckTimer();
    const state = getTransportState();
    const cfg = resolveRuntimeAppConfig();
    const targetUrl = state.wsUrl || cfg.wsUrl;

    console.info(
      `[WS-Startup] Verifica connessione all'avvio | ambiente=${cfg.environment} | appUrl=${cfg.appUrl} | wsUrl=${targetUrl || 'non configurato'} | fallback=${state.fallbackActive}`
    );
    regiaStateManager.addLog(
      `Verifica WebSocket all'avvio (${cfg.environment.toUpperCase()}): ${targetUrl || 'nessun server remoto -> BroadcastChannel'}`,
      'info'
    );

    if (state.status === 'connected') {
      this.startupVerified = true;
      this.hideUnreachableNotification();
      return;
    }

    if (!targetUrl) return;

    this.startupCheckTimer = setTimeout(() => {
      const current = getTransportState();
      if (!this.startupVerified && current.status !== 'connected') {
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

  private notifyServerUnreachable(reason: string) {
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
        if (!handledByController && typeof data.prizePool === 'number') {
          regiaStateManager.syncPrizesState({
            prizePool: data.prizePool,
            currency: data.currency || undefined,
          });
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
(window as any).ClientWsManager = clientWsManager;
