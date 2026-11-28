-- Số hồ sơ Xác minh THA và Tổ chức THA đổi ký hiệu (chủ dự án yêu cầu 28/11/2026):
--   Xác minh (S-04, cột 2): `…/2026/XM-TPL` -> `…/2026/HĐDV-XM`
--   Thi hành án / Tổ chức THA (S-05, cột 2): `…/2026/TC-TPL` -> `…/2026/HĐDV-THA`
-- Năm vẫn lấy theo năm hiện hành lúc ghi sổ (dms_vn_year()), cách đánh số (trùng STT sổ, về 001 đầu năm) không đổi.
-- Số đã cấp KHÔNG đổi: hồ sơ đã ghi sổ là bất biến, nên ràng buộc chấp nhận cả ký hiệu cũ lẫn mới.
-- Tống đạt giữ TĐ-TPL, Vi bằng giữ VB-THV.

ALTER TABLE dms_case_files DROP CONSTRAINT dms_case_files_case_number_chk;
ALTER TABLE dms_case_files ADD CONSTRAINT dms_case_files_case_number_chk
  CHECK (case_number IS NULL OR (status = 'RECORDED' AND case_number ~ '^[0-9]{3,}/[0-9]{4}/((VB|TĐ|XM|TC)-TPL|VB-THV|HĐDV-(XM|THA))$'));

CREATE OR REPLACE FUNCTION dms_case_number_format(p_seq integer, p_year integer, p_domain text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_seq IS NULL OR p_seq < 1 OR p_year IS NULL THEN NULL
              ELSE (CASE WHEN p_seq < 100 THEN lpad(p_seq::text, 3, '0') ELSE p_seq::text END) || '/' || p_year::text || '/' ||
                   CASE p_domain WHEN 'vibang' THEN 'VB-THV' WHEN 'tongdat' THEN 'TĐ-TPL' WHEN 'xacminh' THEN 'HĐDV-XM' WHEN 'tochuc' THEN 'HĐDV-THA' END
         END
$$;
