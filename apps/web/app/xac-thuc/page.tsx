import { VerifyLink } from '../../components/VerifyLink';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export default async function VerifyPage({
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
        <h1>Xác thực đăng nhập</h1>
        <div className="state" role="alert">
          <h2>Link không hợp lệ</h2>
          <p>Hãy đăng nhập lại để nhận email mới.</p>
        </div>
      </section>
    );
  }
  return <VerifyLink tenantId={tenantId} token={token} />;
}
