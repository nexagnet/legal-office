-- Logo tùy chỉnh của văn phòng (hiện ở thanh bên và làm biểu tượng tab trình duyệt). Chỉ Admin văn phòng đặt/đổi/gỡ.
--   * Tệp ở kho tệp (R2 trên production) dưới khóa t/<tenant>/logos/<văn phòng>/<ngẫu nhiên>.<đuôi>; mỗi lần đổi là một khóa mới,
--     tệp cũ không bị ghi đè hay xóa. "Gỡ logo" chỉ bỏ liên kết ở office_settings (quay về logo mặc định).
--   * Đây là cấu hình giao diện, không phải hồ sơ/tài liệu nghiệp vụ nên không thuộc phạm vi bất biến của DMS. Chỉ nhận JPG/PNG/WebP (không SVG).
-- Dữ liệu giả lập.

ALTER TABLE office_settings
  ADD COLUMN logo_key text,
  ADD COLUMN logo_mime text CHECK (logo_mime IS NULL OR logo_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN logo_updated_at timestamptz,
  ADD CONSTRAINT office_settings_logo_shape_chk CHECK (
    (logo_key IS NULL AND logo_mime IS NULL AND logo_updated_at IS NULL)
    OR (logo_key IS NOT NULL AND logo_mime IS NOT NULL AND logo_updated_at IS NOT NULL
        AND btrim(logo_key) <> '' AND left(logo_key, 1) <> '/' AND position('..' IN logo_key) = 0)
  );

-- p_key NULL = gỡ logo. Khóa phải nằm trong thư mục logos của chính tenant và văn phòng này.
CREATE FUNCTION of_set_office_logo(p_tenant uuid, p_actor uuid, p_office uuid, p_key text, p_mime text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.logo.set', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_key IS NULL THEN
    UPDATE office_settings SET logo_key = NULL, logo_mime = NULL, logo_updated_at = NULL, updated_by = p_actor, updated_at = now()
     WHERE office_id = p_office AND tenant_id = p_tenant;
    RETURN vibang_audit(p_tenant, p_actor, 'of.logo.clear', true, 'ALLOWED', p_office, NULL, NULL);
  END IF;
  IF p_mime IS NULL OR p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_key NOT LIKE 't/' || p_tenant::text || '/logos/' || p_office::text || '/%'
     OR position('..' IN p_key) > 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.logo.set', false, 'INVALID_REQUEST', p_office, NULL, NULL);
  END IF;
  INSERT INTO office_settings (office_id, tenant_id, logo_key, logo_mime, logo_updated_at, updated_by)
  VALUES (p_office, p_tenant, p_key, p_mime, now(), p_actor)
  ON CONFLICT (office_id, tenant_id) DO UPDATE
    SET logo_key = EXCLUDED.logo_key, logo_mime = EXCLUDED.logo_mime, logo_updated_at = EXCLUDED.logo_updated_at,
        updated_by = p_actor, updated_at = now();
  RETURN vibang_audit(p_tenant, p_actor, 'of.logo.set', true, 'ALLOWED', p_office, NULL, NULL);
END $$;

-- Đọc logo: mọi thành viên của văn phòng. Chưa có logo = không trả dòng nào.
CREATE FUNCTION of_search_office_logo(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (object_key text, mime text, updated_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT s.logo_key, s.logo_mime, s.logo_updated_at
  FROM office_settings s
  WHERE s.tenant_id = p_tenant AND s.office_id = p_office AND s.logo_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office)
$$;
