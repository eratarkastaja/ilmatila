import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function preserveLiveBuildInfo(liveSiteUrl, outputDirectory, fetchImpl = fetch) {
  const siteUrl = new URL(liveSiteUrl);
  if (!siteUrl.pathname.endsWith('/')) siteUrl.pathname += '/';
  const buildInfoUrl = new URL('build-info.json', siteUrl);
  const response = await fetchImpl(buildInfoUrl, { headers: { 'cache-control': 'no-cache' } });

  if (!response.ok) {
    throw new Error(`Cannot preserve the current Pages build identity: HTTP ${response.status} (${buildInfoUrl})`);
  }

  const contents = await response.text();
  let buildInfo;

  try {
    buildInfo = JSON.parse(contents);
  } catch {
    throw new Error(`Current Pages build identity is not valid JSON: ${buildInfoUrl}`);
  }

  if (!buildInfo || typeof buildInfo !== 'object'
    || typeof buildInfo.version !== 'string' || typeof buildInfo.commit !== 'string') {
    throw new Error(`Current Pages build identity is missing version or commit: ${buildInfoUrl}`);
  }

  await writeFile(resolve(outputDirectory, 'build-info.json'), contents);
  return buildInfo;
}
