const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const token = process.env.GITHUB_TOKEN;
const oidcUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const buildVersion = process.argv[2];

if (!repository || !runId || !token || !oidcUrl || !oidcToken || !buildVersion) {
  throw new Error('GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_TOKEN, OIDC credentials, and a build version are required.');
}

const headers = {
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'x-github-api-version': '2022-11-28',
};

async function githubRequest(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}\n${await response.text()}`);
  return response.json();
}

const artifactResponse = await githubRequest(`/repos/${repository}/actions/runs/${runId}/artifacts?name=github-pages`);
const artifacts = artifactResponse.artifacts.filter(({ name }) => name === 'github-pages');
if (artifacts.length !== 1) throw new Error(`Expected one github-pages artifact, found ${artifacts.length}.`);

const oidcResponse = await fetch(oidcUrl, {
  headers: { authorization: `Bearer ${oidcToken}` },
});
if (!oidcResponse.ok) throw new Error(`OIDC token request returned HTTP ${oidcResponse.status}.`);
const { value: idToken } = await oidcResponse.json();

const deployment = await githubRequest(`/repos/${repository}/pages/deployments`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    artifact_id: artifacts[0].id,
    pages_build_version: buildVersion,
    oidc_token: idToken,
  }),
});
const deploymentId = deployment.id ?? deployment.status_url?.split('/').pop();
if (!deploymentId) throw new Error('Pages deployment did not return a deployment id.');

console.log(`Created Pages deployment ${deploymentId} for ${buildVersion}.`);
const deadline = Date.now() + 600_000;
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  const status = await githubRequest(`/repos/${repository}/pages/deployments/${deploymentId}`);
  if (status.status === 'succeed') {
    console.log(`Pages deployment ${deploymentId} succeeded.`);
    process.exit(0);
  }
  if (['deployment_failed', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost'].includes(status.status)) {
    throw new Error(`Pages deployment ${deploymentId} failed with status ${status.status}.`);
  }
  console.log(`Pages deployment status: ${status.status}.`);
}

throw new Error(`Pages deployment ${deploymentId} timed out.`);
