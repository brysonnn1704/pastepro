// apps/server/src/session-store-testable.ts
// Re-exports the SessionStore class for testing.
// The session-store.ts module exports a singleton `store` — this file
// exports the class directly so tests can instantiate fresh instances.

import { randomBytes, createHash } from 'node:crypto';
import { config } from './config.js';

// ---------------------------------------------------------------------------
// Types (duplicated here to avoid circular import)
// ---------------------------------------------------------------------------

export interface PairingSession {
  pairingId: string;
  shortCode: string;
  pcPublicKey: string;
  expiresAt: Date;
  used: boolean;
  pcSocketId: string | null;
  phoneSocketId: string | null;
  joinAttemptIPs: Set<string>;
}

export interface Transfer {
  transferId: string;
  seq: number;
  ciphertext: string;
  nonce: string;
  byteLength: number;
  receivedAt: Date;
  expiresAt: Date;
}

export interface ClipperSession {
  sessionId: string;
  pcTokenHash: string | null;
  phoneTokenHash: string | null;
  pcSocketId: string | null;
  phoneSocketId: string | null;
  pcConfirmed: boolean;
  phoneConfirmed: boolean;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  transfers: Map<string, Transfer>;
  nextExpectedSeq: number;
}

const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateShortCode(length = 8): string {
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => SHORT_CODE_ALPHABET[b % SHORT_CODE_ALPHABET.length]!)
    .join('');
}

function generateHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export class SessionStore {
  private pairingSessions = new Map<string, PairingSession>();
  private shortCodeIndex = new Map<string, string>();
  private clipperSessions = new Map<string, ClipperSession>();
  private socketToSession = new Map<string, string>();

  createPairing(pcSocketId: string, pcPublicKey: string): PairingSession {
    const pairingId = generateHex(16);
    const shortCode = generateShortCode(8);
    const expiresAt = new Date(Date.now() + config.PAIRING_TTL_SECONDS * 1000);

    const session: PairingSession = {
      pairingId,
      shortCode,
      pcPublicKey,
      expiresAt,
      used: false,
      pcSocketId,
      phoneSocketId: null,
      joinAttemptIPs: new Set(),
    };

    this.pairingSessions.set(pairingId, session);
    this.shortCodeIndex.set(shortCode, pairingId);
    return session;
  }

  getPairing(pairingId: string): PairingSession | undefined {
    return this.pairingSessions.get(pairingId);
  }

  getPairingByCode(shortCode: string): PairingSession | undefined {
    const id = this.shortCodeIndex.get(shortCode.toUpperCase());
    if (!id) return undefined;
    return this.pairingSessions.get(id);
  }

  consumePairing(pairingId: string): PairingSession | null {
    const session = this.pairingSessions.get(pairingId);
    if (!session) return null;
    if (session.used || session.expiresAt <= new Date()) return null;
    session.used = true;
    return session;
  }

  deletePairing(pairingId: string): void {
    const session = this.pairingSessions.get(pairingId);
    if (session) {
      this.shortCodeIndex.delete(session.shortCode);
      this.pairingSessions.delete(pairingId);
    }
  }

  createSession(pcSocketId: string, phoneSocketId: string): {
    session: ClipperSession;
    pcToken: string;
    phoneToken: string;
  } {
    const sessionId = crypto.randomUUID();
    const pcToken = generateHex(32);
    const phoneToken = generateHex(32);

    const expiresAt = new Date(Date.now() + config.SESSION_IDLE_MINUTES * 60 * 1000);

    const session: ClipperSession = {
      sessionId,
      pcTokenHash: sha256Hex(pcToken),
      phoneTokenHash: sha256Hex(phoneToken),
      pcSocketId,
      phoneSocketId,
      pcConfirmed: false,
      phoneConfirmed: false,
      createdAt: new Date(),
      expiresAt,
      lastActivityAt: new Date(),
      transfers: new Map(),
      nextExpectedSeq: 0,
    };

    this.clipperSessions.set(sessionId, session);
    this.socketToSession.set(pcSocketId, sessionId);
    this.socketToSession.set(phoneSocketId, sessionId);

    return { session, pcToken, phoneToken };
  }

  getSession(sessionId: string): ClipperSession | undefined {
    return this.clipperSessions.get(sessionId);
  }

  getSessionBySocket(socketId: string): ClipperSession | undefined {
    const sessionId = this.socketToSession.get(socketId);
    if (!sessionId) return undefined;
    return this.clipperSessions.get(sessionId);
  }

  verifyToken(session: ClipperSession, token: string, role: 'pc' | 'phone'): boolean {
    const hash = sha256Hex(token);
    const storedHash = role === 'pc' ? session.pcTokenHash : session.phoneTokenHash;
    if (!storedHash) return false;
    if (hash.length !== storedHash.length) return false;
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i]! ^ b[i]!);
    return diff === 0;
  }

  touchSession(sessionId: string): void {
    const session = this.clipperSessions.get(sessionId);
    if (!session) return;
    session.lastActivityAt = new Date();
    session.expiresAt = new Date(Date.now() + config.SESSION_IDLE_MINUTES * 60 * 1000);
  }

  addTransfer(session: ClipperSession, transfer: Transfer): boolean {
    if (session.transfers.size >= config.MAX_TRANSFERS_PER_SESSION) return false;
    session.transfers.set(transfer.transferId, transfer);
    return true;
  }

  deleteTransfer(session: ClipperSession, transferId: string): boolean {
    return session.transfers.delete(transferId);
  }

  invalidateSession(sessionId: string): void {
    const session = this.clipperSessions.get(sessionId);
    if (!session) return;
    if (session.pcSocketId) this.socketToSession.delete(session.pcSocketId);
    if (session.phoneSocketId) this.socketToSession.delete(session.phoneSocketId);
    session.pcTokenHash = null;
    session.phoneTokenHash = null;
    this.clipperSessions.delete(sessionId);
  }

  removeSocket(socketId: string): ClipperSession | undefined {
    const session = this.getSessionBySocket(socketId);
    this.socketToSession.delete(socketId);
    if (session) {
      if (session.pcSocketId === socketId) session.pcSocketId = null;
      if (session.phoneSocketId === socketId) session.phoneSocketId = null;
    }
    return session;
  }

  updateSocketId(oldSocketId: string, newSocketId: string): void {
    const sessionId = this.socketToSession.get(oldSocketId);
    if (!sessionId) return;
    const session = this.clipperSessions.get(sessionId);
    if (!session) return;
    this.socketToSession.delete(oldSocketId);
    this.socketToSession.set(newSocketId, sessionId);
    if (session.pcSocketId === oldSocketId) session.pcSocketId = newSocketId;
    if (session.phoneSocketId === oldSocketId) session.phoneSocketId = newSocketId;
  }

  sweep(): { expiredPairings: string[]; expiredSessions: string[] } {
    const now = new Date();
    const expiredPairings: string[] = [];
    const expiredSessions: string[] = [];

    for (const [id, ps] of this.pairingSessions) {
      if (ps.expiresAt <= now || ps.used) {
        this.shortCodeIndex.delete(ps.shortCode);
        this.pairingSessions.delete(id);
        expiredPairings.push(id);
      }
    }

    for (const [id, cs] of this.clipperSessions) {
      const idleDeadline = new Date(
        cs.lastActivityAt.getTime() + config.SESSION_IDLE_MINUTES * 60 * 1000,
      );
      if (idleDeadline <= now) {
        expiredSessions.push(id);
        this.invalidateSession(id);
        continue;
      }
      for (const [tid, t] of cs.transfers) {
        if (t.expiresAt <= now) cs.transfers.delete(tid);
      }
    }

    return { expiredPairings, expiredSessions };
  }

  get pairingCount(): number { return this.pairingSessions.size; }
  get sessionCount(): number { return this.clipperSessions.size; }
}
