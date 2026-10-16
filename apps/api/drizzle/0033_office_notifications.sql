-- Thông báo trong ứng dụng cho nhắc hạn (Lát nhắc hạn/thông báo). Bền vững + có trạng thái đã đọc; KHÔNG gửi ra ngoài (chưa có kênh email/Zalo).
-- Sinh lười: mỗi lần người dùng mở danh sách, hạn sắp tới/quá hạn mà họ được xem được ghi thành thông báo của CHÍNH HỌ, mỗi (hạn, nhóm) đúng một lần.
-- Nhóm DUE_SOON = sắp đến hạn (trong p_within_days), OVERDUE = đã quá hạn. Hạn chuyển từ DUE_SOON sang OVERDUE tạo thêm một thông báo mới.
-- Dữ liệu giả lập; không số tiền.

CREATE TABLE office_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('DEADLINE_DUE_SOON', 'DEADLINE_OVERDUE')),
  domain text NOT NULL,
  ref_id uuid NOT NULL,
  case_id uuid,
  label text NOT NULL,
  deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT office_notifications_once_uq UNIQUE (tenant_id, office_id, user_id, domain, ref_id, kind),
  CONSTRAINT office_notifications_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
CREATE INDEX office_notifications_user_idx ON office_notifications (tenant_id, office_id, user_id, created_at DESC);

ALTER TABLE office_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON office_notifications
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Ghi thông báo cho chính người gọi từ các hạn họ được xem (cùng phạm vi of_search_deadlines/of_can_read). Không audit riêng.
CREATE FUNCTION of_sync_notifications(p_tenant uuid, p_actor uuid, p_office uuid, p_within_days integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO office_notifications (tenant_id, office_id, user_id, kind, domain, ref_id, case_id, label, deadline_at)
  WITH src AS (
    SELECT 'TONG_DAT'::text AS domain, d.id AS ref_id, d.request_id AS case_id, d.recipient_name AS label, d.deadline_at,
           r.branch_id, d.handler_user_id AS handler
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office AND d.status IN ('PENDING', 'ASSIGNED')
    UNION ALL
    SELECT 'VIBANG_CSDL', g.case_id, g.case_id, c.title, g.deadline_at, c.branch_id, c.responsible_thv_user_id
    FROM vibang_registrations g JOIN vibang_cases c ON c.id = g.case_id AND c.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND c.office_id = p_office AND g.status IN ('PENDING', 'SUBMITTED')
  )
  SELECT p_tenant, p_office, p_actor,
         CASE WHEN s.deadline_at < now() THEN 'DEADLINE_OVERDUE' ELSE 'DEADLINE_DUE_SOON' END,
         s.domain, s.ref_id, s.case_id, s.label, s.deadline_at
  FROM src s
  WHERE s.deadline_at <= now() + make_interval(days => p_within_days)
    AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  ON CONFLICT ON CONSTRAINT office_notifications_once_uq DO NOTHING;
END $$;

-- Danh sách thông báo của CHÍNH người gọi (mới nhất trước). Chỉ thành viên văn phòng. p_unread_only = chỉ chưa đọc.
CREATE FUNCTION of_search_notifications(p_tenant uuid, p_actor uuid, p_office uuid, p_unread_only boolean, p_limit integer)
RETURNS TABLE (id uuid, kind text, domain text, ref_id uuid, case_id uuid, label text, deadline_at timestamptz, created_at timestamptz, read_at timestamptz, overdue boolean)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.notifications.read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM of_sync_notifications(p_tenant, p_actor, p_office, 3);
  RETURN QUERY
    SELECT n.id, n.kind, n.domain, n.ref_id, n.case_id, n.label, n.deadline_at, n.created_at, n.read_at, n.deadline_at < now()
    FROM office_notifications n
    WHERE n.tenant_id = p_tenant AND n.office_id = p_office AND n.user_id = p_actor
      AND (NOT coalesce(p_unread_only, false) OR n.read_at IS NULL)
    ORDER BY n.created_at DESC, n.id
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
END $$;

-- Đánh dấu đã đọc: p_id NULL = tất cả thông báo chưa đọc của mình trong văn phòng. label = số thông báo được đánh dấu.
CREATE FUNCTION of_notifications_read(p_tenant uuid, p_actor uuid, p_office uuid, p_id uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.notifications.mark_read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
  END IF;
  UPDATE office_notifications SET read_at = now()
   WHERE tenant_id = p_tenant AND office_id = p_office AND user_id = p_actor AND read_at IS NULL AND (p_id IS NULL OR id = p_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF p_id IS NOT NULL AND n = 0 AND NOT EXISTS (SELECT 1 FROM office_notifications WHERE id = p_id AND tenant_id = p_tenant AND office_id = p_office AND user_id = p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.notifications.mark_read', false, 'NOTIFICATION_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'of.notifications.mark_read', true, 'ALLOWED', p_office, NULL, n::text);
END $$;
