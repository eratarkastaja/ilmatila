import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 800, height: 600 };
const browserArgs = ['--enable-unsafe-swiftshader'];
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/';

function chromiumProject(name, { channel, executablePath } = {}) {
  return {
    name,
    use: {
      ...devices['Desktop Chrome'],
      browserName: 'chromium',
      ...(channel && !executablePath ? { channel } : {}),
      viewport,
      deviceScaleFactor: 1,
      launchOptions: {
        args: browserArgs,
        ...(executablePath ? { executablePath } : {}),
      },
    },
  };
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
  timeout: 360_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    chromiumProject('chrome', {
      channel: 'chrome',
      executablePath: process.env.ILMATILA_CHROME_EXECUTABLE,
    }),
    chromiumProject('edge', {
      channel: 'msedge',
      executablePath: process.env.ILMATILA_EDGE_EXECUTABLE,
    }),
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport,
        deviceScaleFactor: 1,
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'webgl.forbid-software': false,
          },
        },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        browserName: 'webkit',
        viewport,
        deviceScaleFactor: 1,
        ...(process.env.ILMATILA_WEBKIT_EXECUTABLE
          ? { launchOptions: { executablePath: process.env.ILMATILA_WEBKIT_EXECUTABLE } }
          : {}),
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
