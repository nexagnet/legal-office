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
    expect(container.querySelector('style')?.textContent).toContain('nth-child(5){display:none}');
    unmount();
    const again = render(<Sample />);
    await screen.findByRole('button', { name: /Cột hiển thị/ });
    expect(again.container.querySelector('style')?.textContent).toContain('nth-child(5)');
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
