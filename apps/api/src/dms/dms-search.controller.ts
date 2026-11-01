import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { searchTerms, snippetAround, toTsQuery } from '../ocr/text';
import { VibangRepo } from '../vibang/vibang.repo';
import { domain, parse, uuid } from './dms-http';

interface SearchRow {
  readonly case_id: string;
  readonly case_title: string;
  readonly domain: string;
  readonly document_id: string;
  readonly document_title: string;
  readonly file_id: string;
  readonly file_label: string;
  readonly version: number;
  readonly rank: number;
  readonly ranked: boolean;
  readonly ocr_text: string | null;
}

/**
 * Tìm toàn văn trong chữ OCR của tệp scan. Chỉ để TÌM: kết quả trỏ về hồ sơ gốc, không sửa gì. Quyền xem do DB quyết định
 * (cùng quy tắc với danh sách hồ sơ); văn bản OCR đầy đủ không bao giờ trả ra, chỉ đoạn trích ngắn.
 */
@Controller('dms')
@UseGuards(ActorGuard)
export class DmsSearchController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  @Get('search')
  async search(@CurrentActor() a: AuthenticatedActor, @Query() query: unknown) {
    const q = parse(
      z
        .object({
          officeId: uuid,
          q: z.string().min(1).max(200),
          domain: domain.optional(),
          year: z.coerce.number().int().min(2000).max(2100).optional(),
          branch: uuid.optional(),
          creator: uuid.optional(),
          kind: z.string().min(1).max(100).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
          offset: z.coerce.number().int().min(0).max(10_000).default(0),
        })
        .strict(),
      query,
    );
    const terms = searchTerms(q.q);
    const rows = await this.repo.rows<SearchRow>(a.tenantId, 'dms_search_content', [
      a.tenantId,
      a.userId,
      q.officeId,
      q.domain ?? null,
      toTsQuery(q.q),
      q.year ?? null,
      q.branch ?? null,
      q.creator ?? null,
      q.kind ?? null,
      q.limit,
      q.offset,
    ]);
    return {
      rows: rows.map(({ ocr_text, ...r }) => ({
        ...r,
        snippet: snippetAround(ocr_text ?? '', terms),
      })),
    };
  }
}
