import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  filterPersonnel,
  insuranceLabel,
  isIncomplete,
  parsePersonnelTab,
  personnelRoles,
  summarizePersonnel,
  type PersonnelRow,
} from '../lib/personnel-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const row = (over: Partial<PersonnelRow>): PersonnelRow => ({
  person_id: 'p1',
  version: 2,
  branch_id: 'b1',
  full_name: 'Nhân sự giả lập',
  gender: 'F',
  specialty: 'Luật',
  bailiff_decision_ref: null,
  executor_decision_ref: null,
  is_office_head: false,
  is_partner: false,
  labor_contract_ref: 'HĐ 01',
  insurance_purchased: true,
  insurance_note: null,
  contributing: null,
  contribution_note: null,
  note: null,
  work_status: 'ACTIVE',
  ...over,
});

describe('Hồ sơ lao động (S-06)', () => {
  it('đếm chỉ tiêu và lọc tab', () => {
    const rows = [
      row({ person_id: 'a', executor_decision_ref: 'QĐ 1' }),
      row({ person_id: 'b', labor_contract_ref: null }),
      row({ person_id: 'c', insurance_purchased: null }),
      row({ person_id: 'd', work_status: 'LEFT', labor_contract_ref: null }),
    ];
    expect(summarizePersonnel(rows)).toEqual({
      total: 4,
      active: 3,
      left: 1,
      executors: 1,
      missingContract: 1,
      insuranceUnset: 1,
    });
    expect(filterPersonnel(rows, 'dang-lam')).toHaveLength(3);
    expect(filterPersonnel(rows, 'da-nghi').map((r) => r.person_id)).toEqual(['d']);
    expect(filterPersonnel(rows, 'thieu-ho-so').map((r) => r.person_id)).toEqual(['b', 'c']);
    expect(isIncomplete(rows[3]!)).toBe(false);
    expect(parsePersonnelTab('lạ')).toBe('tat-ca');
  });

  it('ghi vai trò và tình trạng bảo hiểm bằng chữ, không có số tiền', () => {
    expect(personnelRoles(row({ is_office_head: true, executor_decision_ref: 'QĐ 1' }))).toBe(
      'Trưởng văn phòng, Thừa hành viên',
    );
    expect(personnelRoles(row({}))).toBe('—');
    expect(insuranceLabel(null)).toBe('Chưa ghi');
    expect(insuranceLabel(false)).toBe('Chưa mua');
  });

  it('nút mở ngăn kéo hiển thị', async () => {
    const { PersonnelSheet } = await import('../components/PersonnelSheet');
    const html = renderToStaticMarkup(
      <PersonnelSheet
        officeId="o1"
        branches={[{ id: 'b1', officeId: 'o1', name: 'Trụ sở' }]}
        person={row({ version: 3 })}
        trigger="Cập nhật"
      />,
    );
    expect(html).toContain('Cập nhật');
  });
});
