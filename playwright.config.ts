import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
process.env.TEST_SETUP_SECRET ??= randomBytes(32).toString("hex");
process.env.TEST_PASSWORD ??= randomBytes(24).toString("base64url");
process.env.TEST_PASSWORD_NEXT ??= randomBytes(24).toString("base64url");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1366, height: 768 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: {
    command: "npx tsx tests/e2e-server.ts",
    url: "http://localhost:4173/api/ready",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      ALLOW_TEST_DATABASE: process.env.ALLOW_TEST_DATABASE ?? "0",
      TEST_SETUP_SECRET: process.env.TEST_SETUP_SECRET,
      TEST_PASSWORD: process.env.TEST_PASSWORD,
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
