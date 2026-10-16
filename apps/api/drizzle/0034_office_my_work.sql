-- Tác nghiệp ngoài văn phòng (nghiệp vụ §53): danh sách việc được giao CHO CHÍNH người gọi, xuyên các nghiệp vụ, để màn điện thoại mở ra là thấy ngay.
-- Chỉ liệt kê hồ sơ/văn bản mà người gọi là người phụ trách và chưa kết thúc. Chỉ ĐỌC: ghi dữ liệu hiện trường dùng lại các endpoint nghiệp vụ sẵn có
-- (nhật ký tống đạt, đợt xác minh, bằng chứng...), không phải quyết định pháp lý. Dữ liệu giả lập; không số tiền.
CREATE FUNCTION of_search_my_work(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (domain text, ref_id uuid, label text, status text, deadline_at timestamptz, created_at timestamptz, overdue boolean)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.my_work.read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.my_work.read', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
  WITH src AS (
    SELECT 'VIBANG'::text AS domain, c.id AS ref_id, c.title AS label, c.status, NULL::timestamptz AS deadline_at, c.created_at
      FROM vibang_cases c
     WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.responsible_thv_user_id = p_actor AND c.status = 'ASSIGNED'
    UNION ALL
    SELECT 'TONG_DAT', d.id, d.recipient_name, d.status, d.deadline_at, d.created_at
      FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
     WHERE d.tenant_id = p_tenant AND r.office_id = p_office AND d.handler_user_id = p_actor AND d.status = 'ASSIGNED'
    UNION ALL
    SELECT 'XAC_MINH', x.id, x.case_ref, x.status, NULL, x.created_at
      FROM vx_cases x
     WHERE x.tenant_id = p_tenant AND x.office_id = p_office AND x.handler_user_id = p_actor AND x.status <> 'CONCLUDED'
    UNION ALL
    SELECT 'THI_HANH', h.id, h.case_ref, h.status, NULL, h.created_at
      FROM th_cases h
     WHERE h.tenant_id = p_tenant AND h.office_id = p_office AND h.handler_user_id = p_actor AND h.status = 'OPEN'
  )
  SELECT s.domain, s.ref_id, s.label, s.status, s.deadline_at, s.created_at, coalesce(s.deadline_at < now(), false)
  FROM src s
  ORDER BY s.deadline_at NULLS LAST, s.created_at DESC, s.ref_id
  LIMIT 200;
END $$;
