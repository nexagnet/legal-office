import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { ImportApi, loginForCookie } from './client';
import { Ledger } from './ledger';
import { runImport } from './run';
import { scan, toLongPath } from './scan';

const USAGE = `lo-import: nhập tài liệu cũ vào Legal Office DMS (chỉ lưu tệp, đánh dấu tài liệu cũ)

Cấu hình (trong tệp lo-import.env cạnh chương trình, hoặc biến môi trường):
  LO_API_URL=https://www.nexagnet.com/api
  LO_COOKIE=lo_session=<giá trị cookie đăng nhập>
  hoặc (khuyên dùng cho đợt nhập dài, tự đăng nhập lại khi phiên hết hạn, không cần người túc trực):
  LO_TENANT_ID=<mã văn phòng/tenant>  LO_LOGIN=<email hoặc số CCCD>  LO_PASSWORD=<mật khẩu>

  scan   <thư-mục>                                  đếm tệp và dung lượng, không gửi gì
  open   --office <id> --label <tên> [<thư-mục>]    mở một đợt nhập, in mã đợt
  run    --batch <id> [--concurrency 3] <thư-mục>   nhập (chạy lại an toàn, làm tiếp chỗ dở)
  report --batch <id>                               xem số tệp, dung lượng của đợt (so với sổ tiến độ trên máy)
  close  --batch <id>                               đóng đợt (sau đó không thêm tệp được nữa)

Sổ tiến độ: lo-import-<mã đợt>.jsonl trong thư mục hiện tại. GIỮ LẠI để chạy tiếp khi đứt mạng.`;

/** Tệp cấu hình đặt cạnh chương trình; biến môi trường có sẵn được ưu tiên. */
function loadConfigFile(): void {
  for (const dir of [process.cwd(), join(__dirname, '..'), __dirname]) {
    const file = join(dir, 'lo-import.env');
    if (existsSync(file)) {
      const before = { ...process.env };
      process.loadEnvFile(file);
      for (const [k, v] of Object.entries(before)) if (v !== undefined) process.env[k] = v;
      return;
    }
  }
}

/** Phiên đăng nhập hết hạn giữa chừng: hỏi cookie mới ngay tại cửa sổ lệnh, không phải chạy lại từ đầu. */
async function askNewCookie(): Promise<string | null> {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nPhiên đăng nhập đã hết hạn.');
    const answer = await rl.question(
      'Đăng nhập lại trên trình duyệt, copy giá trị cookie lo_session rồi dán vào đây (Enter để dừng): ',
    );
    return answer.trim() || null;
  } finally {
    rl.close();
  }
}

async function apiFromEnv(): Promise<ImportApi> {
  const baseUrl = process.env.LO_API_URL?.replace(/\/$/, '');
  const { LO_COOKIE, LO_TENANT_ID, LO_LOGIN, LO_PASSWORD } = process.env;
  if (!baseUrl) throw new Error('Thiếu LO_API_URL (xem lo-import.env)');
  if (LO_TENANT_ID && LO_LOGIN && LO_PASSWORD) {
    const relogin = () => loginForCookie(baseUrl, LO_TENANT_ID, LO_LOGIN, LO_PASSWORD);
    const cookie = await relogin();
    if (!cookie) {
      throw new Error(
        'Đăng nhập tự động thất bại: sai thông tin, tài khoản bị khóa, hoặc chưa đổi mật khẩu lần đầu (đăng nhập trên web để đổi trước)',
      );
    }
    return new ImportApi({ baseUrl, headers: { cookie }, onUnauthorized: relogin });
  }
  if (!LO_COOKIE) throw new Error('Thiếu LO_COOKIE hoặc bộ LO_TENANT_ID + LO_LOGIN + LO_PASSWORD');
  return new ImportApi({ baseUrl, headers: { cookie: LO_COOKIE }, onUnauthorized: askNewCookie });
}

const fmtBytes = (n: number) => `${(n / 1024 ** 3).toFixed(2)} GiB`;

async function main(): Promise<number> {
  loadConfigFile();
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      batch: { type: 'string' },
      office: { type: 'string' },
      label: { type: 'string' },
      concurrency: { type: 'string', default: '3' },
    },
  });
  const [cmd, dir] = positionals;
  switch (cmd) {
    case 'scan': {
      if (!dir) throw new Error(USAGE);
      let files = 0;
      let bytes = 0;
      const skipped: Record<string, number> = {};
      for await (const e of scan(toLongPath(resolve(dir)))) {
        if (e.kind === 'file') {
          files++;
          bytes += e.size;
        } else skipped[e.reason] = (skipped[e.reason] ?? 0) + 1;
      }
      console.log(JSON.stringify({ files, bytes, size: fmtBytes(bytes), skipped }, null, 2));
      return 0;
    }
    case 'open': {
      if (!values.office || !values.label) throw new Error(USAGE);
      const r = await (
        await apiFromEnv()
      ).openBatch(values.office, values.label, dir ? resolve(dir) : undefined);
      console.log(`Mã đợt: ${r.label}`);
      return 0;
    }
    case 'run': {
      if (!values.batch || !dir) throw new Error(USAGE);
      const ledgerPath = resolve(`lo-import-${values.batch}.jsonl`);
      const ledger = await Ledger.open(ledgerPath);
      const sum = await runImport({
        root: toLongPath(resolve(dir)),
        batchId: values.batch,
        api: await apiFromEnv(),
        ledger,
        concurrency: Number(values.concurrency),
        skipAbsPaths: new Set([ledgerPath]),
        onEvent: (e) => console.log(`${e.outcome}\t${e.relPath}`),
      });
      console.log(JSON.stringify({ ...sum, bytesUploaded: fmtBytes(sum.bytesUploaded) }, null, 2));
      if (sum.abortedByAuth) {
        console.error(
          'Đã dừng vì phiên đăng nhập hết hạn. Đăng nhập lại rồi chạy lại đúng lệnh này để làm tiếp.',
        );
        return 3;
      }
      return sum.failed.length > 0 ? 2 : 0;
    }
    case 'report': {
      if (!values.batch) throw new Error(USAGE);
      const server = await (await apiFromEnv()).report(values.batch);
      const local = (await Ledger.open(resolve(`lo-import-${values.batch}.jsonl`))).summary();
      console.log(
        JSON.stringify(
          { server, localLedger: local, matches: server.fileCount === local.registered },
          null,
          2,
        ),
      );
      return 0;
    }
    case 'close': {
      if (!values.batch) throw new Error(USAGE);
      await (await apiFromEnv()).close(values.batch);
      console.log('Đã đóng đợt.');
      return 0;
    }
    default:
      console.log(USAGE);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
