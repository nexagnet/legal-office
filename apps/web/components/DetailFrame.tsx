import Link from 'next/link';
import type { ReactNode } from 'react';
import { CaseBanner } from './CaseBanner';

/**
 * Khung trang chi tiết của Tống đạt, Xác minh, THA (Figma N13 E10–E12): banner mang mã hồ sơ và trạng thái,
 * nội dung là các thẻ; mọi thao tác nằm trong trang này, danh sách chỉ tóm tắt.
 */
export function DetailFrame({
  title,
  meta,
  status,
  statusLabel,
  backHref,
  backLabel,
  children,
}: {
  readonly title: string;
  readonly meta: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly backHref: string;
  readonly backLabel: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby="t">
      <h1 id="t" className="sr-only">
        {title}
      </h1>
      <CaseBanner title={title} meta={meta} status={status} statusLabel={statusLabel} />
      <p className="case-back">
        <Link href={backHref}>← {backLabel}</Link>
      </p>
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-4 max-lg:grid-cols-1">
        {children}
      </div>
    </section>
  );
}

export function DetailSignIn({ title, what }: { readonly title: string; readonly what: string }) {
  return (
    <section aria-labelledby="t">
      <h1 id="t">{title}</h1>
      <div className="state" role="alert">
        <h2>Cần đăng nhập</h2>
        <p>
          <Link href="/login">Đăng nhập</Link> để xem {what}.
        </p>
      </div>
    </section>
  );
}
