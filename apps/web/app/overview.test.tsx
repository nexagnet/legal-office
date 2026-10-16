import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseTable } from '../components/CaseTable';
import { StatCard } from '../components/StatCard';
import { summarizeCases, type CaseItem } from '../lib/cases';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(cleanup);

const mk = (id: string, status: string, thv: string | null = null): CaseItem => ({
  id,
  title: `Hồ sơ ${id}`,
  status,
  createdAt: '2026-10-01T03:00:00Z',
  responsibleThvUserId: thv,
});
const cases = [
  mk('a', 'INTAKE'),
  mk('b', 'ASSIGNED', 'u1'),
  mk('c', 'SIGNED', 'u1'),
  mk('d', 'STAMPED', 'u1'),
  mk('e', 'RETURNED', 'u1'),
  mk('f', 'CANCELLED'),
];

describe('summarizeCases', () => {
  it('counts only states the API really has', () => {
    expect(summarizeCases(cases)).toEqual({
      open: 4,
      unassigned: 1,
      awaitingReturn: 2,
      returned: 1,
    });
    expect(summarizeCases([])).toEqual({ open: 0, unassigned: 0, awaitingReturn: 0, returned: 0 });
  });
});

describe('StatCard', () => {
  it('shows label, value and note', () => {
    render(<StatCard label="Hồ sơ đang xử lý" value={7} note="ghi chú" />);
    expect(screen.getByText('Hồ sơ đang xử lý')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('ghi chú')).toBeTruthy();
  });
});

describe('CaseTable', () => {
  it('lists every case and filters by search, status and THV', () => {
    render(<CaseTable cases={cases} />);
    expect(screen.getAllByRole('row')).toHaveLength(7);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hồ sơ c' } });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }), {
      target: { value: 'RETURNED' },
    });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo THV phụ trách' }), {
      target: { value: 'unassigned' },
    });
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
  it('says so when nothing matches', () => {
    render(<CaseTable cases={cases} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'không có' } });
    expect(screen.getByRole('status').textContent).toContain('Không có hồ sơ phù hợp');
  });
});
