import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preserveLiveAssets } from '../../tools/release/preserve-live-assets.mjs';

describe('preserveLiveAssets', () => {
  let outputDirectory;

  afterEach(async () => {
    if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
    outputDirectory = undefined;
  });

  it('preserves HTML assets and follows transitive Vite bundle and CSS dependencies', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'ilmatila-assets-'));
    const assets = new Map([
      ['/ilmatila/assets/bootstrap-old.js', 'import("./main-old.js");const deps=["assets/three-old.js"];const model="/ilmatila/assets/aircraft/old.glb";'],
      ['/ilmatila/assets/main-old.js', 'import "./three-old.js";'],
      ['/ilmatila/assets/three-old.js', 'export const ready=true;'],
      ['/ilmatila/assets/app-old.css', 'body{background:url("./font-old.woff2")}'],
      ['/ilmatila/assets/font-old.woff2', 'font bytes'],
      ['/ilmatila/assets/aircraft/old.glb', 'model bytes'],
    ]);
    const fetchImpl = vi.fn(async url => {
      const content = assets.get(url.pathname);
      return content === undefined
        ? new Response('not found', { status: 404 })
        : new Response(content, { status: 200 });
    });
    const html = [
      '<script type="module" src="/ilmatila/assets/bootstrap-old.js"></script>',
      '<link rel="stylesheet" href="/ilmatila/assets/app-old.css">',
      '<script src="https://cdn.example.test/ignored.js"></script>',
    ].join('');

    await expect(preserveLiveAssets(
      'https://example.test/ilmatila/',
      html,
      outputDirectory,
      fetchImpl,
    )).resolves.toBe(6);

    expect(fetchImpl.mock.calls.map(([url]) => url.pathname).sort()).toEqual([...assets.keys()].sort());
    await expect(readFile(join(outputDirectory, 'assets/main-old.js'), 'utf8')).resolves.toBe('import "./three-old.js";');
    await expect(readFile(join(outputDirectory, 'assets/three-old.js'), 'utf8')).resolves.toBe('export const ready=true;');
    await expect(readFile(join(outputDirectory, 'assets/font-old.woff2'), 'utf8')).resolves.toBe('font bytes');
    await expect(readFile(join(outputDirectory, 'assets/aircraft/old.glb'), 'utf8')).resolves.toBe('model bytes');
  });

  it('fails when a transitive live dependency can no longer be fetched', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'ilmatila-assets-'));
    const fetchImpl = vi.fn(async url => {
      if (url.pathname.endsWith('/bootstrap-old.js')) {
        return new Response('import("./missing-old.js");', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    await expect(preserveLiveAssets(
      'https://example.test/ilmatila/',
      '<script src="/ilmatila/assets/bootstrap-old.js"></script>',
      outputDirectory,
      fetchImpl,
    )).rejects.toThrow('Cannot preserve /ilmatila/assets/missing-old.js: HTTP 404');
  });
});
