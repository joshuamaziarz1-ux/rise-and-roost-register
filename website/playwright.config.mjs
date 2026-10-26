import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { webkit } from "playwright";
const launchOptions = existsSync("/usr/bin/chromium")
  ? { executablePath: "/usr/bin/chromium" }
  : {};
const baseURL = process.env.RR_BETA_BASE_URL || "http://127.0.0.1:4173";
// The official Linux bundle wrapper replaces LD_LIBRARY_PATH. Restricted cloud
// machines can supply verified user-space dependencies and launch its same
// bundled executable directly. Standard developer/CI installs use the default.
const webkitBundle = join(dirname(webkit.executablePath()), "minibrowser-wpe");
const webkitLaunchOptions = process.env.RR_WEBKIT_LIBRARY_ROOT
  ? {
      executablePath: join(webkitBundle, "bin/MiniBrowser"),
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [
          process.env.RR_WEBKIT_LIBRARY_ROOT,
          join(webkitBundle, "lib"),
          join(webkitBundle, "sys/lib"),
        ].join(":"),
        WEBKIT_EXEC_PATH: join(webkitBundle, "bin"),
        WEBKIT_INJECTED_BUNDLE_PATH: join(webkitBundle, "lib"),
        WEBKIT_INSPECTOR_RESOURCES_PATH: join(webkitBundle, "share"),
        WEBKIT_FORCE_COMPLEX_TEXT: "1",
      },
    }
  : {};
if (
  process.env.RR_BETA_BASE_URL &&
  !(
    new URL(baseURL).protocol === "https:" &&
    new URL(baseURL).hostname.endsWith(".workers.dev")
  )
)
  throw new Error(
    "Remote tests must target an isolated HTTPS workers.dev beta, never the production Register.",
  );
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 150000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.RR_BETA_BASE_URL
    ? undefined
    : {
        command: "RR_TEST_DB=:memory: npm run dev",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
        timeout: 30000,
      },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        launchOptions,
      },
    },
    {
      name: "desktop-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 1000 },
        launchOptions: webkitLaunchOptions,
      },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"], launchOptions: webkitLaunchOptions },
    },
    { name: "android-chromium", use: { ...devices["Pixel 7"], launchOptions } },
    {
      name: "tablet-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1180, height: 820 },
        launchOptions,
      },
    },
  ],
});
