-- Xem trước số sẽ cấp cho một hồ sơ Vi bằng (Figma N17 V2). Chỉ đọc, KHÔNG cấp số và không tăng bộ đếm.
-- Số thật chỉ được cấp bởi vibang_allocate_number; số xem trước có thể lệch nếu hồ sơ khác được cấp số trước.
-- Cùng phạm vi xem với vb_case_progress. paper_last_imported cho biết đã nhập số cuối của sổ giấy cho năm hiện tại chưa.
CREATE FUNCTION vb_number_preview(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (next_label text, paper_last_imported boolean)
LANGUAGE sql STABLE AS $$
  WITH c AS (SELECT v.office_id FROM vibang_cases v WHERE v.id = p_case AND v.tenant_id = p_tenant),
       y AS (SELECT extract(year FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer AS v)
  SELECT (coalesce((SELECT k.last_seq FROM vibang_number_counters k, c, y
                    WHERE k.tenant_id = p_tenant AND k.office_id = c.office_id AND k.year = y.v), 0) + 1) || '/' || y.v || '/VB-THV',
         EXISTS (SELECT 1 FROM vibang_number_imports i, c, y
                 WHERE i.tenant_id = p_tenant AND i.office_id = c.office_id AND i.year = y.v)
  FROM y
  WHERE EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
$$;
