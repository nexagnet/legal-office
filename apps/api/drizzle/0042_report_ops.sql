-- Báo cáo kỳ cho công văn, vật tư và sử dụng lao động. Cùng hình dạng dòng với of_search_report (domain, unit, status, total) và cùng
-- quy tắc: mỗi dòng đếm ĐÚNG MỘT đơn vị, không cộng chéo, không có số tiền. Phạm vi đọc như dữ liệu gốc (of_can_read). Có audit.
--   CONG_VAN : CORRESPONDENCE theo hướng + trạng thái (kỳ theo ngày tạo, giờ Việt Nam)
--   VAT_TU   : MOVEMENT (số lần) và QUANTITY (tổng số lượng tuyệt đối) theo loại phát sinh RECEIPT/ISSUE/ADJUSTMENT (kỳ theo ngày phát sinh)
--   LAO_DONG : PERSON theo trạng thái làm việc, lấy phiên bản mới nhất tại thời điểm đọc (không theo kỳ)
CREATE FUNCTION of_search_report_ops(p_tenant uuid, p_actor uuid, p_office uuid, p_from date, p_to date, p_branch uuid)
RETURNS TABLE (domain text, unit text, status text, total integer)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.report.search_ops', true, 'ALLOWED', p_office, p_branch, NULL);
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN RETURN; END IF;
  RETURN QUERY
  WITH src AS (
    SELECT 'CONG_VAN'::text AS domain, 'CORRESPONDENCE'::text AS unit, (c.direction || ':' || c.status) AS status, 1 AS n,
           c.branch_id, c.handler_user_id AS handler, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
    FROM of_correspondence c WHERE c.tenant_id = p_tenant AND c.office_id = p_office
    UNION ALL
    SELECT 'VAT_TU', 'MOVEMENT', m.kind, 1, b.branch_id, NULL, (m.at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM of_movements m JOIN of_batches b ON b.id = m.batch_id AND b.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND b.office_id = p_office
    UNION ALL
    SELECT 'VAT_TU', 'QUANTITY', m.kind, abs(m.delta), b.branch_id, NULL, (m.at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM of_movements m JOIN of_batches b ON b.id = m.batch_id AND b.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND b.office_id = p_office
    UNION ALL
    SELECT 'LAO_DONG', 'PERSON', pr.work_status, 1, pr.branch_id, NULL, p_to
    FROM (SELECT DISTINCT ON (x.person_id) x.* FROM of_personnel x
           WHERE x.tenant_id = p_tenant AND x.office_id = p_office ORDER BY x.person_id, x.version DESC) pr
  )
  SELECT s.domain, s.unit, s.status, sum(s.n)::integer
  FROM src s
  WHERE s.d BETWEEN p_from AND p_to
    AND (p_branch IS NULL OR s.branch_id = p_branch)
    AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  GROUP BY s.domain, s.unit, s.status
  ORDER BY s.domain, s.unit, s.status;
END $$;
