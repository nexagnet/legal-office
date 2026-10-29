-- Trạng thái số cuối sổ giấy của một năm, để màn Cấu hình hiện "chưa nhập" hay "đã nhập" (Figma N16 O12).
-- Chỉ đọc: số cuối đang dùng (bộ đếm Vi bằng), đã nhập số cuối sổ giấy chưa, nhập lần cuối khi nào. Không đổi dữ liệu.
-- Admin, Trưởng VP, Thư ký xem; mọi lần đọc đều ghi nhật ký. Không số tiền.
CREATE FUNCTION of_search_number_status(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer)
RETURNS TABLE (year integer, last_seq integer, paper_imported boolean, imported_seq integer, imported_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE denied text;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY'], NULL);
  IF denied IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.number.status', false, 'NOT_ALLOWED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.number.status', true, 'ALLOWED', p_office, NULL, p_year::text);
  RETURN QUERY
    SELECT p_year,
           coalesce((SELECT k.last_seq FROM vibang_number_counters k
                     WHERE k.tenant_id = p_tenant AND k.office_id = p_office AND k.year = p_year), 0),
           EXISTS (SELECT 1 FROM vibang_number_imports i
                   WHERE i.tenant_id = p_tenant AND i.office_id = p_office AND i.year = p_year),
           (SELECT i.imported_seq FROM vibang_number_imports i
            WHERE i.tenant_id = p_tenant AND i.office_id = p_office AND i.year = p_year ORDER BY i.id DESC LIMIT 1),
           (SELECT i.at FROM vibang_number_imports i
            WHERE i.tenant_id = p_tenant AND i.office_id = p_office AND i.year = p_year ORDER BY i.id DESC LIMIT 1);
END $$;
