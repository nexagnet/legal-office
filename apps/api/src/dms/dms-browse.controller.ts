import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { VibangRepo } from '../vibang/vibang.repo';
import { bookOf, type BookRowRaw } from './books';
import { domain, parse, respond, uuid } from './dms-http';

/** Bộ lọc chung của danh sách hồ sơ và facet. Mọi trường đều tuỳ chọn; quyền xem do DB quyết định, không do tham số. */
const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
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
  kind: z.string().min(1).max(100).optional(),
  scan: z.enum(['missing', 'complete', 'empty']).optional(),
  pending: bool.optional(),
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
  f.kind ?? null,
  f.scan ?? null,
  f.pending ?? null,
];

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
    ]);
    // Trang đầu không có dòng nào thì tổng là 0 (DB chỉ gắn tổng vào dòng), không phải "không biết".
    const emptyFirstPage = q.total && rows.length === 0 && q.offset === 0 && q.cursor === undefined;
    const total = emptyFirstPage
      ? 0
      : rows[0]?.total_capped == null
        ? null
        : Number(rows[0].total_capped);
    return {
      rows: rows.map((r) =>
        Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'total_capped')),
      ),
      nextCursor: rows.length === q.limit ? (rows[rows.length - 1]?.cursor ?? null) : null,
      total,
      totalCapped: total !== null && total > 10_000,
    };
  }

  /** Số hồ sơ theo từng giá trị của từng nhóm lọc (người tạo, chi nhánh, loại tài liệu, tình trạng scan, năm). */
  @Get('case-facet-counts')
  async facets(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(z.object(filterShape).strict(), query);
    const rows = await this.repo.rows<FacetRow>(a.tenantId, 'dms_case_facet_counts', [
      a.tenantId,
      a.userId,
      ...filterArgs(q),
    ]);
    const groups: Record<string, { value: string; label: string; n: number }[]> = {
      creator: [],
      branch: [],
      kind: [],
      scan: [],
      year: [],
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
    const rows = await this.repo.rows<BookRowRaw>(a.tenantId, 'dms_book_rows_for_cases', [
      a.tenantId,
      a.userId,
      q.officeId,
      spec.code,
      q.cases,
    ]);
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
          params: z.object(filterShape).omit({ officeId: true, domain: true }).partial().strict(),
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
