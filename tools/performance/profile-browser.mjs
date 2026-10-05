import { spawn } from 'node:child_process';
import os from 'node:os';
import { chromium } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';
const SAMPLE_MS = Number(process.env.ILMATILA_PROFILE_SAMPLE_MS ?? 25_000);
const CPU_PROFILE_MS = Number(process.env.ILMATILA_PROFILE_CPU_MS ?? 8_000);
const CYCLE_MENU_SETTLE_MS = Number(process.env.ILMATILA_PROFILE_CYCLE_SETTLE_MS ?? 750);
const CYCLE_ACTIVE_MS = Number(process.env.ILMATILA_PROFILE_CYCLE_ACTIVE_MS ?? 12_000);
const VIEWPORT = { width: 1920, height: 1080 };
const SEED_FOR_SUPPORT_FLANK_PRESSURE = 9;
const CYCLE_MISSION = 'support';
const SCENARIOS = {
  training: { name: 'Training', mission: 'training' },
  patrol: { name: 'Patrol', mission: 'patrol' },
  support: {
    name: 'Support · flank pressure', mission: 'support', seed: SEED_FOR_SUPPORT_FLANK_PRESSURE,
  },
  stress: { name: 'Stress · Intercept', mission: 'intercept', stress: true },
};
const CAREER_STATE = JSON.stringify({
  version: 1,
  difficulty: 'standard',
  unlockedMissions: ['patrol', 'training', 'intercept', 'support'],
  records: {},
});

function startDevServer() {
  let stopping = false;
  const server = spawn('node', [
    'node_modules/vite/bin/vite.js',
    '--host', '127.0.0.1',
    '--port', '5173',
    '--strictPort',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  server.on('exit', code => {
    if (!stopping && code && code !== 0) process.stderr.write(`Vite exited with status ${code}.\n`);
  });
  server.stop = () => {
    stopping = true;
    server.kill('SIGTERM');
  };
  return server;
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited before startup (${server.exitCode}).`);
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Vite did not become ready at ${BASE_URL}.`);
}

function aggregateCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const selfTimeByFunction = new Map();
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const node = nodes.get(profile.samples[index]);
    if (!node) continue;
    const frame = node.callFrame;
    const key = `${frame.functionName || '(anonymous)'} · ${frame.url || 'browser'}`;
    selfTimeByFunction.set(key, (selfTimeByFunction.get(key) ?? 0) + (profile.timeDeltas?.[index] ?? 0));
  }
  return [...selfTimeByFunction.entries()]
    .map(([functionName, microseconds]) => ({ functionName, milliseconds: microseconds / 1000 }))
    .sort((left, right) => right.milliseconds - left.milliseconds)
    .slice(0, 12);
}

async function createProfilePage(browser, seed) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(({ careerState, sortieSeed }) => {
    localStorage.setItem('ilmatila.quick-start-seen', 'true');
    localStorage.setItem('ilmatila-career-v1', careerState);
    if (sortieSeed !== null) {
      Object.defineProperty(crypto, 'getRandomValues', {
        configurable: true,
        value: array => {
          array[0] = sortieSeed;
          return array;
        },
      });
    }
  }, { careerState: CAREER_STATE, sortieSeed: seed ?? null });
  return { context, page, pageErrors, consoleErrors };
}

async function collectEnvironment(page, browserVersion) {
  return {
    browser: `Chromium ${browserVersion}`,
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    viewport: VIEWPORT,
    webgl: await page.evaluate(() => {
      const canvas = document.querySelector('#game canvas');
      const gl = canvas?.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        version: gl?.getParameter(gl.VERSION) ?? null,
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
      };
    }),
  };
}

async function captureCpuProfile(page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 1000 });
  const readMetrics = async () => Object.fromEntries(
    (await session.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]),
  );
  const before = await readMetrics();
  await session.send('Profiler.start');
  await page.waitForTimeout(CPU_PROFILE_MS);
  const { profile } = await session.send('Profiler.stop');
  const after = await readMetrics();
  await session.detach();
  const metricDeltas = {};
  for (const metric of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']) {
    metricDeltas[metric] = (after[metric] ?? 0) - (before[metric] ?? 0);
  }
  return {
    requestedDurationMs: CPU_PROFILE_MS,
    profileDurationMs: (profile.endTime - profile.startTime) / 1000,
    profileSampleCount: profile.samples?.length ?? 0,
    metricDeltasSeconds: metricDeltas,
    topSelfTime: aggregateCpuProfile(profile),
  };
}

async function runScenario(browser, { name, mission, stress = false, seed = null }) {
  const { context, page, pageErrors, consoleErrors } = await createProfilePage(browser, seed);
  const query = stress ? '&stress=1' : '';
  await page.goto(`${BASE_URL}/?mission=${mission}&area=paijanne${query}`);
  await page.locator('#menu-title').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => window.__ilmatilaProfiler?.snapshot, null, { timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector('#launch-mission').disabled, null, { timeout: 120_000 });
  if (await page.locator(`[data-mission="${mission}"]`).getAttribute('aria-pressed') !== 'true') {
    await page.locator(`[data-mission="${mission}"]`).click();
  }
  await page.locator('#launch-mission').click();
  await page.locator('#flight-hud').waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForFunction(() => document.querySelector('#game')?.classList.contains('flight-active'));
  await page.waitForTimeout(3_000);
  const warmupSnapshot = await page.evaluate(() => window.__ilmatilaProfiler.snapshot());
  await page.evaluate(() => window.__ilmatilaProfiler.reset());
  await page.waitForTimeout(SAMPLE_MS);
  const performance = await page.evaluate(() => ({
    app: window.__ilmatilaProfiler.snapshot(),
    stress: window.__ilmatilaStress?.snapshot() ?? null,
  }));
  const cpuProfile = await captureCpuProfile(page);
  const environment = await collectEnvironment(page, browser.version());
  const report = {
    name,
    mission,
    stressMode: stress,
    sampleMs: SAMPLE_MS,
    warmupGpuResources: warmupSnapshot.gpuResources,
    metrics: performance,
    cpuProfile,
    environment,
    pageErrors,
    consoleErrors,
  };
  await context.close();
  return report;
}

async function runSortieCycles(browser) {
  const { context, page, pageErrors, consoleErrors } = await createProfilePage(browser, null);
  await page.goto(`${BASE_URL}/?mission=${CYCLE_MISSION}&area=paijanne`);
  await page.locator('#menu-title').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => window.__ilmatilaProfiler?.snapshot, null, { timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector('#launch-mission').disabled, null, { timeout: 120_000 });
  const before = await page.evaluate(() => window.__ilmatilaProfiler.snapshot());
  const cycles = [];
  const cycleCount = Number(process.env.ILMATILA_PROFILE_CYCLES ?? 10);

  for (let index = 1; index <= cycleCount; index++) {
    process.stderr.write(`Launching sortie cycle ${index}/${cycleCount}.\n`);
    const started = await page.evaluate(({ mission, seed }) => (
      window.__ilmatilaProfiler.startSortie({ missionId: mission, seed })
    ), { mission: CYCLE_MISSION, seed: SEED_FOR_SUPPORT_FLANK_PRESSURE });
    if (!started) throw new Error(`Sortie cycle ${index} could not prepare and start.`);
    await page.locator('#flight-hud').waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(CYCLE_ACTIVE_MS);
    const during = await page.evaluate(() => window.__ilmatilaProfiler.snapshot());
    await page.keyboard.press('p');
    await page.locator('#pause-dialog').waitFor({ state: 'visible' });
    await page.evaluate(() => window.__ilmatilaProfiler.returnToMenu());
    await page.locator('#start-menu').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#launch-mission').disabled, null, { timeout: 120_000 });
    await page.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 10_000 });
    await page.waitForTimeout(CYCLE_MENU_SETTLE_MS);
    const after = await page.evaluate(() => window.__ilmatilaProfiler.snapshot());
    cycles.push({ index, during, after });
    process.stderr.write(`Completed sortie cycle ${index}/${cycleCount}.\n`);
  }

  const report = {
    mission: CYCLE_MISSION,
    missionVariant: 'flank-pressure',
    cycleCount: cycles.length,
    activeMs: CYCLE_ACTIVE_MS,
    launchMethod: 'dev-only SortieController hook; Pointer Lock UI is covered by browser smoke tests',
    menuSettleMs: CYCLE_MENU_SETTLE_MS,
    before,
    cycles,
    environment: await collectEnvironment(page, browser.version()),
    navigationEntries: await page.evaluate(() => performance.getEntriesByType('navigation').length),
    pageErrors,
    consoleErrors,
  };
  await context.close();
  return report;
}

const devServer = startDevServer();
let browser;
try {
  await waitForServer(devServer);
  browser = await chromium.launch({ headless: process.env.ILMATILA_PROFILE_HEADLESS === '1' });
  const reports = [];
  const requestedScenarios = process.argv[2] ?? 'all';
  const scenarioNames = requestedScenarios === 'all'
    ? [...Object.keys(SCENARIOS), 'cycles']
    : requestedScenarios.split(',');
  for (const scenarioName of scenarioNames) {
    process.stderr.write(`Starting ${scenarioName} 1920 × 1080 profile.\n`);
    const report = scenarioName === 'cycles'
      ? await runSortieCycles(browser)
      : SCENARIOS[scenarioName]
        ? await runScenario(browser, SCENARIOS[scenarioName])
        : null;
    if (!report) throw new Error(`Unknown performance scenario: ${scenarioName}`);
    reports.push(report);
    process.stderr.write(`Finished ${scenarioName}.\n`);
  }

  const output = {
    capturedAt: new Date().toISOString(),
    browser: browser.version(),
    measurement: 'requestAnimationFrame intervals; DevTools CPU sampling profile is collected separately',
    sampleMs: SAMPLE_MS,
    cpuProfileMs: CPU_PROFILE_MS,
    scenarios: reports,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  await browser?.close();
  devServer.stop();
}
