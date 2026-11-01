'use client';

import { useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import {
  PERMISSION_ACTIONS,
  PERMISSION_DOMAINS,
  PERMISSION_SOURCE_LABEL,
  SCOPE_LABEL,
  SPECIAL_PERMISSIONS,
  isOverridable,
  permissionLabel,
  permissionSource,
  type PermissionSource,
} from '../../lib/permission-model';
import { Pill } from './Pill';

const SOURCE_TONE: Record<Exclude<PermissionSource, 'none'>, 'ok' | 'brass' | 'danger'> = {
  group: 'ok',
  grant: 'brass',
  revoke: 'danger',
};

/** Dấu cho biết quyền đến từ nhóm, thêm riêng hay bỏ riêng. Quyền chưa tick và không thuộc nhóm thì không có dấu. */
function SourcePill({ source }: { readonly source: PermissionSource }) {
  if (source === 'none') return null;
  return <Pill tone={SOURCE_TONE[source]}>{PERMISSION_SOURCE_LABEL[source]}</Pill>;
}

function Cell({
  code,
  baseline,
  value,
  disabled,
  onToggle,
}: {
  readonly code: string;
  readonly baseline: ReadonlySet<string>;
  readonly value: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onToggle: (code: string) => void;
}) {
  const source = permissionSource(code, baseline, value);
  return (
    <label
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 py-1',
        source === 'grant' && 'bg-brass-soft',
        source === 'revoke' && 'bg-danger-soft',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-[var(--accent)]"
        checked={value.has(code)}
        disabled={disabled}
        onChange={() => onToggle(code)}
        aria-label={permissionLabel(code)}
      />
      <SourcePill source={source} />
    </label>
  );
}

/**
 * Cây quyền chi tiết (Figma N11): mỗi nghiệp vụ một khối, hàng là hành động, hai cột là phạm vi (hồ sơ của mình / mọi hồ sơ).
 * Ô đã tick sẵn là quyền kế thừa từ các nhóm đã chọn. Tick thêm = "Thêm riêng", bỏ tick quyền của nhóm = "Bỏ riêng".
 * Quyền quản trị phân quyền (đề xuất, duyệt) chỉ theo nhóm nên hiện cố định, không tick được ở đây.
 */
export function PermissionTree({
  baseline,
  value,
  onChange,
  disabled = false,
  groupOnly = [],
}: {
  /** Quyền (cấp/thu riêng được) mà các nhóm cho. */
  readonly baseline: ReadonlySet<string>;
  /** Tập quyền đang tick. */
  readonly value: ReadonlySet<string>;
  readonly onChange: (next: Set<string>) => void;
  readonly disabled?: boolean;
  /** Quyền quản trị phân quyền mà nhóm cho: chỉ hiển thị. */
  readonly groupOnly?: readonly string[];
}) {
  const toggle = (code: string) => {
    if (disabled || !isOverridable(code)) return;
    const next = new Set(value);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  };
  const setDomain = (domain: string, on: boolean) => {
    if (disabled) return;
    const next = new Set(value);
    for (const [action] of PERMISSION_ACTIONS)
      for (const scope of ['own', 'all'] as const) {
        const code = `${domain}.${action}.${scope}`;
        if (on) next.add(code);
        else next.delete(code);
      }
    onChange(next);
  };
  const specials = Object.keys(SPECIAL_PERMISSIONS).filter(isOverridable);
  // Mỗi nghiệp vụ gập lại cho gọn; lúc đầu chỉ mở những nghiệp vụ đã có quyền tick. Người dùng bấm thì theo người dùng.
  const initiallyOpen = useRef(
    new Set(
      PERMISSION_DOMAINS.map(([d]) => d).filter((d) =>
        [...value].some((c) => c.startsWith(`${d}.`)),
      ),
    ),
  );
  const [opened, setOpened] = useState<Readonly<Record<string, boolean>>>({});

  return (
    <div className="grid gap-4" role="group" aria-label="Cây quyền chi tiết theo nghiệp vụ">
      {PERMISSION_DOMAINS.map(([domain, title]) => {
        const codes = PERMISSION_ACTIONS.flatMap(([a]) =>
          (['own', 'all'] as const).map((s) => `${domain}.${a}.${s}`),
        );
        const ticked = codes.filter((c) => value.has(c)).length;
        return (
          <details
            key={domain}
            className="tree-domain grid gap-2 rounded-xl border border-line p-4"
            open={opened[domain] ?? initiallyOpen.current.has(domain)}
            onToggle={(e) => {
              const isOpen = e.currentTarget.open;
              setOpened((o) => (o[domain] === isOpen ? o : { ...o, [domain]: isOpen }));
            }}
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-1 font-serif text-base font-semibold">
              <span>{title}</span>
              <span className="font-sans text-sm font-normal text-muted">
                Đang có {ticked}/{codes.length} quyền
              </span>
            </summary>
            <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted">
              <span className="flex gap-3">
                <button
                  type="button"
                  className="btn-link"
                  disabled={disabled}
                  onClick={() => setDomain(domain, true)}
                >
                  Chọn hết
                </button>
                <button
                  type="button"
                  className="btn-link"
                  disabled={disabled}
                  onClick={() => setDomain(domain, false)}
                >
                  Bỏ hết
                </button>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="py-1 text-left font-semibold text-muted">
                      Hành động
                    </th>
                    <th scope="col" className="w-[30%] py-1 text-left font-semibold text-muted">
                      {SCOPE_LABEL.own}
                    </th>
                    <th scope="col" className="w-[30%] py-1 text-left font-semibold text-muted">
                      {SCOPE_LABEL.all}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_ACTIONS.map(([action, label]) => (
                    <tr key={action} className="border-t border-line">
                      <th scope="row" className="py-1 pr-2 text-left font-normal">
                        {label}
                      </th>
                      {(['own', 'all'] as const).map((scope) => (
                        <td key={scope} className="py-1">
                          <Cell
                            code={`${domain}.${action}.${scope}`}
                            baseline={baseline}
                            value={value}
                            disabled={disabled}
                            onToggle={toggle}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}

      <fieldset className="grid gap-2 rounded-xl border border-line p-4">
        <legend className="px-1 font-serif text-base font-semibold">
          Kho, tài liệu cũ, nhật ký
        </legend>
        <ul className="m-0 grid list-none gap-1 p-0">
          {specials.map((code) => (
            <li key={code}>
              <Cell
                code={code}
                baseline={baseline}
                value={value}
                disabled={disabled}
                onToggle={toggle}
              />
              <span className="pl-9 text-sm text-muted">{SPECIAL_PERMISSIONS[code]}</span>
            </li>
          ))}
        </ul>
      </fieldset>

      {groupOnly.length > 0 ? (
        <div
          className="grid gap-1 rounded-xl bg-surface-2 p-4 text-sm"
          aria-label="Quyền chỉ theo nhóm"
        >
          <strong>Quyền quản trị phân quyền (chỉ theo nhóm, không chỉnh riêng)</strong>
          <span className="flex flex-wrap gap-1.5">
            {groupOnly.map((c) => (
              <Pill key={c} tone="mute">
                {permissionLabel(c)}
              </Pill>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
