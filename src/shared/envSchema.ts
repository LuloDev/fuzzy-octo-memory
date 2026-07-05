import { z } from 'zod';

// Shared between backend config and any consumer that needs to validate env.
// Constitution: silent defaults are forbidden for broker/Telegram/DB.
export const envSchema = z.object({
  // Alpaca
  APCA_API_KEY_ID: z.string().min(1, 'APCA_API_KEY_ID is required'),
  APCA_API_SECRET_KEY: z.string().min(1, 'APCA_API_SECRET_KEY is required'),
  APCA_BASE_URL: z
    .string()
    .url('APCA_BASE_URL must be a valid URL')
    .default('https://paper-api.alpaca.markets'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_CHAT_ID: z.string().min(1, 'TELEGRAM_CHAT_ID is required'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Behavior
  DRY_RUN: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('true'),
  MONITOR_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  DAILY_LOSS_LIMIT: z.coerce.number().negative().default(-0.03),
  PANIC_REQUIRES_CONFIRMATION: z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .default('false'),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
});

export type Env = z.infer<typeof envSchema>;

// Test convenience: parse an arbitrary record (used by env.ts and tests).
export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}