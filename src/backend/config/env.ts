import { config as dotenvConfig } from 'dotenv';
import { parseEnv, type Env } from '@/shared/envSchema';

dotenvConfig();

// Constitution: missing/malformed env MUST crash the process loudly.
// No silent defaults for broker, Telegram, or DATABASE_URL.
let cached: Env | null = null;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cached) return cached;
  cached = parseEnv(source);
  return cached;
}

// Test-only reset hook.
export function resetEnvForTests(): void {
  cached = null;
}

export const env = loadEnv();