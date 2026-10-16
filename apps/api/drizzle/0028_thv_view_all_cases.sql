-- Chủ dự án chốt 16/10/2026: Thừa hành viên được XEM mọi hồ sơ Vi bằng của văn phòng (Business Contract #1),
-- nhưng chỉ thao tác khi được giao (các hàm ghi tự kiểm tra người phụ trách, không dựa vào hàm này).
CREATE OR REPLACE FUNCTION vb_list_cases(p_tenant uuid, p_actor uuid, p_case uuid, p_limit integer)
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
        AND (m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY', 'THV')
          OR (m.role IN ('VAN_THU', 'KE_TOAN') AND EXISTS (
                SELECT 1 FROM branch_grants g WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND g.branch_id = c.branch_id))))
  ORDER BY c.created_at DESC, c.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
