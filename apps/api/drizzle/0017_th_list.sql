-- Lát #12: đọc danh sách hồ sơ tổ chức thi hành án kèm đương sự và nghĩa vụ, theo phạm vi ghi (chủ dự án chọn 12/10/2026).
-- Admin/Trưởng VP/Thư ký xem cả văn phòng; Văn thư và Kế toán theo chi nhánh được cấp; THV chỉ hồ sơ mình phụ trách.
-- Chỉ đọc; không trả khoá bằng chứng. Không có số tiền. Dữ liệu giả lập.
CREATE FUNCTION th_list_cases(p_tenant uuid, p_actor uuid, p_limit integer)
RETURNS TABLE (case_id uuid, case_ref text, agreement_ref text, decision_ref text, branch_id uuid, status text,
  handler_user_id uuid, created_at timestamptz, parties jsonb, obligations jsonb)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.case_ref, c.agreement_ref, c.decision_ref, c.branch_id, c.status, c.handler_user_id, c.created_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name, 'kind', p.kind,
                                                        'role', p.role) ORDER BY p.created_at, p.id)
                   FROM th_parties p WHERE p.case_id = c.id AND p.tenant_id = c.tenant_id), '[]'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'seq', o.seq, 'description', o.description,
                                                        'status', o.status, 'obligorPartyId', o.obligor_party_id) ORDER BY o.seq)
                   FROM th_obligations o WHERE o.case_id = c.id AND o.tenant_id = c.tenant_id), '[]'::jsonb)
  FROM th_cases c
  WHERE c.tenant_id = p_tenant
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
  ORDER BY c.created_at DESC, c.id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 200))
$$;
