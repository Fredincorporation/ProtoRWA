import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Vitest config.
 *
 * Only pure modules are unit-tested here (formatters, guards, filters). Component
 * and flow verification happens in the browser via the playwright scripts, so
 * this stays fast and needs no DOM environment.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'default',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
