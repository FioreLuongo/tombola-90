/**
 * Tombola-90 Real-Time WebSocket & BroadcastChannel Synchronization Service
 * Sincronizza istantaneamente la Console Regia e lo Schermo TV Studio senza ricaricare la pagina.
 */

export interface RealtimeMessage {
  type: string;
  [key: string]: any;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

class TombolaRealtimeSyncService {
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 8000;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private statusListeners: Set<(status: ConnectionStatus, clientCount: number) => void> = new Set();
  private connectedClientCount = 1;
  private isProcessingRemote = false;
  private currentLatency = 0;
  private latencyListeners: Set<(latency: number, quality: 'excellent' | 'good' | 'fair') => void> = new Set();

  constructor() {
    this.initBroadcastChannel();
    this.connect();
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('tombola90_realtime_channel');
        this.broadcastChannel.onmessage = (event) => {
          if (event && event.data) {
            this.handleIncomingMessage(event.data, 'broadcast_channel');
          }
        };
      } catch (err) {
        console.warn('[RealtimeSync] BroadcastChannel non supportato o bloccato:', err);
      }
    }
  }

  public connect() {
    if (typeof window === 'undefined') return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[RealtimeSync] ⚡ Connessione WebSocket attiva con il server!');
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingMessage(data, 'websocket');
        } catch (err) {
          console.error('[RealtimeSync] Errore parsing messaggio WS:', err);
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[RealtimeSync] Avviso connessione WebSocket (attivo fallback locale):', err);
        this.setStatus('error');
      };
    } catch (e) {
      console.warn('[RealtimeSync] Impossibile avviare WebSocket:', e);
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private sendPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'PING', clientTime: Date.now() }));
      } catch (e) {
        // Ignora errori di invio transitori
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Invia subito primo ping di misurazione
    this.sendPing();
    // Aggiornamento frequente ogni 3.5 secondi per dare feedback immediato all'amministratore
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 3500);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private updateQualityHUD(latency: number) {
    if (typeof document === 'undefined') return;

    // 1. Trigger animazione battito (Heartbeat beat)
    const dot = document.getElementById('wsHeartbeatDot');
    if (dot) {
      dot.classList.remove('beat');
      void dot.offsetWidth; // Forza reflow CSS
      dot.classList.add('beat');
    }

    // 2. Classificazione della qualità: excellent (<60ms), good (<160ms), fair (>=160ms)
    let quality: 'excellent' | 'good' | 'fair' = 'excellent';
    if (latency >= 160) {
      quality = 'fair';
    } else if (latency >= 60) {
      quality = 'good';
    }

    // 3. Aggiorna tacche segnale
    const bars = document.getElementById('wsSignalBars');
    if (bars) {
      bars.className = `ws-signal-bars ${quality}`;
    }

    // 4. Aggiorna pillola latenza ms
    const pill = document.getElementById('wsLatencyPill');
    if (pill) {
      pill.className = `ws-latency-pill ${quality}`;
    }

    const val = document.getElementById('wsLatencyVal');
    if (val) {
      val.textContent = `${latency} ms`;
    }

    // 5. Notifica ascoltatori
    this.latencyListeners.forEach((cb) => {
      try {
        cb(latency, quality);
      } catch (err) {
        console.error(err);
      }
    });
  }

  private resetQualityHUD(status: ConnectionStatus) {
    if (typeof document === 'undefined') return;
    const bars = document.getElementById('wsSignalBars');
    const pill = document.getElementById('wsLatencyPill');
    const val = document.getElementById('wsLatencyVal');

    if (status === 'connected') {
      if (bars && !bars.classList.contains('excellent') && !bars.classList.contains('good')) {
        bars.className = 'ws-signal-bars excellent';
      }
      if (pill && !pill.classList.contains('excellent') && !pill.classList.contains('good')) {
        pill.className = 'ws-latency-pill excellent';
      }
    } else if (status === 'connecting') {
      if (bars) bars.className = 'ws-signal-bars';
      if (pill) pill.className = 'ws-latency-pill';
      if (val) val.textContent = '... ms';
    } else {
      if (bars) bars.className = 'ws-signal-bars offline';
      if (pill) pill.className = 'ws-latency-pill offline';
      if (val) val.textContent = '-- ms';
    }
  }

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    this.resetQualityHUD(newStatus);
    this.statusListeners.forEach((cb) => {
      try {
        cb(newStatus, this.connectedClientCount);
      } catch (e) {
        console.error(e);
      }
    });
  }

  private handleIncomingMessage(msg: RealtimeMessage, origin: string) {
    if (!msg || !msg.type) return;

    if (msg.type === 'CLIENT_COUNT' && typeof msg.count === 'number') {
      this.connectedClientCount = msg.count;
      this.setStatus(this.status);
      return;
    }

    if (msg.type === 'PONG') {
      const now = Date.now();
      const latency = typeof msg.clientTime === 'number' ? Math.max(1, now - msg.clientTime) : 12;
      this.currentLatency = latency;
      this.updateQualityHUD(latency);
      return;
    }

    // Dispatche to registered handlers
    const handlers = this.listeners.get(msg.type);
    if (handlers) {
      this.isProcessingRemote = true;
      try {
        handlers.forEach((handler) => {
          try {
            handler(msg);
          } catch (err) {
            console.error(`[RealtimeSync] Errore listener ${msg.type}:`, err);
          }
        });
      } finally {
        this.isProcessingRemote = false;
      }
    }
  }

  public send(msg: RealtimeMessage) {
    if (this.isProcessingRemote) return; // Prevent loops

    const payload = JSON.stringify(msg);

    // 1. Send via WebSocket to remote server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
      } catch (err) {
        console.warn('[RealtimeSync] Invio WS fallito:', err);
      }
    }

    // 2. Also send via BroadcastChannel for zero-latency local multi-tab / 2nd screen
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn('[RealtimeSync] Invio BroadcastChannel fallito:', err);
      }
    }
  }

  // High-Level Action Emitters
  public broadcastExtract(number: number, smorfia: string = '') {
    this.send({
      type: 'REGIA_EXTRACT',
      number,
      smorfia,
      timestamp: Date.now()
    });
  }

  public broadcastStartTimer(interval?: number) {
    this.send({
      type: 'REGIA_START_TIMER',
      interval,
      timestamp: Date.now()
    });
  }

  public broadcastPauseTimer() {
    this.send({
      type: 'REGIA_PAUSE_TIMER',
      timestamp: Date.now()
    });
  }

  public broadcastResetGame(preserveUnclaimed: boolean = true, prizePool?: number, currency?: string) {
    this.send({
      type: 'REGIA_RESET_GAME',
      preserveUnclaimed,
      prizePool,
      currency,
      timestamp: Date.now()
    });
  }

  public broadcastWin(winType: string, winningCartellaIds: string[], winningNumbers: number[], winningRowIndex?: number) {
    this.send({
      type: 'WIN_DECLARED',
      winType,
      winningCartellaIds,
      winningNumbers,
      winningRowIndex,
      timestamp: Date.now()
    });
  }

  public broadcastUnclaimedUpdate(unclaimedPot: number) {
    this.send({
      type: 'UPDATE_UNCLAIMED',
      unclaimedPot,
      timestamp: Date.now()
    });
  }

  public broadcastPrizePoolUpdate(prizePool: number, currency: string) {
    this.send({
      type: 'UPDATE_PRIZE_POOL',
      prizePool,
      currency,
      timestamp: Date.now()
    });
  }

  public broadcastGraphicsUpdate(tvGraphics: any) {
    this.send({
      type: 'UPDATE_GRAPHICS',
      tvGraphics,
      timestamp: Date.now()
    });
  }

  public broadcastFullState(state: any) {
    this.send({
      type: 'SYNC_FULL_STATE',
      state,
      timestamp: Date.now()
    });
  }

  // Listener Registration
  public on(type: string, callback: (data: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => this.off(type, callback);
  }

  public off(type: string, callback: (data: any) => void) {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(callback);
    }
  }

  public onStatusChange(callback: (status: ConnectionStatus, clientCount: number) => void) {
    this.statusListeners.add(callback);
    // Emit immediate current status
    callback(this.status, this.connectedClientCount);
    return () => this.statusListeners.delete(callback);
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getClientCount(): number {
    return this.connectedClientCount;
  }

  public getLatency(): number {
    return this.currentLatency;
  }

  public onLatencyChange(callback: (latency: number, quality: 'excellent' | 'good' | 'fair') => void) {
    this.latencyListeners.add(callback);
    if (this.currentLatency > 0) {
      let quality: 'excellent' | 'good' | 'fair' = 'excellent';
      if (this.currentLatency >= 160) quality = 'fair';
      else if (this.currentLatency >= 60) quality = 'good';
      callback(this.currentLatency, quality);
    }
    return () => this.latencyListeners.delete(callback);
  }
}

export const realtimeSync = new TombolaRealtimeSyncService();

if (typeof window !== 'undefined') {
  (window as any).TombolaSync = realtimeSync;
}
