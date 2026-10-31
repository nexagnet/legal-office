import Link from 'next/link';
import { DMS_DOMAINS, VAN_THU_DOMAINS } from '../../lib/dms';

export const dynamic = 'force-dynamic';

export default function DmsHome() {
  return (
    <section aria-labelledby="t">
      <h1 id="t">Hồ sơ</h1>
      <p className="muted">
        Bốn nghiệp vụ lưu hồ sơ và bản scan. Hồ sơ đã lưu chính thức không sửa trực tiếp, không xoá.
      </p>
      <ul>
        {DMS_DOMAINS.map((d) => (
          <li key={d.slug}>
            <Link href={`/dms/${d.slug}`}>{d.label}</Link>
          </li>
        ))}
        {VAN_THU_DOMAINS.map((d) => (
          <li key={d.slug}>
            <Link href={`/dms/${d.slug}`}>Văn thư · {d.label}</Link>
          </li>
        ))}
        <li>
          <Link href="/dms/thv">Chờ tôi xác nhận (thừa hành viên)</Link>
        </li>
        <li>
          <Link href="/dms/sua-doi">Yêu cầu sửa đổi</Link>
        </li>
        <li>
          <Link href="/dms/so">Xuất sổ nghiệp vụ</Link>
        </li>
      </ul>
    </section>
  );
}
