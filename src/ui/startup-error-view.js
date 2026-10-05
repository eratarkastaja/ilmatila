import { t } from './i18n.js';

const errorMessageKeys = {
  touch: ['compatibility.touch.title', 'compatibility.touch.message'],
  webgl: ['compatibility.webgl.title', 'compatibility.webgl.message'],
  'pointer-lock': ['compatibility.pointerLock.title', 'compatibility.pointerLock.message'],
  startup: ['compatibility.startup.title', 'compatibility.startup.message'],
};

export function renderStartupError(reason, {
  documentObject = globalThis.document,
  translate = t,
  error,
} = {}) {
  const [titleKey, messageKey] = errorMessageKeys[reason] ?? errorMessageKeys.startup;
  if (error) console.error('Ilmatila could not start.', error);
  documentObject.querySelector('#game').hidden = true;
  const startMenu = documentObject.querySelector('#start-menu');
  startMenu.hidden = true;
  startMenu.inert = true;
  const screen = documentObject.querySelector('#system-error-screen');
  screen.dataset.reason = reason;
  const title = documentObject.querySelector('#system-error-title');
  title.dataset.i18n = titleKey;
  title.textContent = translate(titleKey);
  const message = documentObject.querySelector('#system-error-message');
  message.dataset.i18n = messageKey;
  message.textContent = translate(messageKey);
  screen.hidden = false;
}
