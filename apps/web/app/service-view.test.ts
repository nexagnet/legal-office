import { describe, expect, it } from 'vitest';
import { deadlineView, serviceNextStep } from '../lib/service-view';

const NOW = new Date('2026-10-27T05:00:00Z');

describe('deadlineView', () => {
  it('counts remaining days and marks near deadlines', () => {
    expect(deadlineView('2026-10-30T05:00:00Z', false, NOW)).toMatchObject({
      note: 'Còn 3 ngày',
      tone: 'ok',
    });
    expect(deadlineView('2026-10-28T09:00:00Z', false, NOW)).toMatchObject({
      note: 'Còn 2 ngày',
      tone: 'soon',
    });
  });
  it('states overdue in words, not only colour', () => {
    expect(deadlineView('2026-10-26T01:00:00Z', false, NOW)).toMatchObject({
      note: 'Quá hạn 2 ngày',
      tone: 'overdue',
    });
  });
  it('stops counting for finished documents', () => {
    expect(deadlineView('2026-10-20T01:00:00Z', true, NOW)).toMatchObject({ tone: 'done' });
  });
});

describe('serviceNextStep', () => {
  it('names the next action per status', () => {
    expect(serviceNextStep('PENDING')).toBe('Giao người xử lý');
    expect(serviceNextStep('ASSIGNED')).toBe('Ghi nhận kết quả');
  });
});
