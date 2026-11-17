-- Ảnh đại diện của người dùng. Do CHÍNH người đó tự tải lên/đổi/gỡ; Admin không đổi hộ.
--   * Tệp nằm ở kho tệp (R2 trên production) dưới khóa t/<tenant>/avatars/<user>/<ngẫu nhiên>.<đuôi>; mỗi lần đổi là một khóa
--     mới, tệp cũ không bị ghi đè hay xóa. "Gỡ ảnh" chỉ bỏ liên kết ở users.
--   * Đây là dữ liệu hồ sơ cá nhân, không phải hồ sơ/tài liệu nghiệp vụ nên không thuộc phạm vi bất biến của DMS.
-- Dữ liệu giả lập.

ALTER TABLE users
  ADD COLUMN avatar_key text,
  ADD COLUMN avatar_mime text CHECK (avatar_mime IS NULL OR avatar_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN avatar_updated_at timestamptz,
  ADD CONSTRAINT users_avatar_shape_chk CHECK (
    (avatar_key IS NULL AND avatar_mime IS NULL AND avatar_updated_at IS NULL)
    OR (avatar_key IS NOT NULL AND avatar_mime IS NOT NULL AND avatar_updated_at IS NOT NULL
        AND btrim(avatar_key) <> '' AND left(avatar_key, 1) <> '/' AND position('..' IN avatar_key) = 0)
  );

-- Chỉ chính người dùng đặt/gỡ ảnh của mình (p_actor = người đăng nhập, không có tham số "người khác").
-- p_key NULL = gỡ ảnh. Khóa phải nằm trong thư mục avatars của chính tenant và người này.
CREATE FUNCTION ad_self_set_avatar(p_tenant uuid, p_actor uuid, p_key text, p_mime text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = p_tenant AND u.id = p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.self.avatar', false, 'USER_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF p_key IS NULL THEN
    UPDATE users SET avatar_key = NULL, avatar_mime = NULL, avatar_updated_at = NULL
     WHERE id = p_actor AND tenant_id = p_tenant;
    RETURN vibang_audit(p_tenant, p_actor, 'ad.self.avatar.clear', true, 'ALLOWED', NULL, NULL, NULL);
  END IF;
  IF p_mime IS NULL OR p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_key NOT LIKE 't/' || p_tenant::text || '/avatars/' || p_actor::text || '/%'
     OR position('..' IN p_key) > 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.self.avatar', false, 'INVALID_REQUEST', NULL, NULL, NULL);
  END IF;
  UPDATE users SET avatar_key = p_key, avatar_mime = p_mime, avatar_updated_at = now()
   WHERE id = p_actor AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.self.avatar', true, 'ALLOWED', NULL, NULL, NULL);
END $$;

-- Đọc ảnh: chính chủ hoặc người cùng văn phòng. Không có ảnh = không trả dòng nào.
CREATE FUNCTION of_avatar_get(p_tenant uuid, p_actor uuid, p_user uuid)
RETURNS TABLE (object_key text, mime text, updated_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT u.avatar_key, u.avatar_mime, u.avatar_updated_at
  FROM users u
  WHERE u.tenant_id = p_tenant AND u.id = p_user AND u.avatar_key IS NOT NULL
    AND (u.id = p_actor
         OR EXISTS (SELECT 1 FROM memberships m JOIN memberships a ON a.tenant_id = m.tenant_id AND a.office_id = m.office_id
                    WHERE m.tenant_id = p_tenant AND m.user_id = u.id AND a.user_id = p_actor))
$$;
