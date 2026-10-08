import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['apps/api/test/**/*.integration.test.ts'], environment: 'node', testTimeout: 20000, hookTimeout: 60000, fileParallelism: false } });
