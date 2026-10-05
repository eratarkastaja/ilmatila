import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import packageMetadata from '../../package.json' with { type: 'json' };

const outputDirectory = resolve(process.argv[2] ?? 'dist');
const commit = process.env.BUILD_SHA ?? process.env.GITHUB_SHA;

if (!commit) throw new Error('BUILD_SHA or GITHUB_SHA must identify the build.');

await writeFile(resolve(outputDirectory, 'build-info.json'), `${JSON.stringify({
  version: packageMetadata.version,
  commit,
}, null, 2)}\n`);
