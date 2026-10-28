'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDay } from '../lib/deadlines';
import { Person } from './ui/avatar';
import {
  MY_WORK_DOMAIN_LABEL,
  myWorkHref,
  myWorkStatusLabel,
  type MyWorkItem,
} from '../lib/my-work-view';

const col = createColumnHelper<MyWorkItem>();
const ALL = 'ALL';

type Names = Readonly<Record<string, string>>;

function Creator({ it, names }: { readonly it: MyWorkItem; readonly names: Names }) {
  const name = it.createdBy ? names[it.createdBy] : undefined;
  return name ? (
    <Person name={name} id={it.createdBy} size="sm" />
  ) : (
    <span className="muted">—</span>
  );
}

function DeadlineCell({ it }: { readonly it: MyWorkItem }) {
  if (!it.deadlineAt) return <span className="muted">—</span>;
  return (
    <span className="my-work-meta">
      <span className={it.overdue ? 'pill overdue' : 'pill soon'}>
        {it.overdue ? 'Quá hạn' : 'Có hạn'}
      </span>
      <span>Hạn {formatDay(it.deadlineAt)}</span>
    </span>
  );
}

function Ref({ it }: { readonly it: MyWorkItem }) {
  const href = myWorkHref(it);
  return href ? <Link href={href}>{it.label}</Link> : <span>{it.label}</span>;
}

function makeColumns(names: Names) {
  return [
    col.accessor((it) => MY_WORK_DOMAIN_LABEL[it.domain] ?? it.domain, {
      id: 'domain',
      header: 'Nghiệp vụ',
      cell: (c) => <span className="my-work-domain">{c.getValue()}</span>,
    }),
    col.display({ id: 'ref', header: 'Hồ sơ', cell: (c) => <Ref it={c.row.original} /> }),
    col.accessor((it) => myWorkStatusLabel(it), {
      id: 'status',
      header: 'Trạng thái',
      cell: (c) => <span className="muted">{c.getValue()}</span>,
    }),
    col.display({
      id: 'creator',
      header: 'Người tạo',
      cell: (c) => <Creator it={c.row.original} names={names} />,
    }),
    col.display({
      id: 'deadline',
      header: 'Hạn',
      cell: (c) => <DeadlineCell it={c.row.original} />,
    }),
  ];
}

/**
 * Việc của tôi. Máy tính: dải số liệu + lọc theo nghiệp vụ + bảng TanStack; điện thoại: thẻ một cột.
 * Chỉ đọc: mỗi việc dẫn về màn nghiệp vụ, nơi thao tác vẫn qua API kiểm quyền.
 * Quá hạn được ghi bằng chữ, không chỉ bằng màu.
 */
export function MyWorkList({
  items,
  names = {},
}: {
  readonly items: readonly MyWorkItem[] | 'error';
  /** Họ tên người tạo theo mã người dùng. */
  readonly names?: Names;
}) {
  const [domain, setDomain] = useState(ALL);
  const all = useMemo(() => (items === 'error' ? [] : items), [items]);
  const rows = useMemo(
    () => (domain === ALL ? all : all.filter((i) => i.domain === domain)),
    [all, domain],
  );
  const table = useReactTable({
    data: rows as MyWorkItem[],
    columns: makeColumns(names),
    getCoreRowModel: getCoreRowModel(),
  });

  if (items === 'error') {
    return (
      <div className="state" role="alert">
        <h2>Không tải được việc của bạn</h2>
        <p>Máy chủ chưa trả về danh sách việc. Vui lòng thử lại sau.</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="state" role="status">
        <h2>Không có việc được giao</h2>
        <p>Hiện không có hồ sơ nào đang giao cho bạn xử lý.</p>
      </div>
    );
  }
  const overdue = all.filter((i) => i.overdue).length;
  const domains = Array.from(new Set(all.map((i) => i.domain)));
  return (
    <>
      <dl className="my-work-kpi">
        <div data-tone="danger">
          <dt>Quá hạn</dt>
          <dd>{overdue}</dd>
        </div>
        <div>
          <dt>Đang xử lý</dt>
          <dd>{all.length - overdue}</dd>
        </div>
        <div>
          <dt>Tổng việc</dt>
          <dd>{all.length}</dd>
        </div>
      </dl>
      <div className="my-work-tabs" role="group" aria-label="Lọc theo nghiệp vụ">
        {[ALL, ...domains].map((d) => (
          <button
            key={d}
            type="button"
            className="my-work-tab"
            aria-pressed={domain === d}
            onClick={() => setDomain(d)}
          >
            {d === ALL ? 'Tất cả' : (MY_WORK_DOMAIN_LABEL[d] ?? d)}
          </button>
        ))}
      </div>
      <div className="table-wrap my-work-table">
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr
                key={`${r.original.domain}-${r.original.refId}`}
                data-overdue={r.original.overdue}
              >
                {r.getVisibleCells().map((c) => (
                  <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="my-work">
        {rows.map((it) => (
          <li key={`${it.domain}-${it.refId}`} data-overdue={it.overdue}>
            <span className="my-work-domain">{MY_WORK_DOMAIN_LABEL[it.domain] ?? it.domain}</span>
            <Ref it={it} />
            <span className="my-work-meta">
              <span className="muted">{myWorkStatusLabel(it)}</span>
              <DeadlineCell it={it} />
            </span>
            <Creator it={it} names={names} />
          </li>
        ))}
      </ul>
    </>
  );
}
