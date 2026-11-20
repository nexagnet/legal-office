-- Bản lưu tệp trên ổ đĩa nhận tệp qua API: cần biết người gọi có quyền nhập tài liệu cũ vào đợt MỞ trước khi nhận byte.
-- Chỉ đọc, không ghi nhật ký; quyền vẫn do dms_has_permission quyết định.
CREATE FUNCTION dms_legacy_can_import(p_tenant uuid, p_actor uuid, p_batch uuid)
RETURNS TABLE (ok boolean)
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM dms_legacy_batches b
    WHERE b.id = p_batch AND b.tenant_id = p_tenant AND b.status = 'OPEN'
      AND dms_has_permission(p_tenant, p_actor, b.office_id, 'dms.legacy.import')
  );
$$;
