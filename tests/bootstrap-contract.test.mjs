import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Normalize CRLF so the contract also holds on Windows checkouts (autocrlf).
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const guard = readFileSync(new URL('../scripts/check-tracked-file-safety.mjs', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('legal-office R3 bootstrap-only CI contract', () => {
  it('runs on PR HEAD and on main push without privileged PR-target events', () => {
    assert.match(workflow, /on:\n  pull_request:\n    branches: \[main\]/);
    assert.match(workflow, /  push:\n    branches: \[main\]/);
    assert.doesNotMatch(workflow, /pull_request_target|workflow_run|issue_comment/);
  });

  it('only grants read-only contents and does not inherit any secrets', () => {
    assert.match(workflow, /permissions:\n  contents: read/);
    assert.doesNotMatch(workflow, /secrets:\s*inherit/);
    assert.doesNotMatch(workflow, /contents: write|pull-requests: write|issues: write|id-token: write/);
  });

  it('pins checkout to a full commit and scrubs checkout credentials', () => {
    const shas = [...workflow.matchAll(/uses:\s*actions\/checkout@([a-f0-9]{40})/g)];
    assert.equal(shas.length, 2);
    assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
  });

  it('pins both checkouts to the exact PR HEAD (pull_request) or pushed SHA (push)', () => {
    const jobs = workflow.split(/^jobs:\n/m)[1].split(/^  (?=bootstrap-)/m).filter(Boolean);
    assert.equal(jobs.length, 2);
    for (const job of jobs) {
      assert.match(job, /EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
      assert.match(
        job,
        /uses: actions\/checkout@[a-f0-9]{40}[^\n]*\n\s+with:\n\s+ref: \$\{\{ env\.EXPECTED_SHA \}\}\n\s+persist-credentials: false/,
      );
    }
    assert.doesNotMatch(workflow, /refs\/pull\/|pull\/\d+\/merge/);
  });

  it('fails closed in both jobs when git rev-parse HEAD differs from the expected SHA', () => {
    const asserts = [...workflow.matchAll(/actual="\$\(git rev-parse HEAD\)"[\s\S]*?exit 1/g)];
    assert.equal(asserts.length, 2);
    for (const [block] of asserts) {
      assert.match(block, /"\$\{actual\}" != "\$\{EXPECTED_SHA\}"/);
    }
    assert.doesNotMatch(workflow, /continue-on-error|\|\| true/);
  });

  it('keeps the workflow name "ci" expected by the central Reviewer', () => {
    assert.match(workflow, /^name: ci\r?$/m);
  });

  it('has dedicated names, timeout, and bounded concurrency', () => {
    assert.match(workflow, /bootstrap-verify:/);
    assert.match(workflow, /bootstrap-safety:/);
    assert.match(workflow, /timeout-minutes: 10/);
    assert.match(workflow, /cancel-in-progress: true/);
  });

  it('does not falsely declare application, domain or runtime proof', () => {
    assert.match(workflow, /bootstrap-only checks/);
    assert.match(workflow, /Neither check proves package build/);
    assert.match(readme, /legal-office/i);
  });

  it('guards common sensitive tracked files and does not suppress checks', () => {
    assert.match(guard, /ls-files/);
    assert.match(guard, /committed environment file/);
    assert.match(guard, /potential credentials/);
    assert.match(guard, /key or state file/);
    assert.doesNotMatch(workflow, /continue-on-error: true/);
  });
});
