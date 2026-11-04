import {
  card,
  escapeHtml,
  heading,
  MAIL_COLORS,
  paragraph,
  primaryButton,
  renderLayout,
} from './layout';
import type { RenderedMail } from './rendered-mail';

/** Thư đặt lại mật khẩu: chỉ chứa một link dùng một lần, hết hạn sau ít phút. */
export async function renderPasswordResetMail(input: {
  readonly url: string;
  readonly validMinutes: number;
}): Promise<RenderedMail> {
  const subject = 'Đặt lại mật khẩu Quản lý văn phòng';
  const html = await renderLayout({
    title: subject,
    preheader: 'Bấm vào nút để đặt mật khẩu mới.',
    footerNote: 'Nếu không phải bạn yêu cầu, đừng bấm link; mật khẩu hiện tại vẫn giữ nguyên.',
    body: card(
      [
        heading('Đặt lại mật khẩu'),
        paragraph('Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.'),
        paragraph(
          `Bấm nút bên dưới để đặt mật khẩu mới. Link dùng một lần và hết hạn sau <strong>${input.validMinutes} phút</strong>.`,
        ),
        primaryButton('Đặt mật khẩu mới', input.url),
        paragraph(
          `Nếu nút không bấm được, sao chép địa chỉ này vào trình duyệt:<br/><span style="word-break:break-all;color:${MAIL_COLORS.accent}">${escapeHtml(input.url)}</span>`,
          MAIL_COLORS.muted,
        ),
      ].join(''),
    ),
  });
  const text = [
    'Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
    '',
    `Bấm vào link sau để đặt mật khẩu mới (link dùng một lần, hết hạn sau ${input.validMinutes} phút):`,
    input.url,
    '',
    'Nếu không phải bạn yêu cầu, đừng bấm link; mật khẩu hiện tại vẫn giữ nguyên.',
  ].join('\n');
  return { subject, html, text };
}
