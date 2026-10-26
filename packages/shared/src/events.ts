// packages/shared/src/events.ts
// Typed Socket.IO event contracts with Zod schemas.
// Server never sees plaintext clipboard content or key material —
// all ciphertext is opaque bytes from the server's perspective.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Base64url-encoded bytes (no padding required, no + or / chars). */
export const Base64urlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, 'Must be base64url');

/** 128-bit (32 hex char) pairing ID */
export const PairingIdSchema = z.string().length(32).regex(/^[0-9a-f]+$/, 'Must be hex');

/** Short human code: 8 chars, unambiguous alphabet (no 0/O/l/1/I) */
export const ShortCodeSchema = z
  .string()
  .min(8)
  .max(8)
  .regex(/^[2-9A-HJ-NP-Z]+$/, 'Must be unambiguous alphabet');

/** 256-bit device token as 64-char hex */
export const DeviceTokenSchema = z.string().length(64).regex(/^[0-9a-f]+$/, 'Must be hex');

/** Message sequence number (u32) */
export const SequenceSchema = z.number().int().min(0).max(2_147_483_647);

// ---------------------------------------------------------------------------
// Pairing events
// ---------------------------------------------------------------------------

/**
 * PC → Server: request a new pairing session.
 * PC public key (ECDH P-256) is transmitted here so it can be included
 * in the QR code / short code metadata returned to the PC.
 * NOTE: The PC public key is NOT a secret; it's public. The server relays
 * it to the phone. The fragment of the QR URL also contains it.
 */
export const PairingCreatePayloadSchema = z.object({
  /** ECDH P-256 public key, SPKI format, base64url encoded */
  pcPublicKey: Base64urlSchema,
});
export type PairingCreatePayload = z.infer<typeof PairingCreatePayloadSchema>;

export const PairingCreatedPayloadSchema = z.object({
  pairingId: PairingIdSchema,
  shortCode: ShortCodeSchema,
  /** ISO 8601 expiry timestamp */
  expiresAt: z.string().datetime(),
  /** TTL in seconds from now */
  ttlSeconds: z.number().int().positive(),
});
export type PairingCreatedPayload = z.infer<typeof PairingCreatedPayloadSchema>;

/**
 * Phone → Server: join an existing pairing session.
 * Phone supplies its own ephemeral P-256 public key.
 */
export const PairingJoinPayloadSchema = z.object({
  pairingId: PairingIdSchema,
  /** Phone's ECDH P-256 public key, SPKI, base64url */
  phonePublicKey: Base64urlSchema,
});
export type PairingJoinPayload = z.infer<typeof PairingJoinPayloadSchema>;

/**
 * Server → PC: phone has joined, here is the phone's public key.
 * PC can now derive the shared secret.
 */
export const PairingPhoneJoinedPayloadSchema = z.object({
  pairingId: PairingIdSchema,
  phonePublicKey: Base64urlSchema,
});
export type PairingPhoneJoinedPayload = z.infer<typeof PairingPhoneJoinedPayloadSchema>;

/**
 * Server → Phone (after join): here is the PC's public key.
 * Phone can now derive the shared secret.
 */
export const PairingPcKeyPayloadSchema = z.object({
  pcPublicKey: Base64urlSchema,
});
export type PairingPcKeyPayload = z.infer<typeof PairingPcKeyPayloadSchema>;

/**
 * PC ↔ Phone: both sides confirm the authentication string matches.
 * Neither side sends the auth string itself over the wire — each device
 * derives it independently from the transcript hash.
 */
export const PairingConfirmPayloadSchema = z.object({
  pairingId: PairingIdSchema,
  /** 'confirmed' means this device's user clicked "Match" */
  confirmed: z.boolean(),
});
export type PairingConfirmPayload = z.infer<typeof PairingConfirmPayloadSchema>;

// ---------------------------------------------------------------------------
// Device / session events
// ---------------------------------------------------------------------------

export const DeviceConnectedPayloadSchema = z.object({
  /** Narrow session-scoped device token, 64-char hex */
  deviceToken: DeviceTokenSchema,
  sessionId: z.string().uuid(),
  role: z.enum(['pc', 'phone']),
  /** ISO 8601 session expiry */
  sessionExpiresAt: z.string().datetime(),
});
export type DeviceConnectedPayload = z.infer<typeof DeviceConnectedPayloadSchema>;

export const SessionDisconnectPayloadSchema = z.object({
  reason: z.enum([
    'user_request',
    'idle_timeout',
    'session_expired',
    'public_pc_wipe',
    'server_restart',
  ]),
});
export type SessionDisconnectPayload = z.infer<typeof SessionDisconnectPayloadSchema>;

export const SessionExpiredPayloadSchema = z.object({
  reason: z.enum(['ttl', 'idle', 'invalidated']),
});
export type SessionExpiredPayload = z.infer<typeof SessionExpiredPayloadSchema>;

// ---------------------------------------------------------------------------
// Transfer events
// ---------------------------------------------------------------------------

/** Maximum ciphertext size in bytes (100 KB plaintext + overhead) */
export const MAX_TRANSFER_BYTES = 102_400 + 256; // 100 KB + crypto overhead

/**
 * Phone → Server → PC: an encrypted clipboard transfer.
 * The server sees ONLY opaque ciphertext and metadata. It never sees
 * plaintext content, keys, or the content type.
 */
export const TransferSendPayloadSchema = z.object({
  /** Client-side random UUID per transfer */
  transferId: z.string().uuid(),
  /** Monotonically increasing per-session sequence number */
  seq: SequenceSchema,
  /** AES-256-GCM ciphertext, base64url */
  ciphertext: Base64urlSchema,
  /** Random 96-bit nonce, base64url (12 bytes = 16 base64url chars) */
  nonce: Base64urlSchema.refine((v) => {
    // base64url of 12 bytes is 16 chars
    return v.length === 16;
  }, 'Nonce must be 16 base64url chars (12 bytes)'),
  /** Byte length of ciphertext for server-side size check */
  byteLength: z.number().int().positive().max(MAX_TRANSFER_BYTES),
});
export type TransferSendPayload = z.infer<typeof TransferSendPayloadSchema>;

/** Server → PC: relayed transfer (same shape, server adds timestamp) */
export const TransferReceivedPayloadSchema = TransferSendPayloadSchema.extend({
  /** ISO 8601 timestamp when server received the transfer */
  receivedAt: z.string().datetime(),
  /** Transfer TTL expiry */
  expiresAt: z.string().datetime(),
});
export type TransferReceivedPayload = z.infer<typeof TransferReceivedPayloadSchema>;

export const TransferDeletePayloadSchema = z.object({
  transferId: z.string().uuid(),
});
export type TransferDeletePayload = z.infer<typeof TransferDeletePayloadSchema>;

export const TransferDeletedPayloadSchema = z.object({
  transferId: z.string().uuid(),
});
export type TransferDeletedPayload = z.infer<typeof TransferDeletedPayloadSchema>;

// ---------------------------------------------------------------------------
// Error event
// ---------------------------------------------------------------------------

/** Generic error event — no oracle; no internal detail in production */
export const ErrorPayloadSchema = z.object({
  code: z.enum([
    'PAIRING_EXPIRED',
    'PAIRING_NOT_FOUND',
    'PAIRING_ALREADY_USED',
    'AUTH_FAILED',
    'RATE_LIMITED',
    'PAYLOAD_TOO_LARGE',
    'SESSION_EXPIRED',
    'UNAUTHORISED',
    'INVALID_PAYLOAD',
    'TRANSFER_LIMIT_EXCEEDED',
    'INTERNAL_ERROR',
  ]),
  message: z.string().max(256),
});
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

// ---------------------------------------------------------------------------
// Full event map (for Socket.IO typing)
// ---------------------------------------------------------------------------

/** Events the server listens for (client → server) */
export interface ClientToServerEvents {
  'pairing:create': (payload: PairingCreatePayload) => void;
  'pairing:join': (payload: PairingJoinPayload) => void;
  'pairing:confirm': (payload: PairingConfirmPayload) => void;
  'transfer:send': (payload: TransferSendPayload) => void;
  'transfer:delete': (payload: TransferDeletePayload) => void;
  'session:disconnect': (payload: SessionDisconnectPayload) => void;
}

/** Events the server emits (server → client) */
export interface ServerToClientEvents {
  'pairing:created': (payload: PairingCreatedPayload) => void;
  'pairing:phone_joined': (payload: PairingPhoneJoinedPayload) => void;
  'pairing:pc_key': (payload: PairingPcKeyPayload) => void;
  'pairing:confirmed': () => void;
  'pairing:peer_confirmed': () => void;
  'device:connected': (payload: DeviceConnectedPayload) => void;
  'transfer:received': (payload: TransferReceivedPayload) => void;
  'transfer:deleted': (payload: TransferDeletedPayload) => void;
  'session:expired': (payload: SessionExpiredPayload) => void;
  error: (payload: ErrorPayload) => void;
}

/** Inter-server events (for Socket.IO adapter; not used in MVP single-instance) */
export interface InterServerEvents {
  ping: () => void;
}

/** Per-socket server-side data */
export interface SocketData {
  sessionId: string;
  role: 'pc' | 'phone';
  deviceTokenHash: string;
  authenticated: boolean;
}
