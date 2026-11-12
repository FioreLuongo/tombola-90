import {
  CUSTOM_WS_STORAGE_KEY,
  getAppBaseUrl,
  getWebSocketUrl,
  resolveRuntimeAppConfig,
  type ResolvedAppConfig,
} from './config';
import type { ConnectionStatus, RealtimeMessage } from './realtime-sync';

export const BROADCAST_CHANNEL_NAME = 'tombola90_realtime_channel';
const MAX_RECONNECT_DELAY_MS = 8000;
const HEARTBEAT_INTERVAL_MS = 3500;

export interface WebSocketTransportState {
  status: ConnectionStatus;
  fallbackActive: boolean;
  wsUrl: string | null;
  hostingUrl: string;
  clientCount: number;
  latencyMs: number;
  lastError: string | null;
}

export interface InitWebSocketOptions {
  wsUrlOverride?: string | null;
  role?: 'regia' | 'tv';
  onMessage?: (data: RealtimeMessage, origin: 'websocket' | 'broadcast_channel') => void;
  onStatusChange?: (status: ConnectionStatus, clientCount: number, fallbackActive: boolean) => void;
  onFallbackActivated?: (reason: string, wsUrl: string | null) => void;
  onConnected?: (wsUrl: string) => void;
  onLatency?: (latencyMs: number) => void;
  onClientCount?: (count: number) => void;
  onRawLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
  WebSocketImpl?: typeof WebSocket;
  BroadcastChannelImpl?: typeof BroadcastChannel;
}

let ws: WebSocket | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let isConnecting = false;
let reconnectAttempts = 0;

/**
 * Flag esplicito di fallback: diventa true se la connessione WebSocket
 * non è configurata o fallisce, instradando i messaggi sul BroadcastChannel locale.
 */
let useBroadcastFallback = false;

let activeOptions: InitWebSocketOptions = {};
let transportState: WebSocketTransportState = {
  status: 'disconnected',
  fallbackActive: false,
  wsUrl: null,
  hostingUrl: '',
  clientCount: 1,
  latencyMs: 0,
  lastError: null,
};

function ensureBroadcastChannel(BroadcastChannelCtor?: typeof BroadcastChannel): BroadcastChannel | null {
  if (broadcastChannel) return broadcastChannel;
  const Ctor =
    BroadcastChannelCtor ??
    (typeof window !== 'undefined' && 'BroadcastChannel' in window ? window.BroadcastChannel : undefined);

  if (!Ctor) return null;

  try {
    broadcastChannel = new Ctor(BROADCAST_CHANNEL_NAME);
    broadcastChannel.onmessage = (event: MessageEvent) => {
      if (event?.data) {
        handleRawIncoming(event.data, 'broadcast_channel');
      }
    };
    return broadcastChannel;
  } catch (err) {
    activeOptions.onRawLog?.(`[WebSocket] BroadcastChannel non disponibile: ${String(err)}`, 'warn');
    return null;
  }
}

function handleRawIncoming(data: RealtimeMessage, origin: 'websocket' | 'broadcast_channel') {
  if (!data || !data.type) return;

  if (data.type === 'CLIENT_COUNT' && typeof data.count === 'number') {
    transportState.clientCount = data.count;
    activeOptions.onClientCount?.(data.count);
    activeOptions.onStatusChange?.(transportState.status, data.count, useBroadcastFallback);
    return;
  }

  if (data.type === 'PONG') {
    const latency = typeof data.clientTime === 'number' ? Math.max(1, Date.now() - data.clientTime) : 12;
    transportState.latencyMs = latency;
    activeOptions.onLatency?.(latency);
    return;
  }

  if (
    (data.type === 'STATE_INIT' || data.type === 'FULL_STATE_SYNC' || data.type === 'SYNC_FULL_STATE') &&
    typeof data.connectedClients === 'number'
  ) {
    transportState.clientCount = data.connectedClients;
    activeOptions.onClientCount?.(data.connectedClients);
  }

  activeOptions.onMessage?.(data, origin);
}

function stopHeartbeat() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  const sendPing = () => {
    if (ws && ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(JSON.stringify({ type: 'PING', clientTime: Date.now() }));
      } catch {
        // Ignore transient send errors
      }
    }
  };
  sendPing();
  pingTimer = setInterval(sendPing, HEARTBEAT_INTERVAL_MS);
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    connectInternal();
  }, delay);
}

function activateFallback(reason: string, wsUrl: string | null) {
  useBroadcastFallback = true;
  transportState.fallbackActive = true;
  transportState.lastError = reason;
  ensureBroadcastChannel(activeOptions.BroadcastChannelImpl);
  activeOptions.onRawLog?.(`[WebSocket] Fallback BroadcastChannel attivato: ${reason}`, 'warn');
  activeOptions.onFallbackActivated?.(reason, wsUrl);
}

function sendViaWebSocketOnly(msg: RealtimeMessage) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      activeOptions.onRawLog?.(`[WebSocket] Errore invio su socket: ${String(err)}`, 'warn');
    }
  }
}

function connectInternal() {
  const targetUrl =
    activeOptions.wsUrlOverride !== undefined ? activeOptions.wsUrlOverride : getWebSocketUrl();
  const hostingUrl = getAppBaseUrl();

  transportState.wsUrl = targetUrl;
  transportState.hostingUrl = hostingUrl;

  ensureBroadcastChannel(activeOptions.BroadcastChannelImpl);

  if (!targetUrl) {
    transportState.status = 'disconnected';
    activateFallback(
      'Nessun endpoint WebSocket remoto configurato per questo host: attivo sync locale via BroadcastChannel.',
      null
    );
    activeOptions.onStatusChange?.('disconnected', transportState.clientCount, true);
    return;
  }

  if (isConnecting || (ws && ws.readyState === 1 /* OPEN */)) {
    return;
  }

  const WebSocketCtor =
    activeOptions.WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);

  if (!WebSocketCtor) {
    transportState.status = 'error';
    activateFallback('API WebSocket non disponibile in questo ambiente.', targetUrl);
    activeOptions.onStatusChange?.('error', transportState.clientCount, true);
    return;
  }

  isConnecting = true;
  transportState.status = 'connecting';
  activeOptions.onStatusChange?.('connecting', transportState.clientCount, useBroadcastFallback);
  activeOptions.onRawLog?.(`[WebSocket] Tentativo connessione a ${targetUrl}...`, 'info');

  try {
    const socket = new WebSocketCtor(targetUrl);
    let failureReported = false;
    let openedOnce = false;
    ws = socket;

    socket.onopen = () => {
      if (ws !== socket) return;
      isConnecting = false;
      openedOnce = true;
      reconnectAttempts = 0;
      useBroadcastFallback = false;
      transportState.fallbackActive = false;
      transportState.lastError = null;
      transportState.status = 'connected';

      activeOptions.onRawLog?.(`⚡ [WebSocket] Connesso a ${targetUrl} (fallback disattivato).`, 'info');
      activeOptions.onConnected?.(targetUrl);
      activeOptions.onStatusChange?.('connected', transportState.clientCount, false);

      sendViaWebSocketOnly({
        type: 'REGISTER_CLIENT',
        role: activeOptions.role || 'regia',
        hostingUrl,
        timestamp: Date.now(),
      });

      startHeartbeat();
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        handleRawIncoming(parsed, 'websocket');
      } catch (err) {
        activeOptions.onRawLog?.(`[WebSocket] Errore parsing messaggio: ${String(err)}`, 'error');
      }
    };

    socket.onclose = () => {
      if (ws !== socket) return;
      isConnecting = false;
      ws = null;
      stopHeartbeat();
      transportState.status = 'disconnected';

      if (!openedOnce && !failureReported) {
        failureReported = true;
        activateFallback(
          `Connessione WebSocket rifiutata o chiusa da ${targetUrl}. Attivo fallback locale BroadcastChannel.`,
          targetUrl
        );
      } else {
        // Anche in caso di disconnessione successiva riabilitiamo temporaneamente il fallback locale
        useBroadcastFallback = true;
        transportState.fallbackActive = true;
      }

      activeOptions.onStatusChange?.('disconnected', transportState.clientCount, useBroadcastFallback);
      scheduleReconnect();
    };

    socket.onerror = () => {
      if (ws !== socket) return;
      isConnecting = false;
      transportState.status = 'error';
      if (!failureReported) {
        failureReported = true;
        activateFallback(
          `Server WebSocket non raggiungibile su ${targetUrl}. Attivo fallback locale BroadcastChannel.`,
          targetUrl
        );
      }
      activeOptions.onStatusChange?.('error', transportState.clientCount, true);
    };
  } catch (err) {
    isConnecting = false;
    transportState.status = 'error';
    activateFallback(
      `Impossibile aprire WebSocket verso ${targetUrl} (${String(err)}). Attivo fallback locale BroadcastChannel.`,
      targetUrl
    );
    activeOptions.onStatusChange?.('error', transportState.clientCount, true);
    scheduleReconnect();
  }
}

/**
 * Inizializza la connessione WebSocket usando gli URL risolti da src/config.ts.
 * In caso di errore o server non configurato/irraggiungibile, attiva automaticamente
 * il flag useBroadcastFallback = true per comunicare tra Regia e TV via BroadcastChannel.
 */
export function initWebSocket(options: InitWebSocketOptions = {}): WebSocketTransportState {
  activeOptions = { ...activeOptions, ...options };
  connectInternal();
  return getTransportState();
}

export function disconnectWebSocket(closeBroadcastChannel: boolean = false) {
  stopHeartbeat();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    } catch {
      // Ignore close errors
    }
    ws = null;
  }
  if (closeBroadcastChannel && broadcastChannel) {
    try {
      broadcastChannel.close();
    } catch {
      // Ignore close errors
    }
    broadcastChannel = null;
  }
  isConnecting = false;
  transportState.status = 'disconnected';
}

export function reconnectWebSocket(): WebSocketTransportState {
  reconnectAttempts = 0;
  disconnectWebSocket(false);
  connectInternal();
  return getTransportState();
}

export function sendRealtimeMessage(msg: RealtimeMessage) {
  // 1. Invia tramite WebSocket se attivo e fallback non forzato
  if (!useBroadcastFallback && ws && ws.readyState === 1 /* OPEN */) {
    sendViaWebSocketOnly(msg);
  }

  // 2. BroadcastChannel sempre attivo in modalità fallback (e per zero-latency multi-tab)
  const channel = ensureBroadcastChannel(activeOptions.BroadcastChannelImpl);
  if (channel) {
    try {
      channel.postMessage(msg);
    } catch (err) {
      activeOptions.onRawLog?.(`[WebSocket] Errore invio BroadcastChannel: ${String(err)}`, 'warn');
    }
  }
}

export function setCustomWebSocketUrl(customUrl: string | null): WebSocketTransportState {
  if (typeof window !== 'undefined') {
    try {
      if (customUrl && customUrl.trim()) {
        window.localStorage.setItem(CUSTOM_WS_STORAGE_KEY, customUrl.trim());
      } else {
        window.localStorage.removeItem(CUSTOM_WS_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }
  return reconnectWebSocket();
}

export function isBroadcastFallbackActive(): boolean {
  return useBroadcastFallback;
}

export function getTransportState(): WebSocketTransportState {
  return { ...transportState, fallbackActive: useBroadcastFallback };
}

export function getRuntimeConfigSnapshot(): ResolvedAppConfig {
  return resolveRuntimeAppConfig();
}
