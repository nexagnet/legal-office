import type { AuthenticatedActor } from '../http/actor';
import type { VibangRepo } from '../vibang/vibang.repo';

export interface CaseExtras {
  readonly case_id: string;
  readonly case_number: string | null;
  readonly returned: boolean;
  readonly phone: string | null;
  readonly created_by_name: string | null;
}

/**
 * Gắn số hồ sơ, cờ "đã trả kết quả" và SĐT vào các dòng hồ sơ (danh sách, tìm kiếm, chi tiết) bằng MỘT truy vấn
 * `dms_case_extras`. Hàm đó dùng cùng luật hiển thị như danh sách nên dòng nào không có kết quả thì để trống, không lộ thêm gì.
 */
export async function mergeCaseExtras<R extends { readonly id: string }>(
  repo: VibangRepo,
  a: AuthenticatedActor,
  rows: readonly R[],
): Promise<
  Array<
    R & {
      case_number: string | null;
      returned: boolean;
      phone: string | null;
      created_by_name: string | null;
    }
  >
> {
  if (rows.length === 0) return [];
  const extras = await repo.rows<CaseExtras>(a.tenantId, 'dms_case_extras', [
    a.tenantId,
    a.userId,
    rows.map((r) => r.id),
  ]);
  const byId = new Map(extras.map((e) => [e.case_id, e]));
  return rows.map((r) => {
    const e = byId.get(r.id);
    return {
      ...r,
      case_number: e?.case_number ?? null,
      returned: e?.returned ?? false,
      phone: e?.phone ?? null,
      created_by_name: e?.created_by_name ?? null,
    };
  });
}
