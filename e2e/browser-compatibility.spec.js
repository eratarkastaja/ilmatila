import { expect, test } from '@playwright/test';

const MISSION_TYPES = ['patrol', 'intercept', 'support'];
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/';
const baseOrigin = new URL(baseURL).origin;
const assetBasePath = process.env.PLAYWRIGHT_ASSET_BASE_PATH ?? new URL(baseURL).pathname;
const assetPrefix = assetBasePath.replace(/\/+$/, '');

function normalizeAssetPath(pathname) {
  const normalized = assetPrefix && pathname.startsWith(assetPrefix)
    ? pathname.slice(assetPrefix.length)
    : pathname;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

async function returnToMenu(page) {
  await page.keyboard.press('p');
  const pauseDialog = page.locator('#pause-dialog');
  await expect(pauseDialog).toBeVisible();
  await page.locator('#quit-to-menu').click();
  await page.locator('#confirm-quit-to-menu').click();
  await expect(pauseDialog).toBeHidden();
  await expect(page.locator('#flight-hud')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#start-menu')).toBeVisible();
}

async function launchMission(page, missionId) {
  await page.locator(`[data-mission="${missionId}"]`).click();
  await expect(page.locator(`[data-mission="${missionId}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#launch-mission').click();
  await expect(page.locator('#flight-hud')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#start-menu')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await expect(page.locator('#mission-objective-title')).not.toBeEmpty();
}

test('desktop browser completes the menu, controls, combat, and repeat-sortie path', async ({ page, context }, testInfo) => {
  test.skip(
    testInfo.project.name === 'webkit',
    'Linux Playwright WebKit cannot grant Pointer Lock in headless mode; its recoverable launch path is tested separately.',
  );
  test.setTimeout(900_000);

  const responseStatuses = new Map();
  const badResponses = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('response', response => {
    const url = new URL(response.url());
    responseStatuses.set(normalizeAssetPath(url.pathname), response.status());
    if (url.origin === baseOrigin && response.status() >= 400) {
      badResponses.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('ilmatila-language', 'en');
    localStorage.setItem('ilmatila-career-v1', JSON.stringify({
      version: 1,
      difficulty: 'standard',
      unlockedMissions: ['patrol', 'intercept', 'support', 'training'],
      records: {},
    }));
    window.__ilmatilaTestAudioContexts = [];
    const NativeAudioContext = window.AudioContext;
    if (NativeAudioContext) {
      window.AudioContext = new Proxy(NativeAudioContext, {
        construct(target, args) {
          const audioContext = Reflect.construct(target, args);
          window.__ilmatilaTestAudioContexts.push(audioContext);
          return audioContext;
        },
      });
    }
  });

  const documentResponse = await page.goto('./');
  expect(documentResponse?.status()).toBe(200);
  await expect(page.locator('#quick-start-dialog')).toBeVisible();
  await expect(page.locator('#start-menu')).toBeVisible();
  await expect(page.locator('[data-mission="support"]')).toBeVisible();

  const canvas = page.locator('#game canvas');
  const initialCanvas = await canvas.evaluate(element => {
    const context2d = element.getContext('webgl2');
    return {
      webgl2: Boolean(context2d),
      version: context2d?.getParameter(context2d.VERSION) ?? '',
      pointerLock: typeof element.requestPointerLock === 'function',
    };
  });
  expect(initialCanvas.webgl2, `${testInfo.project.name} WebGL2`).toBe(true);
  expect(initialCanvas.version).toMatch(/WebGL/);
  expect(initialCanvas.pointerLock, `${testInfo.project.name} Pointer Lock API`).toBe(true);

  await page.locator('#quick-start-training').click();
  await expect(page.locator('#flight-hud')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#start-menu')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await expect.poll(() => page.evaluate(() => window.__ilmatilaTestAudioContexts[0]?.state)).toBe('running');
  await expect.poll(() => responseStatuses.get('/terrain/areas/paijanne/terrain.json')).toBe(200);
  await expect.poll(() => responseStatuses.get('/terrain/areas/paijanne/height.f32')).toBe(200);
  await expect.poll(() => [...responseStatuses].some(([path, status]) => (
    path.startsWith('/terrain/areas/paijanne/ortho-') && path.endsWith('.png') && status === 200
  ))).toBe(true);
  for (const assetPath of [
    '/assets/f35/f35-lightning.glb',
    '/assets/aircraft/su27/su27.glb',
    '/assets/aircraft/mig29/mig29.glb',
  ]) {
    await expect.poll(() => responseStatuses.get(assetPath)).toBe(200);
  }

  const heading = page.locator('#heading');
  const headingBeforeMouse = await heading.textContent();
  await page.mouse.move(300, 280);
  await page.mouse.move(510, 280, { steps: 12 });
  await expect.poll(() => heading.textContent(), { timeout: 8_000 }).not.toBe(headingBeforeMouse);

  const speedBeforeKeyboard = Number(await page.locator('#speed').textContent());
  await page.keyboard.down('Shift');
  await expect.poll(async () => Number(await page.locator('#speed').textContent()), { timeout: 8_000 })
    .toBeGreaterThan(speedBeforeKeyboard);
  await page.keyboard.up('Shift');

  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.locator('#flight-hud')).toBeVisible();
  await page.mouse.click(20, 20);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');

  await page.keyboard.press('p');
  const pauseDialog = page.locator('#pause-dialog');
  await expect(pauseDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pauseDialog).toBeVisible();
  await page.keyboard.press('p');
  await expect(pauseDialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    canvasBounds: (() => {
      const bounds = document.querySelector('#game canvas').getBoundingClientRect();
      return [bounds.width, bounds.height];
    })(),
  }))).toEqual({ viewport: [1024, 768], canvasBounds: [1024, 768] });
  await page.setViewportSize({ width: 800, height: 600 });

  const otherTab = await context.newPage();
  await otherTab.goto('about:blank');
  await otherTab.bringToFront();
  await expect(otherTab).toHaveURL('about:blank');
  await expect(page.locator('#flight-hud')).toBeVisible();
  await page.bringToFront();
  await expect(page.locator('#flight-hud')).toBeVisible();
  await otherTab.close();
  if (await page.evaluate(() => document.pointerLockElement !== document.querySelector('#game canvas'))) {
    await page.mouse.click(20, 20);
  }
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');

  await returnToMenu(page);

  await launchMission(page, 'patrol');
  const gunAmmo = page.locator('#gun-ammo-count');
  const gunAmmoBefore = await gunAmmo.textContent();
  await page.keyboard.down('Space');
  await expect.poll(() => gunAmmo.textContent(), { timeout: 15_000 }).not.toBe(gunAmmoBefore);
  await page.keyboard.up('Space');
  await returnToMenu(page);

  if (testInfo.project.name === 'chrome') {
    for (const missionId of MISSION_TYPES.filter(id => id !== 'patrol')) {
      await launchMission(page, missionId);
      await returnToMenu(page);
    }
  }

  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
  expect(badResponses, 'failed local asset requests').toEqual([]);
  expect(pageErrors, 'uncaught browser errors').toEqual([]);
  expect(consoleErrors, 'browser console errors').toEqual([]);
});

test('Linux WebKit either launches with Pointer Lock or reports a recoverable launch error', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit', 'This test covers the Linux WebKit project only.');
  test.setTimeout(240_000);

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('ilmatila-language', 'en');
    localStorage.setItem('ilmatila-career-v1', JSON.stringify({
      version: 1,
      difficulty: 'standard',
      unlockedMissions: ['patrol', 'intercept', 'support', 'training'],
      records: {},
    }));
  });
  await page.goto('./');
  const canvas = page.locator('#game canvas');
  const webgl2 = await canvas.evaluate(element => Boolean(element.getContext('webgl2')));
  expect(webgl2).toBe(true);

  await page.locator('#quick-start-training').click();
  const flightHud = page.locator('#flight-hud');
  const launchError = page.locator('#launch-error-dialog');
  await expect.poll(async () => (await flightHud.isVisible()) || launchError.isVisible(), { timeout: 120_000 })
    .toBe(true);

  if (await launchError.isVisible()) {
    await expect(page.locator('#launch-error-title')).toHaveText('MOUSE CAPTURE NOT AVAILABLE');
    await expect(page.locator('#retry-launch')).toBeVisible();
    await expect(page.locator('#launch-error-return')).toBeVisible();
    await expect(page.locator('#start-menu')).toBeVisible();
    await expect(flightHud).toBeHidden();
    await page.locator('#retry-launch').click();
    await expect(launchError).toBeVisible();
    await page.locator('#launch-error-return').click();
    await expect(launchError).toBeHidden();
    await expect(page.locator('#start-menu')).toBeVisible();
  } else {
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
    expect(await page.evaluate(() => window.AudioContext ? 'available' : 'missing')).toBe('available');
  }

  expect(pageErrors, 'uncaught WebKit browser errors').toEqual([]);
  expect(consoleErrors, 'WebKit browser console errors').toEqual([]);
});
