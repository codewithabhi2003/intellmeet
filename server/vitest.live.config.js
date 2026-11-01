import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.live.js'], testTimeout: 180000 } });
