import type { Session } from '../app/session';
import type { NavItem } from '../app/nav';

interface Props {
  readonly item: NavItem;
  readonly session: Session;
}

/**
 * Trạng thái của một mô-đun khi giao diện chưa có API: không giả lập thành công, không có nút ghi.
 * Chưa đăng nhập / không đủ vai → thông báo rõ; có quyền → trạng thái rỗng "chưa kết nối".
 */
export function ModuleState({ item, session }: Props) {
  let body: { title: string; text: string; role: 'status' | 'alert' };
  if (session.status !== 'authenticated') {
    body = {
      title: 'Cần đăng nhập',
      text: 'Phiên làm việc chưa được xác thực nên không thể hiển thị mục này.',
      role: 'alert',
    };
  } else if (!item.roles.some((r) => session.roles.includes(r))) {
    body = {
      title: 'Không có quyền truy cập',
      text: 'Vai trò của bạn không được cấp quyền vào mục này. Liên hệ Quản trị viên nếu cần.',
      role: 'alert',
    };
  } else {
    body = {
      title: 'Chưa có dữ liệu',
      text: 'Mô-đun này chưa được kết nối với máy chủ nên chưa hiển thị hồ sơ nào.',
      role: 'status',
    };
  }
  return (
    <section aria-labelledby="module-title">
      <h1 id="module-title">{item.label}</h1>
      <p className="muted">{item.summary}</p>
      <div className="state" role={body.role} data-state={body.title}>
        <h2>{body.title}</h2>
        <p>{body.text}</p>
      </div>
    </section>
  );
}
