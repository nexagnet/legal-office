'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { postJson } from '../../lib/post-json';
import {
  PERMISSION_ACTIONS,
  PERMISSION_DOMAINS,
  SCOPE_LABEL,
  SPECIAL_PERMISSIONS,
  groupPermissionSections,
  groupVersion,
  isGroupActive,
  isOverridable,
  isSensitivePermission,
  permissionLabel,
  permissionMessage,
  type DmsGroup,
} from '../../lib/permission-model';
import { Pill } from './Pill';

type Step = 1 | 2 | 3;
const STEPS: readonly (readonly [Step, string])[] = [
  [1, 'Nguồn & tên'],
  [2, 'Quyền và phạm vi'],
  [3, 'Xem trước & gửi duyệt'],
];

/** Ba nhóm tab quyền: nghiệp vụ hồ sơ, văn thư, quản trị khác. Mỗi nghiệp vụ là một tab con. */
const TABS: readonly (readonly [string, string, readonly string[]])[] = [
  ['ho-so', 'Hồ sơ nghiệp vụ', ['vibang', 'tongdat', 'xacminh', 'tochuc']],
  ['van-thu', 'Văn thư', ['vtden', 'vtdi', 'vtnb']],
  ['quan-tri', 'Quản trị', []],
];

/** Quyền quản trị phân quyền chỉ theo nhóm mẫu của hệ thống: không chép, không chọn trong nhóm tùy chỉnh. */
const RESERVED = Object.keys(SPECIAL_PERMISSIONS).filter((c) => !isOverridable(c));
const ADMIN_CODES = Object.keys(SPECIAL_PERMISSIONS).filter(isOverridable);

const domainName = (d: string) => PERMISSION_DOMAINS.find(([k]) => k === d)?.[1] ?? d;
const toggled = (set: ReadonlySet<string>, code: string, on: boolean): Set<string> => {
  const next = new Set(set);
  if (on) next.add(code);
  else next.delete(code);
  return next;
};

/**
 * "Tạo nhóm quyền" (Figma P4/P5). Ba bước: nguồn & tên → quyền và phạm vi → xem trước & gửi duyệt.
 * Nhóm tạo ra là nhóm trống chưa có thành viên; sao chép đi qua API sao chép; phần quyền khác nguồn đi qua đề xuất có duyệt
 * (người đề xuất không tự duyệt). Việc "Lưu nháp" chưa có ở máy chủ nên không có nút giả.
 */
export function GroupWizard({
  officeId,
  groups,
}: {
  readonly officeId: string;
  readonly groups: readonly DmsGroup[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [tab, setTab] = useState('ho-so');
  const [domain, setDomain] = useState('vibang');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sources = useMemo(() => groups.filter(isGroupActive), [groups]);
  const source = sources.find((g) => g.id === sourceId);
  const copied = useMemo(
    () => (source ? source.permissions.filter((c) => !RESERVED.includes(c)) : []),
    [source],
  );
  const skipped = source ? source.permissions.length - copied.length : 0;

  function chooseSource(id: string) {
    setSourceId(id);
    const g = sources.find((x) => x.id === id);
    setPicked(new Set(g ? g.permissions.filter((c) => !RESERVED.includes(c)) : []));
  }

  const nameTaken = groups.some((g) => g.name.trim() === name.trim());
  const nameError = name.trim() === '' ? 'Hãy đặt tên nhóm.' : nameTaken ? 'Tên nhóm đã có.' : null;
  const added = [...picked].filter((c) => !copied.includes(c));
  const removed = copied.filter((c) => !picked.has(c));
  const sensitive = [...picked].filter(isSensitivePermission);
  const wide = sensitive.filter((c) => c.endsWith('.all'));

  function next() {
    if (step === 1 && nameError) return setError(nameError);
    setError(null);
    setStep((s) => (s === 3 ? 3 : ((s + 1) as Step)));
  }

  async function submit() {
    if (added.length + removed.length > 0 && !reason.trim())
      return setError(permissionMessage('REASON_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      const made = source
        ? await postJson(`/dms/groups/${source.id}/copy`, { name: name.trim() })
        : await postJson('/dms/groups', { officeId, name: name.trim() });
      if (!made.ok || !made.label) return setError(permissionMessage(made.code));
      const groupId = made.label;
      const changes = [
        ...added.map((permission) => ({ kind: 'GRANT', permission })),
        ...removed.map((permission) => ({ kind: 'REVOKE', permission })),
      ];
      for (const c of changes) {
        const r = await postJson(`/dms/groups/${groupId}/requests`, {
          ...c,
          reason: reason.trim(),
        });
        if (!r.ok) {
          setError(
            `Nhóm đã tạo nhưng đề xuất "${permissionLabel(c.permission)}" lỗi: ${permissionMessage(r.code)}`,
          );
          return;
        }
      }
      router.push(`/quan-tri/phan-quyen/nhom/${groupId}`);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const tabDomains = TABS.find(([k]) => k === tab)?.[2] ?? [];
  const activeDomain = tabDomains.includes(domain) ? domain : (tabDomains[0] ?? '');
  const countIn = (d: string) => [...picked].filter((c) => c.startsWith(`${d}.`)).length;

  return (
    <div className="wizard">
      <ol className="wizard-steps" aria-label="Các bước tạo nhóm">
        {STEPS.map(([n, label]) => (
          <li
            key={n}
            aria-current={step === n ? 'step' : undefined}
            data-done={step > n || undefined}
          >
            <span aria-hidden="true">{step > n ? '✓' : n}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <>
          <section className="wizard-card">
            <h2>Thông tin nhóm</h2>
            <label>
              Tên nhóm
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                autoComplete="off"
              />
            </label>
            <p className="muted">
              Tên hiển thị cho người dùng. Không dùng để suy ra quyền ký pháp lý.
            </p>
          </section>
          <section className="wizard-card">
            <h2>Bắt đầu từ đâu</h2>
            <div className="wizard-options" role="radiogroup" aria-label="Bắt đầu từ đâu">
              <label className="option-card" data-selected={sourceId === '' || undefined}>
                <input
                  type="radio"
                  name="source"
                  checked={sourceId === ''}
                  onChange={() => chooseSource('')}
                />
                <span>
                  <strong>Nhóm trống</strong>
                  <small>Tự chọn từng quyền</small>
                </span>
              </label>
              {sources.map((g) => (
                <label
                  key={g.id}
                  className="option-card"
                  data-selected={sourceId === g.id || undefined}
                >
                  <input
                    type="radio"
                    name="source"
                    checked={sourceId === g.id}
                    onChange={() => chooseSource(g.id)}
                  />
                  <span>
                    <strong>Sao chép: {g.name}</strong>
                    <small>
                      {g.kind === 'TEMPLATE' ? 'Mẫu' : 'Tùy chỉnh'} · v{groupVersion(g)} ·{' '}
                      {g.permissions.length} quyền
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </section>
          {source ? (
            <section className="wizard-card">
              <h2>
                Kết quả sao chép từ “{source.name}” · v{groupVersion(source)}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Pill tone="ok">Sao chép {copied.length} quyền</Pill>
                {skipped > 0 ? (
                  <Pill tone="info">Không sao chép {skipped} quyền dành riêng</Pill>
                ) : null}
              </div>
              <p className="muted">
                Quyền dành riêng (duyệt sửa đổi, duyệt đổi quyền, quản trị người dùng và nhóm quyền)
                không bao giờ được sao chép sang nhóm tùy chỉnh. Nhóm mới chưa có thành viên.
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <div className="wizard-split">
          <section className="wizard-card">
            <div className="chip-row" role="tablist" aria-label="Nhóm quyền">
              {TABS.map(([k, label, ds]) => (
                <button
                  key={k}
                  type="button"
                  className="chip"
                  aria-pressed={tab === k}
                  onClick={() => {
                    setTab(k);
                    if (ds[0]) setDomain(ds[0]);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {tabDomains.length > 1 ? (
              <div className="chip-row" aria-label="Nghiệp vụ">
                <span className="muted">Nghiệp vụ:</span>
                {tabDomains.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="chip"
                    aria-pressed={activeDomain === d}
                    onClick={() => setDomain(d)}
                  >
                    {domainName(d)}
                    {countIn(d) > 0 ? ` · ${countIn(d)}` : ''}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="wizard-actions-head" aria-hidden="true">
              <span>Hành động</span>
              <span>Bật</span>
              <span>Phạm vi</span>
              <span>Ghi chú</span>
            </div>
            {tab === 'quan-tri'
              ? ADMIN_CODES.map((code) => (
                  <div className="wizard-row" key={code}>
                    <span>{SPECIAL_PERMISSIONS[code]}</span>
                    <input
                      type="checkbox"
                      aria-label={SPECIAL_PERMISSIONS[code]}
                      checked={picked.has(code)}
                      onChange={(e) => setPicked(toggled(picked, code, e.target.checked))}
                    />
                    <span>—</span>
                    <span>
                      {isSensitivePermission(code) ? <Pill tone="warn">Nhạy cảm</Pill> : null}
                    </span>
                  </div>
                ))
              : PERMISSION_ACTIONS.map(([action, label]) => {
                  const own = `${activeDomain}.${action}.own`;
                  const all = `${activeDomain}.${action}.all`;
                  const on = picked.has(own) || picked.has(all);
                  const scope = picked.has(all) ? 'all' : 'own';
                  const set = (nextScope: 'own' | 'all') => {
                    const cleared = toggled(toggled(picked, own, false), all, false);
                    setPicked(toggled(cleared, nextScope === 'all' ? all : own, true));
                  };
                  return (
                    <div className="wizard-row" key={action}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        aria-label={`${label} · ${domainName(activeDomain)}`}
                        checked={on}
                        onChange={(e) =>
                          setPicked(
                            e.target.checked
                              ? toggled(picked, own, true)
                              : toggled(toggled(picked, own, false), all, false),
                          )
                        }
                      />
                      <select
                        aria-label={`Phạm vi: ${label}`}
                        value={scope}
                        disabled={!on}
                        onChange={(e) => set(e.target.value === 'all' ? 'all' : 'own')}
                      >
                        <option value="own">{SCOPE_LABEL.own}</option>
                        <option value="all">{SCOPE_LABEL.all}</option>
                      </select>
                      <span>
                        {isSensitivePermission(own) ? <Pill tone="warn">Nhạy cảm</Pill> : null}
                      </span>
                    </div>
                  );
                })}
          </section>
          <aside className="wizard-card" aria-label="Xem trước nhóm">
            <h2>Xem trước nhóm</h2>
            <Pill tone="mute">Bản nháp · chưa gửi</Pill>
            <p>
              <strong>{picked.size} quyền đã chọn</strong>
            </p>
            <p className="muted">
              {PERMISSION_DOMAINS.filter(([d]) => countIn(d) > 0)
                .map(([d, l]) => `${l} ${countIn(d)}`)
                .join(' · ') || 'Chưa chọn quyền nào'}
            </p>
            {sensitive.length > 0 ? (
              <div className="wizard-note" data-tone="warn">
                <strong>Cảnh báo ({sensitive.length})</strong>
                <span>
                  {sensitive.length} quyền nhạy cảm
                  {wide.length > 0 ? `, trong đó ${wide.length} quyền phạm vi toàn văn phòng` : ''}.
                  Cần lý do rõ khi gửi duyệt.
                </span>
              </div>
            ) : null}
            <div className="wizard-note">
              <strong>Không thể chọn</strong>
              <span>
                Duyệt sửa đổi, duyệt đổi quyền, quản trị người dùng và nhóm quyền: quyền dành riêng.
                Tư cách hành nghề không phải quyền.
              </span>
            </div>
          </aside>
        </div>
      ) : null}

      {step === 3 ? (
        <>
          <section className="wizard-card">
            <h2>
              Xem trước “{name.trim()}”{source ? ` · sao chép từ ${source.name}` : ''}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Pill tone="info">{picked.size} quyền</Pill>
              {source ? <Pill tone="ok">Thêm {added.length}</Pill> : null}
              {source ? <Pill tone="warn">Bỏ {removed.length}</Pill> : null}
              {sensitive.length > 0 ? (
                <Pill tone="warn">{sensitive.length} quyền nhạy cảm</Pill>
              ) : null}
              <Pill tone="mute">Chưa có thành viên</Pill>
            </div>
            {groupPermissionSections([...picked]).map((s) => (
              <div key={s.title} className="group-perms-sec">
                <h3>{s.title}</h3>
                <ul>
                  {s.items.map((i) => (
                    <li key={i.code}>
                      <span>{i.action}</span>
                      <span>{i.scope ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {picked.size === 0 ? <p className="muted">Nhóm trống: chưa cấp quyền nào.</p> : null}
          </section>
          <section className="wizard-card">
            <h2>Lý do và người duyệt</h2>
            <label>
              Lý do
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                autoComplete="off"
              />
            </label>
            <div className="wizard-note">
              <strong>Người duyệt hợp lệ: Admin có quyền duyệt thay đổi quyền</strong>
              <span>
                Người đề xuất không tự duyệt, kể cả khi thuộc nhiều nhóm quyền. Admin tự đề xuất thì
                có hiệu lực ngay và được ghi nhật ký. Mỗi quyền thêm hoặc bỏ so với nguồn là một đề
                xuất.
              </span>
            </div>
          </section>
        </>
      ) : null}

      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <div className="wizard-foot">
        <button
          type="button"
          onClick={() =>
            step === 1
              ? router.push('/quan-tri/phan-quyen?tab=nhom')
              : setStep((s) => (s === 3 ? 2 : 1))
          }
        >
          {step === 1 ? 'Hủy' : '‹ Quay lại'}
        </button>
        {step < 3 ? (
          <button type="button" className="primary" onClick={next}>
            {step === 1 ? 'Tiếp tục: chọn quyền ›' : 'Tiếp: xem trước ›'}
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={busy}
            aria-busy={busy}
            onClick={submit}
          >
            Gửi duyệt
          </button>
        )}
      </div>
    </div>
  );
}
