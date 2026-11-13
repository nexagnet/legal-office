-- Báo cáo tổng hợp: lọc theo chi nhánh và kỳ 6 tháng (tùy chọn).
-- Kỳ 6 tháng (TT 08 Điều 36 khoản 3a): 01/01–30/06 của năm báo cáo, tính theo giờ Việt Nam. Chỉ N-09 có kỳ này; N-10 chỉ 12 tháng. NULL = tất cả chi nhánh người xem được quyền đọc.
-- Luật hiển thị theo phạm vi chi nhánh vẫn do dms_case_visible quyết định; lọc chỉ thu hẹp thêm.
-- Số cuối sổ (last_stt) là bộ đếm cấp văn phòng nên không đổi theo chi nhánh.
DO $$
DECLARE
  r record;
  def text;
  patched text;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = current_schema() AND p.proname = 'dms_report_summary' AND p.pronargs = 4;
  IF r.oid IS NULL THEN RAISE EXCEPTION '0129: không tìm thấy dms_report_summary(4 tham số)'; END IF;
  def := pg_get_functiondef(r.oid);
  patched := replace(def, 'p_year integer)', 'p_year integer, p_branch uuid DEFAULT NULL, p_first_half boolean DEFAULT false)');
  patched := replace(patched, 'c.office_id = p_office', 'c.office_id = p_office AND (p_branch IS NULL OR c.branch_id = p_branch)');
  patched := replace(patched, 'a.office_id = p_office', 'a.office_id = p_office AND (p_branch IS NULL OR c.branch_id = p_branch)');
  patched := replace(patched, 'extract(year FROM c.recorded_at AT TIME ZONE ''Asia/Ho_Chi_Minh'')::integer = p_year',
    'extract(year FROM c.recorded_at AT TIME ZONE ''Asia/Ho_Chi_Minh'')::integer = p_year AND (NOT p_first_half OR extract(month FROM c.recorded_at AT TIME ZONE ''Asia/Ho_Chi_Minh'') <= 6)');
  patched := replace(patched, 'extract(year FROM a.requested_at AT TIME ZONE ''Asia/Ho_Chi_Minh'')::integer = p_year',
    'extract(year FROM a.requested_at AT TIME ZONE ''Asia/Ho_Chi_Minh'')::integer = p_year AND (NOT p_first_half OR extract(month FROM a.requested_at AT TIME ZONE ''Asia/Ho_Chi_Minh'') <= 6)');
  IF patched = def OR position('p_branch uuid' IN patched) = 0 OR position('c.branch_id = p_branch' IN patched) = 0 OR position('p_first_half OR' IN patched) = 0 THEN
    RAISE EXCEPTION '0129: không vá được dms_report_summary';
  END IF;
  DROP FUNCTION dms_report_summary(uuid, uuid, uuid, integer);
  EXECUTE patched;
END $$;
