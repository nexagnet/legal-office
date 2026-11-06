import { opendir, lstat } from 'node:fs/promises';
import { join } from 'node:path';

export interface ScannedFile {
  readonly kind: 'file';
  readonly absPath: string;
  /** Đường dẫn tương đối trong kho gốc, dùng '/' và chuẩn hoá NFC. */
  readonly relPath: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface SkippedEntry {
  readonly kind: 'skip';
  readonly relPath: string;
  readonly reason: 'IGNORED' | 'SYMLINK' | 'UNREADABLE' | 'BAD_NAME' | 'TOO_LONG';
}

/** Tệp hệ thống/tạm không phải tài liệu: bỏ qua và ghi vào báo cáo. */
export const DEFAULT_IGNORE: readonly RegExp[] = [
  /^thumbs\.db$/i,
  /^desktop\.ini$/i,
  /^\.ds_store$/i,
  /^~\$/,
  /^\.~lock\./,
  /\.tmp$/i,
];

const MAX_REL_PATH = 1000;

/**
 * Duyệt thư mục theo thứ tự ổn định. Không theo liên kết tượng trưng (tránh vòng lặp và đọc ra ngoài kho),
 * không dừng khi một mục lỗi quyền đọc (báo UNREADABLE rồi đi tiếp).
 */
export async function* scan(
  root: string,
  opts: { ignore?: readonly RegExp[]; skipAbsPaths?: ReadonlySet<string> } = {},
): AsyncGenerator<ScannedFile | SkippedEntry> {
  const ignore = opts.ignore ?? DEFAULT_IGNORE;
  async function* walk(dirAbs: string, dirRel: string): AsyncGenerator<ScannedFile | SkippedEntry> {
    let names: string[];
    try {
      const handle = await opendir(dirAbs);
      names = [];
      for await (const e of handle) names.push(e.name);
    } catch {
      yield { kind: 'skip', relPath: dirRel || '.', reason: 'UNREADABLE' };
      return;
    }
    names.sort();
    for (const rawName of names) {
      const name = rawName.normalize('NFC');
      const abs = join(dirAbs, rawName);
      const rel = dirRel ? `${dirRel}/${name}` : name;
      if (opts.skipAbsPaths?.has(abs.replace(/^\\\\\?\\/, ''))) continue;
      if (name.includes('\\') || name.includes('\0')) {
        yield { kind: 'skip', relPath: rel, reason: 'BAD_NAME' };
        continue;
      }
      let st;
      try {
        st = await lstat(abs);
      } catch {
        yield { kind: 'skip', relPath: rel, reason: 'UNREADABLE' };
        continue;
      }
      if (st.isSymbolicLink()) {
        yield { kind: 'skip', relPath: rel, reason: 'SYMLINK' };
      } else if (st.isDirectory()) {
        yield* walk(abs, rel);
      } else if (st.isFile()) {
        if (ignore.some((re) => re.test(name)))
          yield { kind: 'skip', relPath: rel, reason: 'IGNORED' };
        else if (rel.length > MAX_REL_PATH)
          yield { kind: 'skip', relPath: rel, reason: 'TOO_LONG' };
        else yield { kind: 'file', absPath: abs, relPath: rel, size: st.size, mtimeMs: st.mtimeMs };
      }
    }
  }
  yield* walk(root, '');
}

/**
 * Windows giới hạn đường dẫn 260 ký tự. Thêm tiền tố \\?\ để Node đọc được đường dẫn dài (kho tài liệu cũ hay có thư mục lồng sâu).
 * Nơi khác giữ nguyên.
 */
export function toLongPath(absPath: string, platform: string = process.platform): string {
  if (platform !== 'win32' || absPath.startsWith('\\\\?\\')) return absPath;
  return absPath.startsWith('\\\\') ? `\\\\?\\UNC\\${absPath.slice(2)}` : `\\\\?\\${absPath}`;
}
