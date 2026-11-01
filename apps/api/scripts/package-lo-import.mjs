/* global process, fetch, Buffer, console */
// Đóng gói lo-import thành thư mục chạy được trên Windows không cần cài Node:
//   node.exe chính thức (kiểm sha256 theo SHASUMS256.txt của nodejs.org) + mã đã build + hướng dẫn.
// Chạy sau `pnpm build`:  node scripts/package-lo-import.mjs [thư-mục-xuất]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, 'dist-package'));
const NODE_INDEX = 'https://nodejs.org/dist/latest-v22.x';

const sums = await (await fetch(`${NODE_INDEX}/SHASUMS256.txt`)).text();
const line = sums.split('\n').find((l) => /node-v22\.\d+\.\d+-win-x64\.zip$/.test(l));
if (!line) throw new Error('Không tìm thấy node win-x64.zip trong SHASUMS256.txt');
const [expected, zipName] = line.trim().split(/\s+/);
const nodeZip = Buffer.from(await (await fetch(`${NODE_INDEX}/${zipName}`)).arrayBuffer());
const actual = createHash('sha256').update(nodeZip).digest('hex');
if (actual !== expected)
  throw new Error(`sha256 của ${zipName} không khớp: ${actual} != ${expected}`);

const nodeFiles = await JSZip.loadAsync(nodeZip);
const nodeExeEntry = Object.values(nodeFiles.files).find((f) => /\/node\.exe$/.test(f.name));
if (!nodeExeEntry) throw new Error('Không có node.exe trong gói Node');
const nodeExe = await nodeExeEntry.async('nodebuffer');

const out = new JSZip();
const base = 'lo-import-win-x64';
out.file(`${base}/node/node.exe`, nodeExe);
const distDir = join(root, 'dist', 'legacy-import');
for (const f of readdirSync(distDir).filter((n) => n.endsWith('.js') && !n.endsWith('.test.js'))) {
  out.file(`${base}/app/${f}`, readFileSync(join(distDir, f)));
}
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
out.file(
  `${base}/lo-import.cmd`,
  crlf('@echo off\nchcp 65001 >nul\n"%~dp0node\\node.exe" "%~dp0app\\import.cli.js" %*\n'),
);
out.file(
  `${base}/lo-import.env.example`,
  crlf(readFileSync(join(root, 'package-lo-import/lo-import.env.example'), 'utf8')),
);
out.file(
  `${base}/HUONG-DAN.txt`,
  '\ufeff' + crlf(readFileSync(join(root, 'package-lo-import/HUONG-DAN.txt'), 'utf8')),
);
out.file(
  `${base}/NODE-VERSION.txt`,
  crlf(`${zipName}\nsha256 ${expected} (đã kiểm theo ${NODE_INDEX}/SHASUMS256.txt)\n`),
);

mkdirSync(outDir, { recursive: true });
const zipBytes = await out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const target = join(outDir, `${base}.zip`);
writeFileSync(target, zipBytes);
console.log(
  `${target}\nsha256 ${createHash('sha256').update(zipBytes).digest('hex')}\n${zipBytes.length} bytes, ${zipName}`,
);
