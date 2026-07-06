import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // NixOS Prisma engine shim — no-op on other platforms.
    setupFiles: ['tests/setup/nixos-prisma.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        // Constitution Principle IV: ≥90% line coverage for these paths.
        'src/backend/risk/**/*.ts': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 80,
        },
        'src/backend/orders/**/*.ts': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 80,
        },
        'src/types/money.ts': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});