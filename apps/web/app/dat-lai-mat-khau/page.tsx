import Link from 'next/link';
import { ResetPasswordForm } from '../../components/ResetPasswordForm';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Mở từ link trong email quên mật khẩu: `?t=<mã văn phòng>.<mã đặt lại>`. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const raw = (await searchParams).t ?? '';
  const dot = raw.indexOf('.');
  const tenantId = dot > 0 ? raw.slice(0, dot) : '';
  const token = dot > 0 ? raw.slice(dot + 1) : '';
  if (!UUID.test(tenantId) || !TOKEN.test(token)) {
    return (
      <section>
        <h1>Đặt lại mật khẩu</h1>
        <div className="state" role="alert">
          <h2>Link không hợp lệ</h2>
          <p>
            Hãy <Link href="/quen-mat-khau">yêu cầu link mới</Link>.
          </p>
        </div>
      </section>
    );
  }
  return <ResetPasswordForm tenantId={tenantId} token={token} />;
}
