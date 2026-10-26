// apps/server/src/config.ts
// All configuration read from environment variables.
// Fail fast on invalid config.

import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Comma-separated allowed CORS origins. In development, allow localhost and any localtunnel / LAN IPs */
  ALLOWED_ORIGINS: z.string().default('*'),
  /** Max payload body size (express) */
  MAX_BODY_SIZE: z.string().default('200kb'),
  /** Pairing session TTL in seconds */
  PAIRING_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(120),
  /** Transfer TTL in minutes */
  TRANSFER_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  /** Session idle timeout in minutes */
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(120).default(30),
  /** Max transfers per session */
  MAX_TRANSFERS_PER_SESSION: z.coerce.number().int().min(1).max(100).default(20),
  /** Max transfer ciphertext size in bytes */
  MAX_TRANSFER_BYTES: z.coerce.number().int().min(1024).max(10_485_760).default(102_656), // 100KB + 256 crypto overhead
  /** Rate limit: pairing create per IP per window */
  RATE_LIMIT_PAIRING_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_PAIRING_MAX: z.coerce.number().int().default(5),
  /** Rate limit: transfers per session per window */
  RATE_LIMIT_TRANSFER_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_TRANSFER_MAX: z.coerce.number().int().default(60),
});

function parseConfig() {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = parseConfig();

export function getAllowedOrigins(): string[] {
  return config.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
}

export type Config = typeof config;
