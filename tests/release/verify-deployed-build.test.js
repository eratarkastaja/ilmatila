import { describe, expect, it, vi } from 'vitest';
import { verifyDeployedBuild } from '../../tools/release/verify-deployed-build.mjs';

describe('verifyDeployedBuild', () => {
  it('retries stale Pages metadata until the expected build is visible', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"version":"0.2.0-beta.5","commit":"old"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"version":"0.2.0-beta.6","commit":"new"}', { status: 200 }));

    await expect(verifyDeployedBuild({
      buildInfoUrl: 'https://example.test/ilmatila/build-info.json',
      expectedCommit: 'new',
      fetchImpl,
      attempts: 2,
    })).resolves.toEqual({ version: '0.2.0-beta.6', commit: 'new' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0].searchParams.get('release-check')).toBe('new-1');
    expect(fetchImpl.mock.calls[1][0].searchParams.get('release-check')).toBe('new-2');
  });

  it('reports the last deployment mismatch after retries are exhausted', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"version":"old","commit":"old"}', { status: 200 }));

    await expect(verifyDeployedBuild({
      buildInfoUrl: 'https://example.test/ilmatila/build-info.json',
      expectedCommit: 'new',
      fetchImpl,
      attempts: 2,
    })).rejects.toThrow('Expected new, found old');
  });
});
