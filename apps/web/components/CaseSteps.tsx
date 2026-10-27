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
  const firstOpen = steps.findIndex((x) => !x.done);
  const current = firstOpen === -1 ? steps.length - 1 : firstOpen;

  return (
    <>
      <section className="panel" aria-labelledby="steps-t">
        <h2 id="steps-t" className="sr-only">
          Tiến độ hồ sơ
        </h2>
        <ol className="grid list-none grid-cols-6 gap-1 p-0 max-md:grid-cols-3 max-md:gap-y-4">
          {steps.map((s, i) => (
            <li
              key={s.label}
              data-done={s.done}
              aria-current={i === current && !finished ? 'step' : undefined}
              className="grid justify-items-center gap-2 text-center"
            >
              <span
                aria-hidden="true"
                className={`grid size-7 place-items-center rounded-full border-2 text-xs font-bold ${
                  s.done
                    ? 'border-accent bg-accent text-white'
                    : i === current && !finished
                      ? 'border-accent bg-surface text-accent'
                      : 'border-line-strong bg-surface text-faint'
                }`}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <span
                className={`text-[13px] ${i === current && !finished ? 'font-bold text-ink' : 'text-muted'}`}
              >
                {s.label}
                {s.detail ? <span className="block text-xs font-normal">{s.detail}</span> : null}
                <span className="sr-only">{s.done ? ' (đã xong)' : ' (chưa xong)'}</span>
              </span>
            </li>
          ))}
        </ol>
        {progress.misaRevokeStatus !== 'NONE' ? (
          <p className="muted">Có đề nghị thu hồi xác nhận MISA đang xử lý.</p>
        ) : null}
      </section>
      {finished ? null : (
        <section
          aria-labelledby="next-t"
          className="next-action flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line border-l-[5px] border-l-brass bg-surface p-5 shadow-[var(--shadow)]"
        >
          <div className="grid gap-1">
            <p className="text-[11px] font-bold tracking-wide text-brass uppercase">
              Việc tiếp theo
            </p>
            <h2 id="next-t" className="font-serif text-[22px] leading-7 font-bold text-[#12263f]">
              {next.label}
            </h2>
          </div>
          <Link className="primary btn-link" href={`/vi-bang/${caseId}/${next.href}`}>
            Tiếp tục: {next.label}
          </Link>
        </section>
      )}
    </>
  );
}
