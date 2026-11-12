/**
 * Tombola-90 Real-Time Synchronization Bus
 * Ponte eventi condiviso tra la Console Regia, lo Schermo TV Studio e ClientWebSocketManager (src/main.ts).
 * Mantiene una singola connessione WebSocket gestita centralmente da ClientWebSocketManager.
 */

export interface RealtimeMessage {
  type: string;
  [key: string]: any;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RealtimeTransport {
  send: (msg: RealtimeMessage) => void;
  connect?: () => void;
  getStatus: () => ConnectionStatus;
  getClientCount: () => number;
  getLatency: () => number;
}

const BROADCAST_TO_EVENT_ALIAS: Record<string, string> = {
  REGIA_EXTRACT: 'NUMBER_EXTRACTED',
  REGIA_START_TIMER: 'TIMER_STARTED',
  REGIA_PAUSE_TIMER: 'TIMER_PAUSED',
  REGIA_RESET_GAME: 'GAME_RESET',
  UPDATE_UNCLAIMED: 'UNCLAIMED_UPDATED',
  UPDATE_PRIZE_POOL: 'PRIZE_POOL_UPDATED',
  UPDATE_GRAPHICS: 'GRAPHICS_UPDATED',
  SYNC_FULL_STATE: 'FULL_STATE_SYNC',
};

class TombolaRealtimeSyncService {
  private transport: RealtimeTransport | null = null;
  private status: ConnectionStatus = 'disconnected';
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private statusListeners: Set<(status: ConnectionStatus, clientCount: number) => void> = new Set();
  private connectedClientCount = 1;
  private isProcessingRemote = false;
  private currentLatency = 0;
  private latencyListeners: Set<(latency: number, quality: 'excellent' | 'good' | 'fair') => void> = new Set();

  public bindTransport(transport: RealtimeTransport) {
    this.transport = transport;
    this.status = transport.getStatus();
    this.connectedClientCount = transport.getClientCount();
    this.currentLatency = transport.getLatency();
    this.emitStatus(this.status, this.connectedClientCount);
    if (this.currentLatency > 0) {
      this.emitLatency(this.currentLatency);
    }
  }

  public connect() {
    this.transport?.connect?.();
  }

  public notifyStatus(newStatus: ConnectionStatus, clientCount?: number) {
    this.status = newStatus;
    if (typeof clientCount === 'number') {
      this.connectedClientCount = clientCount;
    }
    this.emitStatus(this.status, this.connectedClientCount);
  }

  public notifyLatency(latency: number) {
    this.currentLatency = latency;
    this.emitLatency(latency);
  }

  private emitStatus(status: ConnectionStatus, clientCount: number) {
    this.statusListeners.forEach((cb) => {
      try {
        cb(status, clientCount);
      } catch (e) {
        console.error('[RealtimeSync] Errore status listener:', e);
      }
    });
  }

  private emitLatency(latency: number) {
    let quality: 'excellent' | 'good' | 'fair' = 'excellent';
    if (latency >= 160) quality = 'fair';
    else if (latency >= 60) quality = 'good';

    this.latencyListeners.forEach((cb) => {
      try {
        cb(latency, quality);
      } catch (err) {
        console.error('[RealtimeSync] Errore latency listener:', err);
      }
    });
  }

  public hasListeners(type: string): boolean {
    const direct = this.listeners.get(type);
    return Boolean(direct && direct.size > 0);
  }

  public dispatchIncomingMessage(msg: RealtimeMessage, origin: 'websocket' | 'broadcast_channel' = 'websocket'): boolean {
    if (!msg || !msg.type) return false;

    const mappedType = origin === 'broadcast_channel' && BROADCAST_TO_EVENT_ALIAS[msg.type]
      ? BROADCAST_TO_EVENT_ALIAS[msg.type]
      : msg.type;

    const normalizedMsg = mappedType !== msg.type ? { ...msg, type: mappedType } : msg;
    const handlers = this.listeners.get(mappedType);

    if (!handlers || handlers.size === 0) {
      return false;
    }

    this.isProcessingRemote = true;
    try {
      handlers.forEach((handler) => {
        try {
          handler(normalizedMsg);
        } catch (err) {
          console.error(`[RealtimeSync] Errore listener ${mappedType}:`, err);
        }
      });
    } finally {
      this.isProcessingRemote = false;
    }
    return true;
  }

  public send(msg: RealtimeMessage) {
    if (this.isProcessingRemote) return;
    if (this.transport) {
      this.transport.send(msg);
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
