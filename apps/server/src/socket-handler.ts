// apps/server/src/socket-handler.ts
// Socket.IO event handlers — pairing, auth, transfer relay.
// All event payloads validated with Zod before processing.
// Server sees ONLY opaque ciphertext; never plaintext or key material.

import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@clipper/shared';
import {
  PairingCreatePayloadSchema,
  PairingJoinPayloadSchema,
  PairingConfirmPayloadSchema,
  TransferSendPayloadSchema,
  TransferDeletePayloadSchema,
  SessionDisconnectPayloadSchema,
  MAX_TRANSFER_BYTES,
} from '@clipper/shared';
import { store } from './session-store.js';
import { config } from './config.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// ---------------------------------------------------------------------------
// Rate limiting per IP (in-memory, per event)
// ---------------------------------------------------------------------------
interface RateEntry { count: number; resetAt: number }
const pairingRateMap = new Map<string, RateEntry>();

function checkPairingRate(ip: string): boolean {
  const now = Date.now();
  let entry = pairingRateMap.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + config.RATE_LIMIT_PAIRING_WINDOW_MS };
    pairingRateMap.set(ip, entry);
  }
  entry.count++;
  return entry.count <= config.RATE_LIMIT_PAIRING_MAX;
}

const transferRateMap = new Map<string, RateEntry>();
function checkTransferRate(sessionId: string): boolean {
  const now = Date.now();
  let entry = transferRateMap.get(sessionId);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + config.RATE_LIMIT_TRANSFER_WINDOW_MS };
    transferRateMap.set(sessionId, entry);
  }
  entry.count++;
  return entry.count <= config.RATE_LIMIT_TRANSFER_MAX;
}

// ---------------------------------------------------------------------------
// Auth middleware on initial connection
// Socket.IO auth is in socket.handshake.auth
// ---------------------------------------------------------------------------
export function setupSocketAuth(io: AppServer): void {
  io.use((socket, next) => {
    const auth = socket.handshake.auth as Record<string, unknown>;
    const sessionId = typeof auth['sessionId'] === 'string' ? auth['sessionId'] : null;
    const deviceToken = typeof auth['deviceToken'] === 'string' ? auth['deviceToken'] : null;
    const role = typeof auth['role'] === 'string' ? auth['role'] : null;

    // New connections (pairing) don't have a session yet — allow them through
    // They will authenticate via pairing:create / pairing:join events
    if (!sessionId || !deviceToken || !role) {
      // Unauthenticated — allowed for pairing flow only
      socket.data.authenticated = false;
      return next();
    }

    if (role !== 'pc' && role !== 'phone') {
      return next(new Error('UNAUTHORISED'));
    }

    const session = store.getSession(sessionId);
    if (!session) {
      return next(new Error('SESSION_EXPIRED'));
    }

    if (!store.verifyToken(session, deviceToken, role as 'pc' | 'phone')) {
      return next(new Error('AUTH_FAILED'));
    }

    // Update socket ID in store (reconnect)
    if (role === 'pc' && session.pcSocketId && session.pcSocketId !== socket.id) {
      store.updateSocketId(session.pcSocketId, socket.id);
    }
    if (role === 'phone' && session.phoneSocketId && session.phoneSocketId !== socket.id) {
      store.updateSocketId(session.phoneSocketId, socket.id);
    }

    socket.data.sessionId = sessionId;
    socket.data.role = role as 'pc' | 'phone';
    socket.data.deviceTokenHash = '';
    socket.data.authenticated = true;

    next();
  });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------
export function registerSocketHandlers(socket: AppSocket, _io: AppServer): void {
  const ip = socket.handshake.address;

  // -------------------------------------------------------------------------
  // pairing:create — PC requests a new pairing session
  // -------------------------------------------------------------------------
  socket.on('pairing:create', (payload) => {
    const parsed = PairingCreatePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' });
      return;
    }

    if (!checkPairingRate(ip)) {
      socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many pairing attempts.' });
      return;
    }

    const pairing = store.createPairing(socket.id, parsed.data.pcPublicKey);

    socket.emit('pairing:created', {
      pairingId: pairing.pairingId,
      shortCode: pairing.shortCode,
      expiresAt: pairing.expiresAt.toISOString(),
      ttlSeconds: config.PAIRING_TTL_SECONDS,
    });
  });

  // -------------------------------------------------------------------------
  // pairing:join — Phone joins a pairing session
  // -------------------------------------------------------------------------
  socket.on('pairing:join', (payload) => {
    const parsed = PairingJoinPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' });
      return;
    }

    if (!checkPairingRate(ip)) {
      socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many pairing attempts.' });
      return;
    }

    const pairing = store.getPairing(parsed.data.pairingId);

    if (!pairing) {
      socket.emit('error', { code: 'PAIRING_NOT_FOUND', message: 'Pairing not found or expired.' });
      return;
    }

    if (pairing.used) {
      socket.emit('error', { code: 'PAIRING_ALREADY_USED', message: 'Pairing already used.' });
      return;
    }

    if (pairing.expiresAt <= new Date()) {
      store.deletePairing(pairing.pairingId);
      socket.emit('error', { code: 'PAIRING_EXPIRED', message: 'Pairing expired.' });
      return;
    }

    // Mark join attempt from this IP
    pairing.joinAttemptIPs.add(ip);
    pairing.phoneSocketId = socket.id;

    // Tell the PC about the phone's public key
    if (pairing.pcSocketId) {
      const pcSocket = _io.sockets.sockets.get(pairing.pcSocketId);
      if (pcSocket) {
        pcSocket.emit('pairing:phone_joined', {
          pairingId: pairing.pairingId,
          phonePublicKey: parsed.data.phonePublicKey,
        });
      }
    }

    // Tell the phone the PC's public key (so it can derive the shared secret)
    socket.emit('pairing:pc_key', { pcPublicKey: pairing.pcPublicKey });
  });

  // -------------------------------------------------------------------------
  // pairing:confirm — Device confirms auth string matches
  // -------------------------------------------------------------------------
  socket.on('pairing:confirm', (payload) => {
    const parsed = PairingConfirmPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' });
      return;
    }

    const pairing = store.getPairing(parsed.data.pairingId);
    if (!pairing) {
      socket.emit('error', { code: 'PAIRING_NOT_FOUND', message: 'Pairing not found.' });
      return;
    }
    if (pairing.expiresAt <= new Date()) {
      store.deletePairing(pairing.pairingId);
      socket.emit('error', { code: 'PAIRING_EXPIRED', message: 'Pairing expired.' });
      return;
    }

    if (!parsed.data.confirmed) {
      // User rejected — tear down
      store.deletePairing(pairing.pairingId);
      return;
    }

    // Determine which side this is
    const isPc = socket.id === pairing.pcSocketId;
    const isPhone = socket.id === pairing.phoneSocketId;

    if (!isPc && !isPhone) {
      socket.emit('error', { code: 'UNAUTHORISED', message: 'Not part of this pairing.' });
      return;
    }

    // Track confirmation
    if (isPc) {
      (pairing as any)._pcConfirmed = true;
    } else {
      (pairing as any)._phoneConfirmed = true;
    }

    socket.emit('pairing:confirmed');

    // If both confirmed, upgrade to a full session
    if ((pairing as any)._pcConfirmed && (pairing as any)._phoneConfirmed) {
      const pcSocketId = pairing.pcSocketId!;
      const phoneSocketId = pairing.phoneSocketId!;

      store.consumePairing(pairing.pairingId);
      store.deletePairing(pairing.pairingId);

      const { session, pcToken, phoneToken } = store.createSession(pcSocketId, phoneSocketId);

      const sessionExpiresAt = session.expiresAt.toISOString();

      // Notify PC
      const pcSocket = _io.sockets.sockets.get(pcSocketId);
      if (pcSocket) {
        pcSocket.data.sessionId = session.sessionId;
        pcSocket.data.role = 'pc';
        pcSocket.data.authenticated = true;
        pcSocket.emit('device:connected', {
          deviceToken: pcToken,
          sessionId: session.sessionId,
          role: 'pc',
          sessionExpiresAt,
        });
      }

      // Notify Phone
      const phoneSocket = _io.sockets.sockets.get(phoneSocketId);
      if (phoneSocket) {
        phoneSocket.data.sessionId = session.sessionId;
        phoneSocket.data.role = 'phone';
        phoneSocket.data.authenticated = true;
        phoneSocket.emit('device:connected', {
          deviceToken: phoneToken,
          sessionId: session.sessionId,
          role: 'phone',
          sessionExpiresAt,
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // transfer:send — Phone sends encrypted clipboard to PC
  // -------------------------------------------------------------------------
  socket.on('transfer:send', (payload) => {
    // Must be authenticated and be the phone
    if (!socket.data.authenticated || socket.data.role !== 'phone') {
      socket.emit('error', { code: 'UNAUTHORISED', message: 'Not authorised.' });
      return;
    }

    const session = store.getSession(socket.data.sessionId);
    if (!session) {
      socket.emit('error', { code: 'SESSION_EXPIRED', message: 'Session expired.' });
      return;
    }

    if (!checkTransferRate(socket.data.sessionId)) {
      socket.emit('error', { code: 'RATE_LIMITED', message: 'Transfer rate limit exceeded.' });
      return;
    }

    const parsed = TransferSendPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' });
      return;
    }

    if (parsed.data.byteLength > config.MAX_TRANSFER_BYTES) {
      socket.emit('error', { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' });
      return;
    }

    if (session.transfers.size >= config.MAX_TRANSFERS_PER_SESSION) {
      socket.emit('error', { code: 'TRANSFER_LIMIT_EXCEEDED', message: 'Transfer limit reached.' });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.TRANSFER_TTL_MINUTES * 60 * 1000);

    const transfer = {
      transferId: parsed.data.transferId,
      seq: parsed.data.seq,
      ciphertext: parsed.data.ciphertext,
      nonce: parsed.data.nonce,
      byteLength: parsed.data.byteLength,
      receivedAt: now,
      expiresAt,
    };

    if (!store.addTransfer(session, transfer)) {
      socket.emit('error', { code: 'TRANSFER_LIMIT_EXCEEDED', message: 'Transfer limit reached.' });
      return;
    }

    store.touchSession(socket.data.sessionId);

    // Relay ONLY opaque ciphertext to PC — server never sees plaintext
    if (session.pcSocketId) {
      const pcSocket = _io.sockets.sockets.get(session.pcSocketId);
      if (pcSocket) {
        pcSocket.emit('transfer:received', {
          ...parsed.data,
          receivedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // transfer:delete — PC deletes a transfer
  // -------------------------------------------------------------------------
  socket.on('transfer:delete', (payload) => {
    if (!socket.data.authenticated || socket.data.role !== 'pc') {
      socket.emit('error', { code: 'UNAUTHORISED', message: 'Not authorised.' });
      return;
    }

    const session = store.getSession(socket.data.sessionId);
    if (!session) {
      socket.emit('error', { code: 'SESSION_EXPIRED', message: 'Session expired.' });
      return;
    }

    const parsed = TransferDeletePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' });
      return;
    }

    store.deleteTransfer(session, parsed.data.transferId);
    store.touchSession(socket.data.sessionId);

    socket.emit('transfer:deleted', { transferId: parsed.data.transferId });
  });

  // -------------------------------------------------------------------------
  // session:disconnect — Device requests clean disconnect
  // -------------------------------------------------------------------------
  socket.on('session:disconnect', (payload) => {
    const parsed = SessionDisconnectPayloadSchema.safeParse(payload);
    const reason = parsed.success ? parsed.data.reason : 'user_request';

    if (socket.data.authenticated && socket.data.sessionId) {
      const session = store.getSession(socket.data.sessionId);
      if (session) {
        // Notify peer
        const peerSocketId =
          socket.data.role === 'pc' ? session.phoneSocketId : session.pcSocketId;
        if (peerSocketId) {
          const peerSocket = _io.sockets.sockets.get(peerSocketId);
          if (peerSocket) {
            peerSocket.emit('session:expired', { reason: 'invalidated' });
          }
        }
        store.invalidateSession(socket.data.sessionId);
      }
    }

    socket.disconnect(true);
    void reason;
  });

  // -------------------------------------------------------------------------
  // Disconnect (transport close)
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
    const session = store.removeSocket(socket.id);
    if (!session) return;

    // Connection state recovery handles brief blips, but if transport disconnects:
    // We KEEP the session alive for the configured SESSION_IDLE_MINUTES (default 30 min)
    // so the user can freely minimize Safari, switch to another app, and return
    // without getting disconnected.
    // The session is cleaned up by the idle sweeper or explicit session:disconnect.
  });
}
