import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import packageMetadata from '../../package.json' with { type: 'json' };
import { preserveLiveBuildInfo } from './preserve-live-build-info.mjs';

const outputDirectory = resolve('dist');
const liveSiteUrl = new URL(process.env.ILMATILA_PAGES_URL ?? 'https://eratarkastaja.github.io/ilmatila/');
const deploymentBasePath = liveSiteUrl.pathname.endsWith('/')
  ? liveSiteUrl.pathname
  : `${liveSiteUrl.pathname}/`;
const commit = process.env.BUILD_SHA ?? process.env.GITHUB_SHA;

if (!commit) throw new Error('BUILD_SHA or GITHUB_SHA must identify the staging build.');

const liveResponse = await fetch(liveSiteUrl, { headers: { 'cache-control': 'no-cache' } });
if (!liveResponse.ok) throw new Error(`Cannot preserve the current Pages site: HTTP ${liveResponse.status}`);

const liveHtml = await liveResponse.text();
const candidateHtml = await readFile(resolve(outputDirectory, 'index.html'), 'utf8');
const preservedBuildInfo = await preserveLiveBuildInfo(liveSiteUrl, outputDirectory);
const referencedAssets = [...liveHtml.matchAll(/\b(?:src|href)=(['"])(.*?)\1/g)]
  .map((match) => match[2])
  .filter((reference) => reference.startsWith(deploymentBasePath))
  .map((reference) => new URL(reference, liveSiteUrl))
  .filter((url) => url.origin === liveSiteUrl.origin && url.pathname.startsWith(`${deploymentBasePath}assets/`));

for (const assetUrl of referencedAssets) {
  const relativePath = decodeURIComponent(assetUrl.pathname.slice(deploymentBasePath.length));
  const outputPath = resolve(outputDirectory, relativePath);
  if (!outputPath.startsWith(`${outputDirectory}${sep}`)) throw new Error(`Unsafe asset path: ${relativePath}`);

  try {
    await access(outputPath);
    continue;
  } catch {
    // The candidate build already includes shared hashed files; fetch only old bundles it replaced.
  }

  const assetResponse = await fetch(assetUrl, { headers: { 'cache-control': 'no-cache' } });
  if (!assetResponse.ok) throw new Error(`Cannot preserve ${assetUrl.pathname}: HTTP ${assetResponse.status}`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, new Uint8Array(await assetResponse.arrayBuffer()));
}

await writeFile(resolve(outputDirectory, 'index.html'), liveHtml);
await mkdir(resolve(outputDirectory, 'staging'), { recursive: true });
await writeFile(resolve(outputDirectory, 'staging/index.html'), candidateHtml);
await writeFile(resolve(outputDirectory, 'staging/build-info.json'), `${JSON.stringify({
  version: packageMetadata.version,
  commit,
}, null, 2)}\n`);

console.log(`Staging page prepared at /staging/; preserved the ${preservedBuildInfo.version} live build and ${referencedAssets.length} bundle references.`);
