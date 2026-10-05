const MOBILE_USER_AGENT = /android|iphone|ipad|ipod|mobile/i;

/** Return the first unsupported capability, or null for a supported desktop browser. */
export function detectBrowserCompatibility({
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
} = {}) {
  const coarsePointer = windowObject?.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const mobileUserAgent = MOBILE_USER_AGENT.test(navigatorObject?.userAgent ?? '');
  if (coarsePointer || mobileUserAgent) return 'touch';

  let canvas;
  try {
    canvas = documentObject.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return 'webgl';
    context.getExtension?.('WEBGL_lose_context')?.loseContext();
  } catch {
    return 'webgl';
  }

  if (typeof canvas.requestPointerLock !== 'function'
    || typeof documentObject.exitPointerLock !== 'function'
    || !('pointerLockElement' in documentObject)) return 'pointer-lock';

  return null;
}
