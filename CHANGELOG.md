# Changelog

All notable technical and design decisions recorded throughout Clipper's development.

## [0.1.0] - 2026-10-26

### Architecture & Design
- Monorepo structured with `apps/web`, `apps/server`, and `packages/shared` using pnpm workspaces.
- Implemented OpenDesign-based `DESIGN.md` specification with Neutral Modern base and single accent (`#0057E7` in light, `#4D8EFF` in dark).
- Enforced zero runtime font CDNs: native system fonts only (`-apple-system`, `Segoe UI`, monospace).
- Computed WCAG AA contrast compliance mathematically with custom test script (`scripts/check-contrast.mjs`); tuned light success token to `#15803D` (5.02:1).

### Security & Cryptography
- End-to-end encrypted relay using WebCrypto (`crypto.subtle`): ECDH (NIST P-256), HKDF-SHA-256, and AES-256-GCM.
- Per-message 96-bit random nonce combined with authenticated sequence numbers in AAD to eliminate replay and reordering risks.
- Short Authentication String (SAS) 6-digit confirmation to guard against relay Man-in-the-Middle (MITM).
- QR code encodes PC public key solely inside the URL fragment (`#`), ensuring key material is never transmitted to the relay server or recorded in server access logs.
- Server-side in-memory store with periodic TTL sweeper (15-second interval) for ephemeral pairing and session garbage collection.
- SHA-256 hashing applied to all device tokens held server-side with constant-time verification.

### Frontend & UX
- iPhone screen designed with safe-area insets (`env(safe-area-inset-*)`), one-handed ergonomics, and ≥44px touch targets.
- Client-side content type detection (url, code, multiline, plain text) performed strictly after local decryption.
- Fallback manual textarea copy support implemented for non-secure browser execution or clipboard permission denial.
- Integrated camera QR scanner (`jsqr`) with manual short-code fallback.
- Full offline-ready PWA configuration (`vite-plugin-pwa`) with strict app-shell caching only.
