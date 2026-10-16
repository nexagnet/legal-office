import { Inject, Injectable } from '@nestjs/common';
import { PgService } from '../db/pg.service';

/** Kết quả một hàm nghiệp vụ trong DB (kiểu `vibang_op`). Từ chối là kết quả, không phải lỗi. */
export interface Op {
  readonly ok: boolean;
  readonly code: string;
  readonly label: string | null;
}

/**
 * Gọi các hàm `vibang_*` (0002/0003). Quyền (vai, chi nhánh, THV phụ trách) do DB quyết định và audit.
 * Luôn dùng `SELECT * FROM fn(...)`: `SELECT (fn(...)).*` chạy hàm một lần cho mỗi cột.
 */
@Injectable()
export class VibangRepo {
  constructor(@Inject(PgService) private readonly pg: PgService) {}

  call(tenantId: string, fn: string, args: readonly unknown[]): Promise<Op> {
    if (!/^(vibang|td|vx|th|as|of|ap|vb|ad)_[a-z0-9_]+$/.test(fn))
      throw new Error(`unsafe function name: ${fn}`);
    const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
    return this.pg.withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`SELECT * FROM ${fn}(${placeholders})`, [...args]);
      return rows[0] as Op;
    });
  }

  /** Như `call` nhưng cho hàm trả nhiều dòng (tìm kiếm/đọc sổ). Quyền đọc do DB quyết định và audit. */
  rows<T = Record<string, unknown>>(
    tenantId: string,
    fn: string,
    args: readonly unknown[],
  ): Promise<T[]> {
    if (
      !/^of_(search|s06)_[a-z0-9_]+$|^of_list_correspondence$|^of_get_correspondence$|^of_s06_read$|^of_list_signers$|^of_ledger_s0[1245]$|^vb_list_(cases|changes|thv|customers|contracts)$|^vb_case_progress$|^td_list_documents$|^vx_list_cases$|^th_list_cases$/.test(
        fn,
      )
    )
      throw new Error(`unsafe function name: ${fn}`);
    const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
    return this.pg.withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`SELECT * FROM ${fn}(${placeholders})`, [...args]);
      return rows as T[];
    });
  }
}
