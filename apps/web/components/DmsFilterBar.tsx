import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DmsFacetCounts } from '../lib/dms-browse';
import { DMS_PERIODS, type DmsDateRange } from '../lib/dms-date-range';
import { viewHref, type DmsView } from '../lib/dms-filter-params';
import type { DmsFilter } from '../lib/dms';
import { Button } from './ui/button';

/**
 * Hàng lọc mới của danh sách 4 nghiệp vụ (Figma DMS v2, trang "01 · Vi bằng": 511:450, 512:469, 512:759).
 * Hàng chính chỉ có Thời gian, Thừa hành viên, "Bộ lọc khác (n)"; bộ lọc đang bật hiện thành chip có nút ×.
 * Mọi ô nằm trong MỘT form GET và các ô mở ra là <details> nên không cần JavaScript; thanh địa chỉ là nguồn sự thật
 * (xem `DmsView` trong lib/dms-filter-params.ts), nên bộ lọc đã lưu và nút Xuất Excel sau này dùng lại đúng chuỗi đó.
 */

/** Nhãn của bộ lọc "Việc còn dở" theo nghiệp vụ (cùng luật với thẻ số: dms_domain_pending_counts). Vi bằng không có. */
export const OPEN_LABEL: Readonly<Record<string, string>> = {
  tongdat: 'Chưa tống đạt',
  xacminh: 'Chưa có kết quả',
  tochuc: 'Chưa có biên bản N-08',
};

const shortLocal = (v: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : v;
};

interface Option {
  readonly value: string;
  readonly label: string;
  readonly n: number;
}
/** Mục không có giá trị (vd "(chưa gán)") không lọc được và trùng giá trị rỗng của ô chọn, nên bỏ; giá trị đang chọn mà hết hồ sơ vẫn giữ lại. */
function selectOptions(list: readonly Option[], now?: string): ReactNode {
  const real = list.filter((o) => o.value !== '');
  const rows =
    !now || real.some((o) => o.value === now) ? real : [...real, { value: now, label: now, n: 0 }];
  return rows.map((o) => (
    <option key={o.value} value={o.value}>
      {o.label} ({o.n.toLocaleString('vi-VN')})
    </option>
  ));
}

/** Số bộ lọc đang bật trong ngăn "Bộ lọc khác". */
export function otherFilterCount(v: DmsView, domain: string, recordedView: boolean): number {
  let n = 0;
  if (v.creator) n += 1;
  if (v.kind) n += 1;
  if (v.branch) n += 1;
  if (recordedView) {
    if (v.filter === 'thieu-scan' || v.filter === 'du-scan') n += 1;
    if (v.returned !== undefined && domain === 'vibang') n += 1;
    if (v.open !== undefined && domain in OPEN_LABEL) n += 1;
  }
  return n;
}

export interface DmsFilterFieldsProps {
  readonly view: DmsView;
  readonly range: DmsDateRange;
  readonly facets: DmsFacetCounts;
  readonly domain: string;
  readonly year: number;
  readonly years: readonly number[];
  readonly yearChosen: boolean;
  /** Danh sách chính thức (không phải nháp / đã hủy): mới có lọc scan, việc còn dở, đã trả. */
  readonly recordedView: boolean;
  readonly children?: ReactNode;
}

/** Các ô lọc nằm TRONG form GET (sau ô tìm). `children` là Bộ lọc đã lưu. */
export function DmsFilterFields({
  view,
  range,
  facets,
  domain,
  year,
  years,
  yearChosen,
  recordedView,
  children,
}: DmsFilterFieldsProps) {
  const periodLabel = DMS_PERIODS.find((p) => p.key === range.ky)?.label;
  const timeText = periodLabel
    ? periodLabel
    : range.tu || range.den
      ? `${range.tu ? shortLocal(range.tu) : '…'} → ${range.den ? shortLocal(range.den) : '…'}`
      : `Năm ${year}`;
  const timeActive = Boolean(range.ky || range.tu || range.den || yearChosen);
  const thvNames = new Map(facets.thv.map((o) => [o.value, o.label]));
  const thvSelected = view.thv ?? [];
  const thvText =
    thvSelected.length === 0
      ? 'Thừa hành viên'
      : thvSelected.length === 1
        ? `Thừa hành viên: ${thvNames.get(thvSelected[0]!) ?? 'đã chọn'}`
        : `Thừa hành viên (${thvSelected.length})`;
  const otherN = otherFilterCount(view, domain, recordedView);
  const openLabel = OPEN_LABEL[domain];
  const scanValue =
    view.filter === 'thieu-scan' || view.filter === 'du-scan' ? view.filter : 'chinh-thuc';
  const thvOptions = facets.thv.filter((o) => o.value !== '');
  return (
    <>
      <details name="dms-filter-pop" className="dms-pop" data-active={timeActive || undefined}>
        <summary>
          <span>Thời gian: {timeText}</span>
        </summary>
        <div className="dms-pop-body" role="group" aria-label="Thời gian ghi sổ">
          <p className="dms-pop-title">Thời gian ghi sổ (giờ Việt Nam)</p>
          <fieldset className="dms-period">
            <legend className="sr-only">Mốc nhanh</legend>
            <label>
              <input type="radio" name="ky" value="" defaultChecked={!range.ky} />
              <span>Tùy chọn</span>
            </label>
            {DMS_PERIODS.map((p) => (
              <label key={p.key}>
                <input type="radio" name="ky" value={p.key} defaultChecked={range.ky === p.key} />
                <span>{p.label}</span>
              </label>
            ))}
          </fieldset>
          <div className="dms-pop-row">
            <label className="dms-datetime">
              <span>Từ</span>
              <input
                type="datetime-local"
                name="tu"
                defaultValue={range.tu ?? ''}
                min="2000-01-01T00:00"
                max="2100-12-31T23:59"
                aria-label="Từ ngày giờ"
                title="Từ ngày giờ ghi sổ (giờ Việt Nam)"
              />
            </label>
            <label className="dms-datetime">
              <span>Đến</span>
              <input
                type="datetime-local"
                name="den"
                defaultValue={range.den ?? ''}
                min="2000-01-01T00:00"
                max="2100-12-31T23:59"
                aria-label="Đến ngày giờ"
                title="Đến hết phút này, theo giờ ghi sổ (giờ Việt Nam)"
              />
            </label>
            <label>
              <span className="sr-only">Năm</span>
              <select name="year" defaultValue={year} className="dms-select" style={{ width: 96 }}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    Năm {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="dms-pop-hint">
            Chọn mốc nhanh hoặc khoảng Từ/Đến thì ô “Năm” không áp dụng. Mốc nhanh lưu dạng tương
            đối: bộ lọc đã lưu “Tháng này” mở tháng sau vẫn là tháng này. Tuần tính từ thứ Hai.
          </p>
          <div className="dms-pop-foot">
            <Button type="submit" variant="primary">
              Áp dụng
            </Button>
          </div>
        </div>
      </details>
      {thvOptions.length > 0 || thvSelected.length > 0 ? (
        <details
          name="dms-filter-pop"
          className="dms-pop"
          data-active={thvSelected.length > 0 || undefined}
        >
          <summary>
            <span>{thvText}</span>
          </summary>
          <div className="dms-pop-body dms-pop-narrow" role="group" aria-label="Thừa hành viên">
            <p className="dms-pop-title">Thừa hành viên (chọn được nhiều người)</p>
            <ul className="dms-checklist">
              {thvOptions.map((o) => (
                <li key={o.value}>
                  <label>
                    <input
                      type="checkbox"
                      name="thv"
                      value={o.value}
                      defaultChecked={thvSelected.includes(o.value)}
                    />
                    <span>
                      {o.label} ({o.n.toLocaleString('vi-VN')})
                    </span>
                  </label>
                </li>
              ))}
              {thvSelected
                .filter((id) => !thvOptions.some((o) => o.value === id))
                .map((id) => (
                  <li key={id}>
                    <label>
                      <input type="checkbox" name="thv" value={id} defaultChecked />
                      <span>Đã chọn (0)</span>
                    </label>
                  </li>
                ))}
            </ul>
            <div className="dms-pop-foot">
              <Button type="submit" variant="primary">
                Áp dụng
              </Button>
            </div>
          </div>
        </details>
      ) : null}
      <details
        name="dms-filter-pop"
        className="dms-pop dms-pop-wide"
        data-active={otherN > 0 || undefined}
      >
        <summary>
          <span>Bộ lọc khác{otherN > 0 ? ` (${otherN})` : ''}</span>
        </summary>
        <div className="dms-pop-body" role="group" aria-label="Bộ lọc khác">
          <p className="dms-pop-title">Bộ lọc khác</p>
          <div className="dms-pop-cols">
            <div>
              {recordedView ? (
                <label className="dms-field">
                  <span>Tình trạng scan</span>
                  <select name="loc" defaultValue={scanValue} className="dms-select">
                    <option value="chinh-thuc">Tất cả</option>
                    <option value="thieu-scan">Thiếu scan</option>
                    <option value="du-scan">Đủ scan</option>
                  </select>
                </label>
              ) : null}
              {recordedView && domain === 'vibang' ? (
                <label className="dms-field">
                  <span>Đã trả kết quả</span>
                  <select
                    name="tra"
                    defaultValue={view.returned === undefined ? '' : view.returned ? '1' : '0'}
                    className="dms-select"
                  >
                    <option value="">Tất cả</option>
                    <option value="1">Đã trả</option>
                    <option value="0">Chưa trả</option>
                  </select>
                </label>
              ) : null}
              <label className="dms-field">
                <span>Loại tài liệu</span>
                <select name="lt" defaultValue={view.kind ?? ''} className="dms-select">
                  <option value="">Tất cả loại</option>
                  {selectOptions(facets.kind, view.kind)}
                </select>
              </label>
            </div>
            <div>
              {recordedView && openLabel ? (
                <label className="dms-field">
                  <span>Việc còn dở</span>
                  <select
                    name="mo"
                    defaultValue={view.open === undefined ? '' : view.open ? '1' : '0'}
                    className="dms-select"
                  >
                    <option value="">Tất cả</option>
                    <option value="1">{openLabel}</option>
                    <option value="0">Đã xong</option>
                  </select>
                </label>
              ) : null}
              <label className="dms-field">
                <span>Đơn vị</span>
                <select name="dv" defaultValue={view.branch ?? ''} className="dms-select">
                  <option value="">Tất cả đơn vị bạn được xem</option>
                  {selectOptions(facets.branch, view.branch)}
                </select>
              </label>
              <label className="dms-field">
                <span>Người tạo</span>
                <select name="nt" defaultValue={view.creator ?? ''} className="dms-select">
                  <option value="">Tất cả</option>
                  {selectOptions(facets.creator, view.creator)}
                </select>
              </label>
            </div>
          </div>
          <div className="dms-pop-foot">
            <Button type="submit" variant="primary">
              Áp dụng
            </Button>
          </div>
        </div>
      </details>
      {children}
    </>
  );
}

export interface DmsActiveChipsProps {
  readonly base: string;
  readonly view: DmsView;
  readonly range: DmsDateRange;
  readonly facets: DmsFacetCounts;
  readonly domain: string;
  readonly yearChosen: boolean;
  readonly year: number;
  readonly recordedView: boolean;
  /** "128" hoặc "10.000+": số hồ sơ khớp (cũng là số dòng xuất Excel sau này). */
  readonly matchText: string;
}

/** Hàng chip "Đang lọc": mỗi bộ lọc đang bật là một chip có ×, kèm "Xóa tất cả" và số hồ sơ khớp. Không có bộ lọc thì không vẽ. */
export function DmsActiveChips({
  base,
  view,
  range,
  facets,
  domain,
  yearChosen,
  year,
  recordedView,
  matchText,
}: DmsActiveChipsProps) {
  const chips: { key: string; text: string; href: string }[] = [];
  const without = (patch: Partial<DmsView>, drop: readonly string[] = []) =>
    viewHref(base, { ...view, ...patch }, { drop });
  const period = DMS_PERIODS.find((p) => p.key === range.ky);
  if (range.ky || range.tu || range.den) {
    const span = `${range.tu ? shortLocal(range.tu) : '…'} → ${range.den ? shortLocal(range.den) : '…'}`;
    chips.push({
      key: 'time',
      text: `Ghi sổ: ${period ? `${period.label} (${span})` : span}`,
      href: without({ tu: undefined, den: undefined, ky: undefined }, ['ky', 'tu', 'den']),
    });
  } else if (yearChosen) {
    chips.push({ key: 'year', text: `Năm ${year}`, href: without({ year: undefined }, ['year']) });
  }
  const names = new Map(facets.thv.map((o) => [o.value, o.label]));
  for (const id of view.thv ?? [])
    chips.push({
      key: `thv-${id}`,
      text: `THV: ${names.get(id) ?? 'đã chọn'}`,
      href: without({ thv: (view.thv ?? []).filter((x) => x !== id) }),
    });
  if (recordedView && (view.filter === 'thieu-scan' || view.filter === 'du-scan'))
    chips.push({
      key: 'scan',
      text: `Tình trạng scan: ${view.filter === 'thieu-scan' ? 'Thiếu scan' : 'Đủ scan'}`,
      href: without({ filter: 'chinh-thuc' }),
    });
  if (recordedView && view.open !== undefined && OPEN_LABEL[domain])
    chips.push({
      key: 'open',
      text: `Việc còn dở: ${view.open ? OPEN_LABEL[domain] : 'Đã xong'}`,
      href: without({ open: undefined }),
    });
  if (recordedView && view.returned !== undefined && domain === 'vibang')
    chips.push({
      key: 'returned',
      text: `Đã trả kết quả: ${view.returned ? 'Đã trả' : 'Chưa trả'}`,
      href: without({ returned: undefined }),
    });
  const labelOf = (list: DmsFacetCounts['kind'], v: string) =>
    list.find((o) => o.value === v)?.label ?? v;
  if (view.branch)
    chips.push({
      key: 'dv',
      text: `Đơn vị: ${labelOf(facets.branch, view.branch)}`,
      href: without({ branch: undefined }),
    });
  if (view.creator)
    chips.push({
      key: 'nt',
      text: `Người tạo: ${labelOf(facets.creator, view.creator)}`,
      href: without({ creator: undefined }),
    });
  if (view.kind)
    chips.push({ key: 'lt', text: `Loại: ${view.kind}`, href: without({ kind: undefined }) });
  if (chips.length === 0) return null;
  const tab: DmsFilter =
    view.filter === 'nhap' || view.filter === 'da-huy' ? view.filter : 'chinh-thuc';
  return (
    <div className="dms-chips" role="group" aria-label="Đang lọc">
      <span className="dms-chips-label">Đang lọc:</span>
      {chips.map((c) => (
        <Link key={c.key} href={c.href} className="dms-chip" aria-label={`Bỏ bộ lọc ${c.text}`}>
          <span>{c.text}</span>
          <span aria-hidden="true">×</span>
        </Link>
      ))}
      <Link href={viewHref(base, { filter: tab, q: view.q })} className="dms-scan-link">
        Xóa tất cả
      </Link>
      <span className="dms-chips-count" role="status">
        <strong>{matchText}</strong> hồ sơ khớp
      </span>
    </div>
  );
}
