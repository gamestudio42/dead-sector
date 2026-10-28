import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
