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

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25000);
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

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
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

    if (msg.type === 'PONG') return;

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
}

export const realtimeSync = new TombolaRealtimeSyncService();

if (typeof window !== 'undefined') {
  (window as any).TombolaSync = realtimeSync;
}
