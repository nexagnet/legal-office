import { execFileSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = execFileSync('git', ['ls-files', '--cached', '--full-name', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean);

if (files.length === 0) {
  throw new Error('No tracked files: cannot verify repository content');
}

const violations = [];
for (const file of files) {
  const safe = file.replaceAll('\\', '/');
  const lower = safe.toLowerCase();
  const filename = lower.split('/').at(-1);
  if (lower.includes('../') || safe.startsWith('/') || !safe.trim()) {
    violations.push(file + ': invalid path');
    continue;
  }
  if (/(^|\/)\.env($|\.)/.test(lower) && !/\.env\.(example|sample|template)$/.test(lower)) {
    violations.push(file + ': committed environment file');
  }
  if (/(^|\/)(\.npmrc|\.pypirc|id_rsa|id_ed25519|credentials\.json|service-account\.json)$/.test(lower)) {
    violations.push(file + ': potential credentials');
  }
  if (/\.(pem|p12|pfx|key|jks|keystore|tfstate)$/.test(lower)) {
    violations.push(file + ': key or state file');
  }
  if (lower.startsWith('.github/workflows/') && !lower.endsWith('.yml') && !lower.endsWith('.yaml')) {
    violations.push(file + ': unexpected workflow extension');
  }
}
if (violations.length) {
  throw new Error('Unsafe tracked file(s):\n' + violations.join('\n'));
}
console.log('Checked ' + files.length + ' tracked files; filename safety PASS.');
console.log('This is NOT a contents/secrets scan or application security attestation.');
