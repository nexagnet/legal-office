-- Nhãn người trong các hàm đọc (THV phụ trách, người tạo, người ký, người đóng dấu, người ghi lịch sử, THV ở sổ đăng ký)
-- đang là coalesce(email, mã nội bộ). Đổi sang "Họ tên (email)" như bảng thành viên để web hiện tên và avatar.
-- Tài khoản chưa có họ tên vẫn ra đúng như cũ (email hoặc mã nội bộ). Kiểu trả về không đổi (text).
DO $$
DECLARE
  r record;
  def text;
  patched text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~* 'coalesce\(\s*\w+\.email\s*,\s*\w+\.external_ref\s*\)'
  LOOP
    def := pg_get_functiondef(r.oid);
    patched := regexp_replace(def, 'coalesce\(\s*(\w+)\.email\s*,\s*(\w+)\.external_ref\s*\)',
                              'ad_user_label(\2.full_name, \1.email, \2.external_ref)', 'gi');
    IF patched <> def THEN EXECUTE patched; END IF;
  END LOOP;
END $$;
