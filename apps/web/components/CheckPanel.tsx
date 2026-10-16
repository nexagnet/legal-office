import type { ReactNode } from 'react';

interface Props {
  readonly title: string;
  readonly checks: readonly string[];
  /** Nút hành động chính của màn (Figma 16:2, 16:64). */
  readonly children: ReactNode;
  readonly notice?: string;
  readonly note?: string;
}

/** Cột phải của các màn thao tác quản trị: điều kiện, nút hành động, ghi chú audit. */
export function CheckPanel({
  title,
  checks,
  children,
  notice = 'Trạng thái và quyền được xác minh khi thao tác thực tế.',
  note = 'Lưu audit • hiển thị thông báo và trạng thái kiểm tra sau thao tác.',
}: Props) {
  return (
    <aside className="panel">
      <h2>{title}</h2>
      <p className="notice-blue">{notice}</p>
      <ul className="check-list">
        {checks.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {children}
      <p className="note-box">{note}</p>
    </aside>
  );
}
