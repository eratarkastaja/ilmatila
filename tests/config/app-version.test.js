import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageMetadata from '../../package.json';
import packageLock from '../../package-lock.json';
import { APP_VERSION } from '../../src/ui/diagnostics.js';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const baseline = readFileSync(new URL('../../docs/baseline.md', import.meta.url), 'utf8');
const browserCompatibility = readFileSync(new URL('../../docs/browser-compatibility.md', import.meta.url), 'utf8');
const releaseNotes = readFileSync(new URL('../../docs/release-notes.md', import.meta.url), 'utf8');

describe('application version source', () => {
  it('keeps the package version, lockfile and documented version in sync', () => {
    expect(packageLock.version).toBe(packageMetadata.version);
    expect(packageLock.packages[''].version).toBe(packageMetadata.version);
    expect(APP_VERSION).toBe(packageMetadata.version);
    expect(readme).toContain(`current public beta is **${packageMetadata.version}**`);
  });

  it('keeps the maintained verification documents on the current release', () => {
    expect(baseline).toContain(`Release: \`${packageMetadata.version}\``);
    expect(browserCompatibility).toContain(`The \`${packageMetadata.version}\` release uses`);
    expect(releaseNotes).toContain(`## ${packageMetadata.version}`);
  });
});
