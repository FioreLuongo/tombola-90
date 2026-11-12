import './tombola-luxury.css';
import * as jackpotService from './firebase-jackpot-service';
(window as any).JackpotService = jackpotService;
import { realtimeSync, type ConnectionStatus, type RealtimeMessage } from './realtime-sync';
import './tombola-controller.js';
import './online-guide-manager';
import { getAppBaseUrl, getWebSocketUrl, resolveRuntimeAppConfig } from './config';
import {
  disconnectWebSocket,
  getTransportState,
  initWebSocket,
  isBroadcastFallbackActive,
  reconnectWebSocket,
  sendRealtimeMessage,
  setCustomWebSocketUrl,
} from './websocket';

/**
 * ============================================================================
 * ORCHESTRATORE REAL-TIME LATO CLIENT (REGIA <-> SCHERMO TV)
 * ============================================================================
 * Utilizza initWebSocket() (src/websocket.ts) e gli URL di src/config.ts per
 * sincronizzare tabellone, contatori e vincite tra Console Regia e TV Studio,
 * con verifica all'avvio e attivazione automatica del fallback BroadcastChannel.
 */

const STARTUP_CHECK_TIMEOUT_MS = 4500;

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
        this.appendRegiaLog("Nuovo tentativo di connessione WebSocket avviato dall'operatore...", 'info');
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
        if (status === 'connected') {
          this.updateWsBadge('active', `WS Live (${clientCount} ${clientCount === 1 ? 'schermo' : 'schermi'})`);
        } else if (status === 'connecting') {
          this.updateWsBadge('connecting', 'Connessione WS...');
        } else {
          this.updateWsBadge(
            'offline',
            fallbackActive ? 'WS Locale (Fallback)' : 'WS In Riconnessione...'
          );
        }
        realtimeSync.notifyStatus(status, clientCount);
      },
      onConnected: (wsUrl: string) => {
        this.startupVerified = true;
        this.clearStartupCheckTimer();
        this.hideUnreachableNotification();
        console.log(`⚡ [WS-Client] Connesso con successo a ${wsUrl}`);
        this.appendRegiaLog(`⚡ WebSocket connesso in tempo reale (${wsUrl}).`, 'info');
      },
      onFallbackActivated: (reason: string) => {
        this.clearStartupCheckTimer();
        this.notifyServerUnreachable(reason);
      },
      onLatency: (latencyMs: number) => {
        this.updateLatencyUI(latencyMs);
        realtimeSync.notifyLatency(latencyMs);
      },
      onClientCount: (count: number) => {
        const state = getTransportState();
        this.updateWsBadge(
          state.status === 'connected' ? 'active' : 'connecting',
          `WS Live (${count} ${count === 1 ? 'schermo' : 'schermi'})`
        );
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
   * - Registra ambiente/URL nel log console e Regia
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
    this.appendRegiaLog(
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

  private appendRegiaLog(text: string, type: 'info' | 'win' | 'error' | 'warn' = 'info') {
    if (typeof document === 'undefined') return;
    const logContent = document.getElementById('regiaLogContent');
    if (!logContent) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timeStr = new Date().toLocaleTimeString('it-IT');
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${text}`;
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
  }

  private notifyServerUnreachable(reason: string) {
    console.error(`[WS-Startup] ❌ ${reason}`);
    this.appendRegiaLog(`⚠️ ${reason}`, 'error');

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
        this.handleTimerStatus(true);
        break;

      case 'TIMER_PAUSED':
      case 'REGIA_PAUSE_TIMER':
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
      const unclaimedEl = document.getElementById('unclaimedPotDisplay');
      if (unclaimedEl) unclaimedEl.textContent = `€ ${amount.toFixed(2)}`;
      const regiaUnclaimedEl = document.getElementById('regiaUnclaimedVal');
      if (regiaUnclaimedEl) regiaUnclaimedEl.textContent = `€ ${amount.toFixed(2)}`;
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

  private updateLatencyUI(latency: number) {
    const dot = document.getElementById('wsHeartbeatDot');
    if (dot) {
      dot.classList.remove('beat');
      void dot.offsetWidth;
      dot.classList.add('beat');
    }

    let quality: 'excellent' | 'good' | 'fair' = 'excellent';
    if (latency >= 160) quality = 'fair';
    else if (latency >= 60) quality = 'good';

    const bars = document.getElementById('wsSignalBars');
    if (bars) bars.className = `ws-signal-bars ${quality}`;

    const pill = document.getElementById('wsLatencyPill');
    if (pill) pill.className = `ws-latency-pill ${quality}`;

    const val = document.getElementById('wsLatencyVal');
    if (val) val.textContent = `${latency} ms`;
  }

  private updateWsBadge(status: 'active' | 'connecting' | 'offline', label: string) {
    const badge = document.getElementById('regiaWsBadge');
    const txt = document.getElementById('regiaWsText');
    const state = getTransportState();
    if (badge) {
      badge.className = `regia-ws-badge ${status}`;
      if (state.wsUrl) {
        badge.title = `WebSocket Live: ${state.wsUrl}`;
      }
    }
    if (txt) {
      txt.textContent = label;
    }
    const bars = document.getElementById('wsSignalBars');
    const pill = document.getElementById('wsLatencyPill');
    const val = document.getElementById('wsLatencyVal');
    if (status === 'offline') {
      if (bars) bars.className = 'ws-signal-bars offline';
      if (pill) pill.className = 'ws-latency-pill offline';
      if (val) val.textContent = '-- ms';
    } else if (status === 'connecting') {
      if (bars) bars.className = 'ws-signal-bars';
      if (pill) pill.className = 'ws-latency-pill';
      if (val) val.textContent = '... ms';
    } else if (status === 'active' && state.latencyMs === 0) {
      if (bars) bars.className = 'ws-signal-bars excellent';
      if (pill) pill.className = 'ws-latency-pill excellent';
    }
  }
}

export const clientWsManager = new ClientWebSocketManager();
(window as any).ClientWsManager = clientWsManager;
