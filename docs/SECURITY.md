# Clipper Security Architecture & Threat Model

## 1. Core Cryptographic Primitives

Clipper relies exclusively on standard, well-reviewed WebCrypto (`crypto.subtle`) primitives:
- **Key Agreement:** ECDH over NIST P-256 (`prime256v1`).
- **Key Derivation:** HKDF-SHA-256 with distinct labels:
  - `clipper-v1-encryption-key` (256-bit AES key)
  - `clipper-v1-auth-confirmation-key` (256-bit key for Short Authentication String)
- **Authenticated Encryption:** AES-256-GCM.
  - **Nonce:** Fresh 96-bit random IV generated cryptographically per transfer (`crypto.getRandomValues`).
  - **AAD (Additional Authenticated Data):** Binds `sessionId`, `seq` (sequence counter), and `transferId` to the ciphertext. Tampering with sequence or injecting into another session fails AES-GCM tag verification.
- **Short Authentication String (SAS):** 6-digit verification code derived from `SHA-256(pcPubSpki || phonePubSpki || authKeyBytes || "clipper-v1-sas")` to verify key agreement out-of-band and protect against relay MITM.

---

## 2. Pairing & Key Exchange Flow

1. **PC Request:**
   - PC generates ephemeral P-256 key pair.
   - PC asks server for a pairing slot via `pairing:create`.
   - Server responds with a random 128-bit `pairingId` and human-friendly short code (8 chars, unambiguous alphabet without 0/O/1/I/l).
   - The QR code contains `https://<domain>/#pair=<pairingId>.<pcPublicKey>`.
   - **Key Isolation:** The PC public key and pairing ID exist exclusively in the URL **fragment** (`#`). Fragments are never sent to the server in HTTP request lines or logged in reverse proxy access logs.

2. **Phone Joining:**
   - Phone generates its own ephemeral P-256 key pair.
   - Phone joins via `pairing:join` passing `phonePublicKey`.
   - Server relays keys between PC and phone. Server cannot decrypt anything as it never receives private keys.

3. **Out-of-band Confirmation (MITM defense):**
   - Both devices derive identical SAS codes independently.
   - The user must explicitly press "Matches" on both devices.
   - On confirmation, the server generates 256-bit cryptographically secure device tokens for both parties, storing only their SHA-256 hashes.

---

## 3. Threat Model

### What Clipper Protects Against
1. **Curious Relay Operator / Malicious Server:**
   - The server only ever handles opaque ciphertexts, nonces, and public keys.
   - Server logs never contain plaintext clipboard contents or private keys.
2. **Passive Network Eavesdroppers:**
   - TLS provides transport confidentiality; E2EE guarantees confidentiality even if TLS is terminated at a proxy or CDN.
3. **Replay & Reordering Attacks:**
   - AES-256-GCM authenticated data validates sequential monotonically increasing numbers (`seq`) bound to the session.
4. **Unauthorized Third-Party Devices:**
   - Device tokens are 256 bits, scoped strictly to a single session and verified in constant-time via SHA-256 hash lookup.

### What Clipper Does NOT Protect Against (Documented Limitations)
1. **Compromised Host / Keyloggers:**
   - If the Windows PC or iPhone has malware, spyware, or keyloggers installed, screen memory or keystrokes can be captured.
2. **Windows OS Clipboard History (`Win + V`):**
   - When the user copies decrypted text on Windows, Windows may record it into the OS-level clipboard history if enabled. The user must manually clear this or turn it off.
3. **Malicious Relay Code Injection:**
   - Since the web app client is delivered by the same host running the relay, a compromised server could serve tampered JavaScript. This is an inherent property of all browser-based E2EE apps without signed local binary packages.

---

## 4. Public PC Mode

- **Default State:** Active by default.
- **Wipe Mechanics:** Clicking "Disconnect & Wipe" clears all in-memory keys, wipes `sessionStorage`, resets the socket, and informs the server to invalidate the session tokens immediately.
- **Idle Expiry:** Sessions automatically terminate after 30 minutes of inactivity.
