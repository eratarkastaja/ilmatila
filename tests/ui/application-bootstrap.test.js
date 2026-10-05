import { describe, expect, it, vi } from 'vitest';
import { bootApplication } from '../../src/ui/application-bootstrap.js';

describe('application startup failure boundary', () => {
  it('shows the compatibility path without importing the game', async () => {
    const loadApplication = vi.fn();
    const onError = vi.fn();

    const started = await bootApplication({
      detectCompatibility: () => 'webgl',
      loadApplication,
      onError,
    });

    expect(started).toBe(false);
    expect(loadApplication).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('webgl');
  });

  it('catches renderer or other synchronous module startup failures', async () => {
    const startupFailure = new Error('WebGLRenderer construction failed');
    const onError = vi.fn();

    const started = await bootApplication({
      detectCompatibility: () => null,
      loadApplication: () => Promise.reject(startupFailure),
      onError,
    });

    expect(started).toBe(false);
    expect(onError).toHaveBeenCalledWith('startup', startupFailure);
  });

  it('turns compatibility-check exceptions into a startup error', async () => {
    const startupFailure = new Error('canvas API unavailable');
    const loadApplication = vi.fn();
    const onError = vi.fn();

    const started = await bootApplication({
      detectCompatibility: () => { throw startupFailure; },
      loadApplication,
      onError,
    });

    expect(started).toBe(false);
    expect(loadApplication).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('startup', startupFailure);
  });
});
