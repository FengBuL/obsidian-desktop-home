import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ base: './', build: { outDir: 'dist-preview' }, test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], setupFiles: ['preview/obsidian-dom.ts'], alias: { obsidian: fileURLToPath(new URL('./tests/obsidian-runtime.ts', import.meta.url)) } } });
