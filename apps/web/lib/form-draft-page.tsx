import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentSession } from './server';

/** Khung chung cho trang soạn nháp biểu mẫu: kiểm tra đăng nhập và văn phòng rồi dựng nội dung. */
export async function renderDraftPage(
  title: string,
  body: (officeId: string) => ReactNode,
): Promise<ReactNode> {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{title}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để soạn biểu mẫu.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{title}</h1>
        <div className="state" role="alert">
          <h2>Chưa có văn phòng</h2>
          <p>Tài khoản chưa thuộc văn phòng nào.</p>
        </div>
      </section>
    );
  }
  return <section aria-label={title}>{body(officeId)}</section>;
}
