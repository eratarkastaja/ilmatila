import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage, t } from '../../src/ui/i18n.js';

const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
const originalCustomEvent = globalThis.CustomEvent;

function installDocumentStub() {
  globalThis.document = {
    querySelectorAll: () => [],
    documentElement: { lang: '' },
    title: '',
    dispatchEvent: () => true,
  };
  globalThis.localStorage = { setItem() {} };
  globalThis.CustomEvent = class extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
}

describe('localized compatibility and launch errors', () => {
  afterEach(() => {
    setLanguage('en');
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = originalCustomEvent;
  });

  it('provides Finnish and English messages for startup and launch failures', () => {
    installDocumentStub();

    setLanguage('en');
    expect(t('compatibility.webgl.message')).toContain('WebGL 2');
    expect(t('compatibility.touch.message')).toContain('Touch and mobile');
    expect(t('compatibility.pointerLock.message')).toContain('Pointer Lock');
    expect(t('compatibility.startup.message')).toContain('renderer');
    expect(t('launch.failure.assets.title')).toContain('SORTIE');
    expect(t('launch.retry')).toBe('RETRY');
    expect(t('launch.returnToMenu')).toBe('RETURN TO MENU');

    setLanguage('fi');
    expect(document.documentElement.lang).toBe('fi');
    expect(t('compatibility.webgl.message')).toContain('WebGL 2');
    expect(t('compatibility.touch.message')).toContain('mobiili');
    expect(t('compatibility.pointerLock.message')).toContain('Pointer Lock');
    expect(t('compatibility.startup.message')).toContain('näytönohjaimen');
    expect(t('launch.failure.assets.title')).toContain('LENTOA');
    expect(t('launch.retry')).toBe('YRITÄ UUDELLEEN');
    expect(t('launch.returnToMenu')).toBe('PALAA VALIKKOON');
  });
});
