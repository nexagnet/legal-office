-- Lát #11: đọc danh sách hồ sơ xác minh kèm các vòng, theo phạm vi ghi (chủ dự án chọn 12/10/2026). Admin/Trưởng VP/Thư ký
-- thấy cả văn phòng; Văn thư và Kế toán theo chi nhánh được cấp; THV chỉ hồ sơ mình phụ trách. Chỉ đọc; không trả nguồn,
-- khoá bằng chứng hay ủy quyền. Dữ liệu giả lập.
CREATE FUNCTION vx_list_cases(p_tenant uuid, p_actor uuid, p_limit integer)
RETURNS TABLE (case_id uuid, case_ref text, branch_id uuid, status text, handler_user_id uuid, conclusion_text text,
  proposed_by uuid, created_at timestamptz, rounds jsonb)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.case_ref, c.branch_id, c.status, c.handler_user_id, c.conclusion_text, c.proposed_by, c.created_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'seq', r.seq, 'partyName', r.party_name,
                                                        'status', r.status, 'result', r.result) ORDER BY r.seq)
                   FROM vx_rounds r WHERE r.case_id = c.id AND r.tenant_id = c.tenant_id), '[]'::jsonb)
  FROM vx_cases c
  WHERE c.tenant_id = p_tenant
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
  ORDER BY c.created_at DESC, c.id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 200))
$$;
