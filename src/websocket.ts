import {
  CUSTOM_WS_STORAGE_KEY,
  deriveHealthCheckUrlFromWsUrl,
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
const HEALTH_PROBE_TIMEOUT_MS = 2200;

export type BackendCapability = 'ws_ready' | 'static_only' | 'unknown';

export interface WebSocketTransportState {
  status: ConnectionStatus;
  fallbackActive: boolean;
  relativeFallbackActive: boolean;
  staticHostMode: boolean;
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
  healthCheckUrlOverride?: string | null;
  enablePreFlightProbe?: boolean;
  fetchImpl?: typeof fetch;
  silentStartupRetries?: number;
  role?: 'regia' | 'tv';
  onMessage?: (data: RealtimeMessage, origin: 'websocket' | 'broadcast_channel') => void;
  onStatusChange?: (status: ConnectionStatus, clientCount: number, fallbackActive: boolean) => void;
  onRelativeFallbackActivated?: (relativeUrl: string, reason: string) => void;
  onStaticHostMode?: (reason: string) => void;
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
let connectionEpoch = 0;
let hasCompletedHealthProbe = false;

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

/**
 * Flag di modalità host statico (es. Render Static Site, Cloudflare Pages, Firebase Hosting):
 * nessun backend Express/WS su /api/health e /ws -> usa BroadcastChannel senza mostrare errori.
 */
let useStaticHostMode = false;

let activeOptions: InitWebSocketOptions = {};
let transportState: WebSocketTransportState = {
  status: 'disconnected',
  fallbackActive: false,
  relativeFallbackActive: false,
  staticHostMode: false,
  wsUrl: null,
  relativeWsUrl: null,
  hostingUrl: '',
  clientCount: 1,
  latencyMs: 0,
  lastError: null,
};

export async function probeBackendWebSocketCapability(
  healthUrl: string,
  fetchImpl?: typeof fetch,
  timeoutMs: number = HEALTH_PROBE_TIMEOUT_MS
): Promise<BackendCapability> {
  const fn = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fn || !healthUrl) return 'unknown';

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fn(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (res.status === 404 || res.status === 405 || res.status === 501) {
      return 'static_only';
    }

    const contentType = (res.headers?.get?.('content-type') || '').toLowerCase();
    if (res.ok && !contentType.includes('application/json')) {
      // Es. SPA rewrite (/* -> /index.html) che restituisce text/html su /api/health
      return 'static_only';
    }

    if (res.ok && contentType.includes('application/json')) {
      return 'ws_ready';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function cleanupActiveSocket() {
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
  if (useStaticHostMode) return;
  clearReconnectTimer();
  const silentRetries = activeOptions.silentStartupRetries ?? DEFAULT_SILENT_STARTUP_RETRIES;
  const delay =
    reconnectAttempts < silentRetries
      ? INITIAL_RETRY_DELAY_MS * (reconnectAttempts + 1)
      : Math.min(1000 * Math.pow(1.5, Math.max(0, reconnectAttempts - silentRetries)), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;
  const epochAtSchedule = connectionEpoch;
  reconnectTimer = setTimeout(() => {
    if (epochAtSchedule !== connectionEpoch || useStaticHostMode) return;
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

function activateStaticHostMode(reason: string) {
  clearConnectTimeout();
  clearReconnectTimer();
  stopHeartbeat();
  cleanupActiveSocket();
  isConnecting = false;
  useRelativeFallback = false;
  useBroadcastFallback = true;
  useStaticHostMode = true;
  transportState.staticHostMode = true;
  transportState.fallbackActive = true;
  transportState.relativeFallbackActive = false;
  transportState.status = 'disconnected';
  transportState.wsUrl = null;
  transportState.lastError = null;
  ensureBroadcastChannel(activeOptions.BroadcastChannelImpl);
  activeOptions.onRawLog?.(`[Sync Locale] ${reason}`, 'info');
  activeOptions.onStaticHostMode?.(reason);
  activeOptions.onStatusChange?.('disconnected', transportState.clientCount, true);
}

function activateBroadcastFallback(reason: string, wsUrl: string | null, notifyUi: boolean = true) {
  if (useStaticHostMode) return;
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

function resolveConnectionUrls(): {
  primaryUrl: string | null;
  relativeUrl: string | null;
  cfg: ResolvedAppConfig;
} {
  const configuredWsUrl =
    activeOptions.definedAppWsUrlOverride !== undefined
      ? activeOptions.definedAppWsUrlOverride.trim()
      : getDefinedAppWsUrl();
  const cfg = resolveRuntimeAppConfig({ configuredWsUrl });

  const primaryUrl =
    activeOptions.wsUrlOverride !== undefined
      ? activeOptions.wsUrlOverride
      : cfg.wsUrl;
  const relativeUrl =
    activeOptions.relativeWsUrlOverride !== undefined
      ? activeOptions.relativeWsUrlOverride
      : cfg.relativeWsUrl;
  return { primaryUrl, relativeUrl, cfg };
}

function resolveEffectiveHealthUrl(targetUrl: string | null, cfg: ResolvedAppConfig): string | null {
  if (activeOptions.healthCheckUrlOverride !== undefined) {
    return activeOptions.healthCheckUrlOverride;
  }
  return deriveHealthCheckUrlFromWsUrl(targetUrl, cfg.healthCheckUrl);
}

function connectInternal() {
  ensureBroadcastChannel(activeOptions.BroadcastChannelImpl);

  let targetUrl: string | null = null;
  let relativeUrl: string | null = null;
  let hostingUrl = '';
  let cfg: ResolvedAppConfig;
  const currentEpoch = connectionEpoch;

  const canFallbackToRelative = (failedUrl: string | null): boolean =>
    !useRelativeFallback && Boolean(relativeUrl) && relativeUrl !== failedUrl;

  const tryRelativeFallback = (reason: string, failedUrl: string | null): boolean => {
    if (!canFallbackToRelative(failedUrl) || !relativeUrl) return false;
    useRelativeFallback = true;
    transportState.relativeFallbackActive = true;
    transportState.lastError = reason;
    cleanupActiveSocket();
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
    cfg = resolved.cfg;
    hostingUrl = getAppBaseUrl();
    targetUrl = useRelativeFallback ? relativeUrl : primaryUrl;

    transportState.wsUrl = targetUrl;
    transportState.relativeWsUrl = relativeUrl;
    transportState.relativeFallbackActive = useRelativeFallback;
    transportState.hostingUrl = hostingUrl;

    if (!targetUrl) {
      activateStaticHostMode(
        'Host statico attivo (nessun endpoint WebSocket remoto): sincronizzazione Regia ↔ Schermo TV attiva via BroadcastChannel locale.'
      );
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
    const effectiveHealthUrl = resolveEffectiveHealthUrl(activeTargetUrl, cfg);
    const shouldPreFlight =
      !hasCompletedHealthProbe &&
      !useRelativeFallback &&
      Boolean(effectiveHealthUrl) &&
      (activeOptions.enablePreFlightProbe ??
        (activeOptions.WebSocketImpl === undefined &&
          cfg.environment === 'cloud' &&
          !cfg.hasExplicitExternalWsOverride));

    const openSocketConnection = () => {
      if (currentEpoch !== connectionEpoch || useStaticHostMode) return;
      if (isConnecting || (ws && ws.readyState === 1 /* OPEN */)) return;

      isConnecting = true;
      transportState.status = 'connecting';
      activeOptions.onStatusChange?.('connecting', transportState.clientCount, useBroadcastFallback);
      activeOptions.onRawLog?.(
        `[WebSocket] Tentativo connessione${useRelativeFallback ? ' (fallback relativo)' : ''} a ${activeTargetUrl}...`,
        'info'
      );

      let socket: WebSocket;
      try {
        socket = new WebSocketCtor(activeTargetUrl);
      } catch (err) {
        isConnecting = false;
        const reason = `Impossibile aprire WebSocket verso ${activeTargetUrl} (${String(err)}).`;
        if (tryRelativeFallback(reason, activeTargetUrl)) {
          return;
        }
        transportState.status = 'error';
        activateBroadcastFallback(`${reason} Attivo fallback locale BroadcastChannel.`, activeTargetUrl);
        activeOptions.onStatusChange?.('error', transportState.clientCount, true);
        scheduleReconnect();
        return;
      }

      let failureReported = false;
      let openedOnce = false;
      ws = socket;

      const checkIfStaticHostAfterFailure = () => {
        if (
          hasCompletedHealthProbe ||
          useStaticHostMode ||
          useRelativeFallback ||
          cfg.hasExplicitExternalWsOverride ||
          !effectiveHealthUrl
        ) {
          return;
        }
        hasCompletedHealthProbe = true;
        void probeBackendWebSocketCapability(effectiveHealthUrl, activeOptions.fetchImpl).then((capability) => {
          if (currentEpoch !== connectionEpoch || openedOnce) return;
          if (capability === 'static_only') {
            activateStaticHostMode(
              `Host statico rilevato (${activeTargetUrl} non espone un server WebSocket): sincronizzazione locale Regia ↔ TV Studio attiva via BroadcastChannel.`
            );
          }
        });
      };

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
        if (ws !== socket || currentEpoch !== connectionEpoch) return;
        clearConnectTimeout();
        clearReconnectTimer();
        isConnecting = false;
        openedOnce = true;
        reconnectAttempts = 0;
        useBroadcastFallback = false;
        useStaticHostMode = false;
        hasCompletedHealthProbe = true;
        transportState.staticHostMode = false;
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
        if (ws !== socket || currentEpoch !== connectionEpoch) return;
        isConnecting = false;
        ws = null;
        stopHeartbeat();
        if (useStaticHostMode) return;

        transportState.status = 'disconnected';
        const silentRetries = activeOptions.silentStartupRetries ?? DEFAULT_SILENT_STARTUP_RETRIES;
        const shouldDelayUiAlert = reconnectAttempts < silentRetries;

        if (!openedOnce && !failureReported) {
          failureReported = true;
          checkIfStaticHostAfterFailure();
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

        if (useStaticHostMode) return;

        activeOptions.onStatusChange?.(
          shouldDelayUiAlert ? 'connecting' : 'disconnected',
          transportState.clientCount,
          useBroadcastFallback
        );
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (ws !== socket || currentEpoch !== connectionEpoch || useStaticHostMode) return;
        isConnecting = false;
        const silentRetries = activeOptions.silentStartupRetries ?? DEFAULT_SILENT_STARTUP_RETRIES;
        const shouldDelayUiAlert = reconnectAttempts < silentRetries;
        transportState.status = shouldDelayUiAlert ? 'connecting' : 'error';
        if (!failureReported) {
          failureReported = true;
          checkIfStaticHostAfterFailure();
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
        if (useStaticHostMode) return;

        activeOptions.onStatusChange?.(
          shouldDelayUiAlert ? 'connecting' : 'error',
          transportState.clientCount,
          true
        );
      };
    };

    if (shouldPreFlight && effectiveHealthUrl) {
      hasCompletedHealthProbe = true;
      isConnecting = true;
      transportState.status = 'connecting';
      activeOptions.onStatusChange?.('connecting', transportState.clientCount, useBroadcastFallback);
      void probeBackendWebSocketCapability(effectiveHealthUrl, activeOptions.fetchImpl).then((capability) => {
        if (currentEpoch !== connectionEpoch) return;
        isConnecting = false;
        if (capability === 'static_only') {
          activateStaticHostMode(
            'Host statico rilevato (/api/health assente o SPA rewrite): sincronizzazione Regia ↔ Schermo TV attiva via BroadcastChannel locale.'
          );
          return;
        }
        openSocketConnection();
      });
      return;
    }

    openSocketConnection();
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
 * Rileva automaticamente eventuali host statici tramite `/api/health` e attiva `BroadcastChannel`
 * senza generare falsi allarmi o loop di riconnessione su deploy statici.
 */
export function initWebSocket(options: InitWebSocketOptions = {}): WebSocketTransportState {
  connectionEpoch++;
  reconnectAttempts = 0;
  useRelativeFallback = false;
  useBroadcastFallback = false;
  useStaticHostMode = false;
  hasCompletedHealthProbe = false;
  transportState.staticHostMode = false;
  activeOptions = { ...options };
  connectInternal();
  return getTransportState();
}

export function disconnectWebSocket(closeBroadcastChannel: boolean = false) {
  connectionEpoch++;
  stopHeartbeat();
  clearConnectTimeout();
  clearReconnectTimer();
  cleanupActiveSocket();
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
  useStaticHostMode = false;
  hasCompletedHealthProbe = false;
  transportState.relativeFallbackActive = false;
  transportState.staticHostMode = false;
  transportState.status = 'disconnected';
}

export function reconnectWebSocket(): WebSocketTransportState {
  connectionEpoch++;
  reconnectAttempts = 0;
  hasCompletedHealthProbe = false;
  useStaticHostMode = false;
  useRelativeFallback = false;
  transportState.staticHostMode = false;
  transportState.relativeFallbackActive = false;
  stopHeartbeat();
  clearConnectTimeout();
  clearReconnectTimer();
  cleanupActiveSocket();
  isConnecting = false;
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

export function isStaticHostModeActive(): boolean {
  return useStaticHostMode;
}

export function getTransportState(): WebSocketTransportState {
  return {
    ...transportState,
    fallbackActive: useBroadcastFallback,
    relativeFallbackActive: useRelativeFallback,
    staticHostMode: useStaticHostMode,
  };
}

export function getRuntimeConfigSnapshot(): ResolvedAppConfig {
  return resolveRuntimeAppConfig();
}
