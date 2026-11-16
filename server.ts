import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { ServerPersistentDb } from './server-db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// In-Memory Authoritative Game Session State for instant multi-screen sync
interface ServerGameState {
  extractedNumbers: number[];
  currentNumber: number | null;
  extractionCount: number;
  isTimerRunning: boolean;
  timerIntervalSeconds: number;
  numeroGold: number | null;
  goldWon: boolean;
  goldExpired: boolean;
  prizePool: number;
  unclaimedPot: number;
  currency: string;
  cartelleWins: Record<string, any>;
  tvGraphics: {
    enabled: boolean;
    showTicker: boolean;
    tickerText: string;
    theme: string;
    sponsorLogo: string;
  };
  lastEvent: string;
  updatedAt: number;
}

function createDefaultGameState(): ServerGameState {
  return {
    extractedNumbers: [],
    currentNumber: null,
    extractionCount: 0,
    isTimerRunning: false,
    timerIntervalSeconds: 3,
    numeroGold: null,
    goldWon: false,
    goldExpired: false,
    prizePool: 0,
    unclaimedPot: 0,
    currency: '€',
    cartelleWins: {
      ambo: { won: false, cartellaId: null, count: 0 },
      terno: { won: false, cartellaId: null, count: 0 },
      quaterna: { won: false, cartellaId: null, count: 0 },
      cinquina: { won: false, cartellaId: null, count: 0 },
      tombola: { won: false, cartellaId: null, count: 0, gameEnded: false }
    },
    tvGraphics: {
      enabled: false,
      showTicker: true,
      tickerText: '★ TOMBOLA 90 GOLD EDITION • DIRETTA LIVE STUDIO TV ★',
      theme: 'luxury-gold',
      sponsorLogo: ''
    },
    lastEvent: 'INIT',
    updatedAt: Date.now()
  };
}

let currentGameState: ServerGameState = createDefaultGameState();

// Initialize WebSocket Server safely via noServer to avoid conflicting with other upgrade paths
// perMessageDeflate: false avoids proxy negotiation failures on Cloud Run / reverse proxies
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

server.on('upgrade', (request, socket, head) => {
  try {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const normalizedPath = reqUrl.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  } catch {
    socket.destroy();
  }
});

function broadcast(message: object, excludeSender?: WebSocket) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client !== excludeSender) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('Failed to send WS message:', err);
      }
    }
  });
}

wss.on('connection', (ws: WebSocket, req) => {
  const clientIp = req.socket.remoteAddress;
  (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
  ws.on('pong', () => {
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
  });
  console.log(`[WebSocket] Nuovo client connesso da ${clientIp}. Totale connessioni: ${wss.clients.size}`);

  // Send current authoritative game state immediately to newly connected screen (TV Studio or Regia)
  ws.send(
    JSON.stringify({
      type: 'STATE_INIT',
      state: currentGameState,
      connectedClients: wss.clients.size,
      timestamp: Date.now()
    })
  );

  // Notify everyone of updated connection count
  broadcast({
    type: 'CLIENT_COUNT',
    count: wss.clients.size
  });

  ws.on('message', (data: string) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'REGISTER_CLIENT':
          console.log(`[WebSocket] Client registrato come ruolo: ${msg.role || 'client'}`);
          break;

        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG', clientTime: msg.clientTime, serverTime: Date.now() }));
          break;

        case 'REGIA_EXTRACT': {
          const number = Number(msg.number);
          if (number && !currentGameState.extractedNumbers.includes(number)) {
            currentGameState.extractedNumbers.push(number);
            currentGameState.currentNumber = number;
            currentGameState.extractionCount = currentGameState.extractedNumbers.length;
            currentGameState.lastEvent = `EXTRACT_${number}`;
            currentGameState.updatedAt = Date.now();
          }

          // Broadcast to all clients (including TV Studio)
          broadcast(
            {
              type: 'NUMBER_EXTRACTED',
              number,
              extractedNumbers: currentGameState.extractedNumbers,
              extractionCount: currentGameState.extractionCount,
              smorfia: msg.smorfia || '',
              timestamp: Date.now(),
              source: msg.source || 'regia'
            },
            ws // Skip echoing to sender if requested, or keep it responsive
          );
          break;
        }

        case 'REGIA_START_TIMER':
          currentGameState.isTimerRunning = true;
          currentGameState.timerIntervalSeconds = msg.interval || currentGameState.timerIntervalSeconds;
          currentGameState.lastEvent = 'START_TIMER';
          currentGameState.updatedAt = Date.now();
          broadcast({
            type: 'TIMER_STARTED',
            interval: currentGameState.timerIntervalSeconds,
            timestamp: Date.now()
          }, ws);
          break;

        case 'REGIA_PAUSE_TIMER':
          currentGameState.isTimerRunning = false;
          currentGameState.lastEvent = 'PAUSE_TIMER';
          currentGameState.updatedAt = Date.now();
          broadcast({
            type: 'TIMER_PAUSED',
            timestamp: Date.now()
          }, ws);
          break;

        case 'REGIA_RESET_GAME':
          currentGameState = {
            ...createDefaultGameState(),
            unclaimedPot: msg.preserveUnclaimed ? currentGameState.unclaimedPot : 0,
            prizePool: msg.prizePool || 0,
            currency: msg.currency || currentGameState.currency,
            tvGraphics: currentGameState.tvGraphics,
            lastEvent: 'RESET_GAME',
            updatedAt: Date.now()
          };
          broadcast({
            type: 'GAME_RESET',
            state: currentGameState,
            timestamp: Date.now()
          });
          break;

        case 'WIN_DECLARED':
          if (msg.winType && currentGameState.cartelleWins[msg.winType]) {
            currentGameState.cartelleWins[msg.winType] = {
              won: true,
              cartellaId: msg.winningCartellaId,
              winningNumbers: msg.winningNumbers || [],
              winningRowIndex: msg.winningRowIndex
            };
          }
          currentGameState.lastEvent = `WIN_${msg.winType}`;
          currentGameState.updatedAt = Date.now();
          broadcast({
            type: 'WIN_DECLARED',
            winType: msg.winType,
            winningCartellaIds: msg.winningCartellaIds,
            winningNumbers: msg.winningNumbers,
            winningRowIndex: msg.winningRowIndex,
            timestamp: Date.now()
          }, ws);
          break;

        case 'UPDATE_UNCLAIMED':
          if (typeof msg.unclaimedPot === 'number') {
            currentGameState.unclaimedPot = msg.unclaimedPot;
            currentGameState.updatedAt = Date.now();
            broadcast({
              type: 'UNCLAIMED_UPDATED',
              unclaimedPot: currentGameState.unclaimedPot,
              timestamp: Date.now()
            }, ws);
          }
          break;

        case 'UPDATE_PRIZE_POOL':
          if (typeof msg.prizePool === 'number') {
            currentGameState.prizePool = msg.prizePool;
            currentGameState.currency = msg.currency || currentGameState.currency;
            currentGameState.updatedAt = Date.now();
            broadcast({
              type: 'PRIZE_POOL_UPDATED',
              prizePool: currentGameState.prizePool,
              currency: currentGameState.currency,
              timestamp: Date.now()
            }, ws);
          }
          break;

        case 'UPDATE_GRAPHICS':
          if (msg.tvGraphics) {
            currentGameState.tvGraphics = {
              ...currentGameState.tvGraphics,
              ...msg.tvGraphics
            };
            currentGameState.updatedAt = Date.now();
            broadcast({
              type: 'GRAPHICS_UPDATED',
              tvGraphics: currentGameState.tvGraphics,
              timestamp: Date.now()
            }, ws);
          }
          break;

        case 'SYNC_FULL_STATE':
          if (msg.state) {
            currentGameState = {
              ...currentGameState,
              ...msg.state,
              updatedAt: Date.now()
            };
            broadcast({
              type: 'FULL_STATE_SYNC',
              state: currentGameState,
              timestamp: Date.now()
            }, ws);
          }
          break;

        default:
          console.warn('[WebSocket] Tipo messaggio non riconosciuto:', msg.type);
      }
    } catch (err) {
      console.error('[WebSocket] Errore elaborazione messaggio:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnesso. Connessioni rimanenti: ${wss.clients.size}`);
    broadcast({
      type: 'CLIENT_COUNT',
      count: wss.clients.size
    });
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Errore socket:', err);
  });
});

// Keepalive protocol ping per evitare timeout dei proxy Cloud Run su connessioni inattive
const wsKeepAliveTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    const tracked = client as WebSocket & { isAlive?: boolean };
    if (tracked.isAlive === false) {
      tracked.terminate();
      return;
    }
    tracked.isAlive = false;
    try {
      tracked.ping();
    } catch {
      // Ignore transient ping errors
    }
  });
}, 25000);

wss.on('close', () => {
  clearInterval(wsKeepAliveTimer);
});

// Setup Express Middlewares & Routes
app.use(express.json({ limit: '5mb' }));
const serverDb = new ServerPersistentDb();

// API Status endpoint
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    status: 'ok',
    game: 'Tombola-90 Gold Edition',
    connectedClients: wss.clients.size,
    extractedCount: currentGameState.extractedNumbers.length,
    unclaimedPot: currentGameState.unclaimedPot,
    timestamp: Date.now()
  });
});

// Zero-Config Built-In Persistent Server Database API (/api/db/*)
app.get('/api/db/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(serverDb.getStatus());
});

app.get('/api/db/bank', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const limit = Number(req.query.limit) || 8;
  res.json({
    ok: true,
    bank: serverDb.getBank(),
    history: serverDb.getHistory(limit),
  });
});

app.put('/api/db/current-unclaimed', (req, res) => {
  const { currentGameUnclaimed, currency } = req.body || {};
  const bank = serverDb.saveCurrentGameUnclaimed(Number(currentGameUnclaimed) || 0, currency || '€');
  res.json({ ok: true, bank });
});

app.post('/api/db/bank/sync', (req, res) => {
  const bank = serverDb.syncBankSnapshot(req.body || {});
  res.json({ ok: true, bank });
});

app.post('/api/db/deposit', (req, res) => {
  const { amount, currency, prizeCategory, gameId, note } = req.body || {};
  const result = serverDb.depositUnclaimed(Number(amount) || 0, currency, prizeCategory, gameId, note);
  res.json(result);
});

app.post('/api/db/recall', (req, res) => {
  const { amountToRecall, gameId, note } = req.body || {};
  const parsedAmount = amountToRecall === null || amountToRecall === undefined ? null : Number(amountToRecall);
  const result = serverDb.recallUnclaimed(parsedAmount, gameId, note);
  res.json(result);
});

app.post('/api/db/reset', (req, res) => {
  const { gameId, note } = req.body || {};
  const result = serverDb.resetBank(gameId, note);
  res.json(result);
});

app.get('/api/db/regia-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, config: serverDb.getRegiaConfig() });
});

app.put('/api/db/regia-config', (req, res) => {
  const config = serverDb.saveRegiaConfig(req.body || {});
  res.json({ ok: true, config });
});

app.get('/api/db/tavolo-sets', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, sets: serverDb.listTavoloSets() });
});

app.get('/api/db/tavolo-sets/:setId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const set = serverDb.getTavoloSet(req.params.setId);
  res.json({ ok: true, found: Boolean(set), set });
});

app.put('/api/db/tavolo-sets/:setId', (req, res) => {
  const body = req.body || {};
  const saved = serverDb.saveTavoloSet({ ...body, id: req.params.setId, gameId: body.gameId || req.params.setId });
  if (!saved) {
    res.status(400).json({ ok: false, error: 'Dati sezione Tavolo non validi' });
    return;
  }
  res.json({ ok: true, set: saved });
});

app.patch('/api/db/tavolo-sets/:setId/active-sheets', (req, res) => {
  const activeSheets = Array.isArray(req.body?.activeSheets) ? req.body.activeSheets : [];
  const updatedAt = typeof req.body?.updatedAt === 'string' ? req.body.updatedAt : undefined;
  const result = serverDb.updateTavoloActiveSheets(req.params.setId, activeSheets, updatedAt);
  res.json({ ok: result.success, activeSheets: result.activeSheets });
});

// Vite Middleware for Development or Static Serving for Production
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware caricato in modalità sviluppo.');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (/\.(pdf|zip|js|css|png|jpg|jpeg|svg|ico|webp|woff2?|json)$/i.test(req.path)) {
        res.status(404).type('text/plain').send('File statico non trovato');
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[Server] Serviti file statici da ${distPath} in produzione.`);
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`⚡ Tombola 90 Server con WebSocket attivo su http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Errore critico avvio server:', err);
  process.exit(1);
});
