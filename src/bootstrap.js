import { bootApplication } from './ui/application-bootstrap.js';
import { detectBrowserCompatibility } from './ui/browser-compatibility.js';
import { renderStartupError as renderStartupErrorView } from './ui/startup-error-view.js';
import { initializeLanguagePicker, setLanguage } from './ui/i18n.js';
import { APP_VERSION, createDiagnosticsSnapshot, installDiagnosticsCopyButtons } from './ui/diagnostics.js';
import './ui/styles/compatibility.css';

initializeLanguagePicker();
document.querySelector('#system-error-version').textContent = APP_VERSION;

const startupLanguageButtons = [...document.querySelectorAll('[data-startup-language]')];
const systemErrorScreen = document.querySelector('#system-error-screen');

installDiagnosticsCopyButtons(systemErrorScreen, () => {
  const reason = systemErrorScreen.dataset.reason ?? 'unknown';
  return createDiagnosticsSnapshot({
    lastLoad: { phase: 'startup', result: reason },
    lastState: `startup-error:${reason}`,
  });
}, { selector: '[data-copy-diagnostics="startup"]' });

function renderStartupError(reason, error) {
  renderStartupErrorView(reason, { error });
  renderStartupLanguages();
}

function renderStartupLanguages() {
  const language = document.documentElement.lang || 'en';
  for (const button of startupLanguageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.startupLanguage === language));
  }
}

for (const button of startupLanguageButtons) {
  button.addEventListener('click', () => setLanguage(button.dataset.startupLanguage));
}
document.addEventListener('ilmatila:languagechange', renderStartupLanguages);

void bootApplication({
  detectCompatibility: detectBrowserCompatibility,
  loadApplication: () => import('./main.js'),
  onError: renderStartupError,
});
