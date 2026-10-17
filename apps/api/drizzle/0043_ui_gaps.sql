-- Dữ liệu còn thiếu cho giao diện: (1) số vi bằng theo khách hàng, (2) địa chỉ nơi lập vi bằng (cột 5 sổ S-02),
-- (3) hoạt động theo địa điểm, (4) tab "Thông tin pháp lý" và "Lịch sử" của chi tiết hồ sơ. Dữ liệu giả lập.

-- (2) Nơi lập vi bằng: nhập tay, chỉ sửa được khi hồ sơ chưa trả/huỷ. Không suy đoán từ địa chỉ khách hay chi nhánh.
ALTER TABLE vibang_cases ADD COLUMN place_address text;

CREATE FUNCTION vb_set_case_place(p_tenant uuid, p_actor uuid, p_case uuid, p_place text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.place', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'THV']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.place', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.place', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vibang_cases SET place_address = nullif(btrim(coalesce(p_place, '')), '') WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.place', true, 'ALLOWED', c.office_id, c.branch_id, p_case::text);
END $$;

-- S-02 cột 5 lấy từ nơi lập vi bằng (NULL nếu chưa nhập). Còn lại giữ nguyên như 0030.
CREATE OR REPLACE FUNCTION of_ledger_s02(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer, p_limit integer)
RETURNS TABLE (stt bigint, nguoi_yeu_cau text, noi_dung_yeu_cau text, so_ngay_vi_bang text, dia_chi_noi_lap text,
  thua_hanh_vien_lap text, ghi_chu text, case_id uuid, vibang_label text, branch_id uuid, thv_user_id uuid, status text)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF NOT of_ledger_gate(p_tenant, p_actor, p_office, 'of.ledger.s02.read') THEN RETURN; END IF;
  RETURN QUERY
  WITH rows_ AS (
    SELECT c.id AS case_id, n.label, n.year, n.seq, n.allocated_at, c.branch_id, c.responsible_thv_user_id, c.status,
           c.description, c.title, c.cancel_reason, c.place_address, cu.display_name, cu.address
    FROM vibang_numbers n
    JOIN vibang_cases c ON c.id = n.case_id AND c.tenant_id = n.tenant_id
    LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.tenant_id = c.tenant_id
    WHERE n.tenant_id = p_tenant AND n.office_id = p_office AND (p_year IS NULL OR n.year = p_year)
      AND of_ledger_can_read(p_tenant, p_actor, c.office_id, c.branch_id, c.responsible_thv_user_id, true)
  ), numbered AS (
    SELECT row_number() OVER (ORDER BY x.year, x.seq) AS stt, x.* FROM rows_ x
  )
  SELECT n.stt,
         nullif(concat_ws(', ', nullif(btrim(n.display_name), ''), nullif(btrim(n.address), '')), ''),
         coalesce(nullif(btrim(n.description), ''), nullif(btrim(n.title), '')),
         of_ledger_ref_date(n.label, (n.allocated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
         n.place_address, NULL::text, n.cancel_reason, n.case_id, n.label, n.branch_id, n.responsible_thv_user_id, n.status
  FROM numbered n
  ORDER BY n.stt
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
END $$;

-- (1) Số vi bằng theo khách hàng. Danh bạ khách là PII nên chỉ vai tiếp nhận; mỗi hồ sơ vẫn qua cổng xem vb_list_cases.
CREATE FUNCTION vb_list_customer_numbers(p_tenant uuid, p_actor uuid, p_customer uuid)
RETURNS TABLE (case_id uuid, number_label text, allocated_at timestamptz, case_status text, title text, branch_id uuid, branch_name text)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'vb.customer.numbers', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'vb.customer.numbers', true, 'ALLOWED', NULL, NULL, p_customer::text);
  RETURN QUERY
    SELECT v.id, n.label, n.allocated_at, v.status, v.title, v.branch_id, b.name
    FROM vb_list_cases(p_tenant, p_actor, NULL, 200) v
    JOIN vibang_numbers n ON n.case_id = v.id AND n.tenant_id = p_tenant
    LEFT JOIN branches b ON b.id = v.branch_id AND b.tenant_id = p_tenant
    WHERE v.customer_id = p_customer
    ORDER BY n.allocated_at DESC, n.id;
END $$;

-- (4a) Tab "Thông tin pháp lý": hợp đồng, định danh khách (PII: chỉ vai tiếp nhận), số vi bằng, MISA, ký, đóng dấu, đăng ký, bản scan.
CREATE FUNCTION vb_case_legal(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (place_address text, contract_ref text, contract_service_kind text, contract_signed_on text, contract_valid_from text,
  contract_valid_to text, contract_status text, customer_kind text, customer_name text, customer_id_number text, customer_address text,
  customer_phone text, customer_tax_code text, customer_representative text, number_label text, number_allocated_at timestamptz,
  misa_status text, misa_reference text, misa_confirmed_at timestamptz, signed_at timestamptz, signed_by_label text,
  stamped_at timestamptz, stamped_by_label text, registration_status text, registration_deadline_at timestamptz,
  final_scan_sha256 text, final_scan_locked_at timestamptz)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE pii boolean;
BEGIN
  pii := vb_is_intake_staff(p_tenant, p_actor);
  RETURN QUERY
  SELECT c.place_address, k.external_ref, k.service_kind, to_char(k.signed_on, 'YYYY-MM-DD'), to_char(k.valid_from, 'YYYY-MM-DD'),
         to_char(k.valid_to, 'YYYY-MM-DD'), k.status,
         cu.kind, CASE WHEN pii THEN cu.display_name END, CASE WHEN pii THEN cu.id_number END, CASE WHEN pii THEN cu.address END,
         CASE WHEN pii THEN cu.phone END, CASE WHEN pii THEN cu.tax_code END, CASE WHEN pii THEN cu.representative END,
         n.label, n.allocated_at, m.status, m.reference, m.confirmed_at,
         e.signed_at, (SELECT coalesce(ac.email, u.external_ref) FROM users u LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id WHERE u.id = e.signed_by AND u.tenant_id = p_tenant),
         e.stamped_at, (SELECT coalesce(ac.email, u.external_ref) FROM users u LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id WHERE u.id = e.stamped_by AND u.tenant_id = p_tenant),
         r.status, r.deadline_at, e.final_scan_sha256, e.locked_at
  FROM vibang_cases c
  LEFT JOIN contracts k ON k.id = c.contract_id AND k.tenant_id = c.tenant_id
  LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.tenant_id = c.tenant_id
  LEFT JOIN vibang_numbers n ON n.case_id = c.id AND n.tenant_id = c.tenant_id
  LEFT JOIN vibang_misa_confirmations m ON m.case_id = c.id AND m.tenant_id = c.tenant_id
  LEFT JOIN vibang_evidence e ON e.case_id = c.id AND e.tenant_id = c.tenant_id
  LEFT JOIN vibang_registrations r ON r.case_id = c.id AND r.tenant_id = c.tenant_id
  WHERE c.id = p_case AND c.tenant_id = p_tenant
    AND EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1));
END $$;

-- (4b) Tab "Lịch sử": các mốc của hồ sơ theo thời gian, ghép từ các bảng nghiệp vụ (audit_log không gắn hồ sơ nên không dùng).
-- Chỉ mã sự kiện + người làm + chi tiết ngắn không PII. Cùng cổng xem vb_list_cases.
CREATE FUNCTION vb_case_history(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (at timestamptz, kind text, actor_user_id uuid, actor_label text, detail text)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH ev AS (
    SELECT c.created_at AS at, 'CASE_CREATED'::text AS kind, c.created_by AS actor, NULL::text AS detail
      FROM vibang_cases c WHERE c.id = p_case AND c.tenant_id = p_tenant
    UNION ALL SELECT a.at, CASE WHEN a.previous_thv_user_id IS NULL THEN 'THV_ASSIGNED' ELSE 'THV_CHANGED' END, a.assigned_by, a.reason
      FROM vibang_assignments a WHERE a.case_id = p_case AND a.tenant_id = p_tenant
    UNION ALL SELECT m.at, 'MISA_' || m.event, m.actor_user_id, coalesce(m.reference, m.reason)
      FROM vibang_misa_events m WHERE m.case_id = p_case AND m.tenant_id = p_tenant
    UNION ALL SELECT n.allocated_at, 'NUMBER_ALLOCATED', n.allocated_by, n.label
      FROM vibang_numbers n WHERE n.case_id = p_case AND n.tenant_id = p_tenant
    UNION ALL SELECT d.created_at, 'DOCUMENT_ADDED', d.created_by, d.kind || ' v' || d.version
      FROM vibang_documents d WHERE d.case_id = p_case AND d.tenant_id = p_tenant
    UNION ALL SELECT e.signed_at, 'SIGNED', e.signed_by, NULL FROM vibang_evidence e WHERE e.case_id = p_case AND e.tenant_id = p_tenant AND e.signed_at IS NOT NULL
    UNION ALL SELECT e.stamped_at, 'STAMPED', e.stamped_by, NULL FROM vibang_evidence e WHERE e.case_id = p_case AND e.tenant_id = p_tenant AND e.stamped_at IS NOT NULL
    UNION ALL SELECT h.recorded_at, 'HANDOVER', h.recorded_by, NULL FROM vibang_handovers h WHERE h.case_id = p_case AND h.tenant_id = p_tenant
    UNION ALL SELECT r.created_at, 'CHANGE_REQUESTED', CASE WHEN r.requested_by ~ '^[0-9a-f-]{36}$' THEN r.requested_by::uuid END, r.reason
      FROM vibang_case_change_requests r WHERE r.case_id = p_case AND r.tenant_id = p_tenant
    UNION ALL SELECT r.decided_at, 'CHANGE_' || r.status, CASE WHEN r.decided_by ~ '^[0-9a-f-]{36}$' THEN r.decided_by::uuid END, NULL
      FROM vibang_case_change_requests r WHERE r.case_id = p_case AND r.tenant_id = p_tenant AND r.decided_at IS NOT NULL
    UNION ALL SELECT j.created_at, 'REJECTED', j.rejected_by, 'khoản ' || j.clause
      FROM vibang_rejections j WHERE j.case_id = p_case AND j.tenant_id = p_tenant
    UNION ALL SELECT i.issued_at, 'COPY_ISSUED', i.issued_by, i.kind || ' x' || i.copies
      FROM vibang_copy_issuances i WHERE i.case_id = p_case AND i.tenant_id = p_tenant
    UNION ALL SELECT l.at, 'CONTACT_' || l.kind, l.actor_user_id, l.outcome
      FROM vibang_contact_log l WHERE l.case_id = p_case AND l.tenant_id = p_tenant
    UNION ALL SELECT o.requested_at, 'N11_PROPOSED', o.requested_by, o.reason
      FROM vibang_n11_corrections o WHERE o.case_id = p_case AND o.tenant_id = p_tenant
    UNION ALL SELECT o.applied_at, 'N11_APPLIED', o.signatory_user_id, NULL
      FROM vibang_n11_corrections o WHERE o.case_id = p_case AND o.tenant_id = p_tenant AND o.applied_at IS NOT NULL
  )
  SELECT ev.at, ev.kind, ev.actor,
         (SELECT coalesce(ac.email, u.external_ref) FROM users u
            LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
           WHERE u.id = ev.actor AND u.tenant_id = p_tenant),
         ev.detail
  FROM ev
  WHERE EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
  ORDER BY ev.at, ev.kind;
END $$;

-- (3) Hoạt động theo địa điểm (chi nhánh): mỗi chi nhánh một dòng; kỳ theo ngày tạo (giờ Việt Nam). Chi nhánh không có việc vẫn hiện với số 0.
-- Phạm vi đọc như báo cáo (of_can_read); không số tiền. Đếm đúng từng đơn vị, không cộng chéo.
CREATE FUNCTION of_search_branch_activity(p_tenant uuid, p_actor uuid, p_office uuid, p_from date, p_to date)
RETURNS TABLE (branch_id uuid, branch_name text, vibang_cases integer, vibang_numbers integer, tong_dat_documents integer,
  xac_minh_cases integer, thi_hanh_cases integer, correspondence integer, last_activity_at timestamptz)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.report.branch_activity', true, 'ALLOWED', p_office, NULL, NULL);
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN RETURN; END IF;
  RETURN QUERY
  WITH src AS (
    SELECT c.branch_id AS bid, 'VC'::text AS k, c.responsible_thv_user_id AS handler, c.created_at AS at
      FROM vibang_cases c WHERE c.tenant_id = p_tenant AND c.office_id = p_office
    UNION ALL SELECT c.branch_id, 'VN', c.responsible_thv_user_id, n.allocated_at
      FROM vibang_numbers n JOIN vibang_cases c ON c.id = n.case_id AND c.tenant_id = n.tenant_id
     WHERE n.tenant_id = p_tenant AND n.office_id = p_office
    UNION ALL SELECT r.branch_id, 'TD', d.handler_user_id, d.created_at
      FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
     WHERE d.tenant_id = p_tenant AND r.office_id = p_office
    UNION ALL SELECT x.branch_id, 'XM', x.handler_user_id, x.created_at FROM vx_cases x WHERE x.tenant_id = p_tenant AND x.office_id = p_office
    UNION ALL SELECT t.branch_id, 'TH', t.handler_user_id, t.created_at FROM th_cases t WHERE t.tenant_id = p_tenant AND t.office_id = p_office
    UNION ALL SELECT o.branch_id, 'CV', o.handler_user_id, o.created_at FROM of_correspondence o WHERE o.tenant_id = p_tenant AND o.office_id = p_office
  ), vis AS (
    SELECT s.* FROM src s
     WHERE (s.at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
       AND of_can_read(p_tenant, p_actor, p_office, s.bid, s.handler)
  )
  SELECT b.id, b.name,
         (count(*) FILTER (WHERE v.k = 'VC'))::integer, (count(*) FILTER (WHERE v.k = 'VN'))::integer,
         (count(*) FILTER (WHERE v.k = 'TD'))::integer, (count(*) FILTER (WHERE v.k = 'XM'))::integer,
         (count(*) FILTER (WHERE v.k = 'TH'))::integer, (count(*) FILTER (WHERE v.k = 'CV'))::integer,
         max(v.at)
  FROM branches b
  LEFT JOIN vis v ON v.bid = b.id
  WHERE b.tenant_id = p_tenant AND b.office_id = p_office AND (v.bid IS NOT NULL OR of_can_read(p_tenant, p_actor, p_office, b.id, NULL))
  GROUP BY b.id, b.name
  ORDER BY b.name, b.id;
END $$;
