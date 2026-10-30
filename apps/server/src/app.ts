// apps/server/src/app.ts
// Express app factory — separated from http.Server so tests can use supertest.

import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAllowedOrigins, config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDistCandidates: string[] = [
  path.resolve(process.cwd(), 'apps/web/dist'),
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(__dirname, '../../../../apps/web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
];
const webDistPath: string = webDistCandidates.find((p) => fs.existsSync(p)) ?? webDistCandidates[0]!;

export function createApp(): Application {
  const app = express();

  // -------------------------------------------------------------------------
  // Body limit
  // -------------------------------------------------------------------------
  app.use(express.json({ limit: config.MAX_BODY_SIZE }));

  // -------------------------------------------------------------------------
  // Security headers via helmet
  // -------------------------------------------------------------------------
  const allowedOrigins = getAllowedOrigins();
  const connectSrc = ["'self'", ...allowedOrigins, 'wss:', 'ws:'].join(' ');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      originAgentCluster: false,
      hsts: {
        maxAge: 63_072_000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'no-referrer' },
      xContentTypeOptions: true,
    }),
  );

  // Permissions policy — camera allowed for self (phone scanner), all else denied
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });

  // -------------------------------------------------------------------------
  // CORS — origin handling
  // -------------------------------------------------------------------------
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Vary', 'Origin');
      }
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // -------------------------------------------------------------------------
  // Rate limiting — pairing endpoint
  // -------------------------------------------------------------------------
  const pairingLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_PAIRING_WINDOW_MS,
    max: config.RATE_LIMIT_PAIRING_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: 'Too many requests, try again later.' },
  });

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // -------------------------------------------------------------------------
  // Pairing info REST endpoint (GET /api/pairing/:pairingId)
  // Returns minimal info: TTL remaining, shortCode (so the phone can check
  // before opening a WebSocket). Does NOT return any key material.
  // -------------------------------------------------------------------------
  app.get(
    '/api/pairing/:pairingId',
    pairingLimiter,
    (req: Request, res: Response) => {
      // Inline to avoid circular import — store is imported in routes file
      // Return 404 always (info exposed via WebSocket only)
      res.status(404).json({ code: 'PAIRING_NOT_FOUND', message: 'Not found.' });
    },
  );

  // -------------------------------------------------------------------------
  // Static Web App Frontend
  // -------------------------------------------------------------------------
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
  }

  // -------------------------------------------------------------------------
  // 404 / SPA Fallback
  // -------------------------------------------------------------------------
  app.use((req: Request, res: Response) => {
    const indexPath = path.join(webDistPath, 'index.html');
    if (fs.existsSync(indexPath) && req.accepts('html')) {
      res.sendFile(indexPath);
      return;
    }
    res.status(404).json({ error: 'Not found' });
  });

  // Generic error handler — no stack traces in production
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (config.NODE_ENV !== 'production') {
      console.error(err);
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An error occurred.' });
  });

  return app;
}
