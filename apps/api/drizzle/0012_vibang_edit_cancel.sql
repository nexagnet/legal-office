-- Lát #6: sửa thông tin nội bộ hồ sơ Vi bằng trong 48 giờ liên tục từ lúc tạo (kể cả cuối tuần); sau đó phải lập đề nghị thay đổi
-- (trường, giá trị cũ, giá trị mới, lý do) và Admin duyệt/từ chối; huỷ hồ sơ (kèm lý do). Đây KHÔNG phải quyền sửa nội dung
-- Vi bằng đã ký/đóng dấu (lỗi kỹ thuật theo N-11). Dữ liệu giả lập; không số tiền. Quyền kiểm tra trong DB, mọi kết quả audit.

-- Trường nội bộ được phép sửa: tiêu đề, nội dung cần ghi nhận.
CREATE FUNCTION vb_can_edit(p_tenant uuid, p_actor uuid, c vibang_cases) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                      ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'THV'], c.responsible_thv_user_id)
$$;

-- Sửa trực tiếp trong 48 giờ (null = giữ nguyên).
CREATE FUNCTION vb_edit_case(p_tenant uuid, p_actor uuid, p_case uuid, p_title text, p_description text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.edit', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vb_can_edit(p_tenant, p_actor, c);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.edit', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.edit', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF now() >= c.created_at + interval '48 hours' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.edit', false, 'EDIT_WINDOW_CLOSED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_title IS NULL AND p_description IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.edit', false, 'NOTHING_TO_CHANGE', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_title IS NOT NULL AND btrim(p_title) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.edit', false, 'TITLE_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vibang_cases SET title = coalesce(btrim(p_title), title), description = coalesce(p_description, description),
         version = version + 1
   WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.edit', true, 'ALLOWED', c.office_id, c.branch_id, p_case::text);
END $$;

-- Sau 48 giờ: lập đề nghị thay đổi một trường. p_field: title | description.
CREATE FUNCTION vb_request_change(p_tenant uuid, p_actor uuid, p_case uuid, p_field text, p_value text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text; old text; rid uuid;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vb_can_edit(p_tenant, p_actor, c);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF now() < c.created_at + interval '48 hours' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'EDIT_WINDOW_OPEN', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_field IS NULL OR p_field NOT IN ('title', 'description') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'INVALID_FIELD', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_value IS NULL OR (p_field = 'title' AND btrim(p_value) = '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'INVALID_VALUE', c.office_id, c.branch_id, NULL);
  END IF;
  old := CASE p_field WHEN 'title' THEN c.title ELSE c.description END;
  INSERT INTO vibang_case_change_requests (tenant_id, case_id, requested_by, reason, before, after)
  VALUES (p_tenant, p_case, p_actor::text, btrim(p_reason), jsonb_build_object(p_field, old), jsonb_build_object(p_field, p_value))
  RETURNING id INTO rid;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', true, 'ALLOWED', c.office_id, c.branch_id, rid::text);
END $$;

-- Admin duyệt hoặc từ chối đề nghị; duyệt thì áp dụng ngay và tăng version.
CREATE FUNCTION vb_decide_change(p_tenant uuid, p_actor uuid, p_request uuid, p_accept boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r vibang_case_change_requests%ROWTYPE; c vibang_cases%ROWTYPE; f text;
BEGIN
  SELECT * INTO r FROM vibang_case_change_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.change.decide', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM vibang_cases WHERE id = r.case_id AND tenant_id = p_tenant FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor
                 AND m.office_id = c.office_id AND m.role = 'ADMIN') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.decide', false, 'ADMIN_ONLY', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_accept IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.decide', false, 'INVALID_DECISION', c.office_id, c.branch_id, NULL);
  END IF;
  IF r.status <> 'PENDING' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.decide', false, 'REQUEST_NOT_PENDING', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_accept AND c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.decide', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_accept THEN
    SELECT k INTO f FROM jsonb_object_keys(r.after) AS k LIMIT 1;
    UPDATE vibang_cases SET title = CASE WHEN f = 'title' THEN r.after ->> 'title' ELSE title END,
                            description = CASE WHEN f = 'description' THEN r.after ->> 'description' ELSE description END,
                            version = version + 1
     WHERE id = c.id AND tenant_id = p_tenant;
  END IF;
  UPDATE vibang_case_change_requests SET status = CASE WHEN p_accept THEN 'APPROVED' ELSE 'REJECTED' END,
         decided_by = p_actor::text, decided_at = now()
   WHERE id = p_request AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.change.decide', true, 'ALLOWED', c.office_id, c.branch_id,
                      CASE WHEN p_accept THEN 'APPROVED' ELSE 'REJECTED' END);
END $$;

-- Danh sách đề nghị thay đổi của một hồ sơ mà người dùng được xem (dùng cùng phạm vi xem với vb_list_cases).
CREATE FUNCTION vb_list_changes(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, case_id uuid, requested_by text, reason text, before jsonb, after jsonb, status text,
  created_at timestamptz, decided_by text, decided_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.case_id, r.requested_by, r.reason, r.before, r.after, r.status, r.created_at, r.decided_by, r.decided_at
  FROM vibang_case_change_requests r
  WHERE r.tenant_id = p_tenant AND r.case_id = p_case
    AND EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
  ORDER BY r.created_at DESC, r.id
$$;

-- Huỷ hồ sơ (kèm lý do; cũng dùng để ghi nhận yêu cầu không hợp lệ bị từ chối). Chỉ Admin; chỉ khi chưa có hành vi pháp lý
-- (INTAKE/ASSIGNED): hồ sơ đã ký/đóng dấu không huỷ ở đây.
CREATE FUNCTION vb_cancel_case(p_tenant uuid, p_actor uuid, p_case uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.cancel', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor
                 AND m.office_id = c.office_id AND m.role = 'ADMIN') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.cancel', false, 'ADMIN_ONLY', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.cancel', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.status NOT IN ('INTAKE', 'ASSIGNED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.cancel', false, 'CANCEL_NOT_ALLOWED', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vibang_cases SET status = 'CANCELLED', cancel_reason = btrim(p_reason), version = version + 1
   WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.cancel', true, 'ALLOWED', c.office_id, c.branch_id, p_case::text);
END $$;
