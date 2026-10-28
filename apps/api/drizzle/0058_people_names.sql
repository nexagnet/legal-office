-- Họ tên hiển thị của người dùng (avatar và tên ở mọi nơi hiện một con người; Figma N0 · Avatar).
-- Họ tên nằm ở users.full_name (Admin nhập khi thêm thành viên). Tài khoản chưa có họ tên thì hiện phần trước @ của email.

-- 1) Danh sách THV cho Admin chọn: nhãn "Họ tên (email)" như bảng thành viên, thay vì chỉ email.
CREATE OR REPLACE FUNCTION vb_list_thv(p_tenant uuid, p_actor uuid)
RETURNS TABLE (user_id uuid, office_id uuid, label text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT u.id, m.office_id, ad_user_label(u.full_name, ac.email, u.external_ref)
  FROM memberships m
  JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  WHERE m.tenant_id = p_tenant AND m.role = 'THV'
    AND EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor
                  AND a.office_id = m.office_id AND a.role = 'ADMIN')
  ORDER BY 3, 1
$$;

-- 2) Admin sửa họ tên của một thành viên văn phòng. Chỉ Admin của văn phòng đó; người được sửa phải là thành viên văn phòng.
CREATE FUNCTION ad_member_set_name(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_full_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE nm text := btrim(coalesce(p_full_name, ''));
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.rename', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF nm = '' OR length(nm) > 200 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.rename', false, 'INVALID_REQUEST', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.rename', false, 'USER_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  UPDATE users SET full_name = nm WHERE id = p_user AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.member.rename', true, 'ALLOWED', p_office, NULL, p_user::text);
END $$;

-- 3) Tên hiển thị theo mã người, chỉ cho những người cùng văn phòng với người hỏi (không mở cả danh bạ: cần biết mã,
-- mã lấy từ hồ sơ mà người hỏi được xem). Chỉ đọc. Tối đa 200 mã mỗi lần.
CREATE FUNCTION of_people_names(p_tenant uuid, p_actor uuid, p_ids uuid[])
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE sql STABLE AS $$
  SELECT u.id, coalesce(u.full_name, nullif(split_part(coalesce(ac.email, u.external_ref), '@', 1), ''), u.external_ref)
  FROM users u
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  WHERE u.tenant_id = p_tenant
    AND cardinality(coalesce(p_ids, ARRAY[]::uuid[])) BETWEEN 1 AND 200
    AND u.id = ANY (p_ids)
    AND EXISTS (SELECT 1 FROM memberships m JOIN memberships a ON a.tenant_id = m.tenant_id AND a.office_id = m.office_id
                WHERE m.tenant_id = p_tenant AND m.user_id = u.id AND a.user_id = p_actor)
$$;

-- 4) Họ tên cho các tài khoản thử giả lập (example.invalid) chưa có họ tên, để màn hình và ảnh hướng dẫn dễ đọc.
UPDATE users u SET full_name = d.name
FROM auth_credentials ac, (VALUES
  ('thv@example.invalid', 'Lê Thu Hà'),
  ('truong-vp@example.invalid', 'Trần Quốc Hưng'),
  ('thu-ky@example.invalid', 'Phạm Thu Trang'),
  ('van-thu@example.invalid', 'Đỗ Minh Anh'),
  ('ke-toan@example.invalid', 'Vũ Thị Lan')
) AS d(email, name)
WHERE ac.user_id = u.id AND ac.tenant_id = u.tenant_id AND ac.email = d.email AND u.full_name IS NULL;
