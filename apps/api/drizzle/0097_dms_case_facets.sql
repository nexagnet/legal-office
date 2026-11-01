-- DMS: dữ liệu phụ cho bộ lọc danh sách hồ sơ (Figma: Loại tài liệu, Người tạo, Đơn vị).
-- Hàm đọc riêng, KHÔNG sửa dms_list_cases. Cùng một chốt chặn hiển thị dms_case_visible nên không lộ hồ sơ ngoài quyền/chi nhánh.
-- Tên người tạo: users.full_name, chưa có thì phần trước @ của external_ref (giống màn Nhân sự).
CREATE FUNCTION dms_case_facets(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text)
RETURNS TABLE (case_id uuid, creator_name text, branch_id uuid, branch_name text, doc_kinds text[])
LANGUAGE sql STABLE AS $$
  SELECT c.id,
         coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), '')),
         c.branch_id,
         b.name,
         coalesce((SELECT array_agg(DISTINCT d.kind ORDER BY d.kind)
                     FROM dms_documents d
                    WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'), '{}'::text[])
    FROM dms_case_files c
    LEFT JOIN users u ON u.id = c.created_by AND u.tenant_id = c.tenant_id
    LEFT JOIN branches b ON b.id = c.branch_id AND b.tenant_id = c.tenant_id
   WHERE c.tenant_id = p_tenant AND c.office_id = p_office
     AND (p_domain IS NULL OR c.domain = p_domain)
     AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
   ORDER BY c.created_at DESC, c.id
   LIMIT 2000;
$$;
