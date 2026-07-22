import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Never collect SDD scratch artifacts (briefs/targets live under .superpowers/),
    // and never collect nested worktree checkouts (they have their own node_modules,
    // so a duplicate test file collected from one mixes two React copies and crashes).
    exclude: [...configDefaults.exclude, '.superpowers/**', '.worktrees/**'],
  },
})
