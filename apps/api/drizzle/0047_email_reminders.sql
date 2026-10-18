-- Nhắc hạn tự động qua email (owner chốt 18/10/2026; Zalo làm sau). Việc gửi chạy ở tiến trình ngoài API (CLI theo lịch),
-- DB chỉ chuẩn bị danh sách cần gửi và ghi nhận đã gửi. Thư gửi tới email đăng nhập của CHÍNH người đó (auth_credentials).
-- Mỗi (người, hạn, nhóm DUE_SOON/OVERDUE) đúng một thông báo (xem 0033) nên đúng một thư. Dữ liệu giả lập; không số tiền.

ALTER TABLE office_notifications ADD COLUMN emailed_at timestamptz;

-- Đồng bộ thông báo cho mọi thành viên có tài khoản đăng nhập, rồi trả các thông báo CHƯA đọc và CHƯA gửi email.
-- Phạm vi xem của từng người vẫn do of_sync_notifications/of_can_read quyết định. Chỉ dành cho tiến trình hệ thống
-- (không có đường HTTP); không audit vì không có người gọi.
CREATE FUNCTION of_email_pending(p_tenant uuid)
RETURNS TABLE (notification_id uuid, user_id uuid, email text, office_id uuid, office_name text, kind text, domain text, label text, deadline_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE m record;
BEGIN
  FOR m IN
    SELECT DISTINCT ms.user_id AS uid, ms.office_id AS oid
    FROM memberships ms JOIN auth_credentials c ON c.tenant_id = ms.tenant_id AND c.user_id = ms.user_id
    WHERE ms.tenant_id = p_tenant
  LOOP
    PERFORM of_sync_notifications(p_tenant, m.uid, m.oid, 3);
  END LOOP;
  RETURN QUERY
    SELECT n.id, n.user_id, c.email, n.office_id, o.name, n.kind, n.domain, n.label, n.deadline_at
    FROM office_notifications n
    JOIN auth_credentials c ON c.tenant_id = n.tenant_id AND c.user_id = n.user_id
    JOIN offices o ON o.id = n.office_id AND o.tenant_id = n.tenant_id
    WHERE n.tenant_id = p_tenant AND n.emailed_at IS NULL AND n.read_at IS NULL
    ORDER BY n.user_id, n.office_id, n.deadline_at, n.id;
END $$;

-- Ghi nhận đã gửi (chỉ các thông báo chưa ghi nhận). label = số thông báo được ghi.
CREATE FUNCTION of_email_mark_sent(p_tenant uuid, p_ids uuid[])
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE office_notifications SET emailed_at = now()
   WHERE tenant_id = p_tenant AND id = ANY (coalesce(p_ids, ARRAY[]::uuid[])) AND emailed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
