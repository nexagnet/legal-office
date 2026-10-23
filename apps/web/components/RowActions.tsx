import type { ReactNode } from 'react';

/** Thao tác của một dòng danh sách: thu gọn mặc định để bảng không bị các biểu mẫu kéo dài. */
export function RowActions({ children }: { readonly children: ReactNode }) {
  return (
    <details className="row-actions">
      <summary>Thao tác</summary>
      <div className="row-actions-body">{children}</div>
    </details>
  );
}
