-- Số tiếp nhận và người tạo hồ sơ (Figma Danh sách/Chi tiết/Tạo hồ sơ), chủ dự án chốt lưu 17/10/2026.
-- Số tiếp nhận: <số>/<năm>/TN, đếm theo văn phòng, reset theo năm (giờ Việt Nam) của ngày tiếp nhận; cấp lúc tạo hồ sơ.
-- Hồ sơ tạo trước migration này có intake_no/created_by rỗng (không suy đoán). Dữ liệu giả lập.
ALTER TABLE vibang_cases ADD COLUMN intake_no text, ADD COLUMN created_by uuid;
CREATE UNIQUE INDEX vibang_cases_intake_no_uq ON vibang_cases (tenant_id, office_id, intake_no) WHERE intake_no IS NOT NULL;

CREATE TABLE vibang_intake_counters (
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  year integer NOT NULL,
  last_value integer NOT NULL CHECK (last_value >= 1),
  PRIMARY KEY (tenant_id, office_id, year),
  CONSTRAINT vibang_intake_counters_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
ALTER TABLE vibang_intake_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibang_intake_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vibang_intake_counters
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION vb_create_case(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_customer uuid, p_contract uuid,
  p_title text, p_description text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; cid uuid; y integer; n integer;
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
  y := extract(year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::integer;
  INSERT INTO vibang_intake_counters (tenant_id, office_id, year, last_value) VALUES (p_tenant, p_office, y, 1)
  ON CONFLICT (tenant_id, office_id, year) DO UPDATE SET last_value = vibang_intake_counters.last_value + 1
  RETURNING last_value INTO n;
  INSERT INTO vibang_cases (tenant_id, office_id, branch_id, customer_id, contract_id, title, description, intake_no, created_by)
  VALUES (p_tenant, p_office, p_branch, p_customer, p_contract, btrim(p_title), coalesce(p_description, ''),
          n || '/' || y || '/TN', p_actor)
  RETURNING id INTO cid;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.create', true, 'ALLOWED', p_office, p_branch, cid::text);
END $$;

-- Hồ sơ kèm cột hiển thị (Khách hàng, Địa điểm, THV, số cấp, Bước tiếp theo, bàn giao). Cùng cổng xem vb_list_cases.
--    Tên khách là PII: chỉ vai tiếp nhận (vb_is_intake_staff) thấy display_name, vai khác nhận NULL.
--    next_step: ASSIGN_THV, MISA_NUMBER, SIGN, STAMP, RETURN, REGISTRATION, DONE, NULL (đã huỷ).
DROP FUNCTION vb_list_case_view(uuid, uuid, uuid, integer);
CREATE FUNCTION vb_list_case_view(p_tenant uuid, p_actor uuid, p_case uuid, p_limit integer)
RETURNS TABLE (id uuid, office_id uuid, branch_id uuid, branch_name text, customer_id uuid, customer_name text, contract_id uuid,
  status text, title text, description text, responsible_thv_user_id uuid, thv_label text, created_at timestamptz, version integer,
  number_label text, number_allocated_at timestamptz, next_step text, handover_recipient text, handover_on text,
  intake_no text, created_by uuid, created_by_label text, customer_phone text, customer_id_number text)
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
         h.recipient_name, to_char(h.handed_over_on, 'YYYY-MM-DD'),
         vc.intake_no, vc.created_by, coalesce(cac.email, cu2.external_ref),
         CASE WHEN (SELECT ok FROM pii) THEN cu.phone END, CASE WHEN (SELECT ok FROM pii) THEN cu.id_number END
  FROM vb_list_cases(p_tenant, p_actor, p_case, p_limit) c
  JOIN vibang_cases vc ON vc.id = c.id AND vc.tenant_id = p_tenant
  JOIN branches br ON br.id = c.branch_id AND br.tenant_id = p_tenant
  LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.tenant_id = p_tenant
  LEFT JOIN users u ON u.id = c.responsible_thv_user_id AND u.tenant_id = p_tenant
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  LEFT JOIN vibang_numbers n ON n.case_id = c.id AND n.tenant_id = p_tenant
  LEFT JOIN vibang_registrations r ON r.case_id = c.id AND r.tenant_id = p_tenant
  LEFT JOIN users cu2 ON cu2.id = vc.created_by AND cu2.tenant_id = p_tenant
  LEFT JOIN auth_credentials cac ON cac.user_id = cu2.id AND cac.tenant_id = cu2.tenant_id
  LEFT JOIN vibang_handovers h ON h.case_id = c.id AND h.tenant_id = p_tenant
  ORDER BY c.created_at DESC, c.id
$$;
