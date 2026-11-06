import { defineConfig } from 'vitest/config'

// The production base must match the GitHub Pages project path; the dev server stays at the root.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/virtually-off/' : '/',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { main: 'index.html', sounds: 'sounds.html' },
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          return undefined
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
}))
