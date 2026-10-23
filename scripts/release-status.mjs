import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const hash = text => createHash('sha256').update(text).digest('hex');
const newest = runs => runs.sort((a, b) => b.id - a.id)[0];
const pending = (phase, message, details = {}) => ({ status: 'waiting', phase, message, ...details });

export async function expectedRelease(docs = 'docs') {
  const manifest = JSON.parse(await readFile(resolve(docs, 'build/manifest.json'), 'utf8'));
  if (!/^[a-f0-9]{20}$/.test(manifest.id)) throw new Error('Invalid expected build ID');
  const paths = ['', 'build/manifest.json', 'sw.js', manifest.script, manifest.style];
  const files = await Promise.all(paths.map(async path => {
    if (typeof path !== 'string' || path.includes('..') || path.startsWith('/')) throw new Error('Invalid release asset path');
    return { path, sha256: hash(await readFile(resolve(docs, path || 'index.html'), 'utf8')) };
  }));
  return { build: manifest.id, files };
}

// Read-only, exact-commit checks. Never wait for the whole verification workflow:
// its final release job may be the caller of this very function.
export async function inspectRelease({ repo, commit, verifyRun, expected, url }, request) {
  const api = `https://api.github.com/repos/${repo}`;
  const { workflow_runs: runs } = await request(`${api}/actions/runs?head_sha=${commit}&per_page=100`, true);
  const matching = runs.filter(run => run.head_sha === commit && run.head_branch === 'main');
  const verification = newest(matching.filter(run => run.event === 'push'
    && run.path === '.github/workflows/verify.yml' && (!verifyRun || run.id === verifyRun)));
  if (!verification) return pending('verification', 'No main-branch verification run for this commit');
  const details = { verificationRun: verification.id, verificationAttempt: verification.run_attempt || 1 };
  const { jobs } = await request(`${api}/actions/runs/${verification.id}/attempts/${details.verificationAttempt}/jobs?per_page=100`, true);
  const check = jobs.find(job => job.name === 'verify');
  if (!check || check.status !== 'completed') return pending('verification', 'Verification job has not completed', details);
  if (check.conclusion !== 'success') return { status: 'failed', phase: 'verification', message: `Verification: ${check.conclusion}`, ...details };

  const deployment = newest(matching.filter(run => run.event === 'dynamic' && run.path === 'dynamic/pages/pages-build-deployment'));
  if (!deployment) return pending('deployment', 'No Pages deployment run for this commit', details);
  Object.assign(details, { deploymentRun: deployment.id, deploymentAttempt: deployment.run_attempt || 1 });
  if (deployment.status !== 'completed') return pending('deployment', `Pages deployment: ${deployment.status}`, details);
  if (deployment.conclusion !== 'success') return { status: 'failed', phase: 'deployment', message: `Pages deployment: ${deployment.conclusion}`, ...details };

  const checks = await Promise.all(expected.files.map(async file => {
    const response = await request(new URL(file.path, url).href, false);
    return { path: file.path || '/', ok: response.status === 200 && hash(response.text) === file.sha256, http: response.status };
  }));
  const stale = checks.filter(check => !check.ok);
  if (stale.length) return pending('live', `Live files not current: ${stale.map(file => `${file.path} (${file.http})`).join(', ')}`, { ...details, checks });
  return { status: 'success', phase: 'complete', message: 'Verified commit is deployed; normal live URLs match the checked build', ...details, checks };
}

export function makeRequest({ token, fetcher = fetch, requestTimeout = 10000 } = {}) {
  return async (url, api) => {
    const headers = api ? { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } : {};
    const response = await fetcher(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(requestTimeout) });
    if (api) {
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}; cannot determine release status`);
      return response.json();
    }
    return { status: response.status, text: await response.text() };
  };
}

export async function monitorRelease(options, { inspect = inspectRelease, request = makeRequest(), now = Date.now,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)), save = async () => {}, report = () => {} } = {}) {
  const started = now(), deadline = started + options.timeout * 1000;
  let errors = 0, lastPhase = '', state;
  do {
    try { state = await inspect(options, request); errors = 0; }
    catch (error) {
      errors++;
      state = { status: errors >= 3 || !options.wait ? 'failed' : 'waiting', phase: state?.phase || 'status',
        message: error.message, consecutiveErrors: errors };
    }
    if (state.status === 'waiting' && options.wait && now() >= deadline) state = { ...state, status: 'timeout', message: `Time limit reached: ${state.message}` };
    state = { repo: options.repo, commit: options.commit, build: options.expected.build, url: options.url,
      ...state, startedAt: new Date(started).toISOString(), updatedAt: new Date(now()).toISOString() };
    await save(state);
    const phase = `${state.status}:${state.phase}:${state.message}`;
    if (phase !== lastPhase) { report(state); lastPhase = phase; }
    if (state.status !== 'waiting' || !options.wait) return state;
    await pause(Math.min(options.poll * 1000, Math.max(0, deadline - now())));
  } while (true);
}

async function main() {
  const { values } = parseArgs({ options: {
    repo: { type: 'string', default: process.env.GITHUB_REPOSITORY }, commit: { type: 'string', default: process.env.GITHUB_SHA },
    url: { type: 'string' }, docs: { type: 'string', default: 'docs' }, 'verify-run': { type: 'string' },
    state: { type: 'string' }, wait: { type: 'boolean', default: false }, timeout: { type: 'string', default: '600' }, poll: { type: 'string', default: '15' }
  } });
  if (!/^[\w.-]+\/[\w.-]+$/.test(values.repo || '') || !/^[a-f0-9]{40}$/.test(values.commit || '')) throw new Error('--repo owner/repository and full --commit SHA are required');
  const timeout = Number(values.timeout), poll = Number(values.poll), verifyRun = values['verify-run'] ? Number(values['verify-run']) : undefined;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 1800 || !Number.isFinite(poll) || poll < 1 || poll > 60
    || (verifyRun !== undefined && (!Number.isSafeInteger(verifyRun) || verifyRun < 1))) throw new Error('Invalid run ID or time limits');
  if (values.wait && !values.state) throw new Error('--wait requires --state for a resumable checkpoint');
  const [owner, repository] = values.repo.split('/'), url = values.url || `https://${owner.toLowerCase()}.github.io/${repository}/`;
  if (new URL(url).protocol !== 'https:' || !url.endsWith('/')) throw new Error('--url must be an HTTPS site root ending with /');
  const expected = await expectedRelease(values.docs);
  if (values.state) {
    try {
      const previous = JSON.parse(await readFile(values.state, 'utf8'));
      if (previous.repo !== values.repo || previous.commit !== values.commit || previous.build !== expected.build || previous.url !== url) throw new Error('Checkpoint belongs to another commit, build or site; use a separate --state file');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const state = await monitorRelease({ repo: values.repo, commit: values.commit, verifyRun, expected, url, timeout, poll, wait: values.wait }, {
    request: makeRequest({ token: process.env.GITHUB_TOKEN }),
    save: async state => {
      if (!values.state) return;
      await mkdir(dirname(resolve(values.state)), { recursive: true });
      await writeFile(`${values.state}.tmp`, JSON.stringify(state, null, 2) + '\n');
      await rename(`${values.state}.tmp`, values.state);
    },
    report: state => console.log(JSON.stringify(state))
  });
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## Release: ${state.status}\n\n${state.message}\n\nCommit: \`${state.commit}\`  \nBuild: \`${state.build}\`  \n[Play game](${state.url})\n\n`
    + [state.verificationRun && `[Verification run](https://github.com/${state.repo}/actions/runs/${state.verificationRun})`,
      state.deploymentRun && `[Pages run](https://github.com/${state.repo}/actions/runs/${state.deploymentRun})`].filter(Boolean).join(' · ') + '\n');
  process.exitCode = state.status === 'success' ? 0 : state.status === 'waiting' ? 2 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
