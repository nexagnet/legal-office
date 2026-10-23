import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MyWorkList } from '../components/MyWorkList';
import { myWorkHref, myWorkStatusLabel, type MyWorkItem } from '../lib/my-work';

const item = (over: Partial<MyWorkItem>): MyWorkItem => ({
  domain: 'VIBANG',
  refId: 'c1',
  label: 'Hồ sơ A',
  status: 'ASSIGNED',
  deadlineAt: null,
  overdue: false,
  ...over,
});

describe('Việc của tôi', () => {
  it('dẫn về màn nghiệp vụ tương ứng', () => {
    expect(myWorkHref({ domain: 'VIBANG', refId: 'c1' })).toBe('/vi-bang/c1');
    expect(myWorkHref({ domain: 'TONG_DAT', refId: 'x' })).toBe('/tong-dat');
    expect(myWorkHref({ domain: 'XAC_MINH', refId: 'x' })).toBe('/xac-minh');
    expect(myWorkHref({ domain: 'THI_HANH', refId: 'x' })).toBe('/to-chuc-tha');
    expect(myWorkHref({ domain: 'LA', refId: 'x' })).toBeNull();
  });

  it('dịch trạng thái, lạ thì giữ nguyên', () => {
    expect(myWorkStatusLabel({ domain: 'VIBANG', status: 'ASSIGNED' })).toBe('Đã phân công THV');
    expect(myWorkStatusLabel({ domain: 'XAC_MINH', status: 'OPEN' })).toBe('Đang xác minh');
    expect(myWorkStatusLabel({ domain: 'THI_HANH', status: 'OPEN' })).toBe('Đang thực hiện');
    expect(myWorkStatusLabel({ domain: 'XAC_MINH', status: 'LA' })).toBe('LA');
  });

  it('ghi "Quá hạn" bằng chữ và hiện hạn', () => {
    const html = renderToStaticMarkup(
      <MyWorkList
        items={[item({ domain: 'TONG_DAT', deadlineAt: '2026-10-20T03:00:00Z', overdue: true })]}
      />,
    );
    expect(html).toContain('Quá hạn');
    expect(html).toContain('Hạn 20/10/2026');
    expect(html).toContain('data-overdue="true"');
  });

  it('trống và lỗi có thông báo riêng, không giả lập', () => {
    expect(renderToStaticMarkup(<MyWorkList items={[]} />)).toContain('Không có việc được giao');
    expect(renderToStaticMarkup(<MyWorkList items="error" />)).toContain('role="alert"');
  });
});
