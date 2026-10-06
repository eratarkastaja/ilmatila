import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version: appVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expectedAppVersion = process.env.PLAYWRIGHT_EXPECTED_APP_VERSION || appVersion;

async function expectAppVersion(locator) {
  if (expectedAppVersion === '*') {
    await expect(locator).not.toBeEmpty();
    return;
  }
  await expect(locator).toHaveText(expectedAppVersion);
}

test('first visit quick start is keyboard accessible and returns focus from controls', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('./');
  await expectAppVersion(page.locator('#menu-version'));

  const quickStart = page.locator('#quick-start-dialog');
  await expect(quickStart).toBeVisible();
  await expect(page.locator('#quick-start-training')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const quickStartLanguage = page.locator('#quick-start-language-select');
  await expect(quickStartLanguage).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#quick-start-description')).toContainText('Aloita harjoituslennolla');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#quick-start-menu')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(quickStart).toBeHidden();
  await expect(page.locator('[data-mission="patrol"]')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.locator('[data-mission="training"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-mission="training"]')).toHaveAttribute('aria-pressed', 'true');

  for (let tabCount = 0; tabCount < 8; tabCount += 1) {
    if (await page.evaluate(() => document.activeElement?.id === 'show-menu-controls')) break;
    await page.keyboard.press('Tab');
  }
  const showControls = page.locator('#show-menu-controls');
  await expect(showControls).toBeFocused();
  await page.keyboard.press('Enter');
  const controlsDialog = page.locator('#menu-controls-dialog');
  await expect(controlsDialog).toBeVisible();
  await expect(page.locator('#close-menu-controls')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(controlsDialog).toBeHidden();
  await expect(showControls).toBeFocused();
  expect(pageErrors, 'uncaught browser errors').toEqual([]);
});

test('unsupported WebGL2 browser receives a localized startup error', async ({ page }, testInfo) => {
  const pageErrors = [];
  if (testInfo.project.name === 'chrome') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2') return null;
      return getContext.call(this, type, ...args);
    };
  });

  await page.goto('./');
  const errorScreen = page.locator('#system-error-screen');
  await expect(errorScreen).toBeVisible();
  await expectAppVersion(page.locator('#system-error-version'));
  await expect(errorScreen).toHaveAttribute('data-reason', 'webgl');
  await expect(page.locator('#system-error-title')).toHaveText('WEBGL 2 REQUIRED');
  await expect(page.locator('#game canvas')).toHaveCount(0);
  if (testInfo.project.name === 'chrome') {
    await page.locator('#copy-diagnostics-startup').click();
    await expect(errorScreen.locator('[data-diagnostics-status]')).toHaveText('DIAGNOSTICS COPIED');
    const startupDiagnostics = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    expect(startupDiagnostics.gameVersion).toBe(await page.locator('#system-error-version').textContent());
    expect(startupDiagnostics.mission).toBeNull();
    expect(startupDiagnostics.sortieSeed).toBeNull();
    expect(startupDiagnostics.lastState).toBe('startup-error:webgl');
  }

  await page.locator('[data-startup-language="fi"]').click();
  await expect(page.locator('#system-error-title')).toHaveText('WEBGL 2 VAADITAAN');
  await expect(page.locator('#system-error-message')).toContainText('tämä selain tai laite ei tarjoa');
  await page.locator('[data-startup-language="en"]').click();
  await expect(page.locator('#system-error-title')).toHaveText('WEBGL 2 REQUIRED');
  expect(pageErrors, 'uncaught browser errors').toEqual([]);
});

test('menu diagnostics copy the version, selected sortie seed, and environment', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome', 'Clipboard permissions are exercised in the Chrome project.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await page.locator('#quick-start-menu').click();
  await expect(page.locator('#menu-version')).not.toBeEmpty();
  const copyButton = page.locator('#copy-diagnostics-menu');
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(copyButton.locator('xpath=ancestor::div[@data-diagnostics-tools]').locator('[data-diagnostics-status]'))
    .toHaveText('DIAGNOSTICS COPIED');

  const diagnostics = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(diagnostics.gameVersion).toBe(await page.locator('#menu-version').textContent());
  expect(diagnostics.mission).toBe('patrol');
  expect(diagnostics.difficulty).toBeTruthy();
  expect(diagnostics.area.id).toBeTruthy();
  expect(diagnostics.terrain.id).toBeTruthy();
  expect(diagnostics.sortieSeed).toEqual(expect.any(Number));
  expect(diagnostics.browser).toMatch(/\w+ \d+/);
  expect(diagnostics.platform).toBeTruthy();
  expect(diagnostics.lastLoad).toBeTruthy();
  expect(diagnostics.lastState).toMatch(/^menu:/);
  expect(JSON.stringify(diagnostics)).not.toContain('Mozilla/5.0');
});
