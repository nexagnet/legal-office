import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsThvPicker } from '../components/DmsThvActions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { userId: 'u1', label: 'Lê Thu Hà' },
  { userId: 'u2', label: 'Trần Văn B' },
];

function stubFetch() {
  const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    calls.push({
      method: String(init?.method),
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return { ok: true, json: async () => ({}) } as Response;
  });
  return calls;
}

const textBox = () => screen.getByLabelText('Ghi vào sổ (họ tên, số thẻ)') as HTMLInputElement;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

describe('ô chữ Thừa hành viên ghi vào cột THV của sổ', () => {
  it('chọn THV thì tự điền tên, sửa được (thêm số thẻ) rồi lưu vào thuộc tính hồ sơ', async () => {
    const calls = stubFetch();
    render(
      <DmsThvPicker
        caseId="c1"
        options={options}
        currentId={null}
        confirmed={null}
        text=""
        target={{ kind: 'case', title: 'Hồ sơ A', attributes: { ghi_chu: 'giữ' } }}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'u1' },
    });
    expect(textBox().value).toBe('Lê Thu Hà');
    fireEvent.change(textBox(), { target: { value: 'Lê Thu Hà, thẻ 123' } });
    save();
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: '/api/dms/cases/c1/thv',
      body: { thvUserId: 'u1' },
    });
    expect(calls[1]).toMatchObject({ url: '/api/dms/cases/c1/draft' });
    expect(calls[1]!.body).toEqual({
      title: 'Hồ sơ A',
      attributes: { ghi_chu: 'giữ', thua_hanh_vien: 'Lê Thu Hà, thẻ 123' },
    });
  });

  it('không chọn THV vẫn gõ chữ tùy ý được', async () => {
    const calls = stubFetch();
    render(
      <DmsThvPicker
        caseId="c1"
        options={options}
        currentId={null}
        confirmed={null}
        text=""
        target={{ kind: 'case', title: 'Hồ sơ A', attributes: {} }}
      />,
    );
    fireEvent.change(textBox(), { target: { value: 'THV ngoài văn phòng' } });
    save();
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]!.body).toEqual({ thvUserId: null });
    expect(calls[1]!.body).toMatchObject({ attributes: { thua_hanh_vien: 'THV ngoài văn phòng' } });
  });

  it('chữ không đổi thì chỉ ghi tên THV, không ghi lại hồ sơ', async () => {
    const calls = stubFetch();
    render(
      <DmsThvPicker
        caseId="c1"
        options={options}
        currentId="u1"
        confirmed={false}
        text="Lê Thu Hà"
        target={{ kind: 'case', title: 'Hồ sơ A', attributes: {} }}
      />,
    );
    save();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toBe('/api/dms/cases/c1/thv');
  });

  it('Tống đạt (sổ theo giấy tờ): ghi chữ vào từng giấy tờ nháp, giữ thuộc tính khác', async () => {
    const calls = stubFetch();
    render(
      <DmsThvPicker
        caseId="c1"
        options={options}
        currentId={null}
        confirmed={null}
        text=""
        target={{
          kind: 'documents',
          docs: [
            { id: 'd1', kind: 'Giấy báo', title: 'GB 1', isOfficial: true, attributes: { a: '1' } },
            { id: 'd2', kind: 'Giấy báo', title: 'GB 2', isOfficial: false, attributes: {} },
          ],
        }}
      />,
    );
    expect(screen.getByText(/áp dụng cho 2 giấy tờ nháp/)).toBeTruthy();
    fireEvent.change(textBox(), { target: { value: 'Trần Văn B' } });
    save();
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[1]).toMatchObject({ url: '/api/dms/documents/d1/draft' });
    expect(calls[1]!.body).toEqual({
      kind: 'Giấy báo',
      title: 'GB 1',
      isOfficial: true,
      attributes: { a: '1', thua_hanh_vien: 'Trần Văn B' },
    });
    expect(calls[2]).toMatchObject({ url: '/api/dms/documents/d2/draft' });
  });

  it('nghiệp vụ không có cột THV thì không hiện ô chữ', () => {
    render(<DmsThvPicker caseId="c1" options={options} currentId={null} confirmed={null} />);
    expect(screen.queryByLabelText('Ghi vào sổ (họ tên, số thẻ)')).toBeNull();
  });
});
