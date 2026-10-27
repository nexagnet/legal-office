import type { ReactNode } from 'react';

/** `modal` là chỗ các thao tác của hồ sơ mở đè lên trang hiện tại khi bấm từ menu hoặc từ nút "Việc tiếp theo". */
export default function Layout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
