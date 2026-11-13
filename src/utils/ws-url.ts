/**
 * Pure utility for resolving the WebSocket server URL from the configured hosting URL
 * (VITE_WS_URL, VITE_APP_URL, APP_URL, query parameter ?ws=, or window.location).
 */

export interface ResolveWsUrlInput {
  search?: string;
  storedWsUrl?: string | null;
  viteWsUrl?: string;
  viteAppUrl?: string;
  configuredAppUrl?: string;
  windowProtocol?: string;
  windowHost?: string;
  windowHostname?: string;
}

const STATIC_ONLY_HOST_SUFFIXES = [
  '.github.io',
  '.pages.dev',
  '.web.app',
  '.firebaseapp.com',
  '.netlify.app',
  '.vercel.app',
];

const PLACEHOLDER_VALUES = new Set(['MY_APP_URL', 'MY_WS_URL', 'undefined', 'null', '']);

export function isStaticOnlyHost(hostname?: string): boolean {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return STATIC_ONLY_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function normalizeToWsUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed)) return null;

  let candidate = trimmed;
  if (!/^(wss?|https?):\/\//i.test(candidate)) {
    const isLocal = candidate.startsWith('localhost') || candidate.startsWith('127.0.0.1');
    candidate = `${isLocal ? 'ws' : 'wss'}://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:') {
      parsed.protocol = 'wss:';
    } else if (parsed.protocol === 'http:') {
      parsed.protocol = 'ws:';
    } else if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      return null;
    }

    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (!cleanPath || cleanPath === '') {
      parsed.pathname = '/ws';
    } else if (!cleanPath.endsWith('/ws')) {
      parsed.pathname = `${cleanPath}/ws`;
    } else {
      parsed.pathname = cleanPath;
    }

    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function isAiStudioHost(hostname?: string): boolean {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return (lower.startsWith('ais-dev-') || lower.startsWith('ais-pre-')) && lower.endsWith('.run.app');
}

export function resolveWebSocketUrl(input: ResolveWsUrlInput): string | null {
  // 1. Explicit URL query override (?ws=... or ?wsUrl=...)
  if (input.search) {
    try {
      const params = new URLSearchParams(input.search);
      const fromQuery = params.get('ws') || params.get('wsUrl');
      const normalizedQuery = normalizeToWsUrl(fromQuery);
      if (normalizedQuery) return normalizedQuery;
    } catch {
      // Ignore malformed search string
    }
  }

  // 2. Saved runtime override from localStorage
  const normalizedStored = normalizeToWsUrl(input.storedWsUrl);
  if (normalizedStored) return normalizedStored;

  const hostname = input.windowHostname || '';
  const host = input.windowHost || '';
  const protocol = input.windowProtocol || 'https:';
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';

  // 3. Local development server always connects to local host unless ?ws= override is provided
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return host ? `${wsProto}//${host}/ws` : null;
  }

  // 4. Static-only hosting (e.g. GitHub Pages, Cloudflare Pages, Firebase Hosting):
  //    route WebSocket to VITE_WS_URL or the configured backend hosting URL (VITE_APP_URL / APP_URL).
  if (isStaticOnlyHost(hostname)) {
    const staticViteWs = normalizeToWsUrl(input.viteWsUrl);
    if (staticViteWs) return staticViteWs;

    const backendFromViteApp = normalizeToWsUrl(input.viteAppUrl);
    if (backendFromViteApp && new URL(backendFromViteApp).hostname !== hostname) {
      return backendFromViteApp;
    }
    const backendFromAppUrl = normalizeToWsUrl(input.configuredAppUrl);
    if (backendFromAppUrl && new URL(backendFromAppUrl).hostname !== hostname) {
      return backendFromAppUrl;
    }
    return null;
  }

  // 5. Explicit VITE_WS_URL on non-static hosts (skip cross-host ais-pre/ais-dev URLs that 302-redirect)
  const normalizedViteWs = normalizeToWsUrl(input.viteWsUrl);
  if (normalizedViteWs) {
    try {
      const wsHostname = new URL(normalizedViteWs).hostname;
      if (!hostname || wsHostname === hostname || !isAiStudioHost(wsHostname)) {
        return normalizedViteWs;
      }
    } catch {
      return normalizedViteWs;
    }
  }

  // 6. Full-stack hosting (Cloud Run, Render Web Service, etc.): use active window.location.host
  if (host) {
    return `${wsProto}//${host}/ws`;
  }

  // 7. Explicit VITE_APP_URL / configured APP_URL fallback outside browser
  return normalizeToWsUrl(input.viteAppUrl) || normalizeToWsUrl(input.configuredAppUrl);
}
