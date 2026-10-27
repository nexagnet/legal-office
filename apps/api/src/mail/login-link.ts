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

/** Thư đăng nhập: CHỈ chứa một link; bấm link mới sinh mã (quy tắc chủ dự án, không thêm mã vào thư). */
export async function renderLoginLinkMail(input: {
  readonly url: string;
  readonly validMinutes: number;
}): Promise<RenderedMail> {
  const subject = 'Xác thực đăng nhập Quản lý văn phòng';
  const html = await renderLayout({
    title: subject,
    preheader: 'Bấm vào nút để nhận mã đăng nhập.',
    footerNote: 'Nếu không phải bạn yêu cầu, đừng bấm link; có thể bỏ qua thư này.',
    body: card(
      [
        heading('Xác thực đăng nhập'),
        paragraph('Có yêu cầu đăng nhập vào hệ thống bằng email của bạn.'),
        paragraph(
          `Bấm nút bên dưới để nhận mã đăng nhập. Link dùng một lần và hết hạn sau <strong>${input.validMinutes} phút</strong>.`,
        ),
        primaryButton('Nhận mã đăng nhập', input.url),
        paragraph(
          `Nếu nút không bấm được, sao chép địa chỉ này vào trình duyệt:<br/><span style="word-break:break-all;color:${MAIL_COLORS.accent}">${escapeHtml(input.url)}</span>`,
          MAIL_COLORS.muted,
        ),
      ].join(''),
    ),
  });
  const text = [
    'Có yêu cầu đăng nhập vào hệ thống bằng email.',
    '',
    `Bấm vào link sau để nhận mã đăng nhập (link dùng một lần, hết hạn sau ${input.validMinutes} phút):`,
    input.url,
    '',
    'Nếu không phải bạn yêu cầu, đừng bấm link; có thể bỏ qua thư này.',
  ].join('\n');
  return { subject, html, text };
}
