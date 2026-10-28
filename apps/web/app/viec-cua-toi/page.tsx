import Link from 'next/link';
import { MyWorkList } from '../../components/MyWorkList';
import { loadMyWork } from '../../lib/my-work';
import { loadPeopleNames } from '../../lib/people';
import { currentSession, requestCookie } from '../../lib/server';

export const dynamic = 'force-dynamic';

export default async function MyWorkPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Việc của tôi</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem việc được giao.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const cookie = await requestCookie();
  const items = officeId ? await loadMyWork(cookie, officeId) : [];
  const names = await loadPeopleNames(
    cookie,
    items === 'error' ? [] : items.map((i) => i.createdBy),
  );
  return (
    <section aria-labelledby="t">
      <h1 id="t">Việc của tôi</h1>
      <p className="muted">
        Hồ sơ đang giao cho bạn ở bốn nghiệp vụ. Bấm vào để mở màn xử lý; hạn gần nhất lên trước.
      </p>
      <MyWorkList items={items} names={Object.fromEntries(names)} />
    </section>
  );
}
