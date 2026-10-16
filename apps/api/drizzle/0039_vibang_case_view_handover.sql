-- 1) Bàn giao kết quả: người nhận + ngày bàn giao (Figma 07 "Trả kết quả"). Ghi một lần cho mỗi hồ sơ (chỉ ghi thêm).
--    Chỉ tên người nhận và ngày; KHÔNG số định danh/SĐT. Dữ liệu giả lập.
CREATE TABLE vibang_handovers (
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  recipient_name text NOT NULL CHECK (btrim(recipient_name) <> ''),
  handed_over_on date NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id),
  CONSTRAINT vibang_handovers_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);
ALTER TABLE vibang_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibang_handovers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vibang_handovers
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER vibang_handovers_ro BEFORE UPDATE OR DELETE ON vibang_handovers FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Ghi bàn giao: Văn thư (chi nhánh được cấp) hoặc THV phụ trách; hồ sơ phải đã đóng dấu hoặc đã trả; chỉ một lần.
CREATE FUNCTION vb_record_handover(p_tenant uuid, p_actor uuid, p_case uuid, p_recipient text, p_on date)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.handover.record', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['VAN_THU', 'THV']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.handover.record', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status NOT IN ('STAMPED', 'RETURNED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.handover.record', false, 'INVALID_CASE_STATUS', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_recipient, '')) = '' OR p_on IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.handover.record', false, 'INVALID_HANDOVER', c.office_id, c.branch_id, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM vibang_handovers WHERE case_id = p_case AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.handover.record', false, 'ALREADY_RECORDED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_handovers (tenant_id, case_id, recipient_name, handed_over_on, recorded_by)
  VALUES (p_tenant, p_case, btrim(p_recipient), p_on, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'vb.handover.record', true, 'ALLOWED', c.office_id, c.branch_id, p_case::text);
END $$;

-- 2) Hồ sơ kèm cột hiển thị (Khách hàng, Địa điểm, THV, số cấp, Bước tiếp theo, bàn giao). Cùng cổng xem vb_list_cases.
--    Tên khách là PII: chỉ vai tiếp nhận (vb_is_intake_staff) thấy display_name, vai khác nhận NULL.
--    next_step: ASSIGN_THV, MISA_NUMBER, SIGN, STAMP, RETURN, REGISTRATION, DONE, NULL (đã huỷ).
CREATE FUNCTION vb_list_case_view(p_tenant uuid, p_actor uuid, p_case uuid, p_limit integer)
RETURNS TABLE (id uuid, office_id uuid, branch_id uuid, branch_name text, customer_id uuid, customer_name text, contract_id uuid,
  status text, title text, description text, responsible_thv_user_id uuid, thv_label text, created_at timestamptz, version integer,
  number_label text, number_allocated_at timestamptz, next_step text, handover_recipient text, handover_on text)
LANGUAGE sql STABLE AS $$
  WITH pii AS (SELECT vb_is_intake_staff(p_tenant, p_actor) AS ok)
  SELECT c.id, c.office_id, c.branch_id, br.name, c.customer_id,
         CASE WHEN (SELECT ok FROM pii) THEN cu.display_name END,
         c.contract_id, c.status, c.title, c.description, c.responsible_thv_user_id, coalesce(ac.email, u.external_ref),
         c.created_at, c.version, n.label, n.allocated_at,
         CASE c.status
           WHEN 'INTAKE' THEN 'ASSIGN_THV'
           WHEN 'ASSIGNED' THEN CASE WHEN n.case_id IS NULL THEN 'MISA_NUMBER' ELSE 'SIGN' END
           WHEN 'SIGNED' THEN 'STAMP'
           WHEN 'STAMPED' THEN 'RETURN'
           WHEN 'RETURNED' THEN CASE WHEN coalesce(r.status, 'NOT_STARTED') = 'CONFIRMED' THEN 'DONE' ELSE 'REGISTRATION' END
           ELSE NULL END,
         h.recipient_name, to_char(h.handed_over_on, 'YYYY-MM-DD')
  FROM vb_list_cases(p_tenant, p_actor, p_case, p_limit) c
  JOIN branches br ON br.id = c.branch_id AND br.tenant_id = p_tenant
  LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.tenant_id = p_tenant
  LEFT JOIN users u ON u.id = c.responsible_thv_user_id AND u.tenant_id = p_tenant
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  LEFT JOIN vibang_numbers n ON n.case_id = c.id AND n.tenant_id = p_tenant
  LEFT JOIN vibang_registrations r ON r.case_id = c.id AND r.tenant_id = p_tenant
  LEFT JOIN vibang_handovers h ON h.case_id = c.id AND h.tenant_id = p_tenant
  ORDER BY c.created_at DESC, c.id
$$;
