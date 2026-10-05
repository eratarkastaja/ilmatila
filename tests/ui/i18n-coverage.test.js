import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTranslationKeys, setLanguage, t } from '../../src/ui/i18n.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
const originalCustomEvent = globalThis.CustomEvent;

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

function collectStaticTranslationCalls() {
  const keys = new Map();
  const pattern = /\bt\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/g;
  for (const path of collectJavaScriptFiles(resolve(projectRoot, 'src'))) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const key = match[1] ?? match[2] ?? match[3];
      if (!key.includes('${')) keys.set(key, path.slice(projectRoot.length + 1));
    }
  }
  return keys;
}

function collectHtmlTranslationAttributes() {
  const source = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
  return [...source.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(match => match[1]);
}

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

afterEach(() => {
  if (globalThis.document?.querySelectorAll) setLanguage('en');
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
});

describe('translation coverage', () => {
  it('keeps English and Finnish translation key sets identical', () => {
    expect(getTranslationKeys('en').sort()).toEqual(getTranslationKeys('fi').sort());
  });

  it('defines every static source and HTML translation reference in both languages', () => {
    const staticReferences = collectStaticTranslationCalls();
    const htmlReferences = collectHtmlTranslationAttributes();
    const englishKeys = new Set(getTranslationKeys('en'));
    const finnishKeys = new Set(getTranslationKeys('fi'));
    const missing = [...new Set([...staticReferences.keys(), ...htmlReferences])]
      .filter(key => !englishKeys.has(key) || !finnishKeys.has(key))
      .map(key => ({
        key,
        source: staticReferences.get(key) ?? 'index.html',
        english: englishKeys.has(key),
        finnish: finnishKeys.has(key),
      }));

    expect(missing).toEqual([]);
  });

  it('never returns a raw translation key when a key is missing', () => {
    installDocumentStub();

    setLanguage('en');
    expect(t('missing.translation.key')).toBe('Unavailable');
    setLanguage('fi');
    expect(t('missing.translation.key')).toBe('Ei saatavilla');
  });

  it('localizes the generic optional-target label in both languages', () => {
    installDocumentStub();

    setLanguage('en');
    expect(t('mission.optionalTarget.generic')).toBe('hostile aircraft');
    setLanguage('fi');
    expect(t('mission.optionalTarget.generic')).toBe('viholliskone');
  });
});
