-- Lát #8: tiến trình xử lý một hồ sơ để giao diện biết bước kế tiếp. Chỉ đọc; chỉ trả dữ liệu khi người gọi được xem hồ sơ
-- (cùng phạm vi vb_list_cases). Không có số tiền. Dữ liệu giả lập.
CREATE FUNCTION vb_case_progress(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (misa_status text, misa_revoke_status text, number_label text, signed_at timestamptz,
  stamped_at timestamptz, has_final_scan boolean)
LANGUAGE sql STABLE AS $$
  SELECT m.status, m.revoke_status, n.label, e.signed_at, e.stamped_at,
         EXISTS (SELECT 1 FROM vibang_documents d WHERE d.case_id = p_case AND d.tenant_id = p_tenant AND d.kind = 'FINAL_SCAN')
  FROM (SELECT 1) one
  LEFT JOIN vibang_misa_confirmations m ON m.case_id = p_case AND m.tenant_id = p_tenant
  LEFT JOIN vibang_numbers n ON n.case_id = p_case AND n.tenant_id = p_tenant
  LEFT JOIN vibang_evidence e ON e.case_id = p_case AND e.tenant_id = p_tenant
  WHERE EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
$$;
