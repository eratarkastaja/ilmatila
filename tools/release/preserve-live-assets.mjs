import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

const assetExtension = /\.(?:m?js|css|json|glb|gltf|png|jpe?g|webp|svg|ogg|mp3|wav|woff2?|ttf|otf|bin|f32|md|txt)(?:[?#].*)?$/i;

function normalizeBasePath(url) {
  return url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
}

function addAssetReference(reference, sourceUrl, siteUrl, basePath, output) {
  if (!assetExtension.test(reference) || /^(?:data:|blob:|https?:|\/\/)/i.test(reference)) return;

  let url;
  try {
    url = reference.startsWith('assets/')
      ? new URL(reference, siteUrl)
      : new URL(reference, sourceUrl);
  } catch {
    return;
  }

  if (url.origin !== siteUrl.origin || !url.pathname.startsWith(basePath + 'assets/')) return;
  url.search = '';
  url.hash = '';
  output.add(url.href);
}

function extractAssetReferences(source, sourceUrl, siteUrl, basePath) {
  const references = new Set();
  const stringPattern = /["']([^"']+)["']/g;

  for (const match of source.matchAll(stringPattern)) {
    const reference = match[1];
    if (/^(?:\/|\.{1,2}\/|assets\/)/.test(reference)) {
      addAssetReference(reference, sourceUrl, siteUrl, basePath, references);
    }
  }

  for (const match of source.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi)) {
    addAssetReference(match[2].trim(), sourceUrl, siteUrl, basePath, references);
  }

  return references;
}

function getOutputPath(assetUrl, basePath, outputDirectory) {
  const relativePath = decodeURIComponent(assetUrl.pathname.slice(basePath.length));
  const outputPath = resolve(outputDirectory, relativePath);
  if (!outputPath.startsWith(outputDirectory + sep)) {
    throw new Error('Unsafe asset path: ' + relativePath);
  }
  return outputPath;
}

export async function preserveLiveAssets(liveSiteUrl, liveHtml, outputDirectory, fetchImpl = fetch) {
  const siteUrl = new URL(liveSiteUrl);
  if (!siteUrl.pathname.endsWith('/')) siteUrl.pathname += '/';
  const basePath = normalizeBasePath(siteUrl);
  const queue = new Set();

  for (const match of liveHtml.matchAll(/\b(?:src|href)=(['"])(.*?)\1/g)) {
    addAssetReference(match[2], siteUrl, siteUrl, basePath, queue);
  }

  const preserved = new Set();
  while (queue.size > 0) {
    const assetHref = queue.values().next().value;
    queue.delete(assetHref);
    if (preserved.has(assetHref)) continue;
    preserved.add(assetHref);

    const assetUrl = new URL(assetHref);
    const outputPath = getOutputPath(assetUrl, basePath, outputDirectory);
    let content;

    try {
      content = await readFile(outputPath);
    } catch {
      const response = await fetchImpl(assetUrl, { headers: { 'cache-control': 'no-cache' } });
      if (!response.ok) {
        throw new Error('Cannot preserve ' + assetUrl.pathname + ': HTTP ' + response.status);
      }
      content = Buffer.from(await response.arrayBuffer());
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, content);
    }

    if (/\.(?:m?js|css)$/i.test(assetUrl.pathname)) {
      const text = content.toString('utf8');
      for (const dependency of extractAssetReferences(text, assetUrl, siteUrl, basePath)) {
        if (!preserved.has(dependency)) queue.add(dependency);
      }
    }
  }

  return preserved.size;
}
