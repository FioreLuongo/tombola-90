import { normalizeToWsUrl, resolveWebSocketUrl } from './utils/ws-url';

/**
 * Configurazione centralizzata dell'applicazione (URL di hosting & WebSocket).
 * Legge import.meta.env.VITE_APP_URL e import.meta.env.VITE_WS_URL con
 * fallback automatico sugli URL relativi/correnti per funzionare sia in locale
 * (localhost:3000) sia su hosting cloud (Cloud Run, Render, GitHub Pages, ecc.).
 */

export interface RuntimeConfigOverrides {
  viteAppUrl?: string;
  viteWsUrl?: string;
  configuredAppUrl?: string;
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
  healthCheckUrl: string;
}

const DEFAULT_RELATIVE_WS_PATH = '/ws';
const DEFAULT_RELATIVE_HEALTH_PATH = '/api/health';
const CUSTOM_WS_STORAGE_KEY = 'tombola90_ws_url';

function safeMetaEnv(key: 'VITE_APP_URL' | 'VITE_WS_URL'): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    return env?.[key]?.trim() || '';
  } catch {
    return '';
  }
}

function safeConfiguredHostingUrl(): string {
  try {
    return typeof __APP_HOSTING_URL__ !== 'undefined' && __APP_HOSTING_URL__
      ? String(__APP_HOSTING_URL__).trim()
      : '';
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
  if (!trimmed || trimmed === 'MY_APP_URL') return '';
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

export function resolveRuntimeAppConfig(overrides: RuntimeConfigOverrides = {}): ResolvedAppConfig {
  const winLoc = safeWindowLocation();
  const viteAppUrl = (overrides.viteAppUrl ?? safeMetaEnv('VITE_APP_URL')).trim();
  const viteWsUrlRaw = (overrides.viteWsUrl ?? safeMetaEnv('VITE_WS_URL')).trim();
  const configuredAppUrl = (overrides.configuredAppUrl ?? safeConfiguredHostingUrl()).trim();

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

  // Fallback su URL relativi/origin corrente se VITE_APP_URL non è impostata
  const appUrl =
    normalizeHttpUrl(viteAppUrl) ||
    normalizeHttpUrl(windowOrigin) ||
    normalizeHttpUrl(configuredAppUrl) ||
    '/';

  // Gestione supporto esplicito URL relativo in VITE_WS_URL (es. "/ws")
  let normalizedViteWs = viteWsUrlRaw;
  if (viteWsUrlRaw.startsWith('/') && windowHost) {
    const wsProto = windowProtocol === 'https:' ? 'wss:' : 'ws:';
    const cleanPath = viteWsUrlRaw.endsWith('/ws') ? viteWsUrlRaw : `${viteWsUrlRaw.replace(/\/+$/, '')}/ws`;
    normalizedViteWs = `${wsProto}//${windowHost}${cleanPath}`;
  } else if (viteWsUrlRaw.startsWith('/')) {
    normalizedViteWs = '';
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

  // Fallback relativo quando siamo in ambiente senza windowHost esplicito ma con VITE_WS_URL relativo
  if (!wsUrl && viteWsUrlRaw.startsWith('/')) {
    wsUrl = viteWsUrlRaw;
  }

  // Normalizzazione eventuale su base URL configurata se resolveWebSocketUrl ha restituito null su host sconosciuti
  if (!wsUrl && viteAppUrl) {
    wsUrl = normalizeToWsUrl(viteAppUrl);
  }

  const healthCheckUrl = appUrl && appUrl !== '/'
    ? `${appUrl.replace(/\/+$/, '')}${DEFAULT_RELATIVE_HEALTH_PATH}`
    : DEFAULT_RELATIVE_HEALTH_PATH;

  return {
    environment: isLocal ? 'local' : 'cloud',
    viteAppUrl,
    viteWsUrl: viteWsUrlRaw,
    appUrl,
    wsUrl,
    relativeWsPath: DEFAULT_RELATIVE_WS_PATH,
    healthCheckUrl,
  };
}

export function getAppBaseUrl(): string {
  return resolveRuntimeAppConfig().appUrl;
}

export function getWebSocketUrl(): string | null {
  return resolveRuntimeAppConfig().wsUrl;
}

export const APP_CONFIG: ResolvedAppConfig = resolveRuntimeAppConfig();
export { CUSTOM_WS_STORAGE_KEY };
