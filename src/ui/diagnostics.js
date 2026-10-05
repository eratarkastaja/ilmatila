import packageMetadata from '../../package.json';
import { t } from './i18n.js';

export const APP_VERSION = packageMetadata.version;

function detectBrowser(userAgent) {
  const browsers = [
    [/EdgiOS\/([\d.]+)/, 'Edge iOS'],
    [/EdgA?\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/CriOS\/([\d.]+)/, 'Chrome iOS'],
    [/FxiOS\/([\d.]+)/, 'Firefox iOS'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ];
  for (const [pattern, name] of browsers) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1].split('.')[0]}`;
  }
  return 'Unknown browser';
}

function detectPlatform(navigatorObject) {
  const platformHints = [
    navigatorObject?.userAgentData?.platform,
    navigatorObject?.platform,
    navigatorObject?.userAgent,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/iphone|ipad|ipod|ios/.test(platformHints)) return 'iOS';
  if (/android/.test(platformHints)) return 'Android';
  if (/win/.test(platformHints)) return 'Windows';
  if (/mac/.test(platformHints)) return 'macOS';
  if (/linux|x11/.test(platformHints)) return 'Linux';
  return 'Unknown platform';
}

export function createDiagnosticsSnapshot({
  mission = null,
  missionVariant = null,
  difficulty = null,
  area = null,
  terrain = null,
  sortieSeed = null,
  lastLoad = 'unknown',
  lastState = 'unknown',
  navigatorObject = globalThis.navigator,
} = {}) {
  const userAgent = navigatorObject?.userAgent ?? '';
  return {
    gameVersion: APP_VERSION,
    mission,
    missionVariant,
    difficulty,
    area,
    terrain,
    sortieSeed,
    browser: detectBrowser(userAgent),
    platform: detectPlatform(navigatorObject),
    lastLoad,
    lastState,
  };
}

export async function copyTextToClipboard(text, {
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
} = {}) {
  try {
    if (typeof navigatorObject?.clipboard?.writeText === 'function') {
      await navigatorObject.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API access may be denied; use the selection-based browser fallback.
  }

  if (!documentObject?.createElement || !documentObject.body || !documentObject.execCommand) return false;
  const field = documentObject.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  documentObject.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange?.(0, field.value.length);
  try {
    return documentObject.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove?.();
    if (!field.remove) documentObject.body.removeChild(field);
  }
}

export function installDiagnosticsCopyButtons(root, getSnapshot, {
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  translate = t,
  selector = '[data-copy-diagnostics]',
} = {}) {
  for (const button of root.querySelectorAll(selector)) {
    const status = button.closest('[data-diagnostics-tools]')?.querySelector('[data-diagnostics-status]');
    button.addEventListener('click', async () => {
      button.disabled = true;
      let copied;
      try {
        copied = await copyTextToClipboard(
          JSON.stringify(getSnapshot(), null, 2),
          { navigatorObject, documentObject },
        );
      } catch {
        copied = false;
      } finally {
        button.disabled = false;
      }
      if (status) status.textContent = translate(copied ? 'diagnostics.copied' : 'diagnostics.copyFailed');
    });
  }
}
