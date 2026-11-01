'use client';

import { DataTable } from './ui/data-table';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { cn } from '../lib/cn';
import { formatDay } from '../lib/deadlines';
import { messageFor } from '../lib/messages';
import { NoteBox, Pill, type PillTone } from './permissions/Pill';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Field, Input } from './ui/field';

export interface ThvCard {
  readonly userId: string;
  readonly fullName: string;
  readonly cardNo: string;
  readonly status?: 'ACTIVE' | 'SUSPENDED';
  readonly decisionNo?: string | null;
  readonly decisionDate?: string | null;
  readonly effectiveFrom?: string | null;
  readonly effectiveTo?: string | null;
  readonly hasScan?: boolean;
}

export interface ThvPerson {
  readonly userId: string;
  readonly label: string;
  /** Nhóm quyền người này đang thuộc (chỉ để hiển thị; nhóm quyền không tạo ra tư cách hành nghề). */
  readonly groups?: readonly string[];
}

interface HistoryRow {
  readonly id: number;
  readonly event: 'ISSUED' | 'UPDATED' | 'RENEWED' | 'SUSPENDED';
  readonly fullName: string;
  readonly cardNo: string;
  readonly decisionNo: string | null;
  readonly decisionDate: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly hasScan: boolean;
  readonly at: string;
}

type View = 'ACTIVE' | 'MISSING' | 'NONE' | 'SUSPENDED';
type Filter = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED';

const EVENT_LABEL: Record<HistoryRow['event'], string> = {
  ISSUED: 'Cấp thẻ',
  UPDATED: 'Cập nhật',
  RENEWED: 'Có hiệu lực trở lại',
  SUSPENDED: 'Ngừng hiệu lực',
};
const VIEW_PILL: Record<View, { tone: PillTone; text: string }> = {
  ACTIVE: { tone: 'ok', text: 'Còn hiệu lực' },
  MISSING: { tone: 'brass', text: 'Thiếu quyết định' },
  NONE: { tone: 'mute', text: 'Chưa có thẻ' },
  SUSPENDED: { tone: 'danger', text: 'Ngừng hiệu lực' },
};
const NETWORK_ERROR = 'Không kết nối được máy chủ. Vui lòng thử lại.';

const day = (d: string | null | undefined) => (d ? formatDay(`${d}T00:00:00+07:00`) : '—');

function viewOf(card: ThvCard | undefined): View {
  if (!card) return 'NONE';
  if (card.status === 'SUSPENDED') return 'SUSPENDED';
  return card.decisionNo && card.hasScan ? 'ACTIVE' : 'MISSING';
}
const isPending = (v: View) => v === 'NONE' || v === 'MISSING';

/**
 * Thẻ thừa hành viên (Figma Q7). Quyết định owner 2026-11-01: KHÔNG có bước xác nhận; Admin nhập thẻ kèm quyết định và bản scan,
 * có hiệu lực ngay, không ai duyệt Admin. "Ngừng hiệu lực" giữ thẻ và lịch sử, không xoá gì. Nhóm quyền không tự tạo tư cách
 * hành nghề: thẻ chỉ ghi nhận theo căn cứ có bản scan.
 */
export function ThvCardsForm({
  officeId,
  people,
  cards,
  canEdit,
}: {
  readonly officeId: string;
  readonly people: readonly ThvPerson[];
  readonly cards: readonly ThvCard[];
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const byUser = new Map(cards.map((c) => [c.userId, c]));
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [history, setHistory] = useState<{ person: ThvPerson; rows: readonly HistoryRow[] } | null>(
    null,
  );

  const views = people.map((p) => ({ person: p, card: byUser.get(p.userId) }));
  const matches = (f: Filter, v: View) => f === 'ALL' || (f === 'PENDING' ? isPending(v) : v === f);
  const count = (f: Filter) => views.filter(({ card }) => matches(f, viewOf(card))).length;
  const needle = search.trim().toLowerCase();
  const shown = views.filter(({ person, card }) => {
    const v = viewOf(card);
    if (!matches(filter, v)) return false;
    if (!needle) return true;
    return [person.label, card?.fullName, card?.cardNo].some((t) =>
      t?.toLowerCase().includes(needle),
    );
  });
  const target = people.find((p) => p.userId === editing) ?? null;
  const targetCard = target ? byUser.get(target.userId) : undefined;

  const scanUrl = (userId: string, historyId?: number) =>
    `/api/office/thv-cards/${userId}/scan?officeId=${encodeURIComponent(officeId)}${
      historyId ? `&historyId=${historyId}` : ''
    }`;

  async function run(action: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      if (r.error) setError(r.error);
      if (r.notice) setNotice(r.notice);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function open(userId: string) {
    setEditing(userId);
    setError(null);
    setNotice(null);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const input = form.elements.namedItem('scan') as HTMLInputElement | null;
    const scan = input?.files?.[0] ?? null;
    const query = new URLSearchParams({
      officeId,
      fullName: String(f.get('fullName') ?? '').trim(),
      cardNo: String(f.get('cardNo') ?? '').trim(),
      decisionNo: String(f.get('decisionNo') ?? '').trim(),
      decisionDate: String(f.get('decisionDate') ?? ''),
      effectiveFrom: String(f.get('effectiveFrom') ?? ''),
    });
    return run(async () => {
      const res = await fetch(`/api/office/thv-cards/${target.userId}?${query}`, {
        method: 'POST',
        ...(scan
          ? { headers: { 'content-type': scan.type || 'application/octet-stream' }, body: scan }
          : {}),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return { error: messageFor(json.code) };
      router.refresh();
      return {
        notice:
          json.code === 'THV_CARD_RENEWED'
            ? 'Đã lưu. Thẻ có hiệu lực trở lại.'
            : 'Đã lưu. Thẻ có hiệu lực ngay.',
      };
    });
  }

  const suspend = () =>
    run(async () => {
      if (!target) return {};
      const res = await fetch(`/api/office/thv-cards/${target.userId}/suspend`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      setConfirmSuspend(false);
      if (!res.ok)
        return {
          error:
            json.code === 'NO_CHANGE' ? 'Thẻ đã ngừng hiệu lực từ trước.' : messageFor(json.code),
        };
      router.refresh();
      return { notice: 'Đã ngừng hiệu lực. Thẻ và lịch sử vẫn được giữ.' };
    });

  const showHistory = (person: ThvPerson) =>
    run(async () => {
      const res = await fetch(
        `/api/office/thv-cards/${person.userId}/history?officeId=${encodeURIComponent(officeId)}`,
      );
      const json = (await res.json().catch(() => ({}))) as { code?: string; rows?: HistoryRow[] };
      if (!res.ok) return { error: messageFor(json.code) };
      setHistory({ person, rows: json.rows ?? [] });
      return {};
    });

  const pills: readonly (readonly [Filter, string])[] = [
    ['ALL', 'Tất cả'],
    ['ACTIVE', 'Còn hiệu lực'],
    ['PENDING', 'Chờ bổ sung'],
    ['SUSPENDED', 'Ngừng hiệu lực'],
  ];

  return (
    <section className="grid gap-4" aria-labelledby="thv-t">
      <h2 id="thv-t" className="sr-only">
        Thẻ thừa hành viên
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Tìm thừa hành viên"
          placeholder="Tìm thừa hành viên…"
          className="max-w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {pills.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors',
              filter === key
                ? 'border-accent bg-accent text-white'
                : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
            )}
          >
            {text} {count(key)}
          </button>
        ))}
      </div>
      <p role="alert" className="error" hidden={!error || confirmSuspend}>
        {error}
      </p>
      <p role="status" className="success" hidden={!notice}>
        {notice}
      </p>

      {people.length === 0 ? (
        <p className="muted">Văn phòng chưa có thành viên vai Thừa hành viên.</p>
      ) : (
        <DataTable tableKey="ThvCardsForm-1" className="rounded-2xl bg-surface p-2 shadow-sm">
          <table className="compact-table">
            <caption className="sr-only">Thẻ thừa hành viên</caption>
            <thead>
              <tr>
                <th scope="col">Thừa hành viên</th>
                <th scope="col">Số thẻ</th>
                <th scope="col">Quyết định / giấy tờ</th>
                <th scope="col">Hiệu lực</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Bản scan</th>
                <th scope="col">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ person, card }) => {
                const v = viewOf(card);
                const pill = VIEW_PILL[v];
                return (
                  <tr key={person.userId}>
                    <th scope="row" className="min-w-32">
                      <span className="grid">
                        <strong>{card?.fullName ?? person.label}</strong>
                        {person.groups && person.groups.length > 0 ? (
                          <span className="muted text-xs">nhóm {person.groups.join(', ')}</span>
                        ) : null}
                      </span>
                    </th>
                    <td className="whitespace-nowrap">
                      {card?.cardNo ?? <span className="muted">Chưa có</span>}
                    </td>
                    <td>
                      {card?.decisionNo ? (
                        <span className="grid">
                          <span>{card.decisionNo}</span>
                          <span className="muted text-xs">ngày {day(card.decisionDate)}</span>
                        </span>
                      ) : card ? (
                        <span className="text-danger">Thiếu quyết định</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {card?.effectiveFrom ? (
                        <span className="grid">
                          <span>
                            {day(card.effectiveFrom)} →{' '}
                            {card.effectiveTo ? day(card.effectiveTo) : ''}
                          </span>
                          {card.effectiveTo ? null : (
                            <span className="muted text-xs">chưa hết hạn</span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <Pill tone={pill.tone}>{pill.text}</Pill>
                    </td>
                    <td className="whitespace-nowrap">
                      {card?.hasScan ? (
                        <a
                          href={scanUrl(person.userId)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Xem bản scan quyết định của ${card.fullName}`}
                        >
                          Xem
                        </a>
                      ) : (
                        <span className="muted">Chưa có</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="flex gap-3">
                        {card ? (
                          <button
                            type="button"
                            className="link-btn"
                            disabled={busy}
                            aria-label={`Lịch sử thẻ của ${card.fullName}`}
                            onClick={() => showHistory(person)}
                          >
                            Lịch sử
                          </button>
                        ) : null}
                        {canEdit ? (
                          <button
                            type="button"
                            className="link-btn"
                            aria-label={`${card?.decisionNo ? 'Cập nhật' : 'Nhập'} thẻ của ${card?.fullName ?? person.label}`}
                            onClick={() => open(person.userId)}
                          >
                            {card?.decisionNo ? 'Cập nhật' : 'Nhập'}
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Không có thừa hành viên nào khớp.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </DataTable>
      )}

      {canEdit && target ? (
        <form
          key={target.userId + (targetCard?.decisionNo ?? '') + (targetCard?.status ?? '')}
          className="grid gap-4 rounded-2xl bg-surface p-6 shadow-sm"
          onSubmit={submit}
          aria-label={`Cập nhật thẻ ${target.label}`}
        >
          <h3 className="font-serif text-lg">Cập nhật thẻ · {target.label}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="thv-name" label="Họ tên trên sổ">
              <Input
                id="thv-name"
                name="fullName"
                required
                maxLength={200}
                defaultValue={targetCard?.fullName ?? target.label}
              />
            </Field>
            <Field id="thv-card" label="Số thẻ">
              <Input
                id="thv-card"
                name="cardNo"
                required
                maxLength={50}
                placeholder="Nhập số thẻ"
                defaultValue={targetCard?.cardNo ?? ''}
              />
            </Field>
            <Field id="thv-dec" label="Số quyết định / giấy tờ">
              <Input
                id="thv-dec"
                name="decisionNo"
                required
                maxLength={100}
                placeholder="VD: QĐ 123/QĐ-BTP"
                defaultValue={targetCard?.decisionNo ?? ''}
              />
            </Field>
            <Field id="thv-decdate" label="Ngày ban hành quyết định">
              <Input
                id="thv-decdate"
                name="decisionDate"
                type="date"
                required
                defaultValue={targetCard?.decisionDate ?? ''}
              />
            </Field>
            <Field id="thv-from" label="Ngày hiệu lực">
              <Input
                id="thv-from"
                name="effectiveFrom"
                type="date"
                required
                defaultValue={targetCard?.effectiveFrom ?? ''}
              />
            </Field>
            <Field
              id="thv-scan"
              label={targetCard?.hasScan ? 'Bản scan quyết định' : 'Bản scan quyết định (bắt buộc)'}
              help={
                targetCard?.hasScan
                  ? 'Để trống để giữ bản scan hiện tại. Đổi số quyết định thì phải tải bản scan mới.'
                  : 'PDF, JPEG hoặc PNG, tối đa 25 MB.'
              }
            >
              <Input
                id="thv-scan"
                name="scan"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required={!targetCard?.hasScan}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy}>
              Lưu thẻ
            </Button>
            {targetCard && targetCard.status !== 'SUSPENDED' ? (
              <Button
                variant="secondary"
                className="border-danger text-danger"
                disabled={busy}
                onClick={() => setConfirmSuspend(true)}
              >
                Ngừng hiệu lực (giữ lịch sử)
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Đóng
            </Button>
          </div>
          <p className="muted text-xs">
            Lưu xong thẻ có hiệu lực ngay, không cần ai xác nhận. Ngừng hiệu lực không xoá thẻ hay
            lịch sử.
          </p>
        </form>
      ) : null}

      <NoteBox tone="warn" title="Nhóm quyền khác tư cách hành nghề">
        Thành viên thuộc nhóm quyền Thừa hành viên nhưng chưa có thẻ hợp lệ thì hệ thống không coi
        là thừa hành viên có tư cách. Nhóm quyền không tự tạo ra tư cách hành nghề; thẻ chỉ có hiệu
        lực theo quyết định đã nhập kèm bản scan. Admin nhập trực tiếp, không cần ai xác nhận.
      </NoteBox>

      <Modal
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title="Ngừng hiệu lực thẻ?"
        description="Thẻ và toàn bộ lịch sử vẫn được giữ; hiệu lực kết thúc từ hôm nay. Có thể nhập lại để thẻ có hiệu lực trở lại."
      >
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmSuspend(false)}>
            Hủy
          </Button>
          <Button variant="danger" loading={busy} onClick={suspend}>
            Ngừng hiệu lực
          </Button>
        </div>
      </Modal>

      <Modal
        open={history !== null}
        onOpenChange={(o) => (o ? undefined : setHistory(null))}
        title={`Lịch sử thẻ · ${history?.person.label ?? ''}`}
        description="Mọi lần cấp, cập nhật và ngừng hiệu lực đều được giữ lại, kèm bản scan quyết định tương ứng."
      >
        {history && history.rows.length === 0 ? <p className="muted">Chưa có lịch sử.</p> : null}
        <ul className="m-0 grid list-none gap-3 p-0">
          {history?.rows.map((h) => (
            <li key={h.id} className="grid gap-0.5 border-t border-line pt-3 text-sm">
              <span className="flex items-center justify-between gap-2">
                <strong>{EVENT_LABEL[h.event]}</strong>
                <span className="muted text-xs">{formatDay(h.at)}</span>
              </span>
              <span>
                {h.fullName} · số thẻ {h.cardNo}
              </span>
              <span className="muted">
                {h.decisionNo
                  ? `${h.decisionNo}, ngày ${day(h.decisionDate)}`
                  : 'Chưa có quyết định'}{' '}
                · hiệu lực {day(h.effectiveFrom)} →{' '}
                {h.effectiveTo ? day(h.effectiveTo) : 'chưa hết hạn'}
              </span>
              {h.hasScan && history ? (
                <a
                  href={scanUrl(history.person.userId, h.id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Xem bản scan ngày ${formatDay(h.at)}`}
                >
                  Xem bản scan
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
