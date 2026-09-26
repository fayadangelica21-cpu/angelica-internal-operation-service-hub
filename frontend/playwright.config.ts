import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5174' },
  webServer: {
    command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
});
