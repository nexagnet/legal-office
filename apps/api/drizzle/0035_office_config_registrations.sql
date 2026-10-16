-- Lát API cho các màn còn thiếu: Cấu hình văn phòng, Theo dõi cập nhật CSDL/Sở, Liên hệ khách, Người nhận bàn giao.
-- Không đổi hàm hay quyền sẵn có. Dữ liệu giả lập; không số tiền. Theo dõi Sở/CSDL chỉ là việc phía Văn phòng (S-03 là sổ của Sở).

-- 1) Cấu hình văn phòng: tên đơn vị pháp lý và tên hiển thị trên văn bản (Admin sửa). Quy tắc số Vi bằng cố định theo hệ thống.
CREATE TABLE office_settings (
  office_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  legal_name text CHECK (legal_name IS NULL OR btrim(legal_name) <> ''),
  display_name text CHECK (display_name IS NULL OR btrim(display_name) <> ''),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, tenant_id),
  CONSTRAINT office_settings_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
ALTER TABLE office_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON office_settings
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Đọc: mọi thành viên văn phòng. Tên chưa đặt thì dùng tên văn phòng. Chi nhánh liệt kê theo văn phòng.
CREATE FUNCTION of_search_office_settings(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (office_name text, legal_name text, display_name text, number_rule text, branches jsonb)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.settings.read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.settings.read', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT o.name, coalesce(s.legal_name, o.name), coalesce(s.display_name, o.name), '<số>/<năm>/VB-THV'::text,
           coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) ORDER BY b.name, b.id)
                     FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office), '[]'::jsonb)
    FROM offices o LEFT JOIN office_settings s ON s.office_id = o.id AND s.tenant_id = o.tenant_id
    WHERE o.id = p_office AND o.tenant_id = p_tenant;
END $$;

-- Ghi: chỉ Admin văn phòng. NULL = giữ nguyên; chuỗi rỗng bị từ chối.
CREATE FUNCTION of_set_office_settings(p_tenant uuid, p_actor uuid, p_office uuid, p_legal_name text, p_display_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.settings.set', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF (p_legal_name IS NOT NULL AND btrim(p_legal_name) = '') OR (p_display_name IS NOT NULL AND btrim(p_display_name) = '')
     OR (p_legal_name IS NULL AND p_display_name IS NULL) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.settings.set', false, 'INVALID_SETTINGS', p_office, NULL, NULL);
  END IF;
  INSERT INTO office_settings (office_id, tenant_id, legal_name, display_name, updated_by)
  VALUES (p_office, p_tenant, btrim(p_legal_name), btrim(p_display_name), p_actor)
  ON CONFLICT (office_id, tenant_id) DO UPDATE
    SET legal_name = coalesce(EXCLUDED.legal_name, office_settings.legal_name),
        display_name = coalesce(EXCLUDED.display_name, office_settings.display_name),
        updated_by = p_actor, updated_at = now();
  RETURN vibang_audit(p_tenant, p_actor, 'of.settings.set', true, 'ALLOWED', p_office, NULL, NULL);
END $$;

-- 2) Theo dõi cập nhật CSDL/Sở của Vi bằng: mỗi dòng = một hồ sơ đã cấp số. Chỉ hồ sơ người gọi được xem (vb_list_cases).
-- reg_status NOT_STARTED = chưa ghi nhận lần cập nhật nào. incident_reason = sự cố đang mở (nếu có). made_at = ngày ký (hoặc cấp số).
CREATE FUNCTION vb_list_registrations(p_tenant uuid, p_actor uuid, p_case uuid, p_limit integer)
RETURNS TABLE (case_id uuid, office_id uuid, number_label text, thv_user_id uuid, thv_label text, case_status text, made_at timestamptz,
  reg_status text, deadline_at timestamptz, updated_at timestamptz, updated_by uuid, incident_reason text, overdue boolean)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.office_id, n.label, c.responsible_thv_user_id, coalesce(ac.email, u.external_ref), c.status,
         coalesce(e.signed_at, n.allocated_at), coalesce(r.status, 'NOT_STARTED'), r.deadline_at, r.updated_at, r.updated_by,
         (SELECT i.reason_code FROM vibang_registration_incidents i
           WHERE i.tenant_id = p_tenant AND i.case_id = c.id AND i.resolved_at IS NULL ORDER BY i.id DESC LIMIT 1),
         coalesce(r.status IN ('PENDING', 'SUBMITTED') AND r.deadline_at < now(), false)
  FROM vb_list_cases(p_tenant, p_actor, p_case, 200) c
  JOIN vibang_numbers n ON n.case_id = c.id AND n.tenant_id = p_tenant
  LEFT JOIN vibang_evidence e ON e.case_id = c.id AND e.tenant_id = p_tenant
  LEFT JOIN vibang_registrations r ON r.case_id = c.id AND r.tenant_id = p_tenant
  LEFT JOIN users u ON u.id = c.responsible_thv_user_id AND u.tenant_id = p_tenant
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  ORDER BY coalesce(e.signed_at, n.allocated_at) DESC, c.id
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 200)
$$;

-- 3) Nhật ký liên hệ khách của một hồ sơ (mới nhất trước), chỉ hồ sơ người gọi được xem.
CREATE FUNCTION vb_list_contacts(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id bigint, kind text, outcome text, actor_user_id uuid, at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT l.id, l.kind, l.outcome, l.actor_user_id, l.at
  FROM vibang_contact_log l
  WHERE l.tenant_id = p_tenant AND l.case_id = p_case
    AND EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
  ORDER BY l.id DESC
$$;

-- 4) Người nhận bàn giao: các Thừa hành viên của văn phòng, cho vai tham gia bàn giao (không Kế toán/Văn thư).
CREATE FUNCTION of_search_receivers(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, label text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office
                 AND m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY', 'THV')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.receivers.read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.receivers.read', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT DISTINCT u.id, coalesce(ac.email, u.external_ref)
    FROM memberships m
    JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
    LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
    WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.role = 'THV'
    ORDER BY 2, 1;
END $$;
