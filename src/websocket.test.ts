import test from 'node:test';
import assert from 'node:assert/strict';
import {
  disconnectWebSocket,
  getTransportState,
  initWebSocket,
  isBroadcastFallbackActive,
  isRelativeFallbackActive,
  isStaticHostModeActive,
  probeBackendWebSocketCapability,
  resolvePrimaryWsEndpoint,
  sendRealtimeMessage,
} from './websocket.ts';

class MockBroadcastChannel {
  public name: string;
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public postedMessages: any[] = [];
  constructor(name: string) {
    this.name = name;
  }
  postMessage(data: any) {
    this.postedMessages.push(data);
  }
  close() {}
}

test('initWebSocket activates staticHostMode BroadcastChannel sync without error alert when wsUrl is unavailable', () => {
  disconnectWebSocket(true);
  let staticReason = '';
  let unreachableAlerts = 0;
  const channelInstance: MockBroadcastChannel[] = [];

  class TrackedChannel extends MockBroadcastChannel {
    constructor(name: string) {
      super(name);
      channelInstance.push(this);
    }
  }

  const state = initWebSocket({
    wsUrlOverride: null,
    BroadcastChannelImpl: TrackedChannel as unknown as typeof BroadcastChannel,
    onStaticHostMode: (reason) => {
      staticReason = reason;
    },
    onFallbackActivated: () => {
      unreachableAlerts++;
    },
  });

  assert.equal(state.fallbackActive, true);
  assert.equal(state.staticHostMode, true);
  assert.equal(isBroadcastFallbackActive(), true);
  assert.equal(isStaticHostModeActive(), true);
  assert.equal(unreachableAlerts, 0);
  assert.ok(staticReason.length > 0);

  sendRealtimeMessage({ type: 'REGIA_EXTRACT', number: 42 });
  assert.equal(channelInstance[0].postedMessages.length, 1);
  assert.equal(channelInstance[0].postedMessages[0].number, 42);
  disconnectWebSocket(true);
});

test('initWebSocket activates BroadcastChannel fallback on WebSocket error', () => {
  disconnectWebSocket(true);
  const channels: MockBroadcastChannel[] = [];

  class TrackedChannel extends MockBroadcastChannel {
    constructor(name: string) {
      super(name);
      channels.push(this);
    }
  }

  class FailingWebSocket {
    public readyState = 3;
    public onopen: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(_url: string) {
      throw new Error('ECONNREFUSED');
    }
    send() {}
    close() {}
  }

  const state = initWebSocket({
    wsUrlOverride: 'ws://127.0.0.1:59999/ws',
    WebSocketImpl: FailingWebSocket as unknown as typeof WebSocket,
    BroadcastChannelImpl: TrackedChannel as unknown as typeof BroadcastChannel,
  });

  assert.equal(state.fallbackActive, true);
  assert.equal(isBroadcastFallbackActive(), true);

  sendRealtimeMessage({ type: 'REGIA_EXTRACT', number: 77 });
  assert.equal(channels[0].postedMessages[0].number, 77);
  disconnectWebSocket(true);
});

test('initWebSocket clears fallback flag and registers client when WebSocket connects', () => {
  disconnectWebSocket(true);
  const sentPayloads: string[] = [];

  class OpenWebSocket {
    public readyState = 1;
    public onopen: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(_url: string) {
      queueMicrotask(() => {
        this.onopen?.();
      });
    }
    send(payload: string) {
      sentPayloads.push(payload);
    }
    close() {}
  }

  initWebSocket({
    wsUrlOverride: 'wss://tombola.example.run.app/ws',
    role: 'tv',
    WebSocketImpl: OpenWebSocket as unknown as typeof WebSocket,
    BroadcastChannelImpl: MockBroadcastChannel as unknown as typeof BroadcastChannel,
  });

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const state = getTransportState();
      assert.equal(state.status, 'connected');
      assert.equal(state.fallbackActive, false);
      assert.equal(isBroadcastFallbackActive(), false);
      assert.ok(sentPayloads.some((p) => p.includes('"REGISTER_CLIENT"') && p.includes('"tv"')));
      disconnectWebSocket(true);
      resolve();
    }, 10);
  });
});

test('initWebSocket automatically falls back to relative URL when external WS server is unreachable', () => {
  disconnectWebSocket(true);
  const attemptedUrls: string[] = [];
  const activatedRelativeUrls: string[] = [];
  let connectedUrl = '';

  class FallbackAwareWebSocket {
    public readyState = 0;
    public onopen: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(url: string) {
      attemptedUrls.push(url);
      if (url.includes('external-down.example.com')) {
        queueMicrotask(() => {
          this.readyState = 3;
          this.onerror?.();
          this.onclose?.();
        });
      } else {
        queueMicrotask(() => {
          this.readyState = 1;
          this.onopen?.();
        });
      }
    }
    send() {}
    close() {}
  }

  initWebSocket({
    wsUrlOverride: 'wss://external-down.example.com/ws',
    relativeWsUrlOverride: 'wss://active-host.example.com/ws',
    WebSocketImpl: FallbackAwareWebSocket as unknown as typeof WebSocket,
    BroadcastChannelImpl: MockBroadcastChannel as unknown as typeof BroadcastChannel,
    onRelativeFallbackActivated: (relUrl) => {
      activatedRelativeUrls.push(relUrl);
    },
    onConnected: (wsUrl) => {
      connectedUrl = wsUrl;
    },
  });

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const state = getTransportState();
      assert.deepEqual(attemptedUrls, [
        'wss://external-down.example.com/ws',
        'wss://active-host.example.com/ws',
      ]);
      assert.deepEqual(activatedRelativeUrls, ['wss://active-host.example.com/ws']);
      assert.equal(connectedUrl, 'wss://active-host.example.com/ws');
      assert.equal(state.status, 'connected');
      assert.equal(state.wsUrl, 'wss://active-host.example.com/ws');
      assert.equal(state.relativeFallbackActive, true);
      assert.equal(isRelativeFallbackActive(), true);
      assert.equal(state.fallbackActive, false);
      disconnectWebSocket(true);
      resolve();
    }, 20);
  });
});

test('initWebSocket recovers from transient startup handshake refusal on silent retry without firing unreachable alert', () => {
  disconnectWebSocket(true);
  let attempts = 0;
  let alertFired = 0;

  class FlakyStartupWebSocket {
    public readyState = 0;
    public onopen: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(_url: string) {
      attempts++;
      if (attempts === 1) {
        queueMicrotask(() => {
          this.readyState = 3;
          this.onerror?.();
          this.onclose?.();
        });
      } else {
        queueMicrotask(() => {
          this.readyState = 1;
          this.onopen?.();
        });
      }
    }
    send() {}
    close() {}
  }

  initWebSocket({
    wsUrlOverride: 'wss://tombola.example.run.app/ws',
    relativeWsUrlOverride: 'wss://tombola.example.run.app/ws',
    silentStartupRetries: 2,
    WebSocketImpl: FlakyStartupWebSocket as unknown as typeof WebSocket,
    BroadcastChannelImpl: MockBroadcastChannel as unknown as typeof BroadcastChannel,
    onFallbackActivated: () => {
      alertFired++;
    },
  });

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const state = getTransportState();
      assert.equal(attempts, 2);
      assert.equal(alertFired, 0);
      assert.equal(state.status, 'connected');
      assert.equal(state.fallbackActive, false);
      disconnectWebSocket(true);
      resolve();
    }, 750);
  });
});

test('resolvePrimaryWsEndpoint uses __APP_WS_URL__ as primary endpoint and supports global injection', () => {
  const prev = (globalThis as Record<string, unknown>).__APP_WS_URL__;
  try {
    (globalThis as Record<string, unknown>).__APP_WS_URL__ = 'wss://tombola-prod.example.com/ws';
    const resolved = resolvePrimaryWsEndpoint(undefined, {
      windowProtocol: 'https:',
      windowHost: 'user.github.io',
      windowHostname: 'user.github.io',
    });
    assert.equal(resolved, 'wss://tombola-prod.example.com/ws');
  } finally {
    if (prev === undefined) {
      delete (globalThis as Record<string, unknown>).__APP_WS_URL__;
    } else {
      (globalThis as Record<string, unknown>).__APP_WS_URL__ = prev;
    }
  }
});

test('initWebSocket catches missing WebSocket API in try-catch and falls back to BroadcastChannel', () => {
  disconnectWebSocket(true);
  const channels: MockBroadcastChannel[] = [];
  class TrackedChannel extends MockBroadcastChannel {
    constructor(name: string) {
      super(name);
      channels.push(this);
    }
  }

  const state = initWebSocket({
    definedAppWsUrlOverride: 'wss://tombola-prod.example.com/ws',
    relativeWsUrlOverride: null,
    WebSocketImpl: null,
    BroadcastChannelImpl: TrackedChannel as unknown as typeof BroadcastChannel,
  });

  assert.equal(state.fallbackActive, true);
  assert.equal(isBroadcastFallbackActive(), true);
  sendRealtimeMessage({ type: 'REGIA_EXTRACT', number: 90 });
  assert.equal(channels[0].postedMessages[0].number, 90);
  disconnectWebSocket(true);
});

test('probeBackendWebSocketCapability classifies 404 and HTML SPA rewrites as static_only, JSON ok as ws_ready', async () => {
  const fetch404 = (async () =>
    new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;
  assert.equal(await probeBackendWebSocketCapability('https://tombola-90.onrender.com/api/health', fetch404), 'static_only');

  const fetchHtmlRewrite = (async () =>
    new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })) as unknown as typeof fetch;
  assert.equal(
    await probeBackendWebSocketCapability('https://tombola-90.onrender.com/api/health', fetchHtmlRewrite),
    'static_only'
  );

  const fetchJsonReady = (async () =>
    new Response(JSON.stringify({ status: 'ok', game: 'Tombola-90 Gold Edition' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  assert.equal(
    await probeBackendWebSocketCapability('https://tombola-90.onrender.com/api/health', fetchJsonReady),
    'ws_ready'
  );

  const fetchDown = (async () =>
    new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;
  assert.equal(
    await probeBackendWebSocketCapability('https://tombola-90.onrender.com/api/health', fetchDown),
    'unknown'
  );
});

test('initWebSocket skips WS handshake and activates clean staticHostMode when /api/health returns 404 (Render Static Site)', () => {
  disconnectWebSocket(true);
  let wsAttempts = 0;
  let staticModeFired = false;
  let unreachableAlerts = 0;

  class CountingWebSocket {
    public readyState = 0;
    public onopen: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(_url: string) {
      wsAttempts++;
    }
    send() {}
    close() {}
  }

  const fetch404 = (async () =>
    new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;

  initWebSocket({
    wsUrlOverride: 'wss://tombola-90.onrender.com/ws',
    healthCheckUrlOverride: 'https://tombola-90.onrender.com/api/health',
    enablePreFlightProbe: true,
    fetchImpl: fetch404,
    WebSocketImpl: CountingWebSocket as unknown as typeof WebSocket,
    BroadcastChannelImpl: MockBroadcastChannel as unknown as typeof BroadcastChannel,
    onStaticHostMode: () => {
      staticModeFired = true;
    },
    onFallbackActivated: () => {
      unreachableAlerts++;
    },
  });

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const state = getTransportState();
      assert.equal(wsAttempts, 0);
      assert.equal(staticModeFired, true);
      assert.equal(unreachableAlerts, 0);
      assert.equal(state.staticHostMode, true);
      assert.equal(state.fallbackActive, true);
      disconnectWebSocket(true);
      resolve();
    }, 25);
  });
});

test('initWebSocket proceeds to WebSocket connection when /api/health returns JSON ok (Render Web Service)', () => {
  disconnectWebSocket(true);
  let wsAttempts = 0;
  let connectedUrl = '';

  class HealthyWebSocket {
    public readyState = 1;
    public onopen: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(_url: string) {
      wsAttempts++;
      queueMicrotask(() => {
        this.onopen?.();
      });
    }
    send() {}
    close() {}
  }

  const fetchOk = (async () =>
    new Response(JSON.stringify({ status: 'ok', game: 'Tombola-90 Gold Edition' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

  initWebSocket({
    wsUrlOverride: 'wss://tombola-90.onrender.com/ws',
    healthCheckUrlOverride: 'https://tombola-90.onrender.com/api/health',
    enablePreFlightProbe: true,
    fetchImpl: fetchOk,
    WebSocketImpl: HealthyWebSocket as unknown as typeof WebSocket,
    BroadcastChannelImpl: MockBroadcastChannel as unknown as typeof BroadcastChannel,
    onConnected: (url) => {
      connectedUrl = url;
    },
  });

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const state = getTransportState();
      assert.equal(wsAttempts, 1);
      assert.equal(connectedUrl, 'wss://tombola-90.onrender.com/ws');
      assert.equal(state.status, 'connected');
      assert.equal(state.staticHostMode, false);
      assert.equal(state.fallbackActive, false);
      disconnectWebSocket(true);
      resolve();
    }, 25);
  });
});

