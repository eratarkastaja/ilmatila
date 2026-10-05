import { describe, expect, it, vi } from 'vitest';
import { detectBrowserCompatibility } from '../../src/ui/browser-compatibility.js';

function makeBrowser({
  userAgent = 'Mozilla/5.0 Desktop',
  coarsePointer = false,
  webgl2 = true,
  pointerLock = true,
} = {}) {
  const loseContext = vi.fn();
  const context = { getExtension: vi.fn(() => ({ loseContext })) };
  const canvas = {
    getContext: vi.fn(type => type === 'webgl2' && webgl2 ? context : null),
  };
  if (pointerLock) canvas.requestPointerLock = vi.fn();
  const documentObject = {
    createElement: vi.fn(() => canvas),
    exitPointerLock: pointerLock ? vi.fn() : undefined,
    pointerLockElement: null,
  };
  const windowObject = { matchMedia: vi.fn(() => ({ matches: coarsePointer })) };
  const navigatorObject = { userAgent };
  return { documentObject, windowObject, navigatorObject, canvas, context, loseContext };
}

describe('browser compatibility requirements', () => {
  it('accepts a desktop browser with WebGL2 and Pointer Lock', () => {
    const browser = makeBrowser();

    expect(detectBrowserCompatibility(browser)).toBeNull();
    expect(browser.canvas.getContext).toHaveBeenCalledWith('webgl2');
    expect(browser.loseContext).toHaveBeenCalledOnce();
  });

  it('rejects a browser without WebGL2 before attempting renderer startup', () => {
    const browser = makeBrowser({ webgl2: false });

    expect(detectBrowserCompatibility(browser)).toBe('webgl');
    expect(browser.canvas.getContext).toHaveBeenCalledOnce();
  });

  it('rejects a browser without Pointer Lock support', () => {
    const browser = makeBrowser({ pointerLock: false });

    expect(detectBrowserCompatibility(browser)).toBe('pointer-lock');
  });

  it('rejects touch and mobile browsers before opening a graphics context', () => {
    const coarsePointer = makeBrowser({ coarsePointer: true });
    const mobileUserAgent = makeBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' });

    expect(detectBrowserCompatibility(coarsePointer)).toBe('touch');
    expect(coarsePointer.canvas.getContext).not.toHaveBeenCalled();
    expect(detectBrowserCompatibility(mobileUserAgent)).toBe('touch');
    expect(mobileUserAgent.canvas.getContext).not.toHaveBeenCalled();
  });
});
