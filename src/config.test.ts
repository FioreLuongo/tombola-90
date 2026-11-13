import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveHealthCheckUrlFromWsUrl,
  getRelativeWebSocketUrl,
  resolveRuntimeAppConfig,
} from './config.ts';

test('resolveRuntimeAppConfig falls back to relative appUrl and /api/health when env vars are unset outside browser', () => {
  const cfg = resolveRuntimeAppConfig({
    viteAppUrl: '',
    viteWsUrl: '',
    configuredAppUrl: '',
  });
  assert.equal(cfg.appUrl, '/');
  assert.equal(cfg.healthCheckUrl, '/api/health');
  assert.equal(cfg.relativeWsPath, '/ws');
  assert.equal(cfg.viteWsUrl, '/ws');
  assert.equal(cfg.hasExplicitExternalWsOverride, false);
});

test('resolveRuntimeAppConfig converts relative VITE_WS_URL (/ws) against active window host', () => {
  const cfg = resolveRuntimeAppConfig({
    viteAppUrl: '',
    viteWsUrl: '/ws',
    windowProtocol: 'https:',
    windowHost: 'tombola.example.run.app',
    windowHostname: 'tombola.example.run.app',
    windowOrigin: 'https://tombola.example.run.app',
  });
  assert.equal(cfg.environment, 'cloud');
  assert.equal(cfg.appUrl, 'https://tombola.example.run.app');
  assert.equal(cfg.wsUrl, 'wss://tombola.example.run.app/ws');
  assert.equal(cfg.relativeWsUrl, 'wss://tombola.example.run.app/ws');
  assert.equal(cfg.healthCheckUrl, 'https://tombola.example.run.app/api/health');
  assert.equal(cfg.hasExplicitExternalWsOverride, false);
});

test('resolveRuntimeAppConfig auto-populates viteWsUrl from cloud hosting URL when configuredWsUrl is injected', () => {
  const cfg = resolveRuntimeAppConfig({
    viteAppUrl: 'https://tombola.example.run.app',
    viteWsUrl: '',
    configuredWsUrl: 'wss://tombola.example.run.app/ws',
    windowProtocol: 'https:',
    windowHost: 'tombola.example.run.app',
    windowHostname: 'tombola.example.run.app',
    windowOrigin: 'https://tombola.example.run.app',
  });
  assert.equal(cfg.viteWsUrl, 'wss://tombola.example.run.app/ws');
  assert.equal(cfg.wsUrl, 'wss://tombola.example.run.app/ws');
  assert.equal(cfg.relativeWsUrl, 'wss://tombola.example.run.app/ws');
  assert.equal(cfg.hasExplicitExternalWsOverride, false);
});

test('resolveRuntimeAppConfig honors explicit external VITE_APP_URL and VITE_WS_URL and computes relativeWsUrl fallback', () => {
  const cfg = resolveRuntimeAppConfig({
    viteAppUrl: 'https://tombola-backend.onrender.com',
    viteWsUrl: 'wss://tombola-backend.onrender.com/ws',
    windowProtocol: 'https:',
    windowHost: 'tombola-frontend.run.app',
    windowHostname: 'tombola-frontend.run.app',
    windowOrigin: 'https://tombola-frontend.run.app',
  });
  assert.equal(cfg.environment, 'cloud');
  assert.equal(cfg.appUrl, 'https://tombola-backend.onrender.com');
  assert.equal(cfg.wsUrl, 'wss://tombola-backend.onrender.com/ws');
  assert.equal(cfg.relativeWsUrl, 'wss://tombola-frontend.run.app/ws');
  assert.equal(cfg.hasExplicitExternalWsOverride, true);
});

test('getRelativeWebSocketUrl returns null on static-only hosts like github.io', () => {
  const rel = getRelativeWebSocketUrl({
    windowProtocol: 'https:',
    windowHost: 'fioreluongo.github.io',
    windowHostname: 'fioreluongo.github.io',
  });
  assert.equal(rel, null);
});

test('resolveRuntimeAppConfig falls back to localhost WebSocket in local dev', () => {
  const cfg = resolveRuntimeAppConfig({
    viteAppUrl: '',
    viteWsUrl: '',
    windowProtocol: 'http:',
    windowHost: 'localhost:3000',
    windowHostname: 'localhost',
    windowOrigin: 'http://localhost:3000',
  });
  assert.equal(cfg.environment, 'local');
  assert.equal(cfg.wsUrl, 'ws://localhost:3000/ws');
  assert.equal(cfg.relativeWsUrl, 'ws://localhost:3000/ws');
  assert.equal(cfg.hasExplicitExternalWsOverride, false);
});

test('deriveHealthCheckUrlFromWsUrl converts ws/wss endpoints to corresponding /api/health URL', () => {
  assert.equal(
    deriveHealthCheckUrlFromWsUrl('wss://tombola-90.onrender.com/ws'),
    'https://tombola-90.onrender.com/api/health'
  );
  assert.equal(
    deriveHealthCheckUrlFromWsUrl('ws://localhost:3000/ws'),
    'http://localhost:3000/api/health'
  );
  assert.equal(deriveHealthCheckUrlFromWsUrl('/ws', '/api/health'), '/api/health');
});
