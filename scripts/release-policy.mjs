// V5.1 release-policy: tính mức rủi ro của PR từ đường dẫn thay đổi + nhãn risk của Issue liên kết.
// Chế độ hiện tại: CHỈ THÔNG TIN (không chặn). Chỉ đọc dữ liệu qua API; không chạy mã của PR.
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RANK = { R0: 0, R1: 1, R2: 2, R3: 3 };
const NAME = ['R0', 'R1', 'R2', 'R3'];

const R3_PATHS = [
  /^\.github\//, /^AGENTS\.md$/, /^CLAUDE\.md$/, /^\.claude\//, /^\.mcp\.json$/,
  /^deploy\//, /(^|\/)Dockerfile[^/]*$/, /^infra\//, /(^|\/)\.env/, /(^|\/)docker-compose[^/]*\.ya?ml$/,
];
const R2_PATHS = [
  /^apps\/api\/drizzle\/.*\.sql$/, /(^|\/)pnpm-lock\.yaml$/, /(^|\/)package\.json$/,
  /^apps\/api\/src\/.*(permission|rls|tenant|auth)/i,
];
const R0_PATHS = [/^docs\//, /\.md$/];

export function classify({ files, issueRisk }) {
  const reasons = [];
  let level = 0;
  const raise = (to, why) => { if (to > level) level = to; reasons.push(`${NAME[to]}: ${why}`); };

  if (!Array.isArray(files) || files.length === 0) return { risk: 'UNKNOWN', reasons: ['không đọc được danh sách file'] };
  if (files.length >= 100) raise(3, 'từ 100 file trở lên (danh sách có thể không đầy đủ)');

  let allDocs = true;
  for (const f of files) {
    const name = f.filename;
    if (R3_PATHS.some((r) => r.test(name))) raise(3, `đụng vùng điều khiển: ${name}`);
    else if (R2_PATHS.some((r) => r.test(name))) raise(2, `vùng nhạy cảm: ${name}`);
    if (!R0_PATHS.some((r) => r.test(name)) || /^(AGENTS|CLAUDE)\.md$/.test(name)) allDocs = false;
  }
  if (level === 0) level = allDocs ? 0 : 1;

  const lines = files.reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
  if ((lines > 400 || files.length > 20) && level < 3) { level += 1; reasons.push(`tăng 1 bậc vì diff lớn (${files.length} file, ${lines} dòng)`); }

  if (issueRisk && RANK[issueRisk] !== undefined && RANK[issueRisk] > level) { level = RANK[issueRisk]; reasons.push(`${issueRisk}: nhãn risk của Issue liên kết`); }
  const issueUnknown = !issueRisk;
  if (issueUnknown) reasons.push('Issue liên kết thiếu hoặc không có đúng 1 nhãn risk R0-R3 (cần phân loại tay trước khi tự merge)');
  return { risk: NAME[level], reasons, issueUnknown };
}

export function linkedIssue(body) {
  const m = [...String(body || '').matchAll(/\b(?:Refs|Closes|Relates to)\s+#(\d+)/gi)].map((x) => x[1]);
  return new Set(m).size === 1 ? Number(m[0]) : null;
}

export function pickRisk(labels) {
  const r = (labels || []).map((l) => l.name).filter((n) => /^risk:R[0-3]$/.test(n));
  return r.length === 1 ? r[0].slice(5) : null;
}

function gh(path) {
  const r = spawnSync('gh', ['api', '--paginate', path], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`gh api ${path} lỗi`);
  return JSON.parse(r.stdout.replace(/\]\s*\[/g, ','));
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !/^[1-9]\d*$/.test(pr || '')) throw new Error('đầu vào không hợp lệ');
  const prData = gh(`repos/${repo}/pulls/${pr}`);
  const files = gh(`repos/${repo}/pulls/${pr}/files?per_page=100`);
  const issue = linkedIssue(prData.body);
  let issueRisk = null;
  if (issue) issueRisk = pickRisk(gh(`repos/${repo}/issues/${issue}`).labels);
  const out = classify({ files, issueRisk });
  const lines = [`## release-policy (chế độ chỉ thông tin)`, `PR #${pr}, head ${prData.head.sha}`, `**Mức rủi ro tính được: ${out.risk}**`, ...out.reasons.map((r) => `- ${r}`),
    '', 'Chưa chặn merge. Khi chuyển sang chế độ bắt buộc: R3 và R2 chưa có phê duyệt của chủ sẽ báo đỏ.'];
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (e) { console.log(`release-policy: không tính được (${e.message}); chế độ chỉ thông tin nên không chặn.`); }
}
