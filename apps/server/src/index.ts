// apps/server/src/index.ts
// Entry point: creates the HTTP server, attaches Socket.IO, starts listening.

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@clipper/shared';
import { createApp } from './app.js';
import { setupSocketAuth, registerSocketHandlers } from './socket-handler.js';
import { getAllowedOrigins, config } from './config.js';

const app = createApp();
const httpServer = createServer(app);

const allowedOrigins = getAllowedOrigins();

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS origin not allowed'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: false,
    },
    // Connection state recovery — helps reconnect
    connectionStateRecovery: {
      maxDisconnectionDuration: 120_000, // 2 minutes
      skipMiddlewares: false,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: false,
    pingTimeout: 30_000,
    pingInterval: 25_000,
  },
);

setupSocketAuth(io);

io.on('connection', (socket) => {
  registerSocketHandlers(socket, io);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown(signal: string): void {
  console.log(`[server] Received ${signal}, shutting down gracefully...`);

  // Notify all connected clients
  io.emit('session:expired', { reason: 'invalidated' });

  httpServer.close(() => {
    console.log('[server] HTTP server closed.');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[server] Forced exit after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(config.PORT, () => {
  console.log(`[server] Listening on port ${config.PORT} (${config.NODE_ENV})`);
  console.log(`[server] Allowed origins: ${getAllowedOrigins().join(', ')}`);
});

export { httpServer, io };
