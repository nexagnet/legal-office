-- Gỡ "tự duyệt sau N giờ" cho yêu cầu sửa hồ sơ (chủ dự án quyết định 2026-11-01; Figma P0: "không tự duyệt 24/48 giờ").
--   * Yêu cầu của người không có quyền duyệt LUÔN chờ Admin duyệt, kể cả gửi ngay sau khi ghi sổ.
--   * Admin gửi vẫn có hiệu lực ngay (auto_via = 'ADMIN', quyết định owner 2026-10-31).
--   * Không xoá dữ liệu: các yêu cầu cũ đã tự duyệt (auto_via = 'WINDOW') giữ nguyên để lịch sử còn đọc được; CHECK giữ nguyên.
--   * Gỡ cấu hình cửa sổ: hàm đọc/đặt và cột amendment_auto_hours (chỉ là cấu hình, không phải hồ sơ).
-- Dữ liệu giả lập.

DO $$
DECLARE r record; def text; patched text;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema() AND p.proname = 'dms_amendment_propose';
  def := pg_get_functiondef(r.oid);
  patched := replace(def, E'  win_hours := dms_amendment_window(p_tenant, c.office_id);\n  via := CASE WHEN is_admin THEN ''ADMIN''\n              WHEN win_hours > 0 AND now() < c.recorded_at + make_interval(hours => win_hours) THEN ''WINDOW'' END;',
                      E'  via := CASE WHEN is_admin THEN ''ADMIN'' END;');
  IF patched = def THEN RAISE EXCEPTION '0090: dms_amendment_propose không có gì để vá'; END IF;
  EXECUTE patched;
END $$;

DROP FUNCTION dms_amendment_window_set(uuid, uuid, uuid, integer);
DROP FUNCTION dms_amendment_window(uuid, uuid);
ALTER TABLE dms_office_settings DROP COLUMN amendment_auto_hours;
