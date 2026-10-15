import { pathToFileURL } from 'node:url';

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export async function verifyDeployedBuild({
  buildInfoUrl,
  expectedCommit,
  fetchImpl = fetch,
  attempts = 1,
  delayMs = 0,
  log = console.log,
}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(buildInfoUrl);
      url.searchParams.set('release-check', `${expectedCommit}-${attempt}`);
      const response = await fetchImpl(url, { headers: { 'cache-control': 'no-cache' } });
      if (!response.ok) throw new Error(`Build metadata returned HTTP ${response.status}: ${buildInfoUrl}`);

      const buildInfo = await response.json();
      if (buildInfo.commit !== expectedCommit) {
        throw new Error(`Expected ${expectedCommit}, found ${buildInfo.commit} at ${buildInfoUrl}`);
      }

      return buildInfo;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        log(`Deployed build is not ready (attempt ${attempt}/${attempts}): ${error.message}`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [argumentUrl, argumentCommit] = process.argv.slice(2);
  const buildInfoUrl = argumentUrl ?? process.env.BUILD_INFO_URL;
  const expectedCommit = argumentCommit ?? process.env.EXPECTED_COMMIT;

  if (!buildInfoUrl || !expectedCommit) {
    throw new Error('Usage: node tools/release/verify-deployed-build.mjs <build-info-url> <expected-commit>');
  }

  const buildInfo = await verifyDeployedBuild({
    buildInfoUrl,
    expectedCommit,
    attempts: Number(process.env.PAGES_VERIFY_ATTEMPTS ?? 1),
    delayMs: Number(process.env.PAGES_VERIFY_DELAY_MS ?? 0),
  });
  console.log(`Verified deployed build ${buildInfo.version} at ${buildInfo.commit}.`);
}
