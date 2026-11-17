import { Scale } from 'lucide-react';

/** Logo của văn phòng; chưa đặt (version rỗng) thì dùng biểu tượng cán cân mặc định. */
export function OfficeLogo({
  officeId,
  version,
}: {
  readonly officeId: string | null;
  readonly version: number | null | undefined;
}) {
  if (!officeId || !version) return <Scale aria-hidden="true" />;
  return (
    <img
      src={`/api/office/logo?officeId=${encodeURIComponent(officeId)}&v=${version}`}
      alt=""
      className="size-full object-contain"
    />
  );
}
