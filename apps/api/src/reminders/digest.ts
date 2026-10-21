export interface PendingReminder {
  readonly notification_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly office_id: string;
  readonly office_name: string;
  readonly kind: 'DEADLINE_DUE_SOON' | 'DEADLINE_OVERDUE';
  readonly domain: string;
  readonly label: string;
  readonly deadline_at: Date;
}

export interface Digest {
  readonly userId: string;
  readonly email: string;
  readonly subject: string;
  readonly text: string;
  readonly notificationIds: readonly string[];
}

const DOMAIN_LABEL: Record<string, string> = {
  TONG_DAT: 'Tống đạt',
  VIBANG_CSDL: 'Đăng ký Vi bằng',
  CONG_VAN: 'Công văn',
  TONG_DAT_BAO_KET_QUA: 'Tống đạt: báo kết quả',
  VIBANG_N11: 'Vi bằng: cập nhật CSDL sau sửa lỗi',
  XAC_MINH_QUYET_DINH: 'Xác minh: ra quyết định',
  THA_THU_HOI: 'THA: thu hồi quyết định thi hành án',
};

const VN_DATE = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const line = (r: PendingReminder) =>
  `- [${DOMAIN_LABEL[r.domain] ?? r.domain}] ${r.label} — hạn ${VN_DATE.format(r.deadline_at)}`;

/** Gom các nhắc chưa gửi thành một thư cho mỗi người (mọi văn phòng của họ trong cùng thư). */
export function buildDigests(pending: readonly PendingReminder[]): Digest[] {
  const byUser = new Map<string, PendingReminder[]>();
  for (const r of pending) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  return [...byUser.entries()].map(([userId, rows]) => {
    const overdue = rows.filter((r) => r.kind === 'DEADLINE_OVERDUE');
    const soon = rows.filter((r) => r.kind === 'DEADLINE_DUE_SOON');
    const sections: string[] = [];
    const offices = [...new Set(rows.map((r) => r.office_name))].sort();
    for (const office of offices) {
      const inOffice = rows.filter((r) => r.office_name === office);
      const parts = [
        ['Đã quá hạn', inOffice.filter((r) => r.kind === 'DEADLINE_OVERDUE')],
        ['Sắp đến hạn', inOffice.filter((r) => r.kind === 'DEADLINE_DUE_SOON')],
      ] as const;
      const body = parts
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => `${title}:\n${items.map(line).join('\n')}`)
        .join('\n\n');
      sections.push(`${office}\n${body}`);
    }
    const head =
      overdue.length > 0
        ? `Nhắc hạn: ${overdue.length} việc quá hạn, ${soon.length} việc sắp đến hạn`
        : `Nhắc hạn: ${soon.length} việc sắp đến hạn`;
    return {
      userId,
      email: rows[0]!.email,
      subject: head,
      text: `${sections.join('\n\n')}\n\nThư tự động từ Legal Office. Hạn chỉ để nhắc, không thay đổi trạng thái hồ sơ.`,
      notificationIds: rows.map((r) => r.notification_id),
    };
  });
}
