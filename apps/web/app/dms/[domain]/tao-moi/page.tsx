import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminBanner } from '../../../../components/admin-banner';
import { NewDmsCasePage } from '../../../../components/NewDmsCasePage';
import {
  BOOK_OF_DOMAIN,
  canDraft,
  domainBySlug,
  inputColumns,
  isVanThu,
  loadDmsBooks,
  loadMyDmsPermissions,
} from '../../../../lib/dms';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

const todayVn = (): string =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());

/** Trang tạo hồ sơ nháp (Figma "Tạo hồ sơ"). Ba sổ Văn thư dùng hộp thoại "Thêm bản ghi" ở danh sách nên không có trang này. */
export default async function NewDmsCaseRoute({ params }: { params: Promise<{ domain: string }> }) {
  const domain = domainBySlug((await params).domain);
  if (!domain || isVanThu(domain.code)) notFound();
  const base = `/dms/${domain.slug}`;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tạo hồ sơ {domain.label}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            Phiên làm việc chưa được xác thực. <Link href="/login">Đăng nhập</Link> để tạo hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tạo hồ sơ {domain.label}</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
          <p>Tài khoản chưa thuộc văn phòng nào.</p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const [permissions, books] = await Promise.all([
    loadMyDmsPermissions(cookie, officeId),
    loadDmsBooks(cookie),
  ]);
  const bookCode = BOOK_OF_DOMAIN[domain.code] ?? '';
  const book = books === 'error' ? undefined : books.find((b) => b.code === bookCode);
  return (
    <section aria-labelledby="t" className="dms-create">
      <AdminBanner
        crumb={[
          [domain.label, base],
          ['Tạo hồ sơ', undefined],
        ]}
        title={`Tạo hồ sơ ${domain.label}`}
        sub="Nhập thông tin hồ sơ. Sau khi xác nhận lưu chính thức, chỉ Admin được sửa; mọi lần sửa đều ghi lịch sử."
      />
      <h1 id="t" className="sr-only">
        Tạo hồ sơ {domain.label}
      </h1>
      {canDraft(permissions, domain.code) ? (
        <NewDmsCasePage
          officeId={officeId}
          domainCode={domain.code}
          domainLabel={domain.label}
          bookCode={bookCode}
          columns={book && book.source === 'case' ? inputColumns(book) : []}
          creatorName={session.displayName ?? 'Bạn'}
          createdOn={todayVn()}
          cancelHref={base}
          redirectBase={base}
        />
      ) : (
        <div className="state" role="alert">
          <h2>Bạn chưa có quyền tạo hồ sơ {domain.label}</h2>
          <p>
            Liên hệ quản trị viên để được cấp quyền. <Link href={base}>Quay lại danh sách</Link>.
          </p>
        </div>
      )}
    </section>
  );
}
