-- Lát #84: từ chối yêu cầu lập vi bằng theo Điều 28 NĐ 151/2026 (khoản 1–8, khoản 8 bắt buộc nêu căn cứ) và cấp bản sao vi bằng
-- theo Điều 32 (a: cơ quan có thẩm quyền yêu cầu bằng văn bản; b: người yêu cầu/người tham gia). Chỉ ghi nhận; không có sổ tiền (MISA).
-- Từ chối = huỷ hồ sơ chưa có hành vi pháp lý (INTAKE/ASSIGNED) kèm bản ghi bất biến; không thêm trạng thái mới. Dữ liệu giả lập.

CREATE TABLE vibang_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  clause smallint NOT NULL CHECK (clause BETWEEN 1 AND 8),
  basis text NOT NULL DEFAULT '',
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  rejected_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_rejections_case_uq UNIQUE (case_id),
  CONSTRAINT vibang_rejections_basis_chk CHECK (clause <> 8 OR btrim(basis) <> ''),
  CONSTRAINT vibang_rejections_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);
CREATE TRIGGER vibang_rejections_ro BEFORE UPDATE OR DELETE ON vibang_rejections
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

CREATE TABLE vibang_copy_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('AUTHORITY', 'PARTICIPANT')),
  requester text NOT NULL CHECK (btrim(requester) <> ''),
  basis text NOT NULL CHECK (btrim(basis) <> ''),
  copies smallint NOT NULL CHECK (copies BETWEEN 1 AND 50),
  received_by text NOT NULL CHECK (btrim(received_by) <> ''),
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_copy_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);
CREATE TRIGGER vibang_copy_ro BEFORE UPDATE OR DELETE ON vibang_copy_issuances
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vibang_rejections', 'vibang_copy_issuances'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- Từ chối: Admin, Trưởng VP hoặc THV phụ trách. Chỉ khi hồ sơ chưa ký/đóng dấu.
CREATE FUNCTION vb_reject_case(p_tenant uuid, p_actor uuid, p_case uuid, p_clause integer, p_basis text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.reject', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.responsible_thv_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.reject', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status NOT IN ('INTAKE', 'ASSIGNED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.reject', false, 'REJECT_NOT_ALLOWED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_clause IS NULL OR p_clause NOT BETWEEN 1 AND 8 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.reject', false, 'INVALID_CLAUSE', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.reject', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_clause = 8 AND btrim(coalesce(p_basis, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.reject', false, 'BASIS_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_rejections (tenant_id, case_id, clause, basis, reason, rejected_by)
  VALUES (p_tenant, p_case, p_clause, btrim(coalesce(p_basis, '')), btrim(p_reason), p_actor);
  UPDATE vibang_cases SET status = 'CANCELLED', cancel_reason = 'Từ chối theo Điều 28 khoản ' || p_clause || ': ' || btrim(p_reason),
         version = version + 1
   WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.reject', true, 'ALLOWED', c.office_id, c.branch_id, p_case::text);
END $$;

-- Cấp bản sao: chỉ vi bằng đã trả (RETURNED); chỉ văn phòng đang lưu bản gốc (cùng văn phòng với hồ sơ).
CREATE FUNCTION vb_issue_copy(p_tenant uuid, p_actor uuid, p_case uuid, p_kind text, p_requester text, p_basis text,
                              p_copies integer, p_received_by text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text; cid uuid;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.copy.issue', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'THV'], c.responsible_thv_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.copy.issue', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'RETURNED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.copy.issue', false, 'CASE_NOT_RETURNED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('AUTHORITY', 'PARTICIPANT') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.copy.issue', false, 'INVALID_KIND', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_requester, '')) = '' OR btrim(coalesce(p_basis, '')) = '' OR btrim(coalesce(p_received_by, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.copy.issue', false, 'FIELDS_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_copies IS NULL OR p_copies NOT BETWEEN 1 AND 50 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.copy.issue', false, 'INVALID_COPIES', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_copy_issuances (tenant_id, case_id, kind, requester, basis, copies, received_by, issued_by)
  VALUES (p_tenant, p_case, p_kind, btrim(p_requester), btrim(p_basis), p_copies, btrim(p_received_by), p_actor)
  RETURNING id INTO cid;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.copy.issue', true, 'ALLOWED', c.office_id, c.branch_id, cid::text);
END $$;
