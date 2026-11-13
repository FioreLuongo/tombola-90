import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

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

const defaultGameState: ServerGameState = {
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

let currentGameState: ServerGameState = { ...defaultGameState };

// Initialize WebSocket Server safely via noServer to avoid conflicting with other upgrade paths
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/ws') {
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
            ...defaultGameState,
            unclaimedPot: msg.preserveUnclaimed ? currentGameState.unclaimedPot : 0,
            prizePool: msg.prizePool || currentGameState.prizePool,
            currency: msg.currency || currentGameState.currency,
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

// Setup Express Middlewares & Routes
app.use(express.json());

// API Status endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'Tombola-90 Gold Edition',
    connectedClients: wss.clients.size,
    extractedCount: currentGameState.extractedNumbers.length,
    unclaimedPot: currentGameState.unclaimedPot,
    timestamp: Date.now()
  });
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
    app.get('*', (_req, res) => {
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
