import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./web/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:7351",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm build && node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:7351",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
