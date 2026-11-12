import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToWsUrl, resolveWebSocketUrl, isStaticOnlyHost } from './ws-url';

test('normalizeToWsUrl converts https and http hosting URLs to wss/ws with /ws path', () => {
  assert.equal(normalizeToWsUrl('https://tombola-90.onrender.com'), 'wss://tombola-90.onrender.com/ws');
  assert.equal(normalizeToWsUrl('https://tombola-90.onrender.com/'), 'wss://tombola-90.onrender.com/ws');
  assert.equal(normalizeToWsUrl('http://localhost:3000'), 'ws://localhost:3000/ws');
  assert.equal(normalizeToWsUrl('wss://example.com/ws'), 'wss://example.com/ws');
  assert.equal(normalizeToWsUrl('MY_APP_URL'), null);
  assert.equal(normalizeToWsUrl(''), null);
});

test('isStaticOnlyHost detects GitHub Pages and static hosting domains', () => {
  assert.equal(isStaticOnlyHost('filiantech.github.io'), true);
  assert.equal(isStaticOnlyHost('tombola-90.pages.dev'), true);
  assert.equal(isStaticOnlyHost('tombola-90.web.app'), true);
  assert.equal(isStaticOnlyHost('tombola-90.onrender.com'), false);
  assert.equal(isStaticOnlyHost('localhost'), false);
});

test('resolveWebSocketUrl uses query param ?ws= as highest priority', () => {
  const url = resolveWebSocketUrl({
    search: '?view=tv&ws=https://my-tombola.onrender.com',
    viteWsUrl: 'wss://other.example.com/ws',
    windowHostname: 'filiantech.github.io',
    windowHost: 'filiantech.github.io',
    windowProtocol: 'https:'
  });
  assert.equal(url, 'wss://my-tombola.onrender.com/ws');
});

test('resolveWebSocketUrl uses localhost server during local dev even if APP_URL is configured', () => {
  const url = resolveWebSocketUrl({
    configuredAppUrl: 'https://ais-dev-example.run.app',
    windowHostname: 'localhost',
    windowHost: 'localhost:3000',
    windowProtocol: 'http:'
  });
  assert.equal(url, 'ws://localhost:3000/ws');
});

test('resolveWebSocketUrl routes static host (GitHub Pages) to configured hosting URL when available', () => {
  const url = resolveWebSocketUrl({
    configuredAppUrl: 'https://tombola-90.onrender.com',
    windowHostname: 'filiantech.github.io',
    windowHost: 'filiantech.github.io',
    windowProtocol: 'https:'
  });
  assert.equal(url, 'wss://tombola-90.onrender.com/ws');
});

test('resolveWebSocketUrl returns null on static host with no backend hosting URL configured', () => {
  const url = resolveWebSocketUrl({
    configuredAppUrl: '',
    windowHostname: 'filiantech.github.io',
    windowHost: 'filiantech.github.io',
    windowProtocol: 'https:'
  });
  assert.equal(url, null);
});

test('resolveWebSocketUrl uses active window.location.host on Cloud Run / full-stack hosts', () => {
  const url = resolveWebSocketUrl({
    configuredAppUrl: 'https://ais-dev-example.run.app',
    windowHostname: 'ais-pre-example.run.app',
    windowHost: 'ais-pre-example.run.app',
    windowProtocol: 'https:'
  });
  assert.equal(url, 'wss://ais-pre-example.run.app/ws');
});
