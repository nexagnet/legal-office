import Link from 'next/link';
import { LegacyUploader } from '../../../../components/LegacyUploader';
import { loadMyDmsPermissions } from '../../../../lib/dms';
import { loadLegacyFeatures } from '../../../../lib/dms-legacy';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

/** Tải tài liệu cũ lên từng tệp từ trình duyệt (cần quyền `dms.legacy.import`). */
export default async function LegacyUploadPage() {
  const session = await currentSession();
  const officeId =
    session.status === 'authenticated'
      ? (session.branches[0]?.officeId ?? session.memberships[0]?.officeId)
      : undefined;
  const cookie = await requestCookie();
  const permissions = officeId ? await loadMyDmsPermissions(cookie, officeId) : [];
  if (!officeId || !permissions.includes('dms.legacy.import')) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tải tài liệu cũ lên</h1>
        <div className="state" role="status">
          <h2>Bạn chưa có quyền tải tài liệu cũ lên</h2>
          <p>Liên hệ Admin để được cấp quyền nhập tài liệu cũ.</p>
        </div>
      </section>
    );
  }
  const features = await loadLegacyFeatures(cookie);
  return (
    <section aria-labelledby="t">
      <h1 id="t">Tải tài liệu cũ lên</h1>
      <p>
        <Link href="/dms/tai-lieu-cu">← Về danh sách tài liệu cũ</Link>
      </p>
      <LegacyUploader officeId={officeId} ocrOn={features.ocr} />
    </section>
  );
}
