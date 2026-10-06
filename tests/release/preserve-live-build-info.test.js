import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preserveLiveBuildInfo } from '../../tools/release/preserve-live-build-info.mjs';

describe('preserveLiveBuildInfo', () => {
  let outputDirectory;

  afterEach(async () => {
    if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
    outputDirectory = undefined;
  });

  it('copies the active site identity into the staging artifact', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'ilmatila-release-'));
    const contents = '{\n  "version": "0.2.0-beta.1",\n  "commit": "abc123"\n}\n';
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url.href).toBe('https://example.test/ilmatila/build-info.json');
      expect(options.headers['cache-control']).toBe('no-cache');
      return new Response(contents, { status: 200 });
    });

    await expect(preserveLiveBuildInfo('https://example.test/ilmatila/', outputDirectory, fetchImpl))
      .resolves.toEqual({ version: '0.2.0-beta.1', commit: 'abc123' });
    await expect(readFile(join(outputDirectory, 'build-info.json'), 'utf8')).resolves.toBe(contents);
  });

  it('resolves build identity correctly when the site URL has no trailing slash', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'ilmatila-release-'));
    const fetchImpl = vi.fn(async (url) => {
      expect(url.href).toBe('https://example.test/ilmatila/build-info.json');
      return new Response('{"version":"0.2.0-beta.1","commit":"abc123"}', { status: 200 });
    });

    await preserveLiveBuildInfo('https://example.test/ilmatila', outputDirectory, fetchImpl);
    await expect(readFile(join(outputDirectory, 'build-info.json'), 'utf8'))
      .resolves.toBe('{"version":"0.2.0-beta.1","commit":"abc123"}');
  });

  it('allows a legacy live site without build identity metadata', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'ilmatila-release-'));
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }));

    await expect(preserveLiveBuildInfo('https://example.test/ilmatila/', outputDirectory, fetchImpl))
      .resolves.toBeNull();
    await expect(readFile(join(outputDirectory, 'build-info.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('still fails on other build identity fetch errors', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'ilmatila-release-'));
    const fetchImpl = vi.fn(async () => new Response('unavailable', { status: 503 }));

    await expect(preserveLiveBuildInfo('https://example.test/ilmatila/', outputDirectory, fetchImpl))
      .rejects.toThrow('Cannot preserve the current Pages build identity: HTTP 503');
  });

  it('rejects incomplete metadata', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'ilmatila-release-'));
    const fetchImpl = vi.fn(async () => new Response('{"version":"0.2.0-beta.1"}', { status: 200 }));

    await expect(preserveLiveBuildInfo('https://example.test/ilmatila/', outputDirectory, fetchImpl))
      .rejects.toThrow('Current Pages build identity is missing version or commit');
    await expect(readFile(join(outputDirectory, 'build-info.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
