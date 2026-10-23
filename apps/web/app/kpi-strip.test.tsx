import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiStrip, countStatus } from '../components/KpiStrip';

describe('KpiStrip', () => {
  it('đếm theo trạng thái', () => {
    const items = [{ status: 'A' }, { status: 'B' }, { status: 'A' }];
    expect(countStatus(items, 'A')).toBe(2);
    expect(countStatus(items, 'A', 'B')).toBe(3);
    expect(countStatus(items, 'Z')).toBe(0);
  });

  it('hiện nhãn và số của từng chỉ số', () => {
    render(
      <KpiStrip
        label="Số liệu"
        items={[
          { label: 'Đang xử lý', value: 3 },
          { label: 'Không tống đạt được', value: 1, tone: 'danger' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Số liệu')).toBeTruthy();
    expect(screen.getByText('Đang xử lý').nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('Không tống đạt được').closest('.kpi')?.getAttribute('data-tone')).toBe(
      'danger',
    );
  });
});
