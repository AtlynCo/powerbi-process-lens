import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    browserName: "chromium",
    channel: process.env.PROCESS_LENS_BROWSER_CHANNEL,
    headless: true,
    viewport: { width: 1440, height: 1050 }
  },
  reporter: "list"
});
