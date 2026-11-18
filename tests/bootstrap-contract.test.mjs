import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Normalize CRLF so the contract also holds on Windows checkouts (autocrlf).
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const guard = readFileSync(new URL('../scripts/check-tracked-file-safety.mjs', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const JOBS = ['bootstrap-verify', 'bootstrap-safety', 'app-verify', 'audit', 'db-integration', 'e2e-smoke'];
// Reviewer chỉ chờ các job bắt buộc; e2e-smoke chưa là check bắt buộc (nâng lên là bước ruleset R3 riêng).
const REVIEW_JOBS = JOBS.filter((j) => j !== 'e2e-smoke');

describe('manual sandbox negative probe caller (R3 #172)', () => {
  const centralPin = '907fd9287a9789bfe4db9428f91140efa6b87acc';
  const readCaller = () => readFileSync(
    new URL('../.github/workflows/claude-sandbox-probe-caller.yml', import.meta.url), 'utf8',
  ).replaceAll('\r\n', '\n');

  it('only exposes manual dispatch with no task-controlled inputs or automatic event', () => {
    const caller = readCaller();
    assert.equal(caller.split('on:\n')[1].split('\npermissions:')[0], '  workflow_dispatch:\n');
    assert.doesNotMatch(caller, /pull_request_target|issue_comment|workflow_run|schedule:|inputs:/);
  });

  it('enforces repository, owner, event and default-main branch before the reusable job', () => {
    const caller = readCaller();
    const expression = caller.match(/    if: >-\n([\s\S]*?)    uses:/)?.[1];
    assert.ok(expression);
    const clauses = expression.trim().split(/\s*&&\s*/).map(clause => {
      const match = clause.match(/^github\.(repository|event_name|actor|ref) == '([^']+)'$/);
      assert.ok(match, 'only literal equality AND clauses are allowed');
      return [match[1], match[2]];
    });
    assert.deepEqual(clauses, [
      ['repository', 'nexagnet/legal-office'],
      ['event_name', 'workflow_dispatch'],
      ['actor', 'phungtienviet14-sketch'],
      ['ref', 'refs/heads/main'],
    ]);
    const allowed = Object.fromEntries(clauses);
    const evaluate = context => clauses.every(([key, value]) => context[key] === value);
    assert.equal(evaluate(allowed), true);
    for (const [key, value] of [
      ['repository', 'nexagnet/other'], ['event_name', 'pull_request'],
      ['actor', 'another-user'], ['ref', 'refs/heads/codex/unreviewed'],
      ['ref', 'refs/tags/main'], ['actor', undefined],
    ]) assert.equal(evaluate({ ...allowed, [key]: value }), false);
  });

  it('pins the diagnostic to the exact merged central SHA and has no local execution steps', () => {
    const caller = readCaller();
    const job = caller.split('jobs:\n')[1];
    assert.match(job, new RegExp('uses: nexagnet/\\.github/\\.github/workflows/claude-sandbox-probe\\.yml@' + centralPin + '\\n'));
    assert.equal((job.match(/^  [a-z-]+:/gm) ?? []).length, 1);
    assert.doesNotMatch(job, /steps:|runs-on:|run:|with:|@(?:main|master|HEAD|v\d+)\b/);
  });

  it('grants only the read permissions required by the central probe', () => {
    const caller = readCaller();
    assert.equal(caller.split('permissions:\n')[1].split('\njobs:')[0],
      '  contents: read\n  issues: read\n  pull-requests: read\n');
    assert.doesNotMatch(caller, /: write\b|write-all|id-token:|actions: write|secrets: inherit/);
  });

  it('maps only the existing Claude secret and never a Publisher/App credential', () => {
    const caller = readCaller();
    assert.equal(caller.split('    secrets:\n')[1],
      '      CLAUDE_CODE_OAUTH_TOKEN: $' + '{{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n');
    assert.doesNotMatch(caller, /BUILDER_PUBLISHER|APP_PRIVATE_KEY|GITHUB_TOKEN|GH_TOKEN|gh pr merge|deploy/);
  });
});

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
    const jobs = workflow.split(/^jobs:\n/m)[1].split(/^  (?=[a-z0-9-]+:\n    name: )/m).filter(Boolean);
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
    assert.equal((workflow.match(/pnpm install --frozen-lockfile/g) ?? []).length, 4);
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
  const builderPinned = '907fd9287a9789bfe4db9428f91140efa6b87acc';
  const reviewerPinned = '907fd9287a9789bfe4db9428f91140efa6b87acc';

  it('pins independent immutable and reviewed central Builder/Reviewer workflow versions', () => {
    assert.match(builderCaller, new RegExp('claude-builder\\.yml@' + builderPinned));
    assert.match(reviewerCaller, new RegExp('claude-reviewer\\.yml@' + reviewerPinned));
    assert.doesNotMatch(builderCaller + reviewerCaller, /@(?:main|master|HEAD|v\d+)\b/);
  });

  it('Builder allows only owner-authored Issue comments and explicit credentials', () => {
    assert.match(builderCaller, /issue_comment:\n\s+types: \[created\]/);
    assert.match(builderCaller, /github\.actor == 'phungtienviet14-sketch'/);
    assert.match(builderCaller, /github\.event\.issue\.pull_request == null/);
    assert.doesNotMatch(builderCaller, /contains\(github\.event\.comment\.body/);
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

  it('requires a successful owner-command gate with no token permissions before Builder', () => {
    const [, gate, builder] = builderCaller.match(/\n  command-gate:\n([\s\S]+?)\n  builder:\n([\s\S]+)/) ?? [];
    assert.ok(gate && builder, 'expected separate command-gate and builder jobs');
    assert.match(gate, /permissions: \{\}/);
    assert.match(gate, /github\.repository == 'nexagnet\/legal-office'/);
    assert.match(gate, /github\.actor == 'phungtienviet14-sketch'/);
    assert.match(gate, /github\.event\.sender\.login == 'phungtienviet14-sketch'/);
    assert.match(gate, /github\.event\.comment\.user\.login == 'phungtienviet14-sketch'/);
    assert.match(gate, /github\.event\.comment\.user\.type == 'User'/);
    assert.match(gate, /github\.event\.issue\.pull_request == null/);
    assert.match(gate, /accepted: \$\{\{ steps\.command\.outputs\.accepted \}\}/);
    assert.doesNotMatch(gate, /secrets\.|github\.token|uses:|\$\{\{ github\.event\.comment\.body/);
    assert.match(builder, /needs: command-gate/);
    assert.match(builder, /needs\.command-gate\.outputs\.accepted == 'true'/);
    assert.match(builder, /github\.run_attempt == '1'/);
    assert.doesNotMatch(builder, /always\s*\(/);
  });

  it('accepts only complete case-sensitive commands with optional trailing ASCII whitespace', () => {
    const script = builderCaller.match(/node <<'NODE'\n([\s\S]+?)\n\s+NODE\n/)?.[1];
    assert.ok(script, 'expected inline command evaluator');
    const dir = mkdtempSync(join(tmpdir(), 'builder-command-'));
    try {
      const event = join(dir, 'event.json');
      const output = join(dir, 'output');
      const run = (json) => {
        writeFileSync(event, json);
        writeFileSync(output, '');
        const result = spawnSync(process.execPath, ['-e', script], {
          encoding: 'utf8',
          env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output },
          timeout: 5_000,
        });
        return { status: result.status, output: readFileSync(output, 'utf8') };
      };
      for (const body of ['@claude', '@claude retry', '@claude \t\r\n', '@claude retry\r\n']) {
        assert.deepEqual(run(JSON.stringify({ comment: { body } })), { status: 0, output: 'accepted=true\n' }, JSON.stringify(body));
      }
      for (const body of [
        'status: @claude', '@claude please', '> @claude', '\x60@claude\x60', '@Claude', '@claude Retry',
        ' @claude', '@claude\nretry', '@claude  retry', '@claude\u00a0', '@claude\u2028',
        '@claude\naccepted=true', '', null, 1, {}, undefined,
      ]) {
        assert.deepEqual(run(JSON.stringify({ comment: { body } })), { status: 0, output: 'accepted=false\n' }, JSON.stringify(body));
      }
      const invalid = run('{');
      assert.notEqual(invalid.status, 0);
      assert.equal(invalid.output, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Reviewer accepts successful PR CI with exact HEAD inputs and expected jobs', () => {
    assert.match(reviewerCaller, /workflow_run:\n\s+workflows: \[ci\]\n\s+types: \[completed\]/);
    assert.match(reviewerCaller, /github\.event\.workflow_run\.event == 'pull_request'/);
    assert.match(reviewerCaller, /github\.event\.workflow_run\.conclusion == 'success'/);
    assert.match(reviewerCaller, /github\.event\.workflow_run\.pull_requests\[0\]\.number != null/);
    assert.match(reviewerCaller, /expected_head_sha: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
    assert.match(reviewerCaller, /ci_run_id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
    assert.match(reviewerCaller, new RegExp(`required_jobs_csv: ${REVIEW_JOBS.join(',')}\\n`));
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
    assert.match(reviewerCaller, /uses: nexagnet\/\.github\/\.github\/workflows\/claude-reviewer\.yml@907fd9287a9789bfe4db9428f91140efa6b87acc/);
    assert.match(builderCaller, new RegExp('claude-builder\\.yml@' + builderPinned));
    assert.doesNotMatch(reviewerCaller, /pull_request_target|workflow_dispatch|gh pr merge|gh api.*merge|deploy/);
  });

});


import { existsSync, readdirSync } from 'node:fs';

describe('V5.1 D1: no automatic Claude Repair (REQ-04)', () => {
  it('has no Repair caller workflow', () => {
    assert.equal(existsSync(new URL('../.github/workflows/claude-repair-caller.yml', import.meta.url)), false);
  });

  it('no workflow reacts to a Reviewer run or calls the central Repair workflow', () => {
    const dir = new URL('../.github/workflows/', import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.yml'))) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      assert.doesNotMatch(text, /claude-repair\.yml/, f);
      assert.doesNotMatch(text, /workflows: \[Nexagnet V5 Legal Office Reviewer Caller\]/, f);
    }
  });
});

describe('V5.1 M1: kill switch and ownership', () => {
  it('Builder and Reviewer callers stop when repo variable AUTOPILOT_ENABLED is "false"', () => {
    for (const f of ['claude-builder-caller.yml', 'claude-reviewer-caller.yml']) {
      const text = readFileSync(new URL('../.github/workflows/' + f, import.meta.url), 'utf8');
      assert.match(text, /vars\.AUTOPILOT_ENABLED != 'false'/, f);
    }
  });

  it('CI is not gated by the kill switch', () => {
    assert.doesNotMatch(workflow, /AUTOPILOT_ENABLED/);
  });

  it('CODEOWNERS covers the control plane', () => {
    const co = readFileSync(new URL('../.github/CODEOWNERS', import.meta.url), 'utf8');
    for (const p of ['/.github/', '/AGENTS.md', '/deploy/', '/apps/api/drizzle/']) assert.ok(co.includes(p), p);
  });

  it('PR template carries the Reviewer issue reference line', () => {
    const t = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
    assert.match(t, /Refs #123/);
  });
});

describe('V5.1 M2: CI re-runs when a Draft PR becomes Ready', () => {
  it('pull_request types include ready_for_review and keep the default types', () => {
    assert.match(workflow, /types: \[opened, synchronize, reopened, ready_for_review\]/);
  });
});

import { classify, linkedIssue, pickRisk } from '../scripts/release-policy.mjs';

describe('V5.1 M4: release-policy risk classification (informational)', () => {
  const f = (...names) => names.map((filename) => ({ filename, additions: 5, deletions: 0 }));
  it('docs only is R0, ordinary app code is R1', () => {
    assert.equal(classify({ files: f('docs/a.md'), issueRisk: 'R0' }).risk, 'R0');
    assert.equal(classify({ files: f('apps/web/src/x.tsx'), issueRisk: 'R1' }).risk, 'R1');
  });
  it('control plane and deploy paths are R3', () => {
    for (const p of ['.github/workflows/ci.yml', 'AGENTS.md', 'deploy/scripts/deploy.sh', 'Dockerfile', 'apps/api/.env.example'])
      assert.equal(classify({ files: f(p), issueRisk: 'R0' }).risk, 'R3', p);
  });
  it('migrations, lockfile and package.json are R2; Issue label can only raise', () => {
    assert.equal(classify({ files: f('apps/api/drizzle/0130_x.sql'), issueRisk: 'R0' }).risk, 'R2');
    assert.equal(classify({ files: f('pnpm-lock.yaml'), issueRisk: 'R0' }).risk, 'R2');
    assert.equal(classify({ files: f('docs/a.md'), issueRisk: 'R2' }).risk, 'R2');
  });
  it('large diff raises one level and missing Issue label is flagged', () => {
    const big = Array.from({ length: 25 }, (_, i) => ({ filename: `apps/web/src/${i}.tsx`, additions: 1, deletions: 0 }));
    assert.equal(classify({ files: big, issueRisk: null }).risk, 'R2');
    assert.equal(classify({ files: f('apps/web/src/x.tsx'), issueRisk: null }).issueUnknown, true);
  });
  it('100+ files and empty list fail closed', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md`, additions: 1, deletions: 0 }));
    assert.equal(classify({ files: many, issueRisk: 'R0' }).risk, 'R3');
    assert.equal(classify({ files: [], issueRisk: 'R0' }).risk, 'UNKNOWN');
  });
  it('parses exactly one Issue reference and exactly one risk label', () => {
    assert.equal(linkedIssue('Refs #12'), 12);
    assert.equal(linkedIssue('Refs #12 và Closes #13'), null);
    assert.equal(pickRisk([{ name: 'risk:R1' }]), 'R1');
    assert.equal(pickRisk([{ name: 'risk:R1' }, { name: 'risk:R2' }]), null);
  });
  it('workflow is informational, never checks out PR code and has no write permissions', () => {
    const w = readFileSync(new URL('../.github/workflows/release-policy.yml', import.meta.url), 'utf8');
    assert.match(w, /pull_request_target/);
    assert.match(w, /ref: main/);
    assert.doesNotMatch(w, /github\.event\.pull_request\.head|contents: write|pull-requests: write|secrets\./);
  });
});
