import Link from 'next/link';
import { ChangePasswordForm } from '../../components/ChangePasswordForm';
import { currentSession } from '../../lib/server';

export const dynamic = 'force-dynamic';

/** Đổi mật khẩu của chính mình. Tài khoản mới tạo / vừa được Admin đặt lại bị chuyển về đây cho tới khi đổi xong. */
export default async function ChangePasswordPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section>
        <h1>Đổi mật khẩu</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để đổi mật khẩu.
          </p>
        </div>
      </section>
    );
  }
  return <ChangePasswordForm forced={session.mustChangePassword === true} />;
}
