-- Lát #6/#17: tiếp nhận hồ sơ Vi bằng (khách, hợp đồng, hồ sơ), phân công THV (chỉ Admin, có lịch sử) và đọc hồ sơ theo quyền.
-- Dữ liệu giả lập, không số tiền. Quyền kiểm tra trong DB (td_authorize); mọi kết quả ghi audit_log.
-- Chưa gồm: sửa nội bộ 48 giờ / đề nghị thay đổi, huỷ hồ sơ (lát sau).

CREATE TABLE vibang_assignments (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  thv_user_id uuid NOT NULL,
  previous_thv_user_id uuid,
  reason text,
  assigned_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_assignments_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id),
  CONSTRAINT vibang_assignments_thv_fk FOREIGN KEY (thv_user_id, tenant_id) REFERENCES users (id, tenant_id),
  -- Đổi người phụ trách phải có lý do; lần đầu thì không bắt buộc.
  CONSTRAINT vibang_assignments_reason_chk CHECK (previous_thv_user_id IS NULL OR btrim(coalesce(reason, '')) <> '')
);
CREATE INDEX vibang_assignments_case_idx ON vibang_assignments (tenant_id, case_id, id);
CREATE TRIGGER vibang_assignments_ro BEFORE UPDATE OR DELETE ON vibang_assignments FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
ALTER TABLE vibang_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibang_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vibang_assignments USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Khách và hợp đồng thuộc tenant: cần có vai tiếp nhận ở ít nhất một văn phòng.
CREATE FUNCTION vb_is_intake_staff(p_tenant uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user
                 AND m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'THV'))
$$;

CREATE FUNCTION vb_create_customer(p_tenant uuid, p_actor uuid, p_kind text, p_ref text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.create', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('PERSON', 'ORGANIZATION') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.create', false, 'INVALID_CUSTOMER', NULL, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_ref, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.create', false, 'REFERENCE_REQUIRED', NULL, NULL, NULL);
  END IF;
  INSERT INTO customers (tenant_id, kind, external_ref) VALUES (p_tenant, p_kind, btrim(p_ref)) RETURNING id INTO cid;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.create', true, 'ALLOWED', NULL, NULL, cid::text);
END $$;

CREATE FUNCTION vb_create_contract(p_tenant uuid, p_actor uuid, p_customer uuid, p_ref text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.create', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p_customer AND c.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.create', false, 'CUSTOMER_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_ref, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.create', false, 'REFERENCE_REQUIRED', NULL, NULL, NULL);
  END IF;
  INSERT INTO contracts (tenant_id, customer_id, external_ref) VALUES (p_tenant, p_customer, btrim(p_ref)) RETURNING id INTO cid;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.create', true, 'ALLOWED', NULL, NULL, cid::text);
END $$;

-- Tạo hồ sơ (INTAKE). Admin, Trưởng VP, Thư ký, Văn thư (có quyền chi nhánh) và THV được tạo; chưa có THV phụ trách.
CREATE FUNCTION vb_create_case(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_customer uuid, p_contract uuid,
  p_title text, p_description text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; cid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.create', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  -- THV tiếp nhận được hồ sơ mới: coi người tạo là người xử lý ở bước này.
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'THV'], p_actor);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.create', false, denied, p_office, p_branch, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p_customer AND c.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.create', false, 'CUSTOMER_NOT_FOUND', p_office, p_branch, NULL);
  END IF;
  IF p_contract IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM contracts k WHERE k.id = p_contract AND k.tenant_id = p_tenant AND k.customer_id = p_customer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.create', false, 'CONTRACT_NOT_FOUND', p_office, p_branch, NULL);
  END IF;
  IF btrim(coalesce(p_title, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.create', false, 'TITLE_REQUIRED', p_office, p_branch, NULL);
  END IF;
  INSERT INTO vibang_cases (tenant_id, office_id, branch_id, customer_id, contract_id, title, description)
  VALUES (p_tenant, p_office, p_branch, p_customer, p_contract, btrim(p_title), coalesce(p_description, ''))
  RETURNING id INTO cid;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.create', true, 'ALLOWED', p_office, p_branch, cid::text);
END $$;

-- Phân công / đổi THV phụ trách: CHỈ Admin của văn phòng. Đổi người phải có lý do; lịch sử không xoá.
CREATE FUNCTION vb_assign_thv(p_tenant uuid, p_actor uuid, p_case uuid, p_thv uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.assign', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor
                 AND m.office_id = c.office_id AND m.role = 'ADMIN') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.assign', false, 'ADMIN_ONLY', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.status NOT IN ('INTAKE', 'ASSIGNED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.assign', false, 'CASE_NOT_ASSIGNABLE', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_thv
                 AND m.office_id = c.office_id AND m.role = 'THV') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.assign', false, 'INVALID_HANDLER', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.responsible_thv_user_id IS NOT DISTINCT FROM p_thv THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.assign', false, 'ALREADY_ASSIGNED', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.responsible_thv_user_id IS NOT NULL AND btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.assign', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_assignments (tenant_id, case_id, thv_user_id, previous_thv_user_id, reason, assigned_by)
  VALUES (p_tenant, p_case, p_thv, c.responsible_thv_user_id, nullif(btrim(coalesce(p_reason, '')), ''), p_actor);
  UPDATE vibang_cases SET responsible_thv_user_id = p_thv, status = 'ASSIGNED', version = version + 1
   WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.assign', true, 'ALLOWED', c.office_id, c.branch_id, p_thv::text);
END $$;

-- Hồ sơ người dùng được xem: Admin/Trưởng VP/Thư ký cả văn phòng; Văn thư/Kế toán theo chi nhánh được cấp;
-- THV chỉ hồ sơ mình phụ trách. p_case NULL = danh sách (mới nhất trước).
CREATE FUNCTION vb_list_cases(p_tenant uuid, p_actor uuid, p_case uuid, p_limit integer)
RETURNS TABLE (id uuid, office_id uuid, branch_id uuid, customer_id uuid, contract_id uuid, status text, title text,
  description text, responsible_thv_user_id uuid, created_at timestamptz, version integer)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.office_id, c.branch_id, c.customer_id, c.contract_id, c.status, c.title, c.description,
         c.responsible_thv_user_id, c.created_at, c.version
  FROM vibang_cases c
  WHERE c.tenant_id = p_tenant AND (p_case IS NULL OR c.id = p_case)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id
        AND (m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY')
          OR (m.role = 'THV' AND c.responsible_thv_user_id = p_actor)
          OR (m.role IN ('VAN_THU', 'KE_TOAN') AND EXISTS (
                SELECT 1 FROM branch_grants g WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND g.branch_id = c.branch_id))))
  ORDER BY c.created_at DESC, c.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
