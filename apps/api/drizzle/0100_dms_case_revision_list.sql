-- DMS: danh sách phiên bản của hồ sơ để so sánh trước/sau (Figma tab "Phiên bản").
-- rev 0 = bản gốc lúc ghi sổ (cột gốc của dms_case_files không bị ghi đè); rev >= 1 = các bản sửa đổi đã duyệt, kèm lý do.
-- Cùng chốt chặn hiển thị dms_case_visible với mọi hàm đọc khác; không sửa dữ liệu.
CREATE FUNCTION dms_case_revision_list(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (rev integer, title text, attributes jsonb, created_at timestamptz, created_by_name text, reason text)
LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT f.* FROM dms_case_files f
     WHERE f.tenant_id = p_tenant AND f.id = p_case
       AND dms_case_visible(p_tenant, p_actor, f.office_id, f.domain, f.status, f.created_by, f.branch_id)
  )
  SELECT 0, c.title, c.attributes, coalesce(c.recorded_at, c.created_at),
         coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), '')),
         'Bản gốc khi ghi sổ'::text
    FROM c LEFT JOIN users u ON u.id = c.created_by AND u.tenant_id = c.tenant_id
  UNION ALL
  SELECT r.rev, r.title, r.attributes, r.created_at,
         coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), '')),
         a.reason
    FROM dms_case_revisions r
    JOIN c ON c.id = r.case_id AND c.tenant_id = r.tenant_id
    JOIN dms_amendment_requests a ON a.id = r.amendment_id AND a.tenant_id = r.tenant_id
    LEFT JOIN users u ON u.id = r.created_by AND u.tenant_id = r.tenant_id
   WHERE r.tenant_id = p_tenant
  ORDER BY 1;
$$;
