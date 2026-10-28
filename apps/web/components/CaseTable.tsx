'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { CaseItem } from '../lib/cases';
import { CASE_STATUS_LABEL, NEXT_STEP_LABEL } from '../lib/messages';
import { PersonLabel } from './ui/avatar';

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Danh sách hồ sơ kiểu hàng-thẻ với ô tìm kiếm và lọc theo trạng thái/THV (lọc trên dữ liệu đã tải, Figma 3:28). */
export function CaseTable({
  cases,
  action,
}: {
  readonly cases: readonly CaseItem[];
  /** Nút chính của danh sách, cùng hàng với ô tìm và bộ lọc. */
  readonly action?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [thv, setThv] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (needle === '' ||
          c.title.toLowerCase().includes(needle) ||
          (c.customerName ?? '').toLowerCase().includes(needle)) &&
        (status === '' || c.status === status) &&
        (thv === '' || (thv === 'assigned') === (c.responsibleThvUserId !== null)),
    );
  }, [cases, q, status, thv]);
  return (
    <>
      <div className="filters" role="search">
        <label className="filter-search">
          <span className="sr-only">Tìm theo hồ sơ hoặc khách hàng</span>
          <input
            type="search"
            placeholder="Tìm theo hồ sơ hoặc khách hàng..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="filter">
          <span className="sr-only">Lọc theo trạng thái</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Trạng thái</option>
            {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span className="sr-only">Lọc theo THV phụ trách</span>
          <select value={thv} onChange={(e) => setThv(e.target.value)}>
            <option value="">THV phụ trách</option>
            <option value="assigned">Đã phân công</option>
            <option value="unassigned">Chưa phân công</option>
          </select>
        </label>
        {action}
      </div>
      {shown.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có hồ sơ phù hợp</h2>
          <p>Không có hồ sơ nào khớp bộ lọc hiện tại.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Danh sách hồ sơ Vi bằng</caption>
            <thead>
              <tr>
                <th scope="col">Hồ sơ</th>
                <th scope="col">Khách hàng</th>
                <th scope="col">Địa điểm</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">THV phụ trách</th>
                <th scope="col">Bước tiếp theo</th>
                <th scope="col">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <Link href={`/vi-bang/${c.id}`}>{c.title}</Link>
                    {c.intakeNo ? <small className="muted small-ref"> · {c.intakeNo}</small> : null}
                  </th>
                  <td>{c.customerName ?? <span className="muted">—</span>}</td>
                  <td>{c.branchName ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className="badge" data-status={c.status}>
                      {CASE_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>
                    <PersonLabel
                      label={c.thvLabel}
                      id={c.responsibleThvUserId}
                      fallback={c.responsibleThvUserId ? 'Đã phân công' : 'Chưa phân công'}
                    />
                  </td>
                  <td>{c.nextStep ? (NEXT_STEP_LABEL[c.nextStep] ?? c.nextStep) : '—'}</td>
                  <td>{fmt.format(new Date(c.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
