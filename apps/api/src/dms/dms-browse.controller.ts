import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { VibangRepo } from '../vibang/vibang.repo';
import { buildXlsx, XLSX_MIME } from '../office/xlsx-export';
import { bookCells, bookOf, type BookRowRaw } from './books';
import { mergeBookCaseNumbers, mergeCaseExtras } from './dms-extras';
import { domain, parse, respond, uuid } from './dms-http';

/** Bộ lọc chung của danh sách hồ sơ và facet. Mọi trường đều tuỳ chọn; quyền xem do DB quyết định, không do tham số. */
const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/**
 * Lọc theo cột (0131): tham số `cols` là JSON `{"<khoá cột>": {"c": "chữ chứa"} | {"in": [giá trị]} | {"d": {"from","to"}} | {"b": true|false}}`.
 * Khoá chỉ [a-z0-9_] (DB đối chiếu lại và dựng SQL bằng %L); tối đa 12 cột, 50 giá trị chọn.
 */
const colKey = z.string().regex(/^[a-z0-9_]{1,40}$/);
const colFilter = z
  .object({
    c: z.string().min(1).max(200).optional(),
    in: z.array(z.string().min(1).max(300)).min(1).max(50).optional(),
    d: z.object({ from: isoDay.optional(), to: isoDay.optional() }).strict().optional(),
    b: z.boolean().optional(),
  })
  .strict();
const colsParam = z
  .string()
  .max(4000)
  .transform((v, ctx) => {
    try {
      return JSON.parse(v) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'cols không phải JSON' });
      return z.NEVER;
    }
  })
  .pipe(z.record(colKey, colFilter).refine((r) => Object.keys(r).length <= 12));
const filterShape = {
  officeId: uuid,
  domain: domain.optional(),
  status: z.enum(['DRAFT', 'RECORDED', 'CANCELLED']).optional(),
  q: z.string().max(200).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  branch: uuid.optional(),
  creator: uuid.optional(),
  scan: z.enum(['missing', 'complete', 'empty']).optional(),
  pending: bool.optional(),
  /** Thừa hành viên: một hoặc nhiều mã, cách nhau dấu phẩy (tối đa 20). */
  thv: z
    .string()
    .max(800)
    .transform((v) => v.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(20))
    .optional(),
  /** Việc còn dở (luật riêng từng nghiệp vụ, cùng luật thẻ số): true = còn dở, false = đã xong. */
  open: bool.optional(),
  /** Ô "Đã trả kết quả". */
  returned: bool.optional(),
  /** Quá hạn báo kết quả tống đạt (0128): true = quá hạn, false = không quá hạn. Chỉ Tống đạt có hạn. */
  overdue: bool.optional(),
  /** Bộ lọc nghiệp vụ (0126): giá trị thô facet_a (hình thức tống đạt, tỉnh/thành, kết quả...) và facet_b (cơ quan giao). */
  fa: z.string().min(1).max(200).optional(),
  fb: z.string().min(1).max(200).optional(),
  /** Lọc theo cột (0131), xem `colsParam`. */
  cols: colsParam.optional(),
};

export type CaseFilters = z.infer<z.ZodObject<typeof filterShape>>;

export const filterArgs = (f: CaseFilters) => [
  f.officeId,
  f.domain ?? null,
  f.status ?? null,
  f.q?.trim() || null,
  f.year ?? null,
  f.from ?? null,
  f.to ?? null,
  f.branch ?? null,
  f.creator ?? null,
  null, // loại tài liệu (p_kind): đã bỏ khỏi giao diện và API, DB giữ tham số cho tương thích
  f.scan ?? null,
  f.pending ?? null,
];

/** Tham số lọc mới đi chung một tham số jsonb cuối của hàm DB (xem migration 0119); không có thì NULL. */
export const extraArg = (f: CaseFilters): string | null => {
  const e: Record<string, unknown> = {};
  if (f.thv) e.thv = f.thv;
  if (f.open !== undefined) e.open = f.open;
  if (f.returned !== undefined) e.returned = f.returned;
  if (f.overdue !== undefined) e.overdue = f.overdue;
  if (f.fa) e.fa = f.fa;
  if (f.fb) e.fb = f.fb;
  if (f.cols && Object.keys(f.cols).length > 0) e.cols = f.cols;
  return Object.keys(e).length > 0 ? JSON.stringify(e) : null;
};

/** Trần số hồ sơ của một bản xuất Excel (quá thì báo thu hẹp bộ lọc). */
const EXPORT_MAX = 10_000;
const BOOK_FOR: Readonly<Record<string, string>> = {
  vibang: 'S-02',
  xacminh: 'S-04',
  tochuc: 'S-05',
};

interface SearchRow {
  readonly total_capped: string | null;
  readonly cursor: string;
  readonly [k: string]: unknown;
}
interface FacetRow {
  readonly group_key: string;
  readonly value: string;
  readonly label: string;
  readonly n: string;
}

/**
 * Duyệt/lọc hồ sơ ở quy mô lớn (0098). Mọi lọc, tìm chữ, đếm và phân trang chạy trong DB trên chỉ mục; web không còn tải
 * "tất cả rồi lọc". Phân trang bằng con trỏ keyset (`cursor` do DB cấp, giữ nguyên micro giây) hoặc `offset` cho thanh số trang.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsBrowseController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  @Get('case-search')
  async search(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          ...filterShape,
          sort: z.enum(['newest', 'oldest']).default('newest'),
          cursor: z.string().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
          total: bool.default(true),
        })
        .strict(),
      query,
    );
    if (q.cursor !== undefined && !/^\d{4}-\d{2}-\d{2}T[\d:.]+\+00\|[0-9a-f-]{36}$/.test(q.cursor))
      return { rows: [], nextCursor: null, total: 0, totalCapped: false, invalidCursor: true };
    const rows = await this.repo.rows<SearchRow>(a.tenantId, 'dms_search_cases', [
      a.tenantId,
      a.userId,
      ...filterArgs(q),
      q.sort,
      q.cursor ?? null,
      q.limit,
      q.offset,
      q.total,
      extraArg(q),
    ]);
    // Trang đầu không có dòng nào thì tổng là 0 (DB chỉ gắn tổng vào dòng), không phải "không biết".
    const emptyFirstPage = q.total && rows.length === 0 && q.offset === 0 && q.cursor === undefined;
    const total = emptyFirstPage
      ? 0
      : rows[0]?.total_capped == null
        ? null
        : Number(rows[0].total_capped);
    const visible = rows.map((r) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'total_capped')),
    ) as Array<{ id: string }>;
    return {
      rows: await mergeCaseExtras(this.repo, a, visible),
      nextCursor: rows.length === q.limit ? (rows[rows.length - 1]?.cursor ?? null) : null,
      total,
      totalCapped: total !== null && total > 10_000,
    };
  }

  /**
   * Xuất Excel đúng tập hồ sơ đang lọc (cùng tham số, cùng quyền xem như `case-search`). Chỉ hồ sơ đã ghi sổ của một nghiệp vụ;
   * cột = cột sổ theo mẫu + mã hồ sơ, SĐT, đã trả KQ, số scan, ngày ghi sổ, người tạo. Đây là bản làm việc, không thay "Xuất sổ" pháp định.
   */
  @Get('case-search/export')
  async exportSearch(
    @CurrentActor() a: AuthenticatedActor,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    const q = parse(
      z
        .object({ ...filterShape, domain })
        .strict()
        .refine((v) => v.status === undefined || v.status === 'RECORDED', {
          message: 'Chỉ xuất hồ sơ đã ghi sổ',
        }),
      query,
    );
    const spec = bookOf(q.domain === 'tongdat' ? 'S-01' : (BOOK_FOR[q.domain] ?? ''));
    if (!spec) throw new HttpException({ code: 'INVALID_DOMAIN' }, HttpStatus.BAD_REQUEST);
    const f = { ...q, status: 'RECORDED' as const };
    const cases: Array<Record<string, unknown> & { id: string }> = [];
    for (let offset = 0; offset < EXPORT_MAX + 1; offset += 200) {
      const rows = await this.repo.rows<SearchRow & { id: string }>(
        a.tenantId,
        'dms_search_cases',
        [a.tenantId, a.userId, ...filterArgs(f), 'oldest', null, 200, offset, false, extraArg(f)],
      );
      const merged = await mergeCaseExtras(this.repo, a, rows);
      cases.push(...(merged as unknown as typeof cases));
      if (rows.length < 200) break;
    }
    if (cases.length > EXPORT_MAX)
      throw new HttpException(
        { code: 'EXPORT_TOO_LARGE', label: String(EXPORT_MAX) },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const bookRows: Array<BookRowRaw & { case_id: string }> = [];
    for (let i = 0; i < cases.length; i += 200) {
      bookRows.push(
        ...(await mergeBookCaseNumbers(
          this.repo,
          a,
          await this.repo.rows<BookRowRaw & { case_id: string }>(
            a.tenantId,
            'dms_book_rows_for_cases',
            [a.tenantId, a.userId, q.officeId, spec.code, cases.slice(i, i + 200).map((c) => c.id)],
          ),
        )),
      );
    }
    const byCase = new Map(cases.map((c) => [c.id, c]));
    // Mỗi hồ sơ một hoặc nhiều dòng sổ (hồ sơ Tống đạt cũ); hồ sơ chưa có dòng sổ vẫn xuất một dòng, STT để trống.
    const ordered: Array<BookRowRaw & { case_id: string }> = [];
    for (const c of cases) {
      const own = bookRows.filter((r) => r.case_id === c.id).sort((x, y) => x.stt - y.stt);
      if (own.length > 0) ordered.push(...own);
      else
        ordered.push({
          stt: 0,
          case_id: c.id,
          case_title: String(c.title ?? ''),
          case_attributes: (c.attributes ?? {}) as Record<string, unknown>,
          doc_kind: null,
          doc_attributes: null,
          case_number: (c.case_number as string | null) ?? null,
        });
    }
    const when = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const day = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const applied = [
      q.year ? `năm ${q.year}` : null,
      q.q ? `tìm "${q.q}"` : null,
      q.from || q.to ? `ghi sổ ${q.from ?? '…'} → ${q.to ?? '…'}` : null,
      q.open !== undefined ? (q.open ? 'việc còn dở' : 'đã xong') : null,
      q.returned !== undefined ? (q.returned ? 'đã trả kết quả' : 'chưa trả kết quả') : null,
      q.overdue !== undefined ? (q.overdue ? 'quá hạn' : 'chưa quá hạn') : null,
      q.scan ? `scan: ${q.scan}` : null,
      q.thv ? `${q.thv.length} Thừa hành viên` : null,
      q.fa ? `lọc 1: ${q.fa}` : null,
      q.fb ? `lọc 2: ${q.fb}` : null,
    ].filter(Boolean);
    const buf = await buildXlsx({
      name: spec.form,
      title: `${spec.title} (${spec.form}) · danh sách đã lọc`,
      notice: `Xuất ${when.format(new Date())}. Bộ lọc: ${applied.length > 0 ? applied.join('; ') : 'không (toàn bộ hồ sơ đã ghi sổ trong phạm vi quyền xem)'}. Bản làm việc, không thay sổ pháp định.`,
      columns: [
        ...spec.columns.map((c) => c.heading),
        'Mã hồ sơ',
        'SĐT khách hàng',
        'Đã trả kết quả',
        'Số tệp scan',
        'Ngày ghi sổ',
        'Người tạo',
      ],
      rows: ordered.map((r) => {
        const c = byCase.get(r.case_id) as
          | {
              case_number?: string | null;
              phone?: string | null;
              returned?: boolean;
              scan_count?: number;
              recorded_at?: string | null;
              created_by_name?: string | null;
            }
          | undefined;
        return [
          ...bookCells(spec, r).map((v, k) => (k === 0 && r.stt === 0 ? '' : v)),
          c?.case_number ?? '',
          c?.phone ?? '',
          c?.returned ? 'Đã trả' : 'Chưa trả',
          c?.scan_count ?? 0,
          c?.recorded_at ? day.format(new Date(c.recorded_at)) : '',
          c?.created_by_name ?? '',
        ];
      }),
    });
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${spec.form}-danh-sach-loc.xlsx"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buf);
  }

  /** Giá trị có đếm (tối đa 50) của một cột sổ cho ô "chọn nhiều"; tính trên bộ lọc hiện hành trừ chính cột đó (0131). */
  @Get('case-col-values')
  async colValues(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z.object({ ...filterShape, key: colKey, term: z.string().max(100).optional() }).strict(),
      query,
    );
    const rows = await this.repo.rows<{ value: string; n: string }>(a.tenantId, 'dms_col_values', [
      a.tenantId,
      a.userId,
      ...filterArgs(q),
      extraArg(q),
      q.key,
      q.term?.trim() || null,
    ]);
    return rows.map((r) => ({ value: r.value, n: Number(r.n) }));
  }

  /** Số hồ sơ theo từng giá trị của từng nhóm lọc (người tạo, chi nhánh, loại tài liệu, tình trạng scan, năm). */
  @Get('case-facet-counts')
  async facets(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object(filterShape).strict(), query);
    const rows = await this.repo.rows<FacetRow>(a.tenantId, 'dms_case_facet_counts', [
      a.tenantId,
      a.userId,
      ...filterArgs(q),
      extraArg(q),
    ]);
    const groups: Record<string, { value: string; label: string; n: number }[]> = {
      creator: [],
      branch: [],
      scan: [],
      year: [],
      thv: [],
      open: [],
      returned: [],
      overdue: [],
      fa: [],
      fb: [],
    };
    for (const r of rows)
      groups[r.group_key]?.push({ value: r.value, label: r.label, n: Number(r.n) });
    for (const g of Object.values(groups))
      g.sort((x, y) => y.n - x.n || x.label.localeCompare(y.label, 'vi'));
    groups.year?.sort((x, y) => Number(y.value) - Number(x.value));
    return groups;
  }

  /** Dòng sổ (STT + ô) của các hồ sơ đang hiện trên một trang danh sách; không tải cả sổ cả năm. */
  @Get('book-rows-for-cases')
  async bookRowsForCases(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          book: z.string().max(10),
          cases: z
            .string()
            .max(8000)
            .transform((v) => v.split(',').filter(Boolean))
            .pipe(z.array(uuid).min(1).max(200)),
        })
        .strict(),
      query,
    );
    const spec = bookOf(q.book);
    if (!spec) return { book: null, rows: [] };
    const rows = await mergeBookCaseNumbers(
      this.repo,
      a,
      await this.repo.rows<BookRowRaw & { case_id: string }>(
        a.tenantId,
        'dms_book_rows_for_cases',
        [a.tenantId, a.userId, q.officeId, spec.code, q.cases],
      ),
    );
    return { book: spec, rows };
  }

  @Get('saved-filters')
  list(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object({ officeId: uuid, domain }).strict(), query);
    return this.repo
      .rows(a.tenantId, 'dms_saved_filter_list', [a.tenantId, a.userId, q.officeId, q.domain])
      .then((rows) => ({ rows }));
  }

  @Post('saved-filters')
  @HttpCode(201)
  save(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          domain,
          name: z.string().trim().min(1).max(80),
          params: z
            .object(filterShape)
            .omit({ officeId: true, domain: true })
            .partial()
            .extend({
              ky: z.string().max(20).optional(),
              tu: z.string().max(16).optional(),
              den: z.string().max(16).optional(),
            })
            .strict(),
        })
        .strict(),
      body,
    );
    return this.repo
      .call(a.tenantId, 'dms_saved_filter_save', [
        a.tenantId,
        a.userId,
        b.officeId,
        b.domain,
        b.name,
        JSON.stringify(b.params),
      ])
      .then(respond);
  }

  @Delete('saved-filters/:id')
  remove(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo
      .call(a.tenantId, 'dms_saved_filter_remove', [a.tenantId, a.userId, id])
      .then(respond);
  }
}
