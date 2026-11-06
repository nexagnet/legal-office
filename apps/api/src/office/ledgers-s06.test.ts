import { describe, expect, it } from 'vitest';
import { S06_LEDGER, shapeS06Rows } from './ledgers';

describe('Sổ S-06 từ hồ sơ lao động', () => {
  it('đánh số, dịch trạng thái bằng chữ và không có cột số tiền', () => {
    const rows = shapeS06Rows([
      {
        person_id: 'p1',
        version: 2,
        branch_id: 'b1',
        full_name: 'Nhân sự giả lập',
        gender: 'F',
        is_office_head: true,
        is_partner: false,
        labor_contract_ref: ' ',
        insurance_purchased: true,
        insurance_note: 'từ 06/2025',
        work_status: 'LEFT',
      },
      { full_name: 'Người thứ hai', gender: 'M', insurance_purchased: null, work_status: 'ACTIVE' },
    ]);
    expect(rows[0]).toMatchObject({
      stt: 1,
      gioiTinh: 'Nữ',
      chucVu: 'Trưởng văn phòng',
      hopDongLaoDong: null,
      baoHiem: 'Đã mua (từ 06/2025)',
      trangThai: 'Đã nghỉ',
      personId: 'p1',
    });
    expect(rows[1]).toMatchObject({ stt: 2, baoHiem: 'Chưa ghi', trangThai: 'Đang làm việc' });
    const keys = S06_LEDGER.columns.map((c) => c.key);
    expect(keys.some((k) => /gia|tien|luong|phi/i.test(k))).toBe(false);
    expect(keys.every((k) => k in rows[0]!)).toBe(true);
  });
});
