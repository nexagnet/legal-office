// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionTree } from '../components/permissions/PermissionTree';
import { PERMISSION_ACTIONS, PERMISSION_ACTIONS_SHOWN } from '../lib/permission-model';

afterEach(cleanup);

const codes = (domain: string, actions: readonly (readonly [string, string])[]) =>
  actions.flatMap(([a]) => [`${domain}.${a}.own`, `${domain}.${a}.all`]);

let latest = new Set<string>();

function Harness({ baseline, initial }: { baseline: Set<string>; initial: Set<string> }) {
  const [value, setValue] = useState<ReadonlySet<string>>(initial);
  latest = new Set(value);
  return <PermissionTree baseline={baseline} value={value} onChange={(n) => setValue(n)} />;
}

const block = (title: string) => screen.getByText(title).closest('details') as HTMLElement;

describe('PermissionTree: Chọn hết / Bỏ hết theo nghiệp vụ', () => {
  it('Bỏ hết bỏ mọi quyền của nghiệp vụ ở cả hai cột, kể cả quyền ẩn mà nhóm cho, và không đụng nghiệp vụ khác', () => {
    const vb = [...codes('vibang', PERMISSION_ACTIONS)];
    const td = codes('tongdat', PERMISSION_ACTIONS_SHOWN);
    const base = new Set([...vb, ...td]);
    render(<Harness baseline={base} initial={new Set(base)} />);
    fireEvent.click(within(block('Vi bằng')).getByRole('button', { name: 'Bỏ hết' }));
    expect([...latest].filter((c) => c.startsWith('vibang.'))).toEqual([]);
    expect(td.every((c) => latest.has(c))).toBe(true);
    expect(within(block('Vi bằng')).getByText('Đang có 0/10 quyền')).toBeTruthy();
    // Ô bị bỏ của nhóm hiện "Bỏ riêng" ở cả hai cột.
    expect(within(block('Vi bằng')).getAllByText('Bỏ riêng')).toHaveLength(10);
  });

  it('Chọn hết tick đủ 10 quyền ở cả hai cột, quyền chưa thuộc nhóm hiện "Thêm riêng"', () => {
    render(<Harness baseline={new Set()} initial={new Set()} />);
    fireEvent.click(within(block('Tống đạt')).getByRole('button', { name: 'Chọn hết' }));
    expect(codes('tongdat', PERMISSION_ACTIONS_SHOWN).every((c) => latest.has(c))).toBe(true);
    expect([...latest].filter((c) => c.startsWith('tongdat.'))).toHaveLength(10);
    expect(within(block('Tống đạt')).getAllByText('Thêm riêng')).toHaveLength(10);
  });

  it('Bỏ hết rồi Chọn hết trả về nền của nhóm (đủ quyền hiện)', () => {
    const base = new Set(codes('vtden', PERMISSION_ACTIONS_SHOWN).slice(0, 3));
    render(<Harness baseline={base} initial={new Set(base)} />);
    const b = block('Văn thư · Văn bản đến');
    fireEvent.click(within(b).getByRole('button', { name: 'Bỏ hết' }));
    expect(latest.size).toBe(0);
    fireEvent.click(within(b).getByRole('button', { name: 'Chọn hết' }));
    expect(latest.size).toBe(10);
  });
});
