import { describe, expect, it, vi } from 'vitest';
import packageMetadata from '../../package.json';
import {
  APP_VERSION,
  copyTextToClipboard,
  createDiagnosticsSnapshot,
  installDiagnosticsCopyButtons,
} from '../../src/ui/diagnostics.js';

describe('beta diagnostics', () => {
  it('includes reproduction context while limiting browser data to family and platform', () => {
    const navigatorObject = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      platform: 'Win32',
    };
    const snapshot = createDiagnosticsSnapshot({
      mission: 'intercept',
      missionVariant: 'long-range-screen',
      difficulty: 'hard',
      area: { id: 'paijanne', label: 'Päijänne' },
      terrain: { id: 'paijanne', real: true },
      sortieSeed: 305419896,
      lastLoad: { operation: 'sortie', status: 'failed' },
      lastState: 'launch-error:assets',
      navigatorObject,
    });

    expect(APP_VERSION).toBe(packageMetadata.version);
    expect(snapshot).toMatchObject({
      gameVersion: packageMetadata.version,
      mission: 'intercept',
      missionVariant: 'long-range-screen',
      difficulty: 'hard',
      area: { id: 'paijanne', label: 'Päijänne' },
      terrain: { id: 'paijanne', real: true },
      sortieSeed: 305419896,
      browser: 'Chrome 128',
      platform: 'Windows',
      lastLoad: { operation: 'sortie', status: 'failed' },
      lastState: 'launch-error:assets',
    });
    expect(JSON.stringify(snapshot)).not.toContain(navigatorObject.userAgent);
  });

  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyTextToClipboard('report', {
      navigatorObject: { clipboard: { writeText } },
    })).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('report');
  });

  it('falls back to a temporary selection when clipboard permission is denied', async () => {
    const field = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const execCommand = vi.fn(() => true);
    const navigatorObject = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } };
    const documentObject = {
      createElement: vi.fn(() => field),
      body: { appendChild },
      execCommand,
    };

    await expect(copyTextToClipboard('fallback report', { navigatorObject, documentObject })).resolves.toBe(true);

    expect(field.value).toBe('fallback report');
    expect(field.select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(field.remove).toHaveBeenCalledOnce();
  });

  it('reports copy status on the diagnostics button', async () => {
    let onClick;
    const status = { textContent: '' };
    const button = {
      disabled: false,
      addEventListener: (type, listener) => { if (type === 'click') onClick = listener; },
      closest: () => ({ querySelector: () => status }),
    };
    const root = { querySelectorAll: () => [button] };
    const writeText = vi.fn().mockResolvedValue(undefined);
    const getSnapshot = vi.fn(() => ({ gameVersion: APP_VERSION }));

    installDiagnosticsCopyButtons(root, getSnapshot, {
      navigatorObject: { clipboard: { writeText } },
      documentObject: {},
      translate: key => key,
    });
    await onClick();

    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({ gameVersion: APP_VERSION });
    expect(status.textContent).toBe('diagnostics.copied');
    expect(button.disabled).toBe(false);
  });
});
