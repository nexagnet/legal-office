-- Phiên bản ảnh đại diện theo lô mã người (để bảng/danh sách hiện ảnh nhất quán). Chỉ trả người có ảnh, và chỉ cho
-- chính chủ hoặc người cùng văn phòng với người hỏi. Chỉ đọc. Tối đa 200 mã mỗi lần.
CREATE FUNCTION of_avatar_versions(p_tenant uuid, p_actor uuid, p_ids uuid[])
RETURNS TABLE (user_id uuid, version bigint)
LANGUAGE sql STABLE AS $$
  SELECT u.id, (extract(epoch FROM u.avatar_updated_at) * 1000)::bigint
  FROM users u
  WHERE u.tenant_id = p_tenant
    AND cardinality(coalesce(p_ids, ARRAY[]::uuid[])) BETWEEN 1 AND 200
    AND u.id = ANY (p_ids) AND u.avatar_key IS NOT NULL
    AND (u.id = p_actor
         OR EXISTS (SELECT 1 FROM memberships m JOIN memberships a ON a.tenant_id = m.tenant_id AND a.office_id = m.office_id
                    WHERE m.tenant_id = p_tenant AND m.user_id = u.id AND a.user_id = p_actor))
$$;
