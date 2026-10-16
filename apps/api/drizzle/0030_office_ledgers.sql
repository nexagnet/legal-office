-- Lát sổ theo dõi (Phụ lục I TT 08/2026/TT-BTP): ĐỌC các dòng của S-01 (tống đạt), S-02 (lập vi bằng), S-04 (xác minh điều kiện
-- thi hành án), S-05 (thi hành án) từ dữ liệu đã có, đúng thứ tự và tên cột như mẫu. S-03 là của Sở Tư pháp, S-06 đã có of_s06_read.
-- Đây là bản điện tử hỗ trợ theo dõi, KHÔNG phải biểu mẫu chính thức. Cột mẫu yêu cầu mà DB chưa có nguồn thì trả NULL (không suy đoán).
-- Quyền đọc: Admin/Trưởng VP/Thư ký/Thừa hành viên xem toàn văn phòng (chủ dự án chốt 16/10/2026 cho THV); Văn thư theo chi nhánh được cấp;
-- Kế toán KHÔNG xem sổ nghiệp vụ pháp lý. Mọi lần đọc được audit (kể cả bị từ chối). Chỉ đọc; không có số tiền. Dữ liệu giả lập.

-- Cổng chung: có vai được xem sổ ở văn phòng này không (audit kết quả). Trả false nếu không.
CREATE FUNCTION of_ledger_gate(p_tenant uuid, p_actor uuid, p_office uuid, p_action text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m
                 WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office
                   AND m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, p_action, false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN false;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, p_action, true, 'ALLOWED', p_office, NULL, NULL);
  RETURN true;
END $$;

-- Phạm vi theo dòng: vai toàn văn phòng thấy mọi chi nhánh; Văn thư chỉ chi nhánh được cấp. Kế toán không có trong danh sách.
CREATE FUNCTION of_ledger_can_read(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office
      AND (m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY', 'THV')
        OR (m.role = 'VAN_THU' AND EXISTS (SELECT 1 FROM branch_grants g
                                           WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND g.branch_id = p_branch)))
  )
$$;

-- "Số, ngày" dạng chữ; NULL nếu thiếu số.
CREATE FUNCTION of_ledger_ref_date(p_ref text, p_date date) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_ref IS NULL THEN NULL
              WHEN p_date IS NULL THEN p_ref
              ELSE p_ref || ', ' || to_char(p_date, 'DD/MM/YYYY') END
$$;

-- S-01 — Sổ theo dõi việc tống đạt. Mỗi dòng = một văn bản cần tống đạt. Cột 1..10 theo mẫu, sau đó cột truy vết.
-- Ghi chú = lý do không giao được (nếu có). Hình thức tống đạt chỉ nhận ra được "Niêm yết" (có lần POSTED_NOTICE).
-- Nguồn thiếu (NULL): loại văn bản; số/ngày văn bản; cơ quan Tòa án/THA dân sự/Kiểm sát giao văn bản; họ tên + số Thẻ THV.
CREATE FUNCTION of_ledger_s01(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer, p_limit integer)
RETURNS TABLE (stt bigint, loai_van_ban text, so_ngay_van_ban text, co_quan_toa_an text, co_quan_thi_hanh_an text,
  co_quan_kiem_sat text, ngay_tong_dat text, hinh_thuc_tong_dat text, thua_hanh_vien_thuc_hien text, ghi_chu text,
  document_id uuid, request_id uuid, request_ref text, branch_id uuid, thv_user_id uuid, status text)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF NOT of_ledger_gate(p_tenant, p_actor, p_office, 'of.ledger.s01.read') THEN RETURN; END IF;
  RETURN QUERY
  WITH rows_ AS (
    SELECT d.id AS document_id, d.request_id, r.request_ref, r.branch_id, d.handler_user_id, d.status,
           d.undeliverable_reason, d.created_at
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office
      AND (p_year IS NULL OR extract(year FROM d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = p_year)
      AND of_ledger_can_read(p_tenant, p_actor, r.office_id, r.branch_id)
  ), numbered AS (
    SELECT row_number() OVER (ORDER BY x.created_at, x.document_id) AS stt, x.* FROM rows_ x
  )
  SELECT n.stt, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
         to_char((SELECT min(a.at) FROM td_attempts a
                   WHERE a.document_id = n.document_id AND a.tenant_id = p_tenant AND a.outcome = 'SERVED')
                 AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'),
         CASE WHEN EXISTS (SELECT 1 FROM td_attempts a WHERE a.document_id = n.document_id AND a.tenant_id = p_tenant
                                AND a.outcome = 'POSTED_NOTICE') THEN 'Niêm yết' ELSE NULL END,
         NULL::text,
         CASE n.undeliverable_reason WHEN 'NO_RECIPIENT' THEN 'Không giao được: không có người nhận'
                                     WHEN 'ADDRESS_NOT_FOUND' THEN 'Không giao được: không tìm thấy địa chỉ'
                                     WHEN 'RECIPIENT_REFUSED' THEN 'Không giao được: người nhận từ chối'
                                     ELSE NULL END,
         n.document_id, n.request_id, n.request_ref, n.branch_id, n.handler_user_id, n.status
  FROM numbered n
  ORDER BY n.stt
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
END $$;

-- S-02 — Sổ theo dõi việc lập vi bằng. Mỗi dòng = một vi bằng đã được cấp số. Cột 1..7 theo mẫu, sau đó cột truy vết.
-- Ngày của vi bằng = ngày cấp số (chưa có cột ngày ký riêng). Nguồn thiếu (NULL): địa chỉ nơi lập vi bằng; họ tên + số Thẻ THV.
CREATE FUNCTION of_ledger_s02(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer, p_limit integer)
RETURNS TABLE (stt bigint, nguoi_yeu_cau text, noi_dung_yeu_cau text, so_ngay_vi_bang text, dia_chi_noi_lap text,
  thua_hanh_vien_lap text, ghi_chu text, case_id uuid, vibang_label text, branch_id uuid, thv_user_id uuid, status text)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF NOT of_ledger_gate(p_tenant, p_actor, p_office, 'of.ledger.s02.read') THEN RETURN; END IF;
  RETURN QUERY
  WITH rows_ AS (
    SELECT c.id AS case_id, n.label, n.year, n.seq, n.allocated_at, c.branch_id, c.responsible_thv_user_id, c.status,
           c.description, c.title, c.cancel_reason, cu.display_name, cu.address
    FROM vibang_numbers n
    JOIN vibang_cases c ON c.id = n.case_id AND c.tenant_id = n.tenant_id
    LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.tenant_id = c.tenant_id
    WHERE n.tenant_id = p_tenant AND n.office_id = p_office AND (p_year IS NULL OR n.year = p_year)
      AND of_ledger_can_read(p_tenant, p_actor, c.office_id, c.branch_id)
  ), numbered AS (
    SELECT row_number() OVER (ORDER BY x.year, x.seq) AS stt, x.* FROM rows_ x
  )
  SELECT n.stt,
         nullif(concat_ws(', ', nullif(btrim(n.display_name), ''), nullif(btrim(n.address), '')), ''),
         coalesce(nullif(btrim(n.description), ''), nullif(btrim(n.title), '')),
         of_ledger_ref_date(n.label, (n.allocated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
         NULL::text, NULL::text, n.cancel_reason, n.case_id, n.label, n.branch_id, n.responsible_thv_user_id, n.status
  FROM numbered n
  ORDER BY n.stt
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
END $$;

-- S-04 — Sổ theo dõi việc xác minh điều kiện thi hành án. Mỗi dòng = một hồ sơ xác minh. Cột 1..11 theo mẫu, sau đó cột truy vết.
-- Quyết định xác minh = quyết định đầu tiên trong sổ quyết định gắn hồ sơ (case_kind VERIFICATION).
-- Nguồn thiếu (NULL): hợp đồng dịch vụ; quyết định về THA (số, ngày); bản án/quyết định của Tòa án; người yêu cầu THA; người phải THA;
-- nội dung xác minh; ghi chú; họ tên THV. Các vòng xác minh (bên liên quan, kết quả từng vòng) nằm ở cột truy vết rounds.
CREATE FUNCTION of_ledger_s04(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer, p_limit integer)
RETURNS TABLE (stt bigint, hop_dong_dich_vu text, quyet_dinh_thi_hanh_an text, ban_an_quyet_dinh_toa_an text,
  quyet_dinh_xac_minh text, nguoi_yeu_cau_thi_hanh_an text, nguoi_phai_thi_hanh_an text, noi_dung_xac_minh text,
  ket_qua_xac_minh text, thua_hanh_vien_thuc_hien text, ghi_chu text,
  case_id uuid, case_ref text, branch_id uuid, thv_user_id uuid, status text, rounds jsonb)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF NOT of_ledger_gate(p_tenant, p_actor, p_office, 'of.ledger.s04.read') THEN RETURN; END IF;
  RETURN QUERY
  WITH rows_ AS (
    SELECT c.id AS case_id, c.case_ref, c.branch_id, c.handler_user_id, c.status, c.conclusion_text, c.created_at
    FROM vx_cases c
    WHERE c.tenant_id = p_tenant AND c.office_id = p_office
      AND (p_year IS NULL OR extract(year FROM c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = p_year)
      AND of_ledger_can_read(p_tenant, p_actor, c.office_id, c.branch_id)
  ), numbered AS (
    SELECT row_number() OVER (ORDER BY x.created_at, x.case_id) AS stt, x.* FROM rows_ x
  )
  SELECT n.stt, NULL::text, NULL::text, NULL::text,
         (SELECT of_ledger_ref_date(dd.decision_no, dd.signed_on)
            FROM of_decisions dd
           WHERE dd.tenant_id = p_tenant AND dd.office_id = p_office AND dd.case_kind = 'VERIFICATION' AND dd.case_id = n.case_id
           ORDER BY dd.signed_on, dd.id LIMIT 1),
         NULL::text, NULL::text, NULL::text, n.conclusion_text, NULL::text, NULL::text,
         n.case_id, n.case_ref, n.branch_id, n.handler_user_id, n.status,
         coalesce((SELECT jsonb_agg(jsonb_build_object('seq', r.seq, 'partyName', r.party_name, 'status', r.status,
                                                        'result', r.result) ORDER BY r.seq)
                     FROM vx_rounds r WHERE r.case_id = n.case_id AND r.tenant_id = p_tenant), '[]'::jsonb)
  FROM numbered n
  ORDER BY n.stt
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
END $$;

-- S-05 — Sổ theo dõi việc thi hành án. Mỗi dòng = một hồ sơ tổ chức thi hành án. Cột 1..13 theo mẫu, sau đó cột truy vết.
-- Hợp đồng dịch vụ = tham chiếu N-07 (agreement_ref, không có ngày). Cột 4 = các quyết định trong sổ quyết định gắn hồ sơ
-- (case_kind ENFORCEMENT; "số, ngày"). decision_ref (quyết định/bản án liên quan) được đặt ở cột 7 (bản án, quyết định của Tòa án).
-- Bên phải/được thi hành án lấy theo vai DEBTOR/CREDITOR của đương sự (chỉ có tên, chưa có địa chỉ). Các khoản phải THA = các nghĩa vụ.
-- Kết quả = trạng thái hồ sơ kèm số nghĩa vụ hoàn tất/tổng. Nguồn thiếu (NULL): cột 3; sửa đổi/bổ sung và thu hồi quyết định THA
-- (sổ quyết định chưa phân loại); ghi chú; họ tên + số Thẻ THV.
CREATE FUNCTION of_ledger_s05(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer, p_limit integer)
RETURNS TABLE (stt bigint, hop_dong_dich_vu text, quyet_dinh_ve_thi_hanh_an text, so_ngay_quyet_dinh_thi_hanh_an text,
  sua_doi_bo_sung_quyet_dinh text, thu_hoi_quyet_dinh text, ban_an_quyet_dinh_toa_an text, ben_phai_thi_hanh_an text,
  ben_duoc_thi_hanh_an text, cac_khoan_phai_thi_hanh_an text, ket_qua_thi_hanh_an text, thua_hanh_vien_thuc_hien text,
  ghi_chu text, case_id uuid, case_ref text, branch_id uuid, thv_user_id uuid, status text)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF NOT of_ledger_gate(p_tenant, p_actor, p_office, 'of.ledger.s05.read') THEN RETURN; END IF;
  RETURN QUERY
  WITH rows_ AS (
    SELECT c.id AS case_id, c.case_ref, c.agreement_ref, c.decision_ref, c.branch_id, c.handler_user_id, c.status, c.created_at
    FROM th_cases c
    WHERE c.tenant_id = p_tenant AND c.office_id = p_office
      AND (p_year IS NULL OR extract(year FROM c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = p_year)
      AND of_ledger_can_read(p_tenant, p_actor, c.office_id, c.branch_id)
  ), numbered AS (
    SELECT row_number() OVER (ORDER BY x.created_at, x.case_id) AS stt, x.* FROM rows_ x
  )
  SELECT n.stt, n.agreement_ref, NULL::text,
         (SELECT string_agg(of_ledger_ref_date(dd.decision_no, dd.signed_on), '; ' ORDER BY dd.signed_on, dd.id)
            FROM of_decisions dd
           WHERE dd.tenant_id = p_tenant AND dd.office_id = p_office AND dd.case_kind = 'ENFORCEMENT' AND dd.case_id = n.case_id),
         NULL::text, NULL::text, n.decision_ref,
         (SELECT string_agg(p.display_name, '; ' ORDER BY p.created_at, p.id) FROM th_parties p
           WHERE p.case_id = n.case_id AND p.tenant_id = p_tenant AND p.role = 'DEBTOR'),
         (SELECT string_agg(p.display_name, '; ' ORDER BY p.created_at, p.id) FROM th_parties p
           WHERE p.case_id = n.case_id AND p.tenant_id = p_tenant AND p.role = 'CREDITOR'),
         (SELECT string_agg(o.seq || '. ' || o.description, '; ' ORDER BY o.seq) FROM th_obligations o
           WHERE o.case_id = n.case_id AND o.tenant_id = p_tenant),
         n.status || ' (' ||
           (SELECT count(*) FROM th_obligations o WHERE o.case_id = n.case_id AND o.tenant_id = p_tenant AND o.status = 'COMPLETED') || '/' ||
           (SELECT count(*) FROM th_obligations o WHERE o.case_id = n.case_id AND o.tenant_id = p_tenant) || ' nghĩa vụ hoàn tất)',
         NULL::text, NULL::text, n.case_id, n.case_ref, n.branch_id, n.handler_user_id, n.status
  FROM numbered n
  ORDER BY n.stt
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
END $$;
