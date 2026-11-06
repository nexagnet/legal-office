-- Mở rộng đề nghị thay đổi sau 48 giờ sang thông tin khách trong danh bạ (tên, SĐT, CCCD/định danh, địa chỉ, MST, người đại diện).
-- Đề nghị vẫn gắn một hồ sơ (ngữ cảnh) và lưu giá trị cũ/mới trong before/after như tiêu đề, nội dung. Admin duyệt thì áp dụng vào
-- danh bạ khách (dùng chung các hồ sơ của khách đó). Sửa trực tiếp danh bạ bị khoá khi khách đã có hồ sơ quá 48 giờ,
-- đã cấp số hoặc đã qua bước phân công: lúc đó phải lập đề nghị. Số Vi bằng đã cấp không đổi. Dữ liệu giả lập; không số tiền.

-- Khách "bị khoá": có hồ sơ chưa huỷ mà đã quá 48 giờ từ lúc tạo, đã qua INTAKE/ASSIGNED hoặc đã cấp số.
CREATE FUNCTION vb_customer_locked(p_tenant uuid, p_customer uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM vibang_cases c
    WHERE c.tenant_id = p_tenant AND c.customer_id = p_customer AND c.status <> 'CANCELLED'
      AND (now() >= c.created_at + interval '48 hours'
           OR c.status NOT IN ('INTAKE', 'ASSIGNED')
           OR EXISTS (SELECT 1 FROM vibang_numbers n WHERE n.case_id = c.id AND n.tenant_id = p_tenant))
  )
$$;

CREATE OR REPLACE FUNCTION vb_update_customer(p_tenant uuid, p_actor uuid, p_customer uuid, p_display_name text, p_id_number text,
  p_address text, p_phone text, p_tax_code text, p_representative text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c customers%ROWTYPE;
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  SELECT * INTO c FROM customers WHERE id = p_customer AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'CUSTOMER_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF vb_customer_locked(p_tenant, p_customer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'CUSTOMER_LOCKED', NULL, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_display_name, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'NAME_REQUIRED', NULL, NULL, NULL);
  END IF;
  IF c.kind = 'PERSON' AND (btrim(coalesce(p_tax_code, '')) <> '' OR btrim(coalesce(p_representative, '')) <> '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'FIELD_NOT_FOR_KIND', NULL, NULL, NULL);
  END IF;
  IF c.kind = 'ORGANIZATION' AND btrim(coalesce(p_id_number, '')) <> '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'FIELD_NOT_FOR_KIND', NULL, NULL, NULL);
  END IF;
  UPDATE customers SET display_name = btrim(p_display_name), id_number = nullif(btrim(coalesce(p_id_number, '')), ''),
         address = nullif(btrim(coalesce(p_address, '')), ''), phone = nullif(btrim(coalesce(p_phone, '')), ''),
         tax_code = nullif(btrim(coalesce(p_tax_code, '')), ''), representative = nullif(btrim(coalesce(p_representative, '')), ''),
         updated_by = p_actor, updated_at = now()
   WHERE id = p_customer AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', true, 'ALLOWED', NULL, NULL, p_customer::text);
END $$;

-- p_field: title | description | customer_name | customer_phone | customer_id_number | customer_address
--          | customer_tax_code | customer_representative
CREATE OR REPLACE FUNCTION vb_request_change(p_tenant uuid, p_actor uuid, p_case uuid, p_field text, p_value text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; cu customers%ROWTYPE; denied text; old text; rid uuid; is_customer boolean; val text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vb_can_edit(p_tenant, p_actor, c);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_field IS NULL OR p_field NOT IN ('title', 'description', 'customer_name', 'customer_phone', 'customer_id_number',
                                         'customer_address', 'customer_tax_code', 'customer_representative') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'INVALID_FIELD', c.office_id, c.branch_id, NULL);
  END IF;
  is_customer := p_field LIKE 'customer\_%';
  -- Trường hồ sơ: chỉ sau 48 giờ. Trường khách: sau 48 giờ, hoặc ngay khi danh bạ khách đã bị khoá (còn trong 48 giờ mà khách chưa khoá thì sửa trực tiếp).
  IF now() < c.created_at + interval '48 hours' AND NOT (is_customer AND vb_customer_locked(p_tenant, c.customer_id)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'EDIT_WINDOW_OPEN', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_value IS NULL OR (p_field IN ('title', 'customer_name') AND btrim(p_value) = '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'INVALID_VALUE', c.office_id, c.branch_id, NULL);
  END IF;
  IF is_customer THEN
    SELECT * INTO cu FROM customers WHERE id = c.customer_id AND tenant_id = p_tenant;
    IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'CUSTOMER_NOT_FOUND', c.office_id, c.branch_id, NULL); END IF;
    IF (cu.kind = 'PERSON' AND p_field IN ('customer_tax_code', 'customer_representative') AND btrim(p_value) <> '')
       OR (cu.kind = 'ORGANIZATION' AND p_field = 'customer_id_number' AND btrim(p_value) <> '') THEN
      RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'FIELD_NOT_FOR_KIND', c.office_id, c.branch_id, NULL);
    END IF;
    old := CASE p_field WHEN 'customer_name' THEN cu.display_name WHEN 'customer_phone' THEN cu.phone
                        WHEN 'customer_id_number' THEN cu.id_number WHEN 'customer_address' THEN cu.address
                        WHEN 'customer_tax_code' THEN cu.tax_code ELSE cu.representative END;
    val := btrim(p_value);
  ELSE
    old := CASE p_field WHEN 'title' THEN c.title ELSE c.description END;
    val := p_value;
  END IF;
  IF val IS NOT DISTINCT FROM coalesce(old, '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', false, 'NOTHING_TO_CHANGE', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_case_change_requests (tenant_id, case_id, requested_by, reason, before, after)
  VALUES (p_tenant, p_case, p_actor::text, btrim(p_reason), jsonb_build_object(p_field, coalesce(old, '')), jsonb_build_object(p_field, val))
  RETURNING id INTO rid;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.change.request', true, 'ALLOWED', c.office_id, c.branch_id, rid::text);
END $$;

CREATE OR REPLACE FUNCTION vb_decide_change(p_tenant uuid, p_actor uuid, p_request uuid, p_accept boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r vibang_case_change_requests%ROWTYPE; c vibang_cases%ROWTYPE; f text; v text;
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
    v := r.after ->> f;
    IF f IN ('title', 'description') THEN
      UPDATE vibang_cases SET title = CASE WHEN f = 'title' THEN v ELSE title END,
                              description = CASE WHEN f = 'description' THEN v ELSE description END,
                              version = version + 1
       WHERE id = c.id AND tenant_id = p_tenant;
    ELSE
      -- Áp dụng vào danh bạ khách (dùng chung các hồ sơ của khách); hồ sơ gắn đề nghị tăng version để nơi khác thấy thay đổi.
      UPDATE customers SET display_name = CASE WHEN f = 'customer_name' THEN v ELSE display_name END,
                           phone = CASE WHEN f = 'customer_phone' THEN nullif(v, '') ELSE phone END,
                           id_number = CASE WHEN f = 'customer_id_number' THEN nullif(v, '') ELSE id_number END,
                           address = CASE WHEN f = 'customer_address' THEN nullif(v, '') ELSE address END,
                           tax_code = CASE WHEN f = 'customer_tax_code' THEN nullif(v, '') ELSE tax_code END,
                           representative = CASE WHEN f = 'customer_representative' THEN nullif(v, '') ELSE representative END,
                           updated_by = p_actor, updated_at = now()
       WHERE id = c.customer_id AND tenant_id = p_tenant;
      UPDATE vibang_cases SET version = version + 1 WHERE id = c.id AND tenant_id = p_tenant;
    END IF;
  END IF;
  UPDATE vibang_case_change_requests SET status = CASE WHEN p_accept THEN 'APPROVED' ELSE 'REJECTED' END,
         decided_by = p_actor::text, decided_at = now()
   WHERE id = p_request AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.change.decide', true, 'ALLOWED', c.office_id, c.branch_id,
                      CASE WHEN p_accept THEN 'APPROVED' ELSE 'REJECTED' END);
END $$;
