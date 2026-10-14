import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 3,
  timeout: 45000,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "artifacts/e2e-results.json" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:4173",
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        }
      : {},
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 60000,
      },
});
