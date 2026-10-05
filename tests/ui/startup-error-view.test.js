import { describe, expect, it, vi } from 'vitest';
import { renderStartupError } from '../../src/ui/startup-error-view.js';

function createDocument() {
  const elements = new Map([
    ['#game', { hidden: false }],
    ['#start-menu', { hidden: false, inert: false }],
    ['#system-error-screen', { hidden: true, dataset: {} }],
    ['#system-error-title', { textContent: '', dataset: {} }],
    ['#system-error-message', { textContent: '', dataset: {} }],
  ]);
  return {
    elements,
    querySelector: selector => elements.get(selector),
  };
}

describe('startup compatibility error view', () => {
  it('replaces the game and menu with a localized WebGL explanation', () => {
    const documentObject = createDocument();
    const translate = key => `fi:${key}`;

    renderStartupError('webgl', { documentObject, translate });

    expect(documentObject.elements.get('#game').hidden).toBe(true);
    expect(documentObject.elements.get('#start-menu')).toMatchObject({ hidden: true, inert: true });
    expect(documentObject.elements.get('#system-error-screen')).toMatchObject({
      hidden: false,
      dataset: { reason: 'webgl' },
    });
    expect(documentObject.elements.get('#system-error-title').textContent).toBe('fi:compatibility.webgl.title');
    expect(documentObject.elements.get('#system-error-message').textContent).toBe('fi:compatibility.webgl.message');
    expect(documentObject.elements.get('#system-error-title').dataset.i18n).toBe('compatibility.webgl.title');
    expect(documentObject.elements.get('#system-error-message').dataset.i18n).toBe('compatibility.webgl.message');
  });

  it('maps renderer construction failures to a safe startup explanation', () => {
    const documentObject = createDocument();
    const startupFailure = new Error('renderer constructor detail');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderStartupError('startup', {
      documentObject,
      translate: key => key,
      error: startupFailure,
    });

    expect(documentObject.elements.get('#system-error-title').textContent).toBe('compatibility.startup.title');
    expect(documentObject.elements.get('#system-error-message').textContent).toBe('compatibility.startup.message');
    expect(consoleError).toHaveBeenCalledWith('Ilmatila could not start.', startupFailure);
    consoleError.mockRestore();
  });
});
