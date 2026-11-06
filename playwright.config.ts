import { defineConfig } from '@playwright/test'

const port = Number(process.env.PW_PORT ?? 5331)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  use: { baseURL: `http://localhost:${port}/virtually-off/`, viewport: { width: 1280, height: 720 } },
  webServer: { command: `npm run build && npx vite preview --port ${port} --strictPort`, port, reuseExistingServer: false, timeout: 120_000 },
})
