// packages/shared/src/crypto.ts
// WebCrypto-based E2EE helpers.
// Uses only SubtleCrypto (ECDH P-256, HKDF-SHA-256, AES-256-GCM).
// No custom cryptographic primitives.

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

export function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64urlDecode(s: string): ArrayBuffer {
  // Restore padding
  const rem = s.length % 4;
  const padded = rem === 0 ? s : s + '==='.slice(0, 4 - rem);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/** Decode base64url to Uint8Array */
function b64uToBytes(s: string): Uint8Array {
  return new Uint8Array(base64urlDecode(s));
}

// ---------------------------------------------------------------------------
// ECDH P-256 key pair
// ---------------------------------------------------------------------------

/** Generate an ephemeral ECDH P-256 key pair */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
}

/** Export a public key to SPKI base64url */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return base64urlEncode(spki);
}

/** Import a public key from SPKI base64url */
export async function importPublicKey(spkiBase64url: string): Promise<CryptoKey> {
  const spki = base64urlDecode(spkiBase64url);
  return crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

/** Export a private key to PKCS#8 base64url (for in-memory serialization only) */
export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  return base64urlEncode(pkcs8);
}

// ---------------------------------------------------------------------------
// ECDH shared secret + HKDF key derivation
// ---------------------------------------------------------------------------

const HKDF_SALT = new Uint8Array(32).buffer as ArrayBuffer; // all-zeros salt, acceptable per RFC 5869

/** Derive a raw ECDH shared secret as bits for HKDF */
async function deriveECDHBits(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256,
  );
}

/** Import ECDH bits as HKDF key */
async function importAsHKDF(bits: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

/** Derive bits from HKDF-SHA-256 */
async function hkdfDeriveBits(
  hkdfKey: CryptoKey,
  info: string,
  lengthBits: number,
): Promise<ArrayBuffer> {
  const infoBytes = new TextEncoder().encode(info);
  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: infoBytes,
    },
    hkdfKey,
    lengthBits,
  );
}

/** Derived session keys from an ECDH key exchange */
export interface DerivedSessionKeys {
  /** AES-256-GCM key for message encryption/decryption */
  encryptionKey: CryptoKey;
  /** Raw bytes of the auth confirmation key (for auth string derivation) */
  authKeyBytes: Uint8Array;
}

/**
 * Derive session keys from own private key and peer public key.
 * Uses HKDF-SHA-256 with distinct `info` labels.
 */
export async function deriveSessionKeys(
  ownPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<DerivedSessionKeys> {
  const ecdhBits = await deriveECDHBits(ownPrivateKey, peerPublicKey);
  const hkdfKey = await importAsHKDF(ecdhBits);

  const [encKeyBits, authKeyBits] = await Promise.all([
    hkdfDeriveBits(hkdfKey, 'clipper-v1-encryption-key', 256),
    hkdfDeriveBits(hkdfKey, 'clipper-v1-auth-confirmation-key', 256),
  ]);

  const encryptionKey = await crypto.subtle.importKey(
    'raw',
    encKeyBits,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return {
    encryptionKey,
    authKeyBytes: new Uint8Array(authKeyBits),
  };
}

// ---------------------------------------------------------------------------
// Auth string (SAS — Short Authentication String)
// ---------------------------------------------------------------------------

/**
 * Derive a 6-digit auth confirmation string.
 * Both devices pass keys in the SAME canonical order (pc first).
 */
export async function deriveAuthString(
  pcPublicKeySpki: string,
  phonePublicKeySpki: string,
  authKeyBytes: Uint8Array,
): Promise<string> {
  const encoder = new TextEncoder();
  const pcBytes = b64uToBytes(pcPublicKeySpki);
  const phoneBytes = b64uToBytes(phonePublicKeySpki);
  const labelBytes = encoder.encode('clipper-v1-sas');

  const combined = new Uint8Array(
    pcBytes.length + phoneBytes.length + authKeyBytes.length + labelBytes.length,
  );
  let offset = 0;
  combined.set(pcBytes, offset); offset += pcBytes.length;
  combined.set(phoneBytes, offset); offset += phoneBytes.length;
  combined.set(authKeyBytes, offset); offset += authKeyBytes.length;
  combined.set(labelBytes, offset);

  const digest = await crypto.subtle.digest('SHA-256', combined.buffer as ArrayBuffer);
  const view = new DataView(digest);
  const n = view.getUint32(0, false) % 1_000_000;
  return n.toString().padStart(6, '0');
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption / decryption
// ---------------------------------------------------------------------------

/** Additional Authenticated Data structure for GCM */
export interface TransferAAD {
  /** Session ID to bind ciphertext to this session */
  sessionId: string;
  /** Sequence number to prevent replay and reordering */
  seq: number;
  /** Transfer ID */
  transferId: string;
}

function encodeAAD(aad: TransferAAD): ArrayBuffer {
  return new TextEncoder().encode(
    JSON.stringify({
      sessionId: aad.sessionId,
      seq: aad.seq,
      transferId: aad.transferId,
    }),
  ).buffer as ArrayBuffer;
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Generates a fresh random 96-bit nonce per call.
 */
export async function encryptTransfer(
  key: CryptoKey,
  plaintext: string,
  aad: TransferAAD,
): Promise<{ ciphertext: string; nonce: string }> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const aadBytes = encodeAAD(aad);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBytes.buffer as ArrayBuffer, additionalData: aadBytes },
    key,
    plaintextBytes.buffer as ArrayBuffer,
  );

  return {
    ciphertext: base64urlEncode(ciphertextBuf),
    nonce: base64urlEncode(nonceBytes.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt an AES-256-GCM ciphertext.
 * Throws if authentication fails.
 */
export async function decryptTransfer(
  key: CryptoKey,
  ciphertextBase64url: string,
  nonceBase64url: string,
  aad: TransferAAD,
): Promise<string> {
  const ciphertextBytes = base64urlDecode(ciphertextBase64url);
  const nonceBytes = base64urlDecode(nonceBase64url);
  const aadBytes = encodeAAD(aad);

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBytes, additionalData: aadBytes },
    key,
    ciphertextBytes,
  );

  return new TextDecoder().decode(plaintextBuf);
}

// ---------------------------------------------------------------------------
// Content type detection (client-side, post-decrypt)
// ---------------------------------------------------------------------------

export type ContentType = 'url' | 'code' | 'multiline' | 'text';

export function detectContentType(text: string): ContentType {
  if (/^https?:\/\/\S+$/.test(text.trim())) return 'url';
  if (text.includes('\n') && text.trim().split('\n').length > 2) {
    if (/^[ \t]{2,}|[{}();=<>[\]]/m.test(text)) return 'code';
    return 'multiline';
  }
  if (text.includes('\n')) return 'multiline';
  return 'text';
}

// ---------------------------------------------------------------------------
// Secure helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of two Uint8Arrays.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i]! ^ b[i]!);
  }
  return diff === 0;
}

/** Hash a device token for server-side storage (SHA-256, hex) */
export async function hashDeviceToken(tokenHex: string): Promise<string> {
  const bytes = new TextEncoder().encode(tokenHex);
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
