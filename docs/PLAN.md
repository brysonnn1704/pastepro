# Clipper — Build Plan

## Goal
Private iPhone-to-Windows-PC clipboard relay with E2EE, QR pairing, no accounts.

## Phase 0: Preflight ✓
- Node v24.17.0 (LTS current), pnpm 10.33.2, git 2.54.0
- Project root: f:\Projects\clipper
- pnpm workspace: apps/web, apps/server, packages/shared
- Note: Node 24 is used (latest LTS). Pinning 22 in .nvmrc as stable LTS base.

## Phase 1: Design System
- DESIGN.md with Neutral Modern base + single accent (#0066FF → --accent)
- CSS tokens file + tailwind.config integration
- Static HTML mocks for iPhone (390×844) and PC (1440×900)
- Anti-slop checklist enforcement

## Phase 2: Shared Package
- Zod schemas for all events and payloads
- TypeScript event contract types
- Shared crypto helpers (ECDH, HKDF, AES-GCM) using WebCrypto

## Phase 3: Server (apps/server)
- Express + Socket.IO + TypeScript
- In-memory session store with TTL sweeper
- Pairing: sessionId, short code, 120s TTL, single-use
- Auth: 256-bit device tokens (stored as SHA-256 hash)
- Rate limiting, CORS origin allowlist, helmet CSP
- Relay: opaque ciphertext only, sequence numbers, size limits
- /healthz endpoint

## Phase 4: Web App (apps/web)
- Vite + React 18 + TypeScript + Tailwind
- iPhone screen: editor, paste button, send, clear, status
- PC screen: QR/code panel, incoming list, Copy button
- PWA: manifest, service worker (shell only), iOS meta tags
- Crypto: ECDH pairing, HKDF key derivation, AES-256-GCM per message
- Public PC mode, idle expiry, session wipe

## Phase 5: Tests
- Vitest unit + integration (server, shared)
- React Testing Library (web components)
- Playwright E2E (pair→send→copy flow)
- Axe accessibility check

## Phase 6: Docs + Run
- README, SECURITY.md, DESIGN.md, CHANGELOG.md, .env.example
- Local dev start commands + HTTPS tunnel (ngrok/caddy) for iPhone testing

## Key Decisions
- AES-256-GCM with random 96-bit nonce + sequence in AAD (no nonce reuse risk)
- Fragment-only QR links (server never sees keys)
- System fonts only (no CDN fonts) for privacy
- No database, no analytics, no third-party runtime CDNs
- Public PC mode ON by default
