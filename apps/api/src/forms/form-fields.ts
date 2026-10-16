// Từ dữ liệu vào (lồng nhau) sang bảng trường phẳng `đường.dẫn -> chuỗi` để điền chỗ trống.
// Giá trị thiếu/rỗng KHÔNG vào bảng, nên chỗ trống giữ chấm gốc, không bao giờ ra "undefined".
import type { FormCode } from './form-template';
import type { CorrectionRow, FormInputMap, N01Input, TongDatItem } from './form-input';

export class FormInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormInputError';
  }
}

export interface FormContext {
  /** Trường vô hướng (kèm `.d/.m/.y` cho ngày). */
  readonly fields: ReadonlyMap<string, string>;
  /** Danh sách chuỗi (mỗi phần tử một dòng) theo khóa. */
  readonly lists: ReadonlyMap<string, readonly string[]>;
  readonly items: readonly TongDatItem[];
  readonly corrections: readonly CorrectionRow[];
}

const MONEY_KEYS = new Set([
  'fee.amount',
  'fee.total',
  'fee.verification',
  'fee.minimum',
  'fee.advance',
  'totalCost',
]);
const DATE_KEY = /(Date|date|From|from)$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Ký tự điều khiển không hợp lệ trong XML 1.0 (giữ \t \n \r).
// eslint-disable-next-line no-control-regex
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export const formatVnd = (n: number): string =>
  String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Làm sạch một giá trị văn bản: bỏ ký tự điều khiển, cắt đầu/cuối; trả '' nếu rỗng. */
export function cleanText(value: string): string {
  return value.replace(XML_BAD, '').trim();
}

function parseIsoDate(path: string, value: string): { d: string; m: string; y: string } {
  const m = ISO_DATE.exec(value.trim());
  if (!m) throw new FormInputError(`Trường ngày "${path}" phải có dạng YYYY-MM-DD: "${value}"`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new FormInputError(`Trường ngày "${path}" không tồn tại trên lịch: "${value}"`);
  }
  return { d: pad2(d), m: pad2(mo), y: String(y) };
}

function scalar(path: string, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new FormInputError(`Trường "${path}" không phải số hữu hạn`);
    return MONEY_KEYS.has(path) ? formatVnd(value) : String(value);
  }
  if (typeof value === 'string') {
    const t = cleanText(value).replace(/\s*[\r\n]+\s*/g, ' ');
    return t === '' ? undefined : t;
  }
  return undefined; // boolean và kiểu khác do bước `derive` xử lý, không điền thẳng
}

function walk(
  node: unknown,
  path: string,
  fields: Map<string, string>,
  lists: Map<string, string[]>,
): void {
  if (Array.isArray(node)) {
    if (node.every((x) => typeof x === 'string')) {
      const arr = node.map((x) => cleanText(x as string)).filter((x) => x !== '');
      if (arr.length > 0) lists.set(path, arr);
    }
    return; // mảng đối tượng (items, corrections) đọc riêng
  }
  if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node))
      walk(v, path === '' ? k : `${path}.${k}`, fields, lists);
    return;
  }
  const s = scalar(path, node);
  if (s === undefined) {
    return;
  }
  const last = path.slice(path.lastIndexOf('.') + 1);
  if (DATE_KEY.test(last) && typeof node === 'string') {
    const { d, m, y } = parseIsoDate(path, s);
    fields.set(path, `${d}/${m}/${y}`);
    fields.set(`${path}.d`, d);
    fields.set(`${path}.m`, m);
    fields.set(`${path}.y`, y);
    return;
  }
  fields.set(path, s);
}

/** Khóa văn bản tự do nhiều dòng (khối `lines`): mỗi dòng dữ liệu thành một đoạn. */
const MULTILINE_KEYS = [
  'subjectMatter',
  'eventTitle',
  'eventContent',
  'verificationContent',
  'verificationMethod',
  'enforcementSubject',
  'otherFiles',
  'opinions',
  'reason',
] as const;

function collectMultiline(input: Record<string, unknown>, lists: Map<string, string[]>): void {
  for (const key of MULTILINE_KEYS) {
    const v = input[key];
    if (typeof v !== 'string') continue;
    const arr = v
      .split(/\r?\n/)
      .map(cleanText)
      .filter((x) => x !== '');
    if (arr.length > 0) lists.set(key, arr);
  }
}

type Loose = Record<string, unknown>;

/** Bước suy ra theo từng biểu mẫu: chuyển dữ liệu vào thành đúng khóa của mẫu. */
function derive(code: FormCode, input: Loose): Loose {
  const out: Loose = { ...input };
  if (code === 'N-01') {
    const req = input.requester as N01Input['requester'] | undefined;
    if (req) {
      const { kind, name, ...rest } = req;
      const nameKey =
        kind === 'COURT' ? 'courtName' : kind === 'PROCURACY' ? 'procuracyName' : 'agencyName';
      if (kind !== 'COURT' && kind !== 'PROCURACY' && kind !== 'ENFORCEMENT_AGENCY') {
        throw new FormInputError(`requester.kind không hợp lệ: "${String(kind)}"`);
      }
      out.requester = { ...rest, [nameKey]: name };
    }
  }
  if (code === 'N-05' || code === 'N-07') {
    const req = input.requester as
      | {
          organization?: { name?: string; address?: string };
          person?: { fullName?: string; address?: string };
        }
      | undefined;
    out.requesterName = req?.organization?.name || req?.person?.fullName;
    out.requesterAddress = req?.organization?.address || req?.person?.address;
  }
  if (code === 'N-11') {
    const still = input.thvStillPracticing;
    if (still !== undefined && typeof still !== 'boolean') {
      throw new FormInputError('thvStillPracticing phải là boolean');
    }
    delete out.thvStillPracticing;
    if (still === true) out.signerTitle = 'THỪA HÀNH VIÊN';
    if (still === false) out.signerTitle = 'TRƯỞNG VĂN PHÒNG';
  }
  return out;
}

function rows<T>(value: unknown, pick: (o: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const v of value) {
    if (v !== null && typeof v === 'object') {
      const r = pick(v as Record<string, unknown>);
      if (r !== undefined) out.push(r);
    }
  }
  return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? cleanText(v) : '');

export function buildContext<C extends FormCode>(code: C, input: FormInputMap[C]): FormContext {
  const derived = derive(code, (input ?? {}) as Loose);
  const fields = new Map<string, string>();
  const lists = new Map<string, string[]>();
  walk(derived, '', fields, lists);
  collectMultiline(derived, lists);
  const items = rows<TongDatItem>(derived.items, (o) => {
    const title = str(o.title);
    if (title === '') return undefined;
    const cost = scalar('item.cost', o.cost);
    return {
      title,
      ...(str(o.deadline) !== '' ? { deadline: str(o.deadline) } : {}),
      ...(cost !== undefined
        ? { cost: typeof o.cost === 'number' ? formatVnd(o.cost) : cost }
        : {}),
      ...(str(o.note) !== '' ? { note: str(o.note) } : {}),
    };
  });
  const corrections = rows<CorrectionRow>(derived.corrections, (o) => {
    const location = str(o.location);
    const before = str(o.before);
    const after = str(o.after);
    if (location === '' && before === '' && after === '') return undefined;
    return { location, before, after };
  });
  return { fields, lists, items, corrections };
}
