import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectRelease, makeRequest, monitorRelease, expectedRelease } from '../scripts/release-status.mjs';

const commit = 'a'.repeat(40), repo = 'example/Game-Test', url = 'https://example.github.io/Game-Test/';
const body = 'checked release bytes';
const expected = { build: 'b'.repeat(20), files: [{ path: '', sha256: createHash('sha256').update(body).digest('hex') }] };
const options = { repo, commit, url, expected, wait: true, timeout: 30, poll: 10 };
const verify = { id: 10, head_sha: commit, head_branch: 'main', path: '.github/workflows/verify.yml', event: 'push', run_attempt: 2, status: 'in_progress' };
const pages = { id: 20, head_sha: commit, head_branch: 'main', path: 'dynamic/pages/pages-build-deployment', event: 'dynamic', status: 'completed', conclusion: 'success' };
function fixture({ runs = [verify, pages], jobs = [{ name: 'verify', status: 'completed', conclusion: 'success' }], live = body, http = 200 } = {}) {
  const calls = [];
  return { calls, request: async (path, api) => {
    calls.push({ path, api });
    if (api && path.includes('/attempts/2/jobs?')) return { jobs };
    if (api && path.includes('/actions/runs?head_sha=')) return { workflow_runs: runs };
    if (!api) return { status: http, text: live };
    throw new Error(`Unexpected request ${path}`);
  } };
}

test('release observer ignores PR runs and deployments belonging to other commits', async () => {
  const request = fixture({ runs: [{ ...verify, event: 'pull_request' }, { ...pages, head_sha: 'c'.repeat(40) }] });
  assert.equal((await inspectRelease(options, request.request)).phase, 'verification');
  const result = await inspectRelease(options, fixture({ runs: [verify, { ...pages, head_sha: 'c'.repeat(40) }] }).request);
  assert.equal(result.phase, 'deployment');
  assert.equal(result.status, 'waiting');
});

test('release job observes the successful verify job without waiting on its own workflow', async () => {
  const fixtureData = fixture();
  const result = await inspectRelease({ ...options, verifyRun: 10 }, fixtureData.request);
  assert.equal(result.status, 'success');
  assert.equal(result.verificationAttempt, 2);
  assert.equal(result.deploymentRun, 20);
  assert.ok(fixtureData.calls.some(call => call.path.includes('/attempts/2/jobs?')));
});

test('newer verification runs cannot replace the explicitly pinned run', async () => {
  const result = await inspectRelease({ ...options, verifyRun: 10 }, fixture({ runs: [{ ...verify, id: 11 }, pages] }).request);
  assert.equal(result.status, 'waiting');
  assert.equal(result.phase, 'verification');
});

test('pending or failed verification never reaches the live site', async () => {
  for (const [status, conclusion, expectedStatus] of [['in_progress', null, 'waiting'], ['completed', 'failure', 'failed'], ['completed', 'cancelled', 'failed']]) {
    const data = fixture({ jobs: [{ name: 'verify', status, conclusion }] });
    const result = await inspectRelease(options, data.request);
    assert.equal(result.status, expectedStatus);
    assert.equal(result.phase, 'verification');
    assert.ok(data.calls.every(call => call.api));
  }
});

test('latest Pages attempt wins over an older successful run and failures stop immediately', async () => {
  for (const [status, conclusion, expectedStatus] of [['queued', null, 'waiting'], ['completed', 'failure', 'failed'], ['completed', 'timed_out', 'failed']]) {
    const result = await inspectRelease(options, fixture({ runs: [verify, pages, { ...pages, id: 21, status, conclusion }] }).request);
    assert.equal(result.status, expectedStatus);
    assert.equal(result.deploymentRun, 21);
  }
});

test('green Pages status does not accept a stale root page or a missing live file', async () => {
  for (const data of [fixture({ live: 'old release' }), fixture({ http: 404 })]) {
    const result = await inspectRelease(options, data.request);
    assert.equal(result.status, 'waiting');
    assert.equal(result.phase, 'live');
    assert.ok(data.calls.some(call => call.path === url));
    assert.ok(data.calls.every(call => call.api || !call.path.includes('?')));
  }
});

test('missing runs reach a fixed deadline and preserve a useful checkpoint', async () => {
  let clock = 0;
  const saves = [], reports = [];
  const result = await monitorRelease(options, {
    inspect: async () => ({ status: 'waiting', phase: 'deployment', message: 'No Pages run', verificationRun: 10 }),
    now: () => clock, pause: async ms => { clock += ms; }, save: async state => saves.push(state), report: state => reports.push(state)
  });
  assert.equal(clock, 30000);
  assert.equal(result.status, 'timeout');
  assert.equal(result.phase, 'deployment');
  assert.equal(result.commit, commit);
  assert.equal(saves.at(-1).verificationRun, 10);
  assert.equal(reports.length, 2);
});

test('single checks return promptly and transport errors have a finite retry limit', async () => {
  let pauses = 0, attempts = 0;
  const pending = await monitorRelease({ ...options, wait: false }, {
    inspect: async () => ({ status: 'waiting', phase: 'deployment', message: 'Queued' }), pause: async () => { pauses++; }
  });
  assert.equal(pending.status, 'waiting');
  assert.equal(pauses, 0);
  const failed = await monitorRelease(options, {
    inspect: async () => { attempts++; throw new Error('GitHub unavailable'); }, pause: async () => { pauses++; }
  });
  assert.equal(attempts, 3);
  assert.equal(failed.status, 'failed');
  assert.equal(pauses, 2);
});

test('GitHub credentials are sent only to API requests; every request has a timeout', async () => {
  const calls = [];
  const request = makeRequest({ token: 'test-token', fetcher: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({}), text: async () => body };
  } });
  await request('https://api.github.com/repos/example/Game-Test/actions/runs', true);
  await request(url, false);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.ok(calls.every(call => call.init.signal instanceof AbortSignal));
});

test('expected release covers the normal entry point, manifest, worker, script and stylesheet', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sperrkreis-release-'));
  try {
    await mkdir(join(root, 'build'));
    await writeFile(join(root, 'build/manifest.json'), JSON.stringify({ id: 'b'.repeat(20), script: 'build/main.js', style: 'build/style.css' }));
    for (const path of ['index.html', 'sw.js', 'build/main.js', 'build/style.css']) await writeFile(join(root, path), path);
    const result = await expectedRelease(root);
    assert.deepEqual(result.files.map(file => file.path), ['', 'build/manifest.json', 'sw.js', 'build/main.js', 'build/style.css']);
    const state = join(root, 'state.json');
    await writeFile(state, JSON.stringify({ repo, commit: 'c'.repeat(40), build: result.build, url }));
    assert.throws(() => execFileSync(process.execPath, ['scripts/release-status.mjs', '--repo', repo, '--commit', commit, '--docs', root, '--state', state], { stdio: 'pipe' }), /Checkpoint belongs to another commit/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
