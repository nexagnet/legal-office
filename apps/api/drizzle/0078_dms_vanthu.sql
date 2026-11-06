-- DMS Phase 3: Văn thư (3 sổ: văn bản đến, đi, nội bộ), dùng chung lõi hồ sơ/nháp/tệp/nhật ký với 4 nghiệp vụ.
-- Luật (owner 2026-10-30, Figma "Văn thư"): hệ thống tự cấp CHỈ "Số đến" (sổ đến) và "STT" (sổ đi, nội bộ), theo sổ, văn phòng và năm (giờ VN),
-- cấp lúc "Xác nhận lưu chính thức"; số/ký hiệu văn bản là dữ liệu người nhập. Nháp và nháp đã hủy không có số, không xoá, không khôi phục.
-- Mỗi bản ghi văn thư = một hồ sơ (miền vtden|vtdi|vtnb) có tiêu đề = trích yếu, cột sổ trong attributes, bản scan là tài liệu/tệp.
-- Quyền theo miền: vtden|vtdi|vtnb . read|draft|confirm|add_document|download . own|all (Nhóm quyền, không Role).

ALTER TABLE dms_case_files DROP CONSTRAINT dms_case_files_domain_check;
ALTER TABLE dms_case_files ADD CONSTRAINT dms_case_files_domain_check
  CHECK (domain IN ('vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb'));

ALTER TABLE dms_group_permissions DROP CONSTRAINT dms_group_permissions_permission_check;
ALTER TABLE dms_group_permissions ADD CONSTRAINT dms_group_permissions_permission_check CHECK (
  permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve')
);
ALTER TABLE dms_permission_requests DROP CONSTRAINT dms_perm_req_permission_chk;
ALTER TABLE dms_permission_requests ADD CONSTRAINT dms_perm_req_permission_chk CHECK (
  permission IS NULL
  OR permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve')
);

ALTER TABLE dms_book_counters DROP CONSTRAINT dms_book_counters_book_check;
ALTER TABLE dms_book_counters ADD CONSTRAINT dms_book_counters_book_check
  CHECK (book IN ('S-01', 'S-02', 'S-04', 'S-05', 'VT-DEN', 'VT-DI', 'VT-NB'));
ALTER TABLE dms_book_entries DROP CONSTRAINT dms_book_entries_book_check;
ALTER TABLE dms_book_entries ADD CONSTRAINT dms_book_entries_book_check
  CHECK (book IN ('S-01', 'S-02', 'S-04', 'S-05', 'VT-DEN', 'VT-DI', 'VT-NB'));

CREATE OR REPLACE FUNCTION dms_book_of(p_domain text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_domain WHEN 'tongdat' THEN 'S-01' WHEN 'vibang' THEN 'S-02' WHEN 'xacminh' THEN 'S-04' WHEN 'tochuc' THEN 'S-05'
                       WHEN 'vtden' THEN 'VT-DEN' WHEN 'vtdi' THEN 'VT-DI' WHEN 'vtnb' THEN 'VT-NB' END
$$;

-- Các hàm còn nhúng danh sách miền/mã sổ/biểu thức quyền cũ: vá tại chỗ từ định nghĩa hiện có (một nguồn, không chép lại thân hàm).
DO $$
DECLARE r record; def text; patched text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = current_schema() AND p.proname IN ('dms_case_create_draft', 'dms_permission_propose', 'dms_book_rows')
  LOOP
    def := pg_get_functiondef(r.oid);
    patched := replace(replace(replace(def,
      '''vibang'', ''tongdat'', ''xacminh'', ''tochuc''', '''vibang'', ''tongdat'', ''xacminh'', ''tochuc'', ''vtden'', ''vtdi'', ''vtnb'''),
      '(vibang|tongdat|xacminh|tochuc)', '(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)'),
      '''S-01'', ''S-02'', ''S-04'', ''S-05''', '''S-01'', ''S-02'', ''S-04'', ''S-05'', ''VT-DEN'', ''VT-DI'', ''VT-NB''');
    IF patched = def THEN RAISE EXCEPTION 'dms_vanthu: % không có gì để vá', r.proname; END IF;
    EXECUTE patched;
  END LOOP;
END $$;
