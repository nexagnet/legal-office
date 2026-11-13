// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataTable } from '../components/ui/data-table';

const COLS = ['Mã', 'Tên', 'Ngày', 'Trạng thái', 'Ghi chú', 'Thao tác'];

function Sample({ tableKey = 't1' }: { tableKey?: string }) {
  return (
    <DataTable tableKey={tableKey}>
      <table>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {COLS.map((c) => (
              <td key={c}>{c}-1</td>
            ))}
          </tr>
        </tbody>
      </table>
    </DataTable>
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('DataTable', () => {
  it('shows every column by default and never drops one', async () => {
    const { container } = render(<Sample />);
    await screen.findByRole('button', { name: /Cột hiển thị/ });
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelectorAll('thead th')).toHaveLength(6);
  });

  it('hides a column on request and remembers the choice', async () => {
    const { container, unmount } = render(<Sample />);
    fireEvent.click(await screen.findByRole('button', { name: /Cột hiển thị/ }));
    fireEvent.click(screen.getByLabelText('Ghi chú'));
    expect(container.querySelector('style')?.textContent).toContain('nth-child(5)');
    unmount();
    const again = render(<Sample />);
    await screen.findByRole('button', { name: /Cột hiển thị/ });
    expect(again.container.querySelector('style')?.textContent).toContain('nth-child(5)');
  });

  it('shrinks the group header colSpan when sub-columns are hidden', async () => {
    const labels = ['A', 'B1', 'B2', 'B3', 'C', 'D'];
    const { container } = render(
      <DataTable tableKey="grp">
        <table data-leafcols="true" data-labels={JSON.stringify(labels)}>
          <thead>
            <tr>
              <th rowSpan={2} data-leaf={0}>
                A
              </th>
              <th colSpan={3} data-gstart={1} data-gcount={3}>
                Nhóm
              </th>
              <th rowSpan={2} data-leaf={4}>
                C
              </th>
              <th rowSpan={2} data-leaf={5}>
                D
              </th>
            </tr>
            <tr>
              {[1, 2, 3].map((i) => (
                <th key={i} data-leaf={i}>
                  {labels[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {labels.map((l) => (
                <td key={l}>{l}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </DataTable>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Cột hiển thị/ }));
    fireEvent.click(screen.getByLabelText('B2'));
    const th = container.querySelector('th[data-gstart]') as HTMLTableCellElement;
    expect(th.colSpan).toBe(2);
    expect(container.querySelector('style')?.textContent).toContain('[data-leaf="2"]');
    fireEvent.click(screen.getByLabelText('B1'));
    fireEvent.click(screen.getByLabelText('B3'));
    expect(th.style.display).toBe('none');
  });

  it('toggles compact mode', async () => {
    const { container } = render(<Sample />);
    fireEvent.click(await screen.findByRole('button', { name: /Hiển thị gọn/ }));
    expect(container.querySelector('.dt')?.getAttribute('data-compact')).toBe('true');
  });

  it('has no toolbar for narrow tables', () => {
    render(
      <DataTable tableKey="narrow">
        <table>
          <thead>
            <tr>
              <th>A</th>
              <th>B</th>
            </tr>
          </thead>
        </table>
      </DataTable>,
    );
    expect(screen.queryByRole('button', { name: /Cột hiển thị/ })).toBeNull();
  });
});
