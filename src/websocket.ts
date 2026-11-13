import {
  CUSTOM_WS_STORAGE_KEY,
  getAppBaseUrl,
  getRelativeWebSocketUrl,
  resolveRuntimeAppConfig,
  type ResolvedAppConfig,
  type RuntimeConfigOverrides,
} from './config';
import type { ConnectionStatus, RealtimeMessage } from './realtime-sync';

export const BROADCAST_CHANNEL_NAME = 'tombola90_realtime_channel';
const MAX_RECONNECT_DELAY_MS = 8000;
const HEARTBEAT_INTERVAL_MS = 3500;
const DEFAULT_SILENT_STARTUP_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 600;
const EXTERNAL_HANDSHAKE_TIMEOUT_MS = 2000;

export interface WebSocketTransportState {
  status: ConnectionStatus;
  fallbackActive: boolean;
  relativeFallbackActive: boolean;
  wsUrl: string | null;
  relativeWsUrl: string | null;
  hostingUrl: string;
  clientCount: number;
  latencyMs: number;
  lastError: string | null;
}

export interface InitWebSocketOptions {
  wsUrlOverride?: string | null;
  relativeWsUrlOverride?: string | null;
  definedAppWsUrlOverride?: string;
  silentStartupRetries?: number;
  role?: 'regia' | 'tv';
  onMessage?: (data: RealtimeMessage, origin: 'websocket' | 'broadcast_channel') => void;
  onStatusChange?: (status: ConnectionStatus, clientCount: number, fallbackActive: boolean) => void;
  onRelativeFallbackActivated?: (relativeUrl: string, reason: string) => void;
  onFallbackActivated?: (reason: string, wsUrl: string | null) => void;
  onConnected?: (wsUrl: string) => void;
  onLatency?: (latencyMs: number) => void;
  onClientCount?: (count: number) => void;
  onRawLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
  WebSocketImpl?: typeof WebSocket | null;
  BroadcastChannelImpl?: typeof BroadcastChannel;
}

let ws: WebSocket | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let isConnecting = false;
let reconnectAttempts = 0;

/**
 * Flag di fallback automatico su URL relativo (/ws -> host corrente)
 * quando il server WebSocket esterno configurato non è raggiungibile.
 */
let useRelativeFallback = false;

/**
 * Flag esplicito di fallback su BroadcastChannel: diventa true se sia il
 * WebSocket primario che l'eventuale URL relativo falliscono o non sono disponibili.
 */
let useBroadcastFallback = false;

let activeOptions: InitWebSocketOptions = {};
let transportState: WebSocketTransportState = {
  status: 'disconnected',
  fallbackActive: false,
  relativeFallbackActive: false,
  wsUrl: null,
  relativeWsUrl: null,
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

function clearConnectTimeout() {
  if (connectTimeoutTimer) {
    clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = null;
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
  const silentRetries = activeOptions.silentStartupRetries ?? DEFAULT_SILENT_STARTUP_RETRIES;
  const delay =
    reconnectAttempts < silentRetries
      ? INITIAL_RETRY_DELAY_MS * (reconnectAttempts + 1)
      : Math.min(1000 * Math.pow(1.5, Math.max(0, reconnectAttempts - silentRetries)), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    useRelativeFallback = false;
    transportState.relativeFallbackActive = false;
    connectInternal();
  }, delay);
}

function enableBroadcastBackupSilently(reason: string) {
  useBroadcastFallback = true;
  transportState.fallbackActive = true;
  transportState.lastError = reason;
  ensureBroadcastChannel(activeOptions.BroadcastChannelImpl);
}

function activateBroadcastFallback(reason: string, wsUrl: string | null, notifyUi: boolean = true) {
  enableBroadcastBackupSilently(reason);
  activeOptions.onRawLog?.(`[WebSocket] Fallback BroadcastChannel attivato: ${reason}`, 'warn');
  if (notifyUi) {
    activeOptions.onFallbackActivated?.(reason, wsUrl);
  }
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

export function getDefinedAppWsUrl(): string {
  try {
    return typeof __APP_WS_URL__ !== 'undefined' && __APP_WS_URL__
      ? String(__APP_WS_URL__).trim()
      : '';
  } catch {
    return '';
  }
}

export function resolvePrimaryWsEndpoint(
  definedWsUrlOverride?: string,
  runtimeOverrides: RuntimeConfigOverrides = {}
): string | null {
  const configuredWsUrl =
    definedWsUrlOverride !== undefined ? definedWsUrlOverride.trim() : getDefinedAppWsUrl();
  return resolveRuntimeAppConfig({
    ...runtimeOverrides,
    configuredWsUrl,
  }).wsUrl;
}

function resolveConnectionUrls(): { primaryUrl: string | null; relativeUrl: string | null } {
  const primaryUrl =
    activeOptions.wsUrlOverride !== undefined
      ? activeOptions.wsUrlOverride
      : resolvePrimaryWsEndpoint(activeOptions.definedAppWsUrlOverride);
  const relativeUrl =
    activeOptions.relativeWsUrlOverride !== undefined
      ? activeOptions.relativeWsUrlOverride
      : getRelativeWebSocketUrl();
  return { primaryUrl, relativeUrl };
}

function connectInternal() {
  ensureBroadcastChannel(activeOptions.BroadcastChannelImpl);

  let targetUrl: string | null = null;
  let relativeUrl: string | null = null;
  let hostingUrl = '';

  const canFallbackToRelative = (failedUrl: string | null): boolean =>
    !useRelativeFallback && Boolean(relativeUrl) && relativeUrl !== failedUrl;

  const tryRelativeFallback = (reason: string, failedUrl: string | null): boolean => {
    if (!canFallbackToRelative(failedUrl) || !relativeUrl) return false;
    useRelativeFallback = true;
    transportState.relativeFallbackActive = true;
    transportState.lastError = reason;
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      } catch {
        // Ignore cleanup close error
      }
      ws = null;
    }
    isConnecting = false;
    activeOptions.onRawLog?.(
      `[WebSocket] Server esterno (${failedUrl}) irraggiungibile: fallback automatico su URL relativo (${relativeUrl}).`,
      'warn'
    );
    activeOptions.onRelativeFallbackActivated?.(relativeUrl, reason);
    connectInternal();
    return true;
  };

  try {
    const resolved = resolveConnectionUrls();
    const primaryUrl = resolved.primaryUrl;
    relativeUrl = resolved.relativeUrl;
    hostingUrl = getAppBaseUrl();
    targetUrl = useRelativeFallback ? relativeUrl : primaryUrl;

    transportState.wsUrl = targetUrl;
    transportState.relativeWsUrl = relativeUrl;
    transportState.relativeFallbackActive = useRelativeFallback;
    transportState.hostingUrl = hostingUrl;

    if (!targetUrl) {
      transportState.status = 'disconnected';
      activateBroadcastFallback(
        'Nessun endpoint WebSocket configurato per questo host: attivo sync locale via BroadcastChannel.',
        null
      );
      activeOptions.onStatusChange?.('disconnected', transportState.clientCount, true);
      return;
    }

    if (isConnecting || (ws && ws.readyState === 1 /* OPEN */)) {
      return;
    }

    const WebSocketCtor =
      activeOptions.WebSocketImpl !== undefined
        ? activeOptions.WebSocketImpl
        : typeof WebSocket !== 'undefined'
          ? WebSocket
          : undefined;

    if (!WebSocketCtor) {
      throw new Error('API WebSocket non disponibile in questo ambiente.');
    }

    const activeTargetUrl: string = targetUrl;

    isConnecting = true;
    transportState.status = 'connecting';
    activeOptions.onStatusChange?.('connecting', transportState.clientCount, useBroadcastFallback);
    activeOptions.onRawLog?.(
      `[WebSocket] Tentativo connessione${useRelativeFallback ? ' (fallback relativo)' : ''} a ${activeTargetUrl}...`,
      'info'
    );

    const socket = new WebSocketCtor(activeTargetUrl);
    let failureReported = false;
    let openedOnce = false;
    ws = socket;

    if (canFallbackToRelative(activeTargetUrl)) {
      clearConnectTimeout();
      connectTimeoutTimer = setTimeout(() => {
        if (ws === socket && !openedOnce && !failureReported) {
          failureReported = true;
          tryRelativeFallback(
            `Timeout handshake WebSocket esterno (${activeTargetUrl}).`,
            activeTargetUrl
          );
        }
      }, EXTERNAL_HANDSHAKE_TIMEOUT_MS);
    }

    socket.onopen = () => {
      if (ws !== socket) return;
      clearConnectTimeout();
      isConnecting = false;
      openedOnce = true;
      reconnectAttempts = 0;
      useBroadcastFallback = false;
      transportState.fallbackActive = false;
      transportState.relativeFallbackActive = useRelativeFallback;
      transportState.lastError = null;
      transportState.status = 'connected';
      transportState.wsUrl = activeTargetUrl;

      activeOptions.onRawLog?.(
        `⚡ [WebSocket] Connesso a ${activeTargetUrl}${useRelativeFallback ? ' (via fallback URL relativo)' : ''} (BroadcastChannel disattivato).`,
        'info'
      );
      activeOptions.onConnected?.(activeTargetUrl);
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

      const silentRetries = activeOptions.silentStartupRetries ?? DEFAULT_SILENT_STARTUP_RETRIES;
      const shouldDelayUiAlert = reconnectAttempts < silentRetries;

      if (!openedOnce && !failureReported) {
        failureReported = true;
        const reason = `Connessione WebSocket rifiutata o chiusa da ${activeTargetUrl}.`;
        if (tryRelativeFallback(reason, activeTargetUrl)) {
          return;
        }
        activateBroadcastFallback(
          `${reason} Attivo fallback locale BroadcastChannel.`,
          activeTargetUrl,
          !shouldDelayUiAlert
        );
      } else {
        useBroadcastFallback = true;
        transportState.fallbackActive = true;
      }

      activeOptions.onStatusChange?.(
        shouldDelayUiAlert ? 'connecting' : 'disconnected',
        transportState.clientCount,
        useBroadcastFallback
      );
      scheduleReconnect();
    };

    socket.onerror = () => {
      if (ws !== socket) return;
      isConnecting = false;
      const silentRetries = activeOptions.silentStartupRetries ?? DEFAULT_SILENT_STARTUP_RETRIES;
      const shouldDelayUiAlert = reconnectAttempts < silentRetries;
      transportState.status = shouldDelayUiAlert ? 'connecting' : 'error';
      if (!failureReported) {
        failureReported = true;
        const reason = `Server WebSocket non raggiungibile su ${activeTargetUrl}.`;
        if (tryRelativeFallback(reason, activeTargetUrl)) {
          return;
        }
        activateBroadcastFallback(
          `${reason} Attivo fallback locale BroadcastChannel.`,
          activeTargetUrl,
          !shouldDelayUiAlert
        );
      }
      activeOptions.onStatusChange?.(
        shouldDelayUiAlert ? 'connecting' : 'error',
        transportState.clientCount,
        true
      );
    };
  } catch (err) {
    isConnecting = false;
    const reason = `Impossibile aprire WebSocket verso ${targetUrl} (${String(err)}).`;
    if (tryRelativeFallback(reason, targetUrl)) {
      return;
    }
    transportState.status = 'error';
    activateBroadcastFallback(`${reason} Attivo fallback locale BroadcastChannel.`, targetUrl);
    activeOptions.onStatusChange?.('error', transportState.clientCount, true);
    scheduleReconnect();
  }
}

/**
 * Inizializza la connessione WebSocket usando `__APP_WS_URL__` definito in `vite.config.ts`
 * come endpoint primario (risolto con `src/config.ts`).
 * Se la connessione fallisce (blocco try-catch o handshake rifiutato), tenta l'eventuale
 * URL relativo (/ws) e passa automaticamente a BroadcastChannel come metodo di fallback.
 */
export function initWebSocket(options: InitWebSocketOptions = {}): WebSocketTransportState {
  reconnectAttempts = 0;
  useRelativeFallback = false;
  useBroadcastFallback = false;
  activeOptions = { ...activeOptions, ...options };
  connectInternal();
  return getTransportState();
}

export function disconnectWebSocket(closeBroadcastChannel: boolean = false) {
  stopHeartbeat();
  clearConnectTimeout();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
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
  useRelativeFallback = false;
  transportState.relativeFallbackActive = false;
  transportState.status = 'disconnected';
}

export function reconnectWebSocket(): WebSocketTransportState {
  reconnectAttempts = 0;
  disconnectWebSocket(false);
  connectInternal();
  return getTransportState();
}

export function sendRealtimeMessage(msg: RealtimeMessage) {
  if (!useBroadcastFallback && ws && ws.readyState === 1 /* OPEN */) {
    sendViaWebSocketOnly(msg);
  }

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

export function isRelativeFallbackActive(): boolean {
  return useRelativeFallback;
}

export function getTransportState(): WebSocketTransportState {
  return {
    ...transportState,
    fallbackActive: useBroadcastFallback,
    relativeFallbackActive: useRelativeFallback,
  };
}

export function getRuntimeConfigSnapshot(): ResolvedAppConfig {
  return resolveRuntimeAppConfig();
}
