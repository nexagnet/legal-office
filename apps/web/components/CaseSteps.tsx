import Link from 'next/link';

export interface Progress {
  readonly misaStatus: string;
  readonly misaRevokeStatus: string;
  readonly numberLabel: string | null;
  readonly signedAt: string | null;
  readonly stampedAt: string | null;
  readonly hasFinalScan: boolean;
}
interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly progress: Progress;
}

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Màn xử lý của bước kế tiếp (Figma 3:106, 3:132, 3:158). */
function nextStage(progress: Progress): { href: string; label: string } {
  if (progress.misaStatus !== 'CONFIRMED_FULL' || !progress.numberLabel) {
    return { href: 'cap-so', label: 'Xác nhận MISA và cấp số' };
  }
  if (!progress.stampedAt || !progress.hasFinalScan) {
    return { href: 'ky-dong-dau', label: 'Ký, đóng dấu và bản scan' };
  }
  return { href: 'tra-ket-qua', label: 'Trả kết quả cho khách' };
}

/** Các bước pháp lý theo thứ tự: MISA → cấp số → ký → đóng dấu → bản scan → trả khách. MISA là sổ duy nhất về tiền. */
export function CaseSteps({ caseId, status, progress }: Props) {
  const finished = status === 'RETURNED' || status === 'CANCELLED';
  const steps: { label: string; done: boolean; detail?: string }[] = [
    { label: 'Kế toán xác nhận MISA', done: progress.misaStatus === 'CONFIRMED_FULL' },
    {
      label: 'Cấp số Vi bằng',
      done: !!progress.numberLabel,
      detail: progress.numberLabel ?? undefined,
    },
    {
      label: 'THV xác nhận đã ký',
      done: !!progress.signedAt,
      detail: progress.signedAt ? fmt.format(new Date(progress.signedAt)) : undefined,
    },
    {
      label: 'Xác nhận đã đóng dấu',
      done: !!progress.stampedAt,
      detail: progress.stampedAt ? fmt.format(new Date(progress.stampedAt)) : undefined,
    },
    { label: 'Bản scan cuối', done: progress.hasFinalScan },
    { label: 'Trả khách', done: status === 'RETURNED' },
  ];

  const next = nextStage(progress);

  return (
    <section className="panel" aria-labelledby="steps-t">
      <h2 id="steps-t">Tiến độ hồ sơ</h2>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.label} data-done={s.done}>
            <span className="dot" aria-hidden="true" /> {s.label}
            {s.detail ? <span className="muted"> · {s.detail}</span> : null}
            <span className="sr-only">{s.done ? ' (đã xong)' : ' (chưa xong)'}</span>
          </li>
        ))}
      </ol>
      {progress.misaRevokeStatus !== 'NONE' ? (
        <p className="muted">Có đề nghị thu hồi xác nhận MISA đang xử lý.</p>
      ) : null}
      {finished ? null : (
        <p>
          <Link className="primary btn-link" href={`/vi-bang/${caseId}/${next.href}`}>
            Tiếp tục: {next.label}
          </Link>
        </p>
      )}
    </section>
  );
}
