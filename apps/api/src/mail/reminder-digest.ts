import { DOMAIN_LABEL, VN_DATE, type Digest } from '../reminders/digest';
import { card, escapeHtml, heading, MAIL_COLORS, paragraph, renderLayout } from './layout';

type Row = Digest['rows'][number];

const rowHtml = (r: Row): string => {
  const c = MAIL_COLORS;
  return `<tr>
    <td style="padding:10px 0;border-top:1px solid ${c.line};font-size:14px;line-height:20px;color:${c.ink}">
      <span style="font-size:12px;color:${c.muted}">${escapeHtml(DOMAIN_LABEL[r.domain] ?? r.domain)}</span><br/>
      ${escapeHtml(r.label)}
    </td>
    <td align="right" style="padding:10px 0 10px 12px;border-top:1px solid ${c.line};font-size:13px;line-height:20px;color:${c.muted};white-space:nowrap">${escapeHtml(VN_DATE.format(r.deadline_at))}</td>
  </tr>`;
};

const group = (title: string, ink: string, bg: string, items: readonly Row[]): string =>
  items.length === 0
    ? ''
    : `<mj-text padding-bottom="0" padding-top="12px"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${ink};font-size:12px;font-weight:600">${title} · ${items.length}</span></mj-text>
<mj-table padding-top="4px">${items.map(rowHtml).join('')}</mj-table>`;

/** Thư nhắc hạn: mỗi văn phòng một khối, tách "Đã quá hạn" và "Sắp đến hạn". Cùng nội dung với bản text của digest. */
export async function renderReminderDigestMail(digest: Digest): Promise<string> {
  const c = MAIL_COLORS;
  const offices = [...new Set(digest.rows.map((r) => r.office_name))].sort();
  const sections = offices.map((office) => {
    const inOffice = digest.rows.filter((r) => r.office_name === office);
    return [
      `<mj-text font-family="'Source Serif 4', Georgia, serif" font-size="17px" font-weight="600" padding-top="20px" padding-bottom="0">${escapeHtml(office)}</mj-text>`,
      group(
        'Đã quá hạn',
        c.danger,
        c.dangerBg,
        inOffice.filter((r) => r.kind === 'DEADLINE_OVERDUE'),
      ),
      group(
        'Sắp đến hạn',
        c.warnInk,
        c.warnBg,
        inOffice.filter((r) => r.kind === 'DEADLINE_DUE_SOON'),
      ),
    ].join('');
  });
  return renderLayout({
    title: digest.subject,
    preheader: digest.subject,
    footerNote: 'Hạn chỉ để nhắc, không thay đổi trạng thái hồ sơ.',
    body: card(
      [
        heading(digest.subject),
        paragraph('Các việc dưới đây cần bạn chú ý theo từng văn phòng.', c.muted),
        ...sections,
      ].join(''),
    ),
  });
}
