import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageMetadata from '../../package.json';
import packageLock from '../../package-lock.json';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

describe('application version source', () => {
  it('keeps the package version, lockfile and documented version in sync', () => {
    expect(packageLock.version).toBe(packageMetadata.version);
    expect(packageLock.packages[''].version).toBe(packageMetadata.version);
    expect(readme).toContain(`current source version is **${packageMetadata.version}**`);
  });
});
