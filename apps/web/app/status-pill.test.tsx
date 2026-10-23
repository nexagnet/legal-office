import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusPill } from '../components/StatusPill';
import { statusTone } from '../lib/status-tone';

describe('StatusPill', () => {
  it('gán sắc thái theo trạng thái nghiệp vụ, lạ thì trung tính', () => {
    expect(statusTone('DELIVERED')).toBe('ok');
    expect(statusTone('CONCLUDED')).toBe('ok');
    expect(statusTone('UNDELIVERABLE')).toBe('danger');
    expect(statusTone('TERMINATED')).toBe('danger');
    expect(statusTone('ASSIGNED')).toBe('warn');
    expect(statusTone('PENDING')).toBe('idle');
    expect(statusTone('LA')).toBe('idle');
  });

  it('luôn hiện chữ trạng thái, không chỉ màu', () => {
    const html = renderToStaticMarkup(<StatusPill status="TERMINATED" label="Đã chấm dứt" />);
    expect(html).toContain('Đã chấm dứt');
    expect(html).toContain('data-tone="danger"');
  });
});
