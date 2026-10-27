import { card, heading, paragraph, renderLayout } from './layout';
import type { RenderedMail } from './rendered-mail';

export async function renderTestMail(): Promise<RenderedMail> {
  const subject = 'Legal Office: thư thử cấu hình email';
  const sentence =
    'Đây là thư thử. Cấu hình SMTP đang hoạt động; email nhắc hạn sẽ gửi theo lịch đã cài.';
  const html = await renderLayout({
    title: subject,
    preheader: 'Cấu hình SMTP đang hoạt động.',
    footerNote: 'Thư thử do quản trị viên yêu cầu từ trang cấu hình email.',
    body: card([heading('Thư thử cấu hình email'), paragraph(sentence)].join('')),
  });
  return { subject, html, text: sentence };
}
