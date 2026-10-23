import { describe, expect, it } from 'vitest';
import { loadPendingApprovalCount } from '../lib/pending-approvals';

const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('loadPendingApprovalCount', () => {
  it('đếm số đề xuất chờ duyệt', async () => {
    expect(await loadPendingApprovalCount(null, 'o1', reply(200, [{}, {}, {}]))).toBe(3);
  });
  it('trả null khi API lỗi hoặc phản hồi lạ', async () => {
    expect(await loadPendingApprovalCount(null, 'o1', reply(500, []))).toBeNull();
    expect(await loadPendingApprovalCount(null, 'o1', reply(200, { x: 1 }))).toBeNull();
    const boom = (async () => {
      throw new Error('net');
    }) as unknown as typeof fetch;
    expect(await loadPendingApprovalCount(null, 'o1', boom)).toBeNull();
  });
});
