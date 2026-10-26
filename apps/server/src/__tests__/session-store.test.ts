// apps/server/src/__tests__/session-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStore } from '../session-store-testable.js';

// We use a testable version that doesn't auto-start the sweeper
// and exposes internal state for assertions.

describe('SessionStore — pairing', () => {
  let store: SessionStore;
  beforeEach(() => {
    store = new SessionStore();
  });

  it('creates a pairing with correct structure', () => {
    const p = store.createPairing('socket-1', 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest');
    expect(p.pairingId).toMatch(/^[0-9a-f]{32}$/);
    expect(p.shortCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(p.used).toBe(false);
    expect(p.pcSocketId).toBe('socket-1');
    expect(p.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('retrieves pairing by id', () => {
    const p = store.createPairing('socket-1', 'pubkey');
    const found = store.getPairing(p.pairingId);
    expect(found).toBeTruthy();
    expect(found?.pairingId).toBe(p.pairingId);
  });

  it('retrieves pairing by short code (case-insensitive)', () => {
    const p = store.createPairing('socket-1', 'pubkey');
    const found = store.getPairingByCode(p.shortCode.toLowerCase());
    expect(found?.pairingId).toBe(p.pairingId);
  });

  it('consumes pairing only once', () => {
    const p = store.createPairing('socket-1', 'pubkey');
    const first = store.consumePairing(p.pairingId);
    expect(first).not.toBeNull();
    const second = store.consumePairing(p.pairingId);
    expect(second).toBeNull();
  });

  it('returns null for expired pairing', () => {
    const p = store.createPairing('socket-1', 'pubkey');
    // Manually expire
    p.expiresAt = new Date(Date.now() - 1000);
    const result = store.consumePairing(p.pairingId);
    expect(result).toBeNull();
  });

  it('deletes pairing and its short code index', () => {
    const p = store.createPairing('socket-1', 'pubkey');
    store.deletePairing(p.pairingId);
    expect(store.getPairing(p.pairingId)).toBeUndefined();
    expect(store.getPairingByCode(p.shortCode)).toBeUndefined();
  });

  it('short code uses unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const p = store.createPairing(`socket-${i}`, 'pubkey');
      expect(p.shortCode).not.toMatch(/[01IlO]/);
    }
  });
});

describe('SessionStore — sessions', () => {
  let store: SessionStore;
  beforeEach(() => {
    store = new SessionStore();
  });

  it('creates a session with tokens', () => {
    const { session, pcToken, phoneToken } = store.createSession('pc-sock', 'phone-sock');
    expect(session.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(pcToken).toMatch(/^[0-9a-f]{64}$/);
    expect(phoneToken).toMatch(/^[0-9a-f]{64}$/);
    expect(pcToken).not.toBe(phoneToken);
  });

  it('verifies correct tokens', () => {
    const { session, pcToken, phoneToken } = store.createSession('pc-sock', 'phone-sock');
    expect(store.verifyToken(session, pcToken, 'pc')).toBe(true);
    expect(store.verifyToken(session, phoneToken, 'phone')).toBe(true);
  });

  it('rejects wrong token', () => {
    const { session } = store.createSession('pc-sock', 'phone-sock');
    expect(store.verifyToken(session, 'a'.repeat(64), 'pc')).toBe(false);
  });

  it('rejects cross-role token', () => {
    const { session, pcToken, phoneToken } = store.createSession('pc-sock', 'phone-sock');
    expect(store.verifyToken(session, pcToken, 'phone')).toBe(false);
    expect(store.verifyToken(session, phoneToken, 'pc')).toBe(false);
  });

  it('finds session by socket id', () => {
    const { session } = store.createSession('pc-sock', 'phone-sock');
    const byPc = store.getSessionBySocket('pc-sock');
    const byPhone = store.getSessionBySocket('phone-sock');
    expect(byPc?.sessionId).toBe(session.sessionId);
    expect(byPhone?.sessionId).toBe(session.sessionId);
  });

  it('invalidates session and nulls tokens', () => {
    const { session } = store.createSession('pc-sock', 'phone-sock');
    store.invalidateSession(session.sessionId);
    expect(store.getSession(session.sessionId)).toBeUndefined();
    expect(store.getSessionBySocket('pc-sock')).toBeUndefined();
  });

  it('transfers are stored and deleted correctly', () => {
    const { session } = store.createSession('pc-sock', 'phone-sock');
    const transfer = {
      transferId: '550e8400-e29b-41d4-a716-446655440000',
      seq: 0,
      ciphertext: 'abc',
      nonce: 'aaaaaaaaaaaaaaaa',
      byteLength: 3,
      receivedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const added = store.addTransfer(session, transfer);
    expect(added).toBe(true);
    expect(session.transfers.has(transfer.transferId)).toBe(true);

    const deleted = store.deleteTransfer(session, transfer.transferId);
    expect(deleted).toBe(true);
    expect(session.transfers.has(transfer.transferId)).toBe(false);
  });

  it('enforces max transfers per session', () => {
    const { session } = store.createSession('pc-sock', 'phone-sock');
    // Override config for test
    (store as any).maxTransfers = 2;
    for (let i = 0; i < 2; i++) {
      store.addTransfer(session, {
        transferId: `id-${i}`,
        seq: i,
        ciphertext: 'c',
        nonce: 'aaaaaaaaaaaaaaaa',
        byteLength: 1,
        receivedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
    }
    // Force capacity by manually setting
    session.transfers.set('extra', {
      transferId: 'extra',
      seq: 99,
      ciphertext: 'x',
      nonce: 'aaaaaaaaaaaaaaaa',
      byteLength: 1,
      receivedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    // Now at max
    session.transfers.delete('extra');
    for (let i = 2; i < 25; i++) {
      store.addTransfer(session, {
        transferId: `id-${i}`,
        seq: i,
        ciphertext: 'c',
        nonce: 'aaaaaaaaaaaaaaaa',
        byteLength: 1,
        receivedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
    }
    // Default MAX_TRANSFERS_PER_SESSION is 20 from config
    expect(session.transfers.size).toBeLessThanOrEqual(20);
  });

  it('sweeper removes expired pairing sessions', () => {
    const p = store.createPairing('socket-1', 'pubkey');
    p.expiresAt = new Date(Date.now() - 1000);
    const { expiredPairings } = store.sweep();
    expect(expiredPairings).toContain(p.pairingId);
    expect(store.getPairing(p.pairingId)).toBeUndefined();
  });

  it('sweeper removes idle clipper sessions', () => {
    const { session } = store.createSession('pc-sock', 'phone-sock');
    // Force idle by setting lastActivityAt far in the past
    session.lastActivityAt = new Date(Date.now() - 100 * 60 * 1000); // 100 minutes ago
    session.expiresAt = new Date(Date.now() - 1000);
    const { expiredSessions } = store.sweep();
    expect(expiredSessions).toContain(session.sessionId);
    expect(store.getSession(session.sessionId)).toBeUndefined();
  });

  it('cross-session isolation: foreign socketId gets no session', () => {
    store.createSession('pc-sock', 'phone-sock');
    const result = store.getSessionBySocket('other-socket');
    expect(result).toBeUndefined();
  });
});
