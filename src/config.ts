import { isStaticOnlyHost, normalizeToWsUrl, resolveWebSocketUrl } from './utils/ws-url';

/**
 * Configurazione centralizzata dell'applicazione (URL di hosting & WebSocket).
 * Garantisce che VITE_WS_URL e VITE_APP_URL siano popolati dall'ambiente di deploy
 * con fallback automatico sugli URL relativi (/ws, /api/health) in locale e in cloud.
 */

export interface RuntimeConfigOverrides {
  viteAppUrl?: string;
  viteWsUrl?: string;
  configuredAppUrl?: string;
  configuredWsUrl?: string;
  search?: string;
  storedWsUrl?: string | null;
  windowProtocol?: string;
  windowHost?: string;
  windowHostname?: string;
  windowOrigin?: string;
}

export interface ResolvedAppConfig {
  environment: 'local' | 'cloud';
  viteAppUrl: string;
  viteWsUrl: string;
  appUrl: string;
  wsUrl: string | null;
  relativeWsPath: string;
  relativeWsUrl: string | null;
  healthCheckUrl: string;
  hasExplicitExternalWsOverride: boolean;
}

const DEFAULT_RELATIVE_WS_PATH = '/ws';
const DEFAULT_RELATIVE_HEALTH_PATH = '/api/health';
const CUSTOM_WS_STORAGE_KEY = 'tombola90_ws_url';
const PLACEHOLDER_ENV = new Set(['MY_APP_URL', 'MY_WS_URL', 'undefined', 'null', '']);

function safeMetaEnv(key: 'VITE_APP_URL' | 'VITE_WS_URL'): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    const raw = env?.[key]?.trim() || '';
    return PLACEHOLDER_ENV.has(raw) ? '' : raw;
  } catch {
    return '';
  }
}

function safeConfiguredHostingUrl(): string {
  try {
    if (typeof __APP_HOSTING_URL__ !== 'undefined' && __APP_HOSTING_URL__) {
      const raw = String(__APP_HOSTING_URL__).trim();
      return PLACEHOLDER_ENV.has(raw) ? '' : raw;
    }
    return '';
  } catch {
    return '';
  }
}

function safeConfiguredWsUrl(): string {
  try {
    if (typeof __APP_WS_URL__ !== 'undefined' && __APP_WS_URL__) {
      const raw = String(__APP_WS_URL__).trim();
      return PLACEHOLDER_ENV.has(raw) ? '' : raw;
    }
    return '';
  } catch {
    return '';
  }
}

function safeWindowLocation(): {
  protocol?: string;
  host?: string;
  hostname?: string;
  origin?: string;
  search?: string;
} {
  if (typeof window === 'undefined' || !window.location) return {};
  return {
    protocol: window.location.protocol,
    host: window.location.host,
    hostname: window.location.hostname,
    origin: window.location.origin,
    search: window.location.search,
  };
}

function safeStoredWsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CUSTOM_WS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function normalizeHttpUrl(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed || PLACEHOLDER_ENV.has(trimmed)) return '';
  if (trimmed.startsWith('/')) return trimmed.replace(/\/+$/, '') || '/';
  try {
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `${trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1') ? 'http' : 'https'}://${trimmed}`;
    return new URL(withProto).origin;
  } catch {
    return '';
  }
}

export function resolveRelativeWsUrlFromLocation(
  windowProtocol?: string,
  windowHost?: string,
  windowHostname?: string,
  relativePath: string = DEFAULT_RELATIVE_WS_PATH
): string | null {
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  if (windowHostname && isStaticOnlyHost(windowHostname)) {
    return null;
  }
  if (windowHost) {
    const wsProto = windowProtocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${windowHost}${cleanPath}`;
  }
  return cleanPath;
}

export function resolveRuntimeAppConfig(overrides: RuntimeConfigOverrides = {}): ResolvedAppConfig {
  const winLoc = safeWindowLocation();
  const viteAppUrl = (overrides.viteAppUrl ?? safeMetaEnv('VITE_APP_URL')).trim();
  const configuredAppUrl = (overrides.configuredAppUrl ?? safeConfiguredHostingUrl()).trim();
  const rawMetaWs = overrides.viteWsUrl !== undefined ? overrides.viteWsUrl.trim() : safeMetaEnv('VITE_WS_URL');
  const rawConfiguredWs =
    overrides.configuredWsUrl !== undefined ? overrides.configuredWsUrl.trim() : safeConfiguredWsUrl();

  const windowHostname = overrides.windowHostname ?? winLoc.hostname;
  const windowHost = overrides.windowHost ?? winLoc.host;
  const windowProtocol = overrides.windowProtocol ?? winLoc.protocol;
  const windowOrigin = overrides.windowOrigin ?? winLoc.origin ?? '';
  const search = overrides.search ?? winLoc.search;
  const storedWsUrl = overrides.storedWsUrl !== undefined ? overrides.storedWsUrl : safeStoredWsUrl();

  const isLocal =
    !windowHostname ||
    windowHostname === 'localhost' ||
    windowHostname === '127.0.0.1';

  // Popola VITE_WS_URL dall'ambiente di deploy (o derivando dall'APP_URL configurata), con fallback relativo "/ws"
  const effectiveAppOrigin =
    normalizeHttpUrl(viteAppUrl) ||
    normalizeHttpUrl(windowOrigin) ||
    normalizeHttpUrl(configuredAppUrl) ||
    '/';

  const derivedWsFromDeploy =
    !rawMetaWs && !rawConfiguredWs && !isLocal && effectiveAppOrigin !== '/' && !isStaticOnlyHost(windowHostname)
      ? normalizeToWsUrl(effectiveAppOrigin) || DEFAULT_RELATIVE_WS_PATH
      : '';

  const viteWsUrlRaw =
    rawMetaWs ||
    rawConfiguredWs ||
    derivedWsFromDeploy ||
    DEFAULT_RELATIVE_WS_PATH;

  // Risolve URL relativo per fallback automatico su server sullo stesso host
  const relativeWsUrl = resolveRelativeWsUrlFromLocation(
    windowProtocol,
    windowHost,
    windowHostname,
    viteWsUrlRaw.startsWith('/') ? viteWsUrlRaw : DEFAULT_RELATIVE_WS_PATH
  );

  // Gestione supporto esplicito URL relativo in VITE_WS_URL (es. "/ws")
  let normalizedViteWs = viteWsUrlRaw;
  if (viteWsUrlRaw.startsWith('/')) {
    if (windowHost && !isStaticOnlyHost(windowHostname)) {
      const wsProto = windowProtocol === 'https:' ? 'wss:' : 'ws:';
      const cleanPath = viteWsUrlRaw.endsWith('/ws') ? viteWsUrlRaw : `${viteWsUrlRaw.replace(/\/+$/, '')}/ws`;
      normalizedViteWs = `${wsProto}//${windowHost}${cleanPath}`;
    } else {
      normalizedViteWs = '';
    }
  }

  let wsUrl = resolveWebSocketUrl({
    search,
    storedWsUrl,
    viteWsUrl: normalizedViteWs,
    viteAppUrl,
    configuredAppUrl,
    windowProtocol,
    windowHost,
    windowHostname,
  });

  // Fallback relativo quando siamo senza windowHost esplicito ma con path relativo configurato
  if (!wsUrl && viteWsUrlRaw.startsWith('/') && !isStaticOnlyHost(windowHostname)) {
    wsUrl = viteWsUrlRaw;
  }

  // Fallback su relativa same-origin se nessun URL esterno valido è stato risolto
  if (!wsUrl && relativeWsUrl) {
    wsUrl = relativeWsUrl;
  }

  const healthCheckUrl =
    effectiveAppOrigin && effectiveAppOrigin !== '/'
      ? `${effectiveAppOrigin.replace(/\/+$/, '')}${DEFAULT_RELATIVE_HEALTH_PATH}`
      : DEFAULT_RELATIVE_HEALTH_PATH;

  let hasExplicitQueryWs = false;
  if (search) {
    try {
      const params = new URLSearchParams(search);
      hasExplicitQueryWs = Boolean(normalizeToWsUrl(params.get('ws') || params.get('wsUrl')));
    } catch {
      hasExplicitQueryWs = false;
    }
  }
  const hasExplicitStoredWs = Boolean(normalizeToWsUrl(storedWsUrl));
  let isCrossHostExplicitWs = false;
  if (wsUrl && windowHostname) {
    try {
      const parsedWsHost = new URL(wsUrl).hostname;
      if (parsedWsHost && parsedWsHost.toLowerCase() !== windowHostname.toLowerCase()) {
        isCrossHostExplicitWs = true;
      }
    } catch {
      isCrossHostExplicitWs = false;
    }
  }
  const hasExplicitExternalWsOverride = hasExplicitQueryWs || hasExplicitStoredWs || isCrossHostExplicitWs;

  return {
    environment: isLocal ? 'local' : 'cloud',
    viteAppUrl,
    viteWsUrl: viteWsUrlRaw,
    appUrl: effectiveAppOrigin,
    wsUrl,
    relativeWsPath: DEFAULT_RELATIVE_WS_PATH,
    relativeWsUrl,
    healthCheckUrl,
    hasExplicitExternalWsOverride,
  };
}

export function deriveHealthCheckUrlFromWsUrl(
  wsUrl: string | null | undefined,
  fallbackHealthUrl: string = DEFAULT_RELATIVE_HEALTH_PATH
): string {
  if (!wsUrl) return fallbackHealthUrl;
  const trimmed = wsUrl.trim();
  if (!trimmed || trimmed.startsWith('/')) {
    return fallbackHealthUrl;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    else if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    const basePath = parsed.pathname.replace(/\/ws\/?$/i, '').replace(/\/+$/, '');
    parsed.pathname = `${basePath}${DEFAULT_RELATIVE_HEALTH_PATH}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return fallbackHealthUrl;
  }
}

export function getAppBaseUrl(): string {
  return resolveRuntimeAppConfig().appUrl;
}

export function getWebSocketUrl(): string | null {
  return resolveRuntimeAppConfig().wsUrl;
}

export function getRelativeWebSocketUrl(overrides: RuntimeConfigOverrides = {}): string | null {
  return resolveRuntimeAppConfig(overrides).relativeWsUrl;
}

export const APP_CONFIG: ResolvedAppConfig = resolveRuntimeAppConfig();
export { CUSTOM_WS_STORAGE_KEY };
