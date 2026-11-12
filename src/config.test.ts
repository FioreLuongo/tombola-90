import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeAppConfig } from './config.ts';

test('resolveRuntimeAppConfig falls back to relative appUrl and /api/health when env vars are unset outside browser', () => {
  const cfg = resolveRuntimeAppConfig({
    viteAppUrl: '',
    viteWsUrl: '',
    configuredAppUrl: '',
  });
  assert.equal(cfg.appUrl, '/');
  assert.equal(cfg.healthCheckUrl, '/api/health');
  assert.equal(cfg.relativeWsPath, '/ws');
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
  assert.equal(cfg.healthCheckUrl, 'https://tombola.example.run.app/api/health');
});

test('resolveRuntimeAppConfig honors explicit VITE_APP_URL and VITE_WS_URL on cloud deploy', () => {
  const cfg = resolveRuntimeAppConfig({
    viteAppUrl: 'https://tombola-backend.onrender.com',
    viteWsUrl: 'wss://tombola-backend.onrender.com/ws',
    windowProtocol: 'https:',
    windowHost: 'user.github.io',
    windowHostname: 'user.github.io',
    windowOrigin: 'https://user.github.io',
  });
  assert.equal(cfg.environment, 'cloud');
  assert.equal(cfg.appUrl, 'https://tombola-backend.onrender.com');
  assert.equal(cfg.wsUrl, 'wss://tombola-backend.onrender.com/ws');
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
});
