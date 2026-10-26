// packages/shared/src/__tests__/events.test.ts
import { describe, it, expect } from 'vitest';
import {
  PairingCreatePayloadSchema,
  PairingJoinPayloadSchema,
  TransferSendPayloadSchema,
  MAX_TRANSFER_BYTES,
} from '../events.js';
import { base64urlEncode } from '../crypto.js';

describe('PairingCreatePayloadSchema', () => {
  it('accepts valid payload', () => {
    const result = PairingCreatePayloadSchema.safeParse({
      pcPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-base64url characters', () => {
    const result = PairingCreatePayloadSchema.safeParse({
      pcPublicKey: 'invalid+/=key',
    });
    expect(result.success).toBe(false);
  });
});

describe('PairingJoinPayloadSchema', () => {
  it('rejects wrong pairingId length', () => {
    const result = PairingJoinPayloadSchema.safeParse({
      pairingId: 'tooshort',
      phonePublicKey: 'validbase64url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid payload', () => {
    const result = PairingJoinPayloadSchema.safeParse({
      pairingId: 'a'.repeat(32),
      phonePublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest',
    });
    expect(result.success).toBe(true);
  });
});

describe('TransferSendPayloadSchema', () => {
  it('accepts valid transfer', () => {
    const nonce = base64urlEncode(crypto.getRandomValues(new Uint8Array(12)));
    const cipher = base64urlEncode(crypto.getRandomValues(new Uint8Array(64)));
    const result = TransferSendPayloadSchema.safeParse({
      transferId: '550e8400-e29b-41d4-a716-446655440000',
      seq: 0,
      ciphertext: cipher,
      nonce,
      byteLength: 64,
    });
    expect(result.success).toBe(true);
  });

  it('rejects oversized byteLength', () => {
    const nonce = base64urlEncode(crypto.getRandomValues(new Uint8Array(12)));
    const result = TransferSendPayloadSchema.safeParse({
      transferId: '550e8400-e29b-41d4-a716-446655440000',
      seq: 0,
      ciphertext: 'abc',
      nonce,
      byteLength: MAX_TRANSFER_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong nonce length', () => {
    const result = TransferSendPayloadSchema.safeParse({
      transferId: '550e8400-e29b-41d4-a716-446655440000',
      seq: 0,
      ciphertext: 'abc',
      nonce: 'tooshort',
      byteLength: 10,
    });
    expect(result.success).toBe(false);
  });
});
