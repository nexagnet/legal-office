'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import {
  isOverridable,
  isSensitivePermission,
  overridableBaseline,
  parsePermission,
  permissionMessage,
  summarizeGroup,
  type DmsGroup,
} from '../lib/permission-model';
import type { OfficeBranch } from '../lib/dms-admin';
import { PermissionTree } from './permissions/PermissionTree';
import { Pill } from './permissions/Pill';

const STEPS: readonly [string, string, string][] = [
  [
    '1 · Đã tạo tài khoản',
    'warn',
    'Ngay khi bấm gửi. Tài khoản chưa có quyền nào, chỉ có tư cách thành viên văn phòng.',
  ],
  [
    '2 · Đã áp dụng',
    'ok',
    'Admin áp dụng ngay các nhóm quyền đã chọn cùng quyền chi tiết đã tick, không cần ai duyệt. Mọi thay đổi ghi vào nhật ký phân quyền.',
  ],
  [
    '3 · Hoạt động',
    'ok',
    'Đăng nhập bằng link email. Quyền hiệu lực = quyền của các nhóm + quyền thêm riêng − quyền bỏ riêng.',
  ],
];

/** Hiệu lực dự kiến của việc xếp nhóm: tổng số quyền sau khi gộp, có quyền nhạy cảm không, có phạm vi rộng không. */
export function previewGroups(groups: readonly DmsGroup[]) {
  return previewCodes(groups.flatMap((g) => g.permissions));
}

/** Như previewGroups nhưng nhận thẳng danh sách mã quyền (đã gộp nhóm và chỉnh riêng). */
export function previewCodes(all: readonly string[]) {
  const codes = [...new Set(all)];
  return {
    total: codes.length,
    sensitive: codes.some(isSensitivePermission),
    wide: codes.some((c) => parsePermission(c)?.scope === 'all' || c.startsWith('dms.')),
  };
}

/**
 * Admin thêm thành viên (Figma Q2). Quyền chỉ theo nhóm quyền, không theo vai: tài khoản được tạo kèm tư cách thành viên
 * không quyền, rồi xếp vào các nhóm đã chọn. Admin áp dụng ngay; việc xếp nhóm vẫn nằm trong nhật ký phân quyền.
 */
export function AddMemberForm({
  officeId,
  groups,
  branches = [],
}: {
  readonly officeId: string;
  readonly groups: readonly DmsGroup[];
  readonly branches?: readonly OfficeBranch[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = useMemo(() => groups.filter((g) => picked.has(g.id)), [groups, picked]);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [branchPicked, setBranchPicked] = useState<ReadonlySet<string>>(new Set());
  const baseline = useMemo(
    () => overridableBaseline(chosen.flatMap((g) => g.permissions)),
    [chosen],
  );
  const groupOnly = useMemo(
    () => [...new Set(chosen.flatMap((g) => g.permissions).filter((c) => !isOverridable(c)))],
    [chosen],
  );
  // Quyền đang tick = nền của các nhóm + thêm riêng − bỏ riêng. Đổi nhóm thì nền đổi, các lựa chọn riêng giữ nguyên.
  const value = useMemo(() => {
    const out = new Set([...baseline, ...added]);
    for (const c of removed) out.delete(c);
    return out;
  }, [baseline, added, removed]);
  const customized = added.size > 0 || removed.size > 0;
  const preview = useMemo(() => previewCodes([...value, ...groupOnly]), [value, groupOnly]);

  const onTree = (next: Set<string>) => {
    const a = new Set(added);
    const r = new Set(removed);
    for (const c of next) {
      if (value.has(c)) continue;
      if (baseline.has(c)) r.delete(c);
      else a.add(c);
    }
    for (const c of value) {
      if (next.has(c)) continue;
      if (baseline.has(c)) r.add(c);
      else a.delete(c);
    }
    setAdded(a);
    setRemoved(r);
  };
  const toggleBranch = (id: string) =>
    setBranchPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          email: String(f.get('email') ?? '').trim(),
          fullName: String(f.get('fullName') ?? '').trim(),
          groupIds: chosen.map((g) => g.id),
          ...(customized ? { permissions: [...value] } : {}),
          ...(branchPicked.size > 0 ? { branchIds: [...branchPicked] } : {}),
          reason: String(f.get('reason') ?? '').trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
      if (!res.ok) return setError(permissionMessage(json.code));
      router.push(
        json.label ? `/quan-tri/phan-quyen/nguoi-dung/${json.label}` : '/quan-tri/nhan-su',
      );
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="member-form" onSubmit={submit} aria-label="Thêm thành viên">
      <div className="mf-col">
        <section className="mf-main" aria-labelledby="mf-info">
          <h2 id="mf-info">1 · Thông tin cơ bản</h2>
          <label>
            Họ và tên
            <input name="fullName" required maxLength={200} autoComplete="off" />
          </label>
          <label>
            Email đăng nhập
            <input name="email" type="email" required maxLength={254} autoComplete="off" />
            <small>
              Người dùng bấm link trong email để đăng nhập, không ai biết mật khẩu của họ.
            </small>
          </label>
        </section>

        <section className="mf-main" aria-labelledby="mf-groups">
          <h2 id="mf-groups">2 · Nhóm quyền</h2>
          {groups.length === 0 ? (
            <p className="muted">
              Văn phòng chưa có nhóm quyền nào. Có thể tạo tài khoản trước và xếp nhóm sau ở{' '}
              <Link href="/quan-tri/phan-quyen?tab=nhom">Phân quyền</Link>.
            </p>
          ) : (
            <ul className="mf-groups">
              {groups.map((g) => (
                <li key={g.id}>
                  <label className="mf-group">
                    <input
                      type="checkbox"
                      checked={picked.has(g.id)}
                      onChange={() => toggle(g.id)}
                    />
                    <span>
                      <strong>{g.name}</strong>
                      <small>
                        {summarizeGroup(g)} · {g.permissions.length} quyền
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mf-main" aria-labelledby="mf-tree">
          <h2 id="mf-tree">3 · Quyền chi tiết (tùy chọn)</h2>
          <p className="muted">
            Quyền của các nhóm đã chọn được tick sẵn. Tick thêm hoặc bỏ tick từng quyền để chỉ áp
            dụng cho riêng tài khoản này; nhóm quyền không bị đổi.
          </p>
          <PermissionTree
            baseline={baseline}
            value={value}
            onChange={onTree}
            groupOnly={groupOnly}
          />
          {customized ? (
            <p role="status" className="callout">
              <strong>Đã chỉnh riêng</strong>
              Thêm riêng {added.size} quyền, bỏ riêng {removed.size} quyền so với nhóm.{' '}
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setAdded(new Set());
                  setRemoved(new Set());
                }}
              >
                Quay về đúng theo nhóm
              </button>
            </p>
          ) : null}
        </section>

        {branches.length > 0 ? (
          <section className="mf-main" aria-labelledby="mf-branches">
            <h2 id="mf-branches">4 · Chi nhánh được xem</h2>
            <p className="muted">
              Người này chỉ thấy hồ sơ và sổ của các chi nhánh được chọn. Không chọn thì chưa thấy
              hồ sơ chi nhánh nào; có thể cấp sau ở trang quyền hiệu lực của người đó.
            </p>
            <ul className="mf-groups">
              {branches.map((b) => (
                <li key={b.id}>
                  <label className="mf-group">
                    <input
                      type="checkbox"
                      checked={branchPicked.has(b.id)}
                      onChange={() => toggleBranch(b.id)}
                    />
                    <span>
                      <strong>{b.name}</strong>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mf-main" aria-labelledby="mf-preview">
          <h2 id="mf-preview">{branches.length > 0 ? '5' : '4'} · Xem trước và lý do</h2>
          <div className="mf-preview" aria-live="polite">
            <strong>Quyền hiệu lực sau khi gửi</strong>
            <span>
              {chosen.length === 0 && !customized
                ? 'Chưa chọn nhóm nào: tài khoản vào được hệ thống nhưng chưa có quyền nào.'
                : `${preview.total} quyền${chosen.length > 0 ? ` từ ${chosen.length} nhóm: ${chosen.map((g) => g.name).join(', ')}` : ''}${customized ? `; chỉnh riêng +${added.size} / −${removed.size}` : ''}.`}
            </span>
          </div>
          <div className="mf-pills">
            <Pill tone={preview.sensitive ? 'warn' : 'ok'}>
              Quyền nhạy cảm: {preview.sensitive ? 'có' : 'không'}
            </Pill>
            <Pill tone={preview.wide ? 'warn' : 'ok'}>
              Phạm vi rộng: {preview.wide ? 'có' : 'không'}
            </Pill>
          </div>
          <label>
            Lý do
            <input name="reason" required maxLength={1000} />
          </label>
        </section>

        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <div className="mf-actions">
          <Link className="btn-link" href="/quan-tri/nhan-su">
            Hủy
          </Link>
          <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
            Tạo tài khoản và áp dụng quyền
          </button>
        </div>
      </div>

      <aside className="mf-side">
        <section className="side-card">
          <h2>Điều gì xảy ra sau khi gửi</h2>
          <ul className="mf-flow">
            {STEPS.map(([title, tone, text]) => (
              <li key={title}>
                <Pill tone={tone === 'ok' ? 'ok' : 'warn'}>{title}</Pill>
                <small>{text}</small>
              </li>
            ))}
          </ul>
        </section>
        <p className="callout">
          <strong>Không có vai trò</strong>
          Quyền của mỗi người = quyền của các nhóm + quyền thêm riêng − quyền bỏ riêng. Quyền đề
          xuất, duyệt thay đổi quyền chỉ theo nhóm. Đổi nhóm hay quyền riêng sau này làm ở mục Phân
          quyền.
        </p>
      </aside>
    </form>
  );
}
