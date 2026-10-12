import { redirect } from 'next/navigation';
import { LoginForm } from '../../components/LoginForm';
import { currentSession } from '../../lib/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if ((await currentSession()).status === 'authenticated') redirect('/');
  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    return (
      <section>
        <h1>Đăng nhập</h1>
        <div className="state" role="alert">
          <h2>Chưa cấu hình văn phòng</h2>
          <p>
            Máy chủ web chưa được đặt mã văn phòng (TENANT_ID). Liên hệ người quản trị hệ thống.
          </p>
        </div>
      </section>
    );
  }
  return <LoginForm tenantId={tenantId} />;
}
