import { appendFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import packageMetadata from '../../package.json' with { type: 'json' };
import { preserveLiveBuildInfo } from './preserve-live-build-info.mjs';
import { preserveLiveAssets } from './preserve-live-assets.mjs';

const outputDirectory = resolve('dist');
const liveSiteUrl = new URL(process.env.ILMATILA_PAGES_URL ?? 'https://eratarkastaja.github.io/ilmatila/');
const commit = process.env.BUILD_SHA ?? process.env.GITHUB_SHA;

if (!commit) throw new Error('BUILD_SHA or GITHUB_SHA must identify the staging build.');

const liveResponse = await fetch(liveSiteUrl, { headers: { 'cache-control': 'no-cache' } });
if (!liveResponse.ok) throw new Error('Cannot preserve the current Pages site: HTTP ' + liveResponse.status);

const liveHtml = await liveResponse.text();
const candidateHtml = await readFile(resolve(outputDirectory, 'staging/index.html'), 'utf8');
if (!candidateHtml.includes('/staging/assets/')) {
  throw new Error('The staging candidate must be built with the /staging/ base path.');
}

const preservedBuildInfo = await preserveLiveBuildInfo(liveSiteUrl, outputDirectory);
await cp(resolve('public'), outputDirectory, { recursive: true, force: false, errorOnExist: false });
const preservedAssetCount = await preserveLiveAssets(liveSiteUrl, liveHtml, outputDirectory);

await writeFile(resolve(outputDirectory, 'index.html'), liveHtml);
await mkdir(resolve(outputDirectory, 'staging'), { recursive: true });
await writeFile(resolve(outputDirectory, 'staging/build-info.json'), JSON.stringify({
  version: packageMetadata.version,
  commit,
}, null, 2) + '\n');

if (process.env.GITHUB_OUTPUT && preservedBuildInfo) {
  await appendFile(process.env.GITHUB_OUTPUT,
    'live_commit=' + preservedBuildInfo.commit + '\n'
    + 'live_version=' + preservedBuildInfo.version + '\n');
}

const liveBuildLabel = preservedBuildInfo
  ? preservedBuildInfo.version + ' live build'
  : 'live build without identity metadata';
console.log('Staging page prepared at /staging/; preserved the '
  + liveBuildLabel + ' and ' + preservedAssetCount + ' transitive assets.');
