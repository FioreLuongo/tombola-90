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

  // 2. Explicit VITE_WS_URL environment variable
  const normalizedViteWs = normalizeToWsUrl(input.viteWsUrl);
  if (normalizedViteWs) return normalizedViteWs;

  // 3. Saved runtime override from localStorage
  const normalizedStored = normalizeToWsUrl(input.storedWsUrl);
  if (normalizedStored) return normalizedStored;

  const hostname = input.windowHostname || '';
  const host = input.windowHost || '';
  const protocol = input.windowProtocol || 'https:';
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';

  // 4. Local development server always connects to local host
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return host ? `${wsProto}//${host}/ws` : null;
  }

  // 5. Static-only hosting (e.g. GitHub Pages, Cloudflare Pages, Firebase Hosting):
  //    route WebSocket to the configured backend hosting URL (VITE_APP_URL / APP_URL) if available.
  if (isStaticOnlyHost(hostname)) {
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

  // 6. Explicit VITE_APP_URL hosting configuration
  const normalizedViteApp = normalizeToWsUrl(input.viteAppUrl);
  if (normalizedViteApp) return normalizedViteApp;

  // 7. Full-stack hosting (Cloud Run, Render Web Service, etc.): use active window.location.host
  if (host) {
    return `${wsProto}//${host}/ws`;
  }

  // 8. Standalone / fallback to configured APP_URL
  return normalizeToWsUrl(input.configuredAppUrl);
}
