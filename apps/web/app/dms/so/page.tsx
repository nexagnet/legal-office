import Link from 'next/link';
import { Button } from '../../../components/ui/button';
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
      <ul
        className="m-0 mt-4 grid list-none gap-4 p-0 sm:grid-cols-2"
        aria-label="Các sổ nghiệp vụ"
      >
        {BOOKS.map(([slug, code, title, domainSlug]) => (
          <li key={slug} className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-sm">
            <div>
              <span className="chip" data-tone="info">
                Sổ {code}
              </span>
              <h2 className="mt-2 mb-1 font-serif text-lg font-bold">{title}</h2>
              <p className="muted m-0 text-sm">
                Nghiệp vụ {DMS_DOMAINS.find((d) => d.slug === domainSlug)?.label}
              </p>
            </div>
            <div>
              <Button asChild variant="secondary">
                <Link className="no-underline" href={`/dms/so/${slug}`}>
                  Xem trước và xuất {code}
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
