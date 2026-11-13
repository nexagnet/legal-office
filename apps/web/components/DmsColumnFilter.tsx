'use client';

import * as Popover from '@radix-ui/react-popover';
import { Funnel } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  COLUMN_FILTERS,
  colsToParam,
  parseCols,
  withCol,
  type ColField,
  type ColFilter,
  type ColFilters,
} from '../lib/dms-col-filters';
import { Button } from './ui/button';
import { Input, Select } from './ui/field';

/** Giá trị có đếm của một cột (ô "chọn nhiều"). Chỉ lấy tập hồ sơ đã ghi sổ của nghiệp vụ; chưa thu hẹp theo bộ lọc khác. */
function ChoiceList({
  officeId,
  domain,
  field,
  value,
  onChange,
}: {
  readonly officeId: string;
  readonly domain: string;
  readonly field: ColField;
  readonly value: readonly string[];
  readonly onChange: (v: string[]) => void;
}) {
  const [options, setOptions] = useState<{ value: string; n: number }[] | null>(null);
  const [term, setTerm] = useState('');
  useEffect(() => {
    const ctrl = new AbortController();
    const q = new URLSearchParams({ officeId, domain, status: 'RECORDED', key: field.key });
    if (term.trim()) q.set('term', term.trim());
    const timer = setTimeout(() => {
      fetch(`/api/dms/case-col-values?${q}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((v: { value: string; n: number }[]) => setOptions(v))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [officeId, domain, field.key, term]);
  const list = options ?? [];
  return (
    <div className="grid gap-1.5">
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Tìm trong danh sách"
        aria-label={`Tìm giá trị ${field.label}`}
      />
      <ul className="m-0 grid max-h-48 list-none gap-0.5 overflow-auto p-0">
        {options === null ? <li className="text-xs text-muted">Đang tải…</li> : null}
        {options !== null && list.length === 0 ? (
          <li className="text-xs text-muted">Không có giá trị.</li>
        ) : null}
        {list.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent-soft">
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value),
                  )
                }
              />
              <span className="min-w-0 flex-1 truncate" title={o.value}>
                {o.value}
              </span>
              <span className="text-xs text-muted">{o.n.toLocaleString('vi-VN')}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Phễu lọc trên tiêu đề một cột của danh sách: bấm mở popover đúng loại lọc của cột (chữ chứa, khoảng ngày, chọn nhiều,
 * có/không). Bộ lọc nằm trên URL (`cl`), nên chia sẻ và lưu bộ lọc được; áp dụng thì về trang 1.
 */
export function DmsColumnFilter({
  domain,
  officeId,
  columnId,
  head,
}: {
  readonly domain: string;
  readonly officeId: string;
  readonly columnId: string;
  readonly head: ReactNode;
}) {
  const fields = COLUMN_FILTERS[domain]?.[columnId];
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = parseCols(sp.get('cl') ?? undefined);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColFilters>(current);
  if (!fields) return <>{head}</>;
  const active = fields.some((f) => current[f.key] !== undefined);
  const set = (key: string, patch: Partial<ColFilter>) =>
    setDraft((d) => withCol(d, key, { ...(d[key] ?? {}), ...patch }));

  function go(next: ColFilters) {
    const params = new URLSearchParams(sp.toString());
    const v = colsToParam(next);
    if (v) params.set('cl', v);
    else params.delete('cl');
    params.delete('p');
    const qs = params.toString();
    setOpen(false);
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }
  function clearHere() {
    let next = current;
    for (const f of fields!) next = withCol(next, f.key, undefined);
    go(next);
  }

  return (
    <span className="group/h relative inline-block max-w-full">
      {head}
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          if (o) setDraft(current);
          setOpen(o);
        }}
      >
        <Popover.Trigger
          aria-label={`Lọc cột ${fields.map((f) => f.label).join(' / ')}`}
          data-active={active ? 'true' : undefined}
          className={
            active
              ? 'absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-surface text-accent shadow-sm outline-none ring-1 ring-line focus-visible:ring-2 focus-visible:ring-accent'
              : 'absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-surface text-muted opacity-0 shadow-sm outline-none ring-1 ring-line group-hover/h:opacity-100 hover:text-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:opacity-100'
          }
        >
          <Funnel size={11} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 grid w-72 gap-3 rounded-xl border border-line bg-surface p-3 text-left font-normal shadow-xl"
          >
            {fields.map((f, i) => {
              const d = draft[f.key];
              return (
                <div key={`${f.key}-${f.type}-${i}`} className="grid gap-1.5">
                  <span className="text-[13px] font-semibold">{f.label}</span>
                  {f.type === 'text' ? (
                    <Input
                      value={d?.c ?? ''}
                      onChange={(e) => set(f.key, { c: e.target.value })}
                      placeholder="Chứa chữ…"
                      aria-label={`${f.label} chứa`}
                    />
                  ) : null}
                  {f.type === 'date' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={d?.d?.from ?? ''}
                        aria-label={`${f.label} từ ngày`}
                        onChange={(e) =>
                          set(f.key, { d: { ...(d?.d ?? {}), from: e.target.value || undefined } })
                        }
                      />
                      <Input
                        type="date"
                        value={d?.d?.to ?? ''}
                        aria-label={`${f.label} đến ngày`}
                        onChange={(e) =>
                          set(f.key, { d: { ...(d?.d ?? {}), to: e.target.value || undefined } })
                        }
                      />
                    </div>
                  ) : null}
                  {f.type === 'choice' ? (
                    <ChoiceList
                      officeId={officeId}
                      domain={domain}
                      field={f}
                      value={d?.in ?? []}
                      onChange={(v) => set(f.key, { in: v.length > 0 ? v : undefined })}
                    />
                  ) : null}
                  {f.type === 'bool' ? (
                    <Select
                      value={d?.b === undefined ? '' : d.b ? '1' : '0'}
                      aria-label={`${f.label}: có hay không`}
                      onChange={(e) =>
                        set(f.key, {
                          b: e.target.value === '' ? undefined : e.target.value === '1',
                        })
                      }
                    >
                      <option value="">Tất cả</option>
                      <option value="1">Có</option>
                      <option value="0">Không</option>
                    </Select>
                  ) : null}
                </div>
              );
            })}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="secondary" onClick={clearHere}>
                Xóa lọc cột
              </Button>
              <Button type="button" onClick={() => go(draft)}>
                Áp dụng
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}
