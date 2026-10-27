import type { Progress } from '../../../components/CaseSteps';
import type { ActionGroup, ActionItem } from '../../../components/ui/action-menu';
import type { CaseDetail } from '../../../lib/case-api';

interface Input {
  readonly c: CaseDetail;
  readonly base: string;
  readonly progress: Progress | null;
  readonly isAdmin: boolean;
  readonly isFinal: boolean;
  readonly windowOpen: boolean;
  readonly pendingChanges: number;
}

/** Menu "Thêm thao tác" theo Figma N13 E6: hồ sơ, phát hành, sau phát hành, nguy hiểm. Mục chưa tới bước vẫn hiện, mờ, kèm lý do. */
export function caseMenu({
  c,
  base,
  progress,
  isAdmin,
  isFinal,
  windowOpen,
  pendingChanges,
}: Input): ActionGroup[] {
  const numbered = !!progress?.numberLabel;
  const signed = !!progress?.signedAt;
  const stamped = !!progress?.stampedAt;
  const scanned = !!progress?.hasFinalScan;
  const returned = c.status === 'RETURNED';
  const link = (key: string, label: string, ok: boolean, why: string): ActionItem => ({
    key,
    label,
    href: `${base}/${key}`,
    disabled: !ok,
    hint: ok ? undefined : why,
  });

  const file: ActionItem[] = [];
  if (!isFinal) {
    file.push({
      key: 'edit',
      label: windowOpen ? 'Sửa trong 48 giờ' : 'Đề nghị thay đổi',
      href: `${base}?tab=thong-tin`,
      hint: windowOpen ? undefined : 'Đã quá 48 giờ kể từ ngày tạo',
    });
    if (isAdmin) {
      file.push({
        key: 'phan-cong',
        label: c.responsibleThvUserId ? 'Đổi thừa phát lại phụ trách' : 'Phân công thừa phát lại',
        href: `${base}/phan-cong`,
      });
    }
  }
  if (isAdmin && !isFinal && pendingChanges > 0) {
    file.push({
      key: 'duyet-sua',
      label: `Duyệt đề nghị sửa (${pendingChanges})`,
      href: `${base}/duyet-sua`,
    });
  }

  const issue: ActionItem[] = isFinal
    ? []
    : [
        link('cap-so', 'Cấp số MISA', !numbered, 'Đã cấp số'),
        link(
          'ky-dong-dau',
          'Ký và đóng dấu',
          numbered && !(stamped && scanned),
          numbered ? 'Đã xong' : 'Chưa cấp số',
        ),
        link(
          'tra-ket-qua',
          'Trả kết quả',
          stamped && scanned && !returned,
          returned ? 'Đã trả' : 'Chưa đủ điều kiện',
        ),
        link('kiem-tra-ban-giao', 'Kiểm tra bàn giao', numbered && signed, 'Chưa tới bước'),
      ];

  const after: ActionItem[] =
    c.status === 'CANCELLED'
      ? []
      : [
          link('cap-ban-sao', 'Cấp bản sao', returned, 'Sau khi trả kết quả'),
          link('cap-nhat-so', 'Cập nhật Sở', numbered, 'Sau khi cấp số'),
          link('thu-hoi-misa', 'Thu hồi MISA', numbered, 'Sau khi cấp số'),
          link('sua-loi-n11', 'Sửa lỗi (N-11)', numbered, 'Sau khi cấp số'),
        ];

  const danger: ActionItem[] = [];
  if (!isFinal && (c.status === 'INTAKE' || c.status === 'ASSIGNED')) {
    danger.push({
      key: 'tu-choi',
      label: 'Từ chối yêu cầu…',
      href: `${base}/tu-choi`,
      tone: 'danger',
    });
  }
  if (!isFinal && isAdmin) {
    danger.push({
      key: 'huy-ho-so',
      label: 'Huỷ hồ sơ…',
      href: `${base}/huy-ho-so`,
      tone: 'danger',
    });
  }
  return [
    { label: 'Hồ sơ', items: file },
    { label: 'Phát hành', items: issue },
    { label: 'Sau phát hành', items: after },
    { label: 'Nguy hiểm', items: danger },
  ];
}
