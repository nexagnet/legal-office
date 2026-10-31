import Link from 'next/link';
import { DMS_DOMAINS } from '../../../lib/dms';

export const dynamic = 'force-dynamic';

const BOOKS = [
  ['s-01', 'S-01', 'Sổ theo dõi việc tống đạt', 'tong-dat'],
  ['s-02', 'S-02', 'Sổ theo dõi việc lập vi bằng', 'vi-bang'],
  ['s-04', 'S-04', 'Sổ theo dõi việc xác minh điều kiện thi hành án', 'xac-minh'],
  ['s-05', 'S-05', 'Sổ theo dõi việc thi hành án', 'to-chuc-tha'],
] as const;

export default function DmsBooksIndex() {
  return (
    <section aria-labelledby="t">
      <h1 id="t">Xuất sổ nghiệp vụ</h1>
      <p className="muted">
        Xem trước sổ theo đúng mẫu để xuất in. STT do hệ thống cấp theo sổ, văn phòng và năm khi hồ
        sơ được xác nhận lưu chính thức.
      </p>
      <ul>
        {BOOKS.map(([slug, code, title, domainSlug]) => (
          <li key={slug}>
            <Link href={`/dms/so/${slug}`}>
              {code} · {title}
            </Link>{' '}
            <span className="muted">({DMS_DOMAINS.find((d) => d.slug === domainSlug)?.label})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
