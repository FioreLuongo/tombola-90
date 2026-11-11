import './tombola-luxury.css';
import * as jackpotService from './firebase-jackpot-service';
(window as any).JackpotService = jackpotService;
import './realtime-sync';
import './tombola-controller.js';
import './online-guide-manager';

/**
 * ============================================================================
 * GESTORE WEBSOCKET LATO CLIENT (TV STUDIO & TABELLONE LIVE)
 * ============================================================================
 * Ascolta in tempo reale gli eventi di estrazione trasmessi dalla Console Regia
 * e aggiorna istantaneamente il tabellone a 90 numeri, i contatori di gioco,
 * la Smorfia e la visualizzazione senza ricaricare la pagina.
 */

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
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 8000;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    // Connetti WebSocket quando la pagina è pronta
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.connect());
    } else {
      this.connect();
    }
  }

  public connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.updateWsBadge('connecting', 'Connessione WS...');

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log(`[WS-Client] Connessione a ${wsUrl}...`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log('⚡ [WS-Client] Connesso con successo al server WebSocket!');
        this.updateWsBadge('active', 'WS Live (TV Connessa)');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (err) {
          console.error('[WS-Client] Errore parsing messaggio:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.stopHeartbeat();
        console.warn('[WS-Client] Connessione chiusa. Tentativo di riconnessione...');
        this.updateWsBadge('offline', 'WS In Riconnessione...');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        this.isConnecting = false;
        console.warn('[WS-Client] Errore socket (attivo fallback locale):', err);
        this.updateWsBadge('offline', 'WS Offline (Locale)');
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const sendPing = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'PING', clientTime: Date.now() }));
        } catch (e) {
          // ignore
        }
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

  /**
   * Smistamento eventi in tempo reale inviati dalla Regia
   */
  private handleServerMessage(data: any) {
    if (!data || !data.type) return;

    switch (data.type) {
      // 1. Estrazione Numero da Regia
      case 'NUMBER_EXTRACTED':
      case 'REGIA_EXTRACT':
        this.handleExtractionEvent(data);
        break;

      // 2. Timer avviato
      case 'TIMER_STARTED':
      case 'REGIA_START_TIMER':
        this.handleTimerStatus(true);
        break;

      // 3. Timer in pausa
      case 'TIMER_PAUSED':
      case 'REGIA_PAUSE_TIMER':
        this.handleTimerStatus(false);
        break;

      // 4. Reset Partita da Regia
      case 'GAME_RESET':
      case 'REGIA_RESET_GAME':
        this.handleGameReset();
        break;

      // 5. Vincita dichiarata (Ambo, Terno, Tombola, ecc.)
      case 'WIN_DECLARED':
        this.handleWinDeclared(data);
        break;

      // 6. Aggiornamento Montepremi Non Vinti
      case 'UNCLAIMED_UPDATED':
        this.updateUnclaimedPot(data.unclaimedPot);
        break;

      // 7. Conteggio schermi/client connessi
      case 'CLIENT_COUNT':
        if (typeof data.count === 'number') {
          this.updateWsBadge('active', `WS Live (${data.count} ${data.count === 1 ? 'schermo' : 'schermi'})`);
        }
        break;

      // 8. Stato iniziale al momento della connessione
      case 'STATE_INIT':
        this.handleStateInit(data.state);
        break;

      // 9. Pong di misurazione latenza
      case 'PONG': {
        const latency = typeof data.clientTime === 'number' ? Math.max(1, Date.now() - data.clientTime) : 12;
        this.updateLatencyUI(latency);
        break;
      }

      default:
        break;
    }
  }

  /**
   * Aggiorna automaticamente il Tabellone a 90 numeri e i Contatori di Gioco
   */
  private handleExtractionEvent(data: ExtractionPayload) {
    const num = Number(data.number);
    if (!num || num < 1 || num > 90) return;

    console.log(`⚡ [WS-Client] Ricevuta estrazione in tempo reale dalla Regia: NUMERO ${num}`);

    // 1. Se il controller tombola principale è pronto, elabora logica cartelle e audio
    const tombolaGame = (window as any).__tombolaGame;
    if (tombolaGame && typeof tombolaGame.processExtractedNumber === 'function') {
      tombolaGame.processExtractedNumber(num, true, data.smorfia);
      return; // processExtractedNumber gestisce l'aggiornamento completo
    }

    // 2. Aggiornamento Diretto DOM del Tabellone a 90 numeri (Fallback / Rendering Istantaneo)
    this.updateBoardCell(num);

    // 3. Aggiorna Numero Gigante e Smorfia
    this.updateCurrentNumberDisplay(num, data.smorfia);

    // 4. Aggiorna Contatori di Gioco (Estratti, Rimanenti, Percentuale)
    this.updateGameCounters();

    // 5. Aggiorna Striscia Ultimi Numeri
    this.updateLastNumbersStrip(num);
  }

  private updateBoardCell(num: number) {
    const cell = document.getElementById(`number-${num}`);
    if (cell && !cell.classList.contains('extracted')) {
      cell.classList.remove('flip-circle', 'flipping-to-green-phase1', 'flipping-to-green-phase2');
      cell.classList.add('extracted');

      // Animazione 3D verso tessera verde smeraldo con smusso dorato
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

    // Aggiorna anche cella nel mini-tabellone Regia se presente
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
      void currentNumEl.offsetWidth; // Trigger reflow
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
    console.log('[WS-Client] Reset partita ricevuto dalla Regia.');
    const tombolaGame = (window as any).__tombolaGame;
    if (tombolaGame && typeof tombolaGame.resetGame === 'function') {
      tombolaGame.resetGame(true);
      return;
    }

    // Reset DOM tabellone e contatori
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
      if (unclaimedEl) {
        unclaimedEl.textContent = `€ ${amount.toFixed(2)}`;
      }
      const regiaUnclaimedEl = document.getElementById('regiaUnclaimedVal');
      if (regiaUnclaimedEl) {
        regiaUnclaimedEl.textContent = `€ ${amount.toFixed(2)}`;
      }
    }
  }

  private handleStateInit(state: any) {
    if (!state) return;
    if (Array.isArray(state.extractedNumbers) && state.extractedNumbers.length > 0) {
      state.extractedNumbers.forEach((n: number) => this.updateBoardCell(n));
      this.updateGameCounters();
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
    }
  }
}

// Inizializza il gestore WebSocket globale lato client
export const clientWsManager = new ClientWebSocketManager();
(window as any).ClientWsManager = clientWsManager;
