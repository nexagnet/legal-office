import Link from 'next/link';
import { NewCaseForm } from '../../../components/NewCaseForm';
import { currentSession } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function NewCasePage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tạo hồ sơ Vi bằng</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            Phiên làm việc chưa được xác thực. <Link href="/login">Đăng nhập</Link> để tạo hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Tạo hồ sơ Vi bằng">
      <NewCaseForm branches={session.branches} />
    </section>
  );
}
