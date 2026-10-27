import mjml2html from 'mjml';

/** Màu theo giao diện "Navy – Serif" (apps/web/app/theme-v2.css). */
export const MAIL_COLORS = {
  bg: '#f3f6fb',
  surface: '#ffffff',
  ink: '#14233b',
  muted: '#5b6b82',
  line: '#e3e9f2',
  accent: '#1f4fa8',
  navy: '#0a1f3b',
  brass: '#c9a24a',
  logo: '#a8802f',
  warnBg: '#fdf0da',
  warnInk: '#b76a00',
  dangerBg: '#fdecec',
  danger: '#d13438',
} as const;

const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SANS = "'Be Vietnam Pro', 'Segoe UI', Roboto, Arial, sans-serif";

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface MailLayout {
  /** Dòng xem trước hiện cạnh tiêu đề trong hộp thư. */
  readonly preheader: string;
  readonly title: string;
  /** Các khối `<mj-section>` của phần thân (đã escape). */
  readonly body: string;
  readonly footerNote: string;
}

/** Khung thư chung: dải navy có dấu hiệu "LO", thẻ trắng chứa nội dung, chân trang. Mọi loại thư dùng chung. */
export async function renderLayout(layout: MailLayout): Promise<string> {
  const c = MAIL_COLORS;
  const source = `
<mjml>
  <mj-head>
    <mj-title>${escapeHtml(layout.title)}</mj-title>
    <mj-preview>${escapeHtml(layout.preheader)}</mj-preview>
    <mj-font name="Source Serif 4" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600&amp;display=swap" />
    <mj-font name="Be Vietnam Pro" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600&amp;display=swap" />
    <mj-attributes>
      <mj-all font-family="${SANS}" />
      <mj-text font-size="15px" line-height="24px" color="${c.ink}" />
    </mj-attributes>
    <mj-style>
      .serif { font-family: ${SERIF} !important; }
      a { color: ${c.accent}; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${c.bg}" width="600px">
    <mj-section background-color="${c.navy}" padding="22px 24px" border-radius="16px 16px 0 0">
      <mj-column>
        <mj-text padding="0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;background:${c.logo};border-radius:10px;font-family:${SERIF};font-size:18px;font-weight:600;color:#ffffff">LO</td>
            <td valign="middle" style="padding-left:14px">
              <div style="font-family:${SERIF};font-size:20px;font-weight:600;line-height:26px;color:#ffffff">Quản lý văn phòng</div>
              <div style="font-size:12px;line-height:16px;color:#8196b3">Legal Office</div>
            </td>
          </tr></table>
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="${c.brass}" padding="0" css-class="rule"><mj-column><mj-spacer height="3px" /></mj-column></mj-section>
    ${layout.body}
    <mj-section padding="16px 24px 8px">
      <mj-column>
        <mj-text align="center" font-size="12px" line-height="18px" color="${c.muted}">${escapeHtml(layout.footerNote)}</mj-text>
        <mj-text align="center" font-size="12px" line-height="18px" color="#8a97ab" padding-top="0">Thư tự động từ Legal Office, vui lòng không trả lời thư này.</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
  const out = await mjml2html(source, { validationLevel: 'strict', minify: false });
  return out.html;
}

/** Khối thẻ trắng bo viền chứa nội dung chính. */
export const card = (inner: string): string => `
<mj-section background-color="${MAIL_COLORS.surface}" padding="28px 28px 24px" border="1px solid ${MAIL_COLORS.line}" border-top="none" border-radius="0 0 16px 16px">
  <mj-column>${inner}</mj-column>
</mj-section>`;

export const heading = (text: string): string =>
  `<mj-text font-family="${SERIF}" font-size="24px" font-weight="600" line-height="32px" padding-bottom="12px">${escapeHtml(text)}</mj-text>`;

export const paragraph = (html: string, color: string = MAIL_COLORS.ink): string =>
  `<mj-text color="${color}">${html}</mj-text>`;

/** Nút chính (đã bọc bảng nên hiển thị đúng cả trong Outlook). */
export const primaryButton = (label: string, href: string): string =>
  `<mj-button href="${escapeHtml(href)}" background-color="${MAIL_COLORS.accent}" color="#ffffff" font-family="${SANS}" font-size="15px" font-weight="600" border-radius="10px" inner-padding="14px 28px" padding="12px 25px 16px" align="left">${escapeHtml(label)}</mj-button>`;
