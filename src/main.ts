import './tombola-luxury.css';
import * as jackpotService from './firebase-jackpot-service';
(window as any).JackpotService = jackpotService;
import { realtimeSync, type ConnectionStatus, type RealtimeMessage } from './realtime-sync';
import './tombola-controller.js';
import './online-guide-manager';
import { resolveWebSocketUrl } from './utils/ws-url';

/**
 * ============================================================================
 * GESTORE CONNESSIONE WEBSOCKET IN TEMPO REALE (REGIA <-> SCHERMO TV)
 * ============================================================================
 * Unifica la connessione WebSocket + BroadcastChannel per sincronizzare
 * istantaneamente il tabellone a 90 numeri, le cartelle, i contatori e le vincite
 * tra la Console Regia e lo Schermo TV Studio utilizzando l'URL di hosting
 * configurato (VITE_WS_URL, VITE_APP_URL, APP_URL, ?ws=, o window.location).
 */

const CUSTOM_WS_STORAGE_KEY = 'tombola90_ws_url';
const BROADCAST_CHANNEL_NAME = 'tombola90_realtime_channel';

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
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 8000;
  private currentWsUrl: string | null = null;
  private status: ConnectionStatus = 'disconnected';
  private connectedClientCount = 1;
  private currentLatency = 0;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    this.initBroadcastChannel();
    this.bindRealtimeBus();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.connect());
    } else {
      this.connect();
    }
  }

  private bindRealtimeBus() {
    realtimeSync.bindTransport({
      send: (msg: RealtimeMessage) => this.send(msg),
      connect: () => this.connect(),
      getStatus: () => this.status,
      getClientCount: () => this.connectedClientCount,
      getLatency: () => this.currentLatency,
    });
  }

  private initBroadcastChannel() {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event: MessageEvent) => {
        if (event?.data) {
          this.handleIncomingData(event.data, 'broadcast_channel');
        }
      };
    } catch (err) {
      console.warn('[WS-Client] BroadcastChannel non disponibile:', err);
    }
  }

  private getConfiguredHostingUrl(): string {
    const fromViteApp = typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL
      ? import.meta.env.VITE_APP_URL
      : '';
    const fromDefine = typeof __APP_HOSTING_URL__ !== 'undefined' ? __APP_HOSTING_URL__ : '';
    return fromViteApp || fromDefine || '';
  }

  public resolveTargetWsUrl(): string | null {
    if (typeof window === 'undefined') return null;

    let storedWsUrl: string | null = null;
    try {
      storedWsUrl = window.localStorage.getItem(CUSTOM_WS_STORAGE_KEY);
    } catch {
      storedWsUrl = null;
    }

    const viteWsUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_WS_URL : undefined;
    const viteAppUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_APP_URL : undefined;
    const configuredAppUrl = typeof __APP_HOSTING_URL__ !== 'undefined' ? __APP_HOSTING_URL__ : undefined;

    return resolveWebSocketUrl({
      search: window.location.search,
      storedWsUrl,
      viteWsUrl,
      viteAppUrl,
      configuredAppUrl,
      windowProtocol: window.location.protocol,
      windowHost: window.location.host,
      windowHostname: window.location.hostname,
    });
  }

  public getWsUrl(): string | null {
    return this.currentWsUrl || this.resolveTargetWsUrl();
  }

  public getHostingUrl(): string {
    return this.getConfiguredHostingUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  }

  public getClientRole(): 'tv' | 'regia' {
    if (typeof window === 'undefined') return 'regia';
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'tv' || params.get('mode') === 'tv' ? 'tv' : 'regia';
  }

  public setCustomWsUrl(customUrl: string | null) {
    if (typeof window === 'undefined') return;
    try {
      if (customUrl && customUrl.trim()) {
        window.localStorage.setItem(CUSTOM_WS_STORAGE_KEY, customUrl.trim());
      } else {
        window.localStorage.removeItem(CUSTOM_WS_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures
    }
    this.reconnectAttempts = 0;
    this.disconnect();
    this.connect();
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.isConnecting = false;
  }

  public connect() {
    if (typeof window === 'undefined') return;
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    const wsUrl = this.resolveTargetWsUrl();
    this.currentWsUrl = wsUrl;

    if (!wsUrl) {
      this.status = 'disconnected';
      this.updateWsBadge('offline', 'WS Locale (BroadcastChannel)');
      realtimeSync.notifyStatus('disconnected', this.connectedClientCount);
      console.info('[WS-Client] Nessun endpoint WebSocket remoto configurato: attivo sync locale via BroadcastChannel.');
      return;
    }

    this.isConnecting = true;
    this.status = 'connecting';
    this.updateWsBadge('connecting', 'Connessione WS...');
    realtimeSync.notifyStatus('connecting', this.connectedClientCount);

    try {
      console.log(`[WS-Client] Connessione real-time (${this.getClientRole()}) a ${wsUrl}...`);
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.status = 'connected';

        console.log(`⚡ [WS-Client] Connesso con successo a ${wsUrl}`);
        this.updateWsBadge('active', `WS Live (${this.connectedClientCount} ${this.connectedClientCount === 1 ? 'schermo' : 'schermi'})`);
        realtimeSync.notifyStatus('connected', this.connectedClientCount);

        // Registra il ruolo (Regia o TV Studio) e l'URL di hosting
        this.sendWsOnly({
          type: 'REGISTER_CLIENT',
          role: this.getClientRole(),
          hostingUrl: this.getHostingUrl(),
          timestamp: Date.now(),
        });

        this.startHeartbeat();
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingData(data, 'websocket');
        } catch (err) {
          console.error('[WS-Client] Errore parsing messaggio WebSocket:', err);
        }
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.isConnecting = false;
        this.ws = null;
        this.stopHeartbeat();
        this.status = 'disconnected';
        console.warn('[WS-Client] Connessione WebSocket chiusa. Riconnessione programmata...');
        this.updateWsBadge('offline', 'WS In Riconnessione...');
        realtimeSync.notifyStatus('disconnected', this.connectedClientCount);
        this.scheduleReconnect();
      };

      socket.onerror = (err) => {
        if (this.ws !== socket) return;
        this.isConnecting = false;
        this.status = 'error';
        console.warn('[WS-Client] Errore socket (attivo fallback BroadcastChannel):', err);
        this.updateWsBadge('offline', 'WS Locale (Fallback)');
        realtimeSync.notifyStatus('error', this.connectedClientCount);
      };
    } catch (e) {
      this.isConnecting = false;
      this.status = 'disconnected';
      realtimeSync.notifyStatus('disconnected', this.connectedClientCount);
      this.scheduleReconnect();
    }
  }

  private sendWsOnly(msg: RealtimeMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        console.warn('[WS-Client] Errore invio WebSocket:', err);
      }
    }
  }

  public send(msg: RealtimeMessage) {
    this.sendWsOnly(msg);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn('[WS-Client] Errore invio BroadcastChannel:', err);
      }
    }
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

  private startHeartbeat() {
    this.stopHeartbeat();
    const sendPing = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendWsOnly({ type: 'PING', clientTime: Date.now() });
      }
    };
    sendPing();
    this.pingInterval = setInterval(sendPing, 3500);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleIncomingData(data: any, origin: 'websocket' | 'broadcast_channel') {
    if (!data || !data.type) return;

    if (data.type === 'CLIENT_COUNT') {
      if (typeof data.count === 'number') {
        this.connectedClientCount = data.count;
        const badgeLabel = `WS Live (${data.count} ${data.count === 1 ? 'schermo' : 'schermi'})`;
        this.updateWsBadge(this.status === 'connected' ? 'active' : 'connecting', badgeLabel);
        realtimeSync.notifyStatus(this.status, data.count);
      }
      return;
    }

    if (data.type === 'PONG') {
      const latency = typeof data.clientTime === 'number' ? Math.max(1, Date.now() - data.clientTime) : 12;
      this.currentLatency = latency;
      this.updateLatencyUI(latency);
      realtimeSync.notifyLatency(latency);
      return;
    }

    // Inoltra al controller di gioco tramite il bus TombolaSync
    const handledByController = realtimeSync.dispatchIncomingMessage(data, origin);

    // Sincronizzazione diretta del tabellone e stato HUD
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
        if (typeof data.connectedClients === 'number') {
          this.connectedClientCount = data.connectedClients;
          this.updateWsBadge(
            'active',
            `WS Live (${data.connectedClients} ${data.connectedClients === 1 ? 'schermo' : 'schermi'})`
          );
          realtimeSync.notifyStatus(this.status, data.connectedClients);
        }
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
    if (badge) {
      badge.className = `regia-ws-badge ${status}`;
      if (this.currentWsUrl) {
        badge.title = `WebSocket Live: ${this.currentWsUrl}`;
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
    } else if (status === 'active' && this.currentLatency === 0) {
      if (bars) bars.className = 'ws-signal-bars excellent';
      if (pill) pill.className = 'ws-latency-pill excellent';
    }
  }
}

export const clientWsManager = new ClientWebSocketManager();
(window as any).ClientWsManager = clientWsManager;
