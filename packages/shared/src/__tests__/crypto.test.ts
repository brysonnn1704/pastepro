// packages/shared/src/__tests__/crypto.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateECDHKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSessionKeys,
  deriveAuthString,
  encryptTransfer,
  decryptTransfer,
  base64urlEncode,
  base64urlDecode,
  detectContentType,
  constantTimeEqual,
  type TransferAAD,
} from '../crypto.js';

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    const original = crypto.getRandomValues(new Uint8Array(32));
    const encoded = base64urlEncode(original);
    const decoded = base64urlDecode(encoded);
    // base64urlDecode returns ArrayBuffer; compare as Uint8Array
    expect(new Uint8Array(decoded)).toEqual(original);
  });

  it('produces url-safe chars only', () => {
    for (let i = 0; i < 20; i++) {
      const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(Math.random() * 64)));
      const enc = base64urlEncode(bytes);
      expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('ECDH key pair', () => {
  it('generates a key pair with extractable public key', async () => {
    const kp = await generateECDHKeyPair();
    expect(kp.publicKey).toBeTruthy();
    expect(kp.privateKey).toBeTruthy();
    const exported = await exportPublicKey(kp.publicKey);
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(50);
  });

  it('round-trips public key export/import', async () => {
    const kp = await generateECDHKeyPair();
    const exported = await exportPublicKey(kp.publicKey);
    const imported = await importPublicKey(exported);
    expect(imported.type).toBe('public');
    expect(imported.algorithm.name).toBe('ECDH');
  });
});

describe('ECDH key agreement + HKDF', () => {
  it('derives identical keys on both sides', async () => {
    const pcKp = await generateECDHKeyPair();
    const phoneKp = await generateECDHKeyPair();

    const [pcKeys, phoneKeys] = await Promise.all([
      deriveSessionKeys(pcKp.privateKey, phoneKp.publicKey),
      deriveSessionKeys(phoneKp.privateKey, pcKp.publicKey),
    ]);

    // Auth key bytes must be identical
    expect(pcKeys.authKeyBytes).toEqual(phoneKeys.authKeyBytes);

    // Encryption keys must produce same output (verify by encrypt/decrypt)
    const pcPub = await exportPublicKey(pcKp.publicKey);
    const phonePub = await exportPublicKey(phoneKp.publicKey);
    const aad: TransferAAD = {
      sessionId: 'test-session-123',
      seq: 0,
      transferId: '550e8400-e29b-41d4-a716-446655440000',
    };

    const { ciphertext, nonce } = await encryptTransfer(pcKeys.encryptionKey, 'Hello World', aad);
    const decrypted = await decryptTransfer(phoneKeys.encryptionKey, ciphertext, nonce, aad);
    expect(decrypted).toBe('Hello World');

    // And vice versa
    const { ciphertext: c2, nonce: n2 } = await encryptTransfer(
      phoneKeys.encryptionKey,
      'नमस्ते 🎉',
      { ...aad, seq: 1, transferId: '550e8400-e29b-41d4-a716-446655440001' },
    );
    const dec2 = await decryptTransfer(pcKeys.encryptionKey, c2, n2, {
      ...aad,
      seq: 1,
      transferId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(dec2).toBe('नमस्ते 🎉');
  });
});

describe('auth string (SAS)', () => {
  it('produces 6-digit string', async () => {
    const pcKp = await generateECDHKeyPair();
    const phoneKp = await generateECDHKeyPair();

    const pcPub = await exportPublicKey(pcKp.publicKey);
    const phonePub = await exportPublicKey(phoneKp.publicKey);

    const pcKeys = await deriveSessionKeys(pcKp.privateKey, phoneKp.publicKey);
    const phoneKeys = await deriveSessionKeys(phoneKp.privateKey, pcKp.publicKey);

    const pcSAS = await deriveAuthString(pcPub, phonePub, pcKeys.authKeyBytes);
    const phoneSAS = await deriveAuthString(pcPub, phonePub, phoneKeys.authKeyBytes);

    expect(pcSAS).toMatch(/^\d{6}$/);
    expect(pcSAS).toBe(phoneSAS);
  });

  it('differs for different key pairs', async () => {
    const pc1 = await generateECDHKeyPair();
    const ph1 = await generateECDHKeyPair();
    const pc2 = await generateECDHKeyPair();
    const ph2 = await generateECDHKeyPair();

    const keys1 = await deriveSessionKeys(pc1.privateKey, ph1.publicKey);
    const keys2 = await deriveSessionKeys(pc2.privateKey, ph2.publicKey);

    const pub1pc = await exportPublicKey(pc1.publicKey);
    const pub1ph = await exportPublicKey(ph1.publicKey);
    const pub2pc = await exportPublicKey(pc2.publicKey);
    const pub2ph = await exportPublicKey(ph2.publicKey);

    const sas1 = await deriveAuthString(pub1pc, pub1ph, keys1.authKeyBytes);
    const sas2 = await deriveAuthString(pub2pc, pub2ph, keys2.authKeyBytes);

    // Collision extremely unlikely
    expect(sas1).not.toBe(sas2);
  });
});

describe('AES-256-GCM', () => {
  it('encrypts and decrypts correctly', async () => {
    const pcKp = await generateECDHKeyPair();
    const phoneKp = await generateECDHKeyPair();
    const { encryptionKey } = await deriveSessionKeys(pcKp.privateKey, phoneKp.publicKey);

    const aad: TransferAAD = {
      sessionId: 'session-abc',
      seq: 5,
      transferId: '550e8400-e29b-41d4-a716-446655440002',
    };

    const { ciphertext, nonce } = await encryptTransfer(encryptionKey, 'test payload', aad);
    const result = await decryptTransfer(encryptionKey, ciphertext, nonce, aad);
    expect(result).toBe('test payload');
  });

  it('preserves Unicode including Hindi, Marathi, emoji', async () => {
    const pcKp = await generateECDHKeyPair();
    const phoneKp = await generateECDHKeyPair();
    const { encryptionKey } = await deriveSessionKeys(pcKp.privateKey, phoneKp.publicKey);

    const texts = [
      'नमस्ते दुनिया',           // Hindi
      'मराठी भाषा',              // Marathi
      '😀🎉🌍',                 // Emoji
      '    function foo() {\n      return 42;\n    }', // Code with indentation
      'Hello\nWorld\nLine 3',    // Multiline
    ];

    const aad: TransferAAD = {
      sessionId: 'session-unicode',
      seq: 0,
      transferId: '550e8400-e29b-41d4-a716-446655440003',
    };

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const { ciphertext, nonce } = await encryptTransfer(encryptionKey, text, {
        ...aad,
        seq: i,
        transferId: `550e8400-e29b-41d4-a716-44665544000${i}`,
      });
      const decrypted = await decryptTransfer(encryptionKey, ciphertext, nonce, {
        ...aad,
        seq: i,
        transferId: `550e8400-e29b-41d4-a716-44665544000${i}`,
      });
      expect(decrypted).toBe(text);
    }
  });

  it('rejects tampered ciphertext (GCM auth tag check)', async () => {
    const pcKp = await generateECDHKeyPair();
    const phoneKp = await generateECDHKeyPair();
    const { encryptionKey } = await deriveSessionKeys(pcKp.privateKey, phoneKp.publicKey);

    const aad: TransferAAD = {
      sessionId: 'session-tamper',
      seq: 0,
      transferId: '550e8400-e29b-41d4-a716-446655440004',
    };

    const { ciphertext, nonce } = await encryptTransfer(encryptionKey, 'secret', aad);
    const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith('AA') ? 'BB' : 'AA');

    await expect(decryptTransfer(encryptionKey, tampered, nonce, aad)).rejects.toThrow();
  });

  it('rejects wrong AAD (replay/reorder prevention)', async () => {
    const pcKp = await generateECDHKeyPair();
    const phoneKp = await generateECDHKeyPair();
    const { encryptionKey } = await deriveSessionKeys(pcKp.privateKey, phoneKp.publicKey);

    const aad: TransferAAD = {
      sessionId: 'session-aad',
      seq: 0,
      transferId: '550e8400-e29b-41d4-a716-446655440005',
    };

    const { ciphertext, nonce } = await encryptTransfer(encryptionKey, 'secret', aad);

    // Wrong sequence number
    await expect(
      decryptTransfer(encryptionKey, ciphertext, nonce, { ...aad, seq: 1 }),
    ).rejects.toThrow();

    // Wrong session
    await expect(
      decryptTransfer(encryptionKey, ciphertext, nonce, {
        ...aad,
        sessionId: 'different-session',
      }),
    ).rejects.toThrow();
  });

  it('uses a fresh nonce each call', async () => {
    const pcKp = await generateECDHKeyPair();
    const phoneKp = await generateECDHKeyPair();
    const { encryptionKey } = await deriveSessionKeys(pcKp.privateKey, phoneKp.publicKey);

    const aad: TransferAAD = {
      sessionId: 's',
      seq: 0,
      transferId: '550e8400-e29b-41d4-a716-446655440006',
    };

    const nonces = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { nonce } = await encryptTransfer(encryptionKey, 'text', {
        ...aad,
        seq: i,
        transferId: `id-${i}`,
      });
      expect(nonces.has(nonce)).toBe(false);
      nonces.add(nonce);
    }
  });
});

describe('detectContentType', () => {
  it('detects URLs', () => {
    expect(detectContentType('https://example.com/path?q=1')).toBe('url');
    expect(detectContentType('http://localhost:3000')).toBe('url');
  });

  it('detects code', () => {
    expect(detectContentType('function foo() {\n  return 42;\n}')).toBe('code');
    expect(detectContentType('const x = [\n  1,\n  2,\n];')).toBe('code');
  });

  it('detects multiline', () => {
    expect(detectContentType('line one\nline two\nline three')).toBe('multiline');
  });

  it('detects plain text', () => {
    expect(detectContentType('Hello world')).toBe('text');
    expect(detectContentType('नमस्ते')).toBe('text');
  });
});

describe('constantTimeEqual', () => {
  it('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('returns false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('returns false for different lengths', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });
});
