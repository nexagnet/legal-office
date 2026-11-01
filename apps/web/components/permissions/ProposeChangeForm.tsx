'use client';

import { DataTable } from '../ui/data-table';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import {
  KIND_LABEL,
  PERMISSION_DOMAINS,
  allPermissionCodes,
  groupVersion,
  isSensitivePermission,
  parsePermission,
  permissionLabel,
  permissionMessage,
  splitLabel,
  type DmsGroup,
  type RequestKind,
} from '../../lib/permission-model';
import { Pill } from './Pill';

const KINDS: readonly RequestKind[] = ['ADD_MEMBER', 'REMOVE_MEMBER', 'GRANT', 'REVOKE'];
const KIND_HINT: Record<RequestKind, string> = {
  ADD_MEMBER: 'Đưa một thành viên vào nhóm quyền',
  REMOVE_MEMBER: 'Gỡ một thành viên khỏi nhóm quyền',
  GRANT: 'Thêm quyền vào nhóm (ảnh hưởng mọi thành viên nhóm)',
  REVOKE: 'Thu hồi quyền khỏi nhóm (ảnh hưởng mọi thành viên nhóm)',
};

export interface PersonOption {
  readonly userId: string;
  readonly label: string;
}

const isKind = (v: string | undefined): v is RequestKind => KINDS.some((k) => k === v);

/**
 * Form đề xuất đổi quyền (Figma Q5). Mỗi thành viên hoặc mỗi quyền được chọn là MỘT đề xuất, cùng lý do, để người duyệt
 * thấy và quyết định từng thay đổi. Máy chủ chặn đề xuất trùng, không đổi gì, và việc làm mất người duyệt cuối cùng.
 */
export function ProposeChangeForm({
  groups,
  people,
  initial,
}: {
  readonly groups: readonly DmsGroup[];
  readonly people: readonly PersonOption[];
  readonly initial: { loai?: string; nhom?: string; nguoi?: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RequestKind>(isKind(initial.loai) ? initial.loai : 'ADD_MEMBER');
  const [groupId, setGroupId] = useState(
    groups.find((g) => g.id === initial.nhom)?.id ?? groups[0]?.id ?? '',
  );
  const [userIds, setUserIds] = useState<readonly string[]>(initial.nguoi ? [initial.nguoi] : []);
  const [codes, setCodes] = useState<readonly string[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const group = groups.find((g) => g.id === groupId);
  const memberKind = kind === 'ADD_MEMBER' || kind === 'REMOVE_MEMBER';
  const personName = (id: string) => {
    const p = people.find((x) => x.userId === id);
    return p ? splitLabel(p.label).name : 'Người dùng khác';
  };
  const candidates = useMemo(() => {
    if (!group) return [];
    if (kind === 'ADD_MEMBER') return people.filter((p) => !group.member_ids.includes(p.userId));
    if (kind === 'REMOVE_MEMBER') return people.filter((p) => group.member_ids.includes(p.userId));
    return [];
  }, [group, kind, people]);
  const permissionPool = useMemo(() => {
    if (!group) return [];
    return kind === 'GRANT'
      ? allPermissionCodes().filter((c) => !group.permissions.includes(c))
      : kind === 'REVOKE'
        ? [...group.permissions]
        : [];
  }, [group, kind]);
  const sections = useMemo(() => {
    const bySection = new Map<string, string[]>();
    for (const c of permissionPool) {
      const d = parsePermission(c)?.domain;
      const title = PERMISSION_DOMAINS.find(([k]) => k === d)?.[1] ?? 'Quản trị';
      bySection.set(title, [...(bySection.get(title) ?? []), c]);
    }
    return [...bySection.entries()];
  }, [permissionPool]);

  const targets = memberKind ? userIds : codes;
  const sensitive = codes.filter(isSensitivePermission).length;

  function pickKind(k: RequestKind) {
    setKind(k);
    setCodes([]);
    setUserIds([]);
    setError(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!group) return setError('Hãy chọn nhóm quyền.');
    if (targets.length === 0)
      return setError(memberKind ? 'Hãy chọn thành viên.' : 'Hãy chọn ít nhất một quyền.');
    if (!reason.trim()) return setError(permissionMessage('REASON_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      for (const t of targets) {
        const r = await postJson(`/dms/groups/${group.id}/requests`, {
          kind,
          ...(memberKind ? { userId: t } : { permission: t }),
          reason: reason.trim(),
        });
        if (!r.ok) {
          const what = memberKind ? personName(t) : permissionLabel(t);
          return setError(`${what}: ${permissionMessage(r.code)}`);
        }
      }
      router.push('/quan-tri/phan-quyen?tab=yeu-cau');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'min-h-11 rounded-[10px] border border-line-strong bg-surface px-4 text-ink';
  const memberDelta = userIds.length * (kind === 'ADD_MEMBER' ? 1 : -1);

  return (
    <form className="wizard" onSubmit={submit} aria-label="Đề xuất đổi quyền" noValidate>
      <section className="wizard-card" aria-labelledby="pf-kind">
        <h2 id="pf-kind">1 · Loại thay đổi</h2>
        <div className="chip-row">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={kind === k}
              title={KIND_HINT[k]}
              onClick={() => pickKind(k)}
            >
              {k === 'ADD_MEMBER'
                ? 'Gán nhóm quyền'
                : k === 'REMOVE_MEMBER'
                  ? 'Gỡ khỏi nhóm'
                  : k === 'GRANT'
                    ? 'Thêm quyền vào nhóm'
                    : 'Thu hồi quyền khỏi nhóm'}
            </button>
          ))}
        </div>
        <p className="muted">{KIND_HINT[kind]}</p>
      </section>

      <section className="wizard-card" aria-labelledby="pf-group">
        <h2 id="pf-group">2 · Chọn nhóm quyền</h2>
        <div className="wizard-options" role="radiogroup" aria-label="Nhóm quyền">
          {groups.map((g) => (
            <label key={g.id} className="option-card" data-selected={groupId === g.id || undefined}>
              <input
                type="radio"
                name="group"
                checked={groupId === g.id}
                onChange={() => {
                  setGroupId(g.id);
                  setCodes([]);
                  setUserIds([]);
                }}
              />
              <span>
                <strong>{g.name}</strong>
                <small>
                  {g.kind === 'TEMPLATE' ? 'Mẫu' : 'Tùy chỉnh'} · v{groupVersion(g)} ·{' '}
                  {g.member_ids.length} người
                </small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="wizard-card" aria-labelledby="pf-target">
        <h2 id="pf-target">{memberKind ? '3 · Chọn thành viên' : '3 · Chọn quyền'}</h2>
        {memberKind ? (
          <>
            <div className="chip-row">
              {userIds.map((id) => (
                <span key={id} className="member-chip">
                  {personName(id)}
                  <button
                    type="button"
                    aria-label={`Bỏ ${personName(id)}`}
                    onClick={() => setUserIds(userIds.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {userIds.length === 0 ? (
                <span className="muted">Chưa chọn thành viên nào.</span>
              ) : null}
            </div>
            <label className="grid gap-1 text-sm font-semibold text-muted">
              Thêm thành viên
              <select
                className={field}
                value=""
                onChange={(e) => e.target.value && setUserIds([...userIds, e.target.value])}
              >
                <option value="">— Chọn thành viên —</option>
                {candidates
                  .filter((p) => !userIds.includes(p.userId))
                  .map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.label}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : (
          <fieldset className="grid max-h-[420px] gap-3 overflow-y-auto rounded-[10px] border border-line p-3">
            <legend className="text-sm font-semibold text-muted">
              {kind === 'GRANT' ? 'Quyền thêm vào nhóm' : 'Quyền thu hồi khỏi nhóm'}
            </legend>
            {sections.length === 0 ? <p className="muted">Không có quyền nào để chọn.</p> : null}
            {sections.map(([title, items]) => (
              <div key={title} className="grid gap-1">
                <h3 className="rounded-md bg-head px-3 py-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                  {title}
                </h3>
                {items.map((c) => (
                  <label key={c} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={codes.includes(c)}
                      onChange={(e) =>
                        setCodes(e.target.checked ? [...codes, c] : codes.filter((x) => x !== c))
                      }
                    />
                    <span className="flex-1">{permissionLabel(c).replace(`${title} · `, '')}</span>
                    {isSensitivePermission(c) ? (
                      <span className="text-xs font-semibold text-warn">Nhạy cảm</span>
                    ) : null}
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        )}
      </section>

      <section className="wizard-card" aria-labelledby="prev-t">
        <h2 id="prev-t">4 · Xem trước nếu được duyệt</h2>
        <DataTable tableKey="permissions-ProposeChangeForm-1">
          <table>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Hiện tại</th>
                <th scope="col">Sau khi duyệt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{KIND_LABEL[kind]}</th>
                <td>{group?.name ?? '—'}</td>
                <td>
                  {targets.length === 0
                    ? '— chưa chọn —'
                    : memberKind
                      ? `${userIds.map(personName).join(', ')} ${kind === 'ADD_MEMBER' ? 'thuộc' : 'không còn thuộc'} nhóm`
                      : `${targets.length} quyền ${kind === 'GRANT' ? 'được thêm' : 'bị thu hồi'}`}
                </td>
              </tr>
              <tr>
                <th scope="row">Số thành viên nhóm</th>
                <td>{group?.member_ids.length ?? 0}</td>
                <td>
                  {memberKind
                    ? (group?.member_ids.length ?? 0) + memberDelta
                    : `${group?.member_ids.length ?? 0} (không đổi)`}
                </td>
              </tr>
              <tr>
                <th scope="row">Số quyền của nhóm</th>
                <td>{group?.permissions.length ?? 0}</td>
                <td>
                  {memberKind
                    ? `${group?.permissions.length ?? 0} (không đổi)`
                    : (group?.permissions.length ?? 0) +
                      (kind === 'GRANT' ? codes.length : -codes.length)}
                </td>
              </tr>
            </tbody>
          </table>
        </DataTable>
        <div className="flex flex-wrap gap-2">
          <Pill tone={sensitive > 0 ? 'warn' : 'ok'}>
            {sensitive > 0 ? `${sensitive} quyền nhạy cảm` : '0 quyền nhạy cảm'}
          </Pill>
          <Pill tone="brass">Chưa áp dụng cho đến khi được duyệt</Pill>
        </div>
      </section>

      <section className="wizard-card" aria-labelledby="pf-reason">
        <h2 id="pf-reason">5 · Lý do và người duyệt</h2>
        <label>
          Lý do
          <input
            className={field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            autoComplete="off"
          />
        </label>
        <div className="wizard-note">
          <strong>Người duyệt hợp lệ: Admin có quyền duyệt thay đổi quyền</strong>
          <span>
            Người đề xuất không tự duyệt, kể cả khi thuộc nhiều nhóm quyền. Mỗi thành viên hoặc mỗi
            quyền được chọn là một đề xuất riêng cùng lý do.
          </span>
        </div>
      </section>

      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <div className="wizard-foot">
        <button type="button" onClick={() => router.push('/quan-tri/phan-quyen')}>
          Hủy
        </button>
        <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
          Gửi duyệt
        </button>
      </div>
    </form>
  );
}
