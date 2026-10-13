-- Danh sách biểu mẫu TT06 bản mới nhất mỗi mã, cho thành viên văn phòng. Chỉ đọc, có audit; không trả khoá tệp.
CREATE FUNCTION of_search_tt06(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (code text, version integer, title text, registered_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.tt06.search', true, 'ALLOWED', p_office, NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT ON (f.code) f.code, f.version, f.title, f.at
    FROM of_tt06_forms f
    WHERE f.tenant_id = p_tenant
    ORDER BY f.code, f.version DESC;
END $$;
