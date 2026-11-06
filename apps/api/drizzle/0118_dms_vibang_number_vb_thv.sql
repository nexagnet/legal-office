-- Số hồ sơ Vi bằng đổi ký hiệu: `030/2026/VB-TPL` -> `030/2026/VB-THV` (chủ dự án yêu cầu 05/11/2026: "số/năm/VB-THV ngày tháng năm").
-- Chỉ đổi ký hiệu Vi bằng; Tống đạt, Xác minh THA, Tổ chức THA giữ TĐ-TPL, XM-TPL, TC-TPL. Cách đánh số (trùng STT sổ S-02, về 001 đầu năm) không đổi.
-- Số đã cấp KHÔNG đổi: hồ sơ đã ghi sổ là bất biến (dms_draft_guard), nên số `.../VB-TPL` cấp trước migration này giữ nguyên;
-- chỉ hồ sơ ghi sổ từ nay mới nhận `.../VB-THV`. Ràng buộc định dạng vì vậy chấp nhận cả hai.

ALTER TABLE dms_case_files DROP CONSTRAINT dms_case_files_case_number_chk;
ALTER TABLE dms_case_files ADD CONSTRAINT dms_case_files_case_number_chk
  CHECK (case_number IS NULL OR (status = 'RECORDED' AND case_number ~ '^[0-9]{3,}/[0-9]{4}/((VB|TĐ|XM|TC)-TPL|VB-THV)$'));

-- Định dạng số: Vi bằng 030/2026/VB-THV; nghiệp vụ khác 030/2026/TĐ-TPL, XM-TPL, TC-TPL. NULL nếu nghiệp vụ không hợp lệ.
CREATE OR REPLACE FUNCTION dms_case_number_format(p_seq integer, p_year integer, p_domain text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_seq IS NULL OR p_seq < 1 OR p_year IS NULL THEN NULL
              ELSE (CASE WHEN p_seq < 100 THEN lpad(p_seq::text, 3, '0') ELSE p_seq::text END) || '/' || p_year::text || '/' ||
                   CASE p_domain WHEN 'vibang' THEN 'VB-THV' WHEN 'tongdat' THEN 'TĐ-TPL' WHEN 'xacminh' THEN 'XM-TPL' WHEN 'tochuc' THEN 'TC-TPL' END
         END
$$;
