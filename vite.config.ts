import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function normalizeBasePath(raw?: string): string {
  const trimmed = (raw || '/').trim();
  if (!trimmed || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

function isPlaceholder(val?: string): boolean {
  const v = (val || '').trim();
  return !v || v === 'MY_APP_URL' || v === 'MY_WS_URL' || v === 'undefined' || v === 'null';
}

function deriveDeployWsUrl(rawWs?: string, rawAppUrl?: string, isProd: boolean = false): string {
  if (!isPlaceholder(rawWs)) {
    return rawWs!.trim();
  }
  if (isProd && !isPlaceholder(rawAppUrl)) {
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(rawAppUrl!) ? rawAppUrl!.trim() : `https://${rawAppUrl!.trim()}`
      );
      parsed.protocol = parsed.protocol === 'http:' ? 'ws:' : 'wss:';
      parsed.pathname = '/ws';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return '/ws';
    }
  }
  return '/ws';
}

export default defineConfig(({mode}) => {
  const configuredHostingUrl =
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    '';

  const isProd = mode === 'production' || process.env.NODE_ENV === 'production';
  const configuredWsUrl = deriveDeployWsUrl(
    process.env.VITE_WS_URL || process.env.WS_URL,
    configuredHostingUrl,
    isProd
  );

  // Garantisce che import.meta.env.VITE_WS_URL sia popolato correttamente dall'ambiente di deploy
  if (isPlaceholder(process.env.VITE_WS_URL)) {
    process.env.VITE_WS_URL = configuredWsUrl;
  }

  return {
    base: normalizeBasePath(process.env.VITE_BASE_PATH),
    define: {
      __APP_HOSTING_URL__: JSON.stringify(configuredHostingUrl),
      __APP_WS_URL__: JSON.stringify(configuredWsUrl),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
