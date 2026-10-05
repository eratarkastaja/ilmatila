const [argumentUrl, argumentCommit] = process.argv.slice(2);
const buildInfoUrl = argumentUrl ?? process.env.BUILD_INFO_URL;
const expectedCommit = argumentCommit ?? process.env.EXPECTED_COMMIT;

if (!buildInfoUrl || !expectedCommit) {
  throw new Error('Usage: node tools/release/verify-deployed-build.mjs <build-info-url> <expected-commit>');
}

const response = await fetch(buildInfoUrl, { headers: { 'cache-control': 'no-cache' } });
if (!response.ok) throw new Error(`Build metadata returned HTTP ${response.status}: ${buildInfoUrl}`);

const buildInfo = await response.json();
if (buildInfo.commit !== expectedCommit) {
  throw new Error(`Expected ${expectedCommit}, found ${buildInfo.commit} at ${buildInfoUrl}`);
}

console.log(`Verified deployed build ${buildInfo.version} at ${buildInfo.commit}.`);
