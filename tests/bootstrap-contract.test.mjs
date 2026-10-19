import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Normalize CRLF so the contract also holds on Windows checkouts (autocrlf).
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const guard = readFileSync(new URL('../scripts/check-tracked-file-safety.mjs', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const JOBS = ['bootstrap-verify', 'bootstrap-safety', 'app-verify', 'audit', 'db-integration'];

describe('legal-office R3 application CI contract', () => {
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
    assert.equal(shas.length, JOBS.length);
    assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, JOBS.length);
  });

  it('pins every checkout to the exact PR HEAD (pull_request) or pushed SHA (push)', () => {
    const jobs = workflow.split(/^jobs:\n/m)[1].split(/^  (?=[a-z-]+:\n    name: )/m).filter(Boolean);
    assert.equal(jobs.length, JOBS.length);
    for (const job of jobs) {
      assert.match(job, /EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
      assert.match(
        job,
        /uses: actions\/checkout@[a-f0-9]{40}[^\n]*\n\s+with:\n\s+ref: \$\{\{ env\.EXPECTED_SHA \}\}\n\s+persist-credentials: false/,
      );
    }
    assert.doesNotMatch(workflow, /refs\/pull\/|pull\/\d+\/merge/);
  });

  it('fails closed in every job when git rev-parse HEAD differs from the expected SHA', () => {
    const asserts = [...workflow.matchAll(/actual="\$\(git rev-parse HEAD\)"[\s\S]*?exit 1/g)];
    assert.equal(asserts.length, JOBS.length);
    for (const [block] of asserts) {
      assert.match(block, /"\$\{actual\}" != "\$\{EXPECTED_SHA\}"/);
    }
    assert.doesNotMatch(workflow, /continue-on-error|\|\| true/);
  });

  it('keeps the workflow name "ci" expected by the central Reviewer', () => {
    assert.match(workflow, /^name: ci\r?$/m);
  });

  it('has dedicated names, timeout, and bounded concurrency', () => {
    for (const name of JOBS) assert.match(workflow, new RegExp(`  ${name}:\\n    name: ${name}\\n`));
    assert.match(workflow, /timeout-minutes: 10/);
    assert.match(workflow, /cancel-in-progress: true/);
  });

  it('does not falsely declare deployment or preview-runtime proof', () => {
    assert.match(workflow, /It does not prove\n# deployment, preview runtime, or the Claude pipeline/);
    assert.match(readme, /legal-office/i);
  });

  it('runs the application, audit and PostgreSQL jobs from the frozen lockfile with pinned inputs', () => {
    assert.match(workflow, /uses: actions\/setup-node@[a-f0-9]{40}/);
    assert.equal((workflow.match(/pnpm install --frozen-lockfile/g) ?? []).length, 3);
    for (const cmd of ['pnpm -r run lint', 'pnpm -r run typecheck', 'pnpm -r run test', 'pnpm -r run build', 'pnpm audit --audit-level high']) {
      assert.ok(workflow.includes(`run: ${cmd}`), cmd);
    }
    assert.match(workflow, /image: postgres:\d+\.\d+\n/);
    assert.match(workflow, /DATABASE_URL: postgresql:\/\/postgres@127\.0\.0\.1:5432\/postgres/);
    assert.match(workflow, /pnpm -r --if-present run test:integration/);
    assert.doesNotMatch(workflow, /secrets\./);
  });

  it('guards common sensitive tracked files and does not suppress checks', () => {
    assert.match(guard, /ls-files/);
    assert.match(guard, /committed environment file/);
    assert.match(guard, /potential credentials/);
    assert.match(guard, /key or state file/);
    assert.doesNotMatch(workflow, /continue-on-error: true/);
  });
});


const builderCaller = readFileSync(
  new URL('../.github/workflows/claude-builder-caller.yml', import.meta.url), 'utf8',
).replaceAll('\r\n', '\n');
const reviewerCaller = readFileSync(
  new URL('../.github/workflows/claude-reviewer-caller.yml', import.meta.url), 'utf8',
).replaceAll('\r\n', '\n');

describe('V5 consumer callers R3 static security contract (not runtime proof)', () => {
  const builderPinned = '7166e745607860e6f8a414548963f83d12c71f9b';
  const reviewerPinned = '7166e745607860e6f8a414548963f83d12c71f9b';

  it('pins independent immutable and reviewed central Builder/Reviewer workflow versions', () => {
    assert.match(builderCaller, new RegExp('claude-builder\\.yml@' + builderPinned));
    assert.match(reviewerCaller, new RegExp('claude-reviewer\\.yml@' + reviewerPinned));
    assert.doesNotMatch(builderCaller + reviewerCaller, /@(?:main|master|HEAD|v\d+)\b/);
  });

  it('Builder allows only owner-authored Issue comments and explicit credentials', () => {
    assert.match(builderCaller, /issue_comment:\n\s+types: \[created\]/);
    assert.match(builderCaller, /github\.actor == 'phungtienviet14-sketch'/);
    assert.match(builderCaller, /github\.event\.issue\.pull_request == null/);
    assert.match(builderCaller, /contains\(github\.event\.comment\.body, '@claude'\)/);
    assert.match(builderCaller, /permissions:\n  contents: read\n  issues: read\n  pull-requests: read/);
    for (const s of [
      'CLAUDE_CODE_OAUTH_TOKEN',
      'BUILDER_PUBLISHER_APP_ID',
      'BUILDER_PUBLISHER_APP_PRIVATE_KEY',
    ]) {
      assert.match(builderCaller, new RegExp(s + ': \\$\\{\\{ secrets\\.' + s + ' \\}\\}'));
    }
    assert.doesNotMatch(builderCaller, /secrets:\s*inherit|pull_request_target|contents: write|issues: write/);
  });

  it('Reviewer accepts successful PR CI with exact HEAD inputs and expected jobs', () => {
    assert.match(reviewerCaller, /workflow_run:\n\s+workflows: \[ci\]\n\s+types: \[completed\]/);
    assert.match(reviewerCaller, /github\.event\.workflow_run\.event == 'pull_request'/);
    assert.match(reviewerCaller, /github\.event\.workflow_run\.conclusion == 'success'/);
    assert.match(reviewerCaller, /github\.event\.workflow_run\.pull_requests\[0\]\.number != null/);
    assert.match(reviewerCaller, /expected_head_sha: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
    assert.match(reviewerCaller, /ci_run_id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
    assert.match(reviewerCaller, new RegExp(`required_jobs_csv: ${JOBS.join(',')}\\n`));
    assert.match(reviewerCaller, /permissions:\n  contents: read\n  actions: read\n  checks: read\n  issues: read\n(?:  # [^\n]+\n)*  pull-requests: write/);
    assert.match(reviewerCaller, /CLAUDE_CODE_OAUTH_TOKEN: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/);
    assert.doesNotMatch(reviewerCaller, /BUILDER_PUBLISHER_APP_|secrets:\s*inherit|contents: write|pull_request_target/);
  });

  it('does not include privileged cross-org targets, automatic merge or deployment', () => {
    for (const caller of [builderCaller, reviewerCaller]) {
      assert.match(caller, /github\.repository == 'nexagnet\/legal-office'/);
      assert.doesNotMatch(caller, /secrets:\s*inherit|gh pr merge|deployment:|deployments: write/);
    }
  });
  it('grants PR-comment write only at Reviewer caller ceiling, never to Builder or Claude', () => {
    assert.match(reviewerCaller, /pull-requests: write/);
    assert.match(reviewerCaller, /issues: read/);
    assert.doesNotMatch(reviewerCaller, /issues: write|contents: write|actions: write|id-token: write/);
    assert.doesNotMatch(reviewerCaller, /secrets: inherit|BUILDER_PUBLISHER_APP_ID|BUILDER_PUBLISHER_APP_PRIVATE_KEY/);
    assert.doesNotMatch(builderCaller, /pull-requests: write|issues: write|contents: write/);
    assert.match(reviewerCaller, /uses: nexagnet\/\.github\/\.github\/workflows\/claude-reviewer\.yml@7166e745607860e6f8a414548963f83d12c71f9b/);
    assert.match(builderCaller, /uses: nexagnet\/\.github\/\.github\/workflows\/claude-builder\.yml@7166e745607860e6f8a414548963f83d12c71f9b/);
    assert.doesNotMatch(reviewerCaller, /pull_request_target|workflow_dispatch|gh pr merge|gh api.*merge|deploy/);
  });

});
