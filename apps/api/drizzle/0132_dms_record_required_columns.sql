-- Ghi sổ: chặn khi bản nháp thiếu cột nhận diện bắt buộc của sổ hoặc có ngày không có thật (chủ dự án chốt 13/11/2026).
-- Lý do: hồ sơ đã ghi sổ không sửa trực tiếp được (phải có yêu cầu sửa đổi, scan văn bản và Admin duyệt).
-- Danh sách cột bắt buộc (Claude đề xuất từ tiêu đề cột TT 08, chủ dự án duyệt "làm"):
--   vibang  : nguoi_yeu_cau, noi_dung_yeu_cau, so_ngay_vi_bang (phải là ngày hợp lệ), dia_chi_noi_lap
--   tongdat : loai_van_ban, so_ngay_van_ban, và ít nhất một trong co_quan_toa_an / co_quan_thads / co_quan_kiem_sat
--   xacminh : nguoi_yeu_cau_thi_hanh_an, nguoi_phai_thi_hanh_an, noi_dung_xac_minh
--   tochuc  : quyet_dinh_thi_hanh_an, ben_phai_thi_hanh_an, ben_duoc_thi_hanh_an, cac_khoan_phai_thi_hanh_an
-- Cột thua_hanh_vien không bắt buộc: giao diện chọn THV bằng ô riêng (dms_case_files.thv_user_id).
-- Ngày: Tống đạt "ngay_tong_dat" được để trống (việc còn dở) nhưng đã nhập thì phải đọc được dd/mm/yyyy (cùng cách đọc với hạn quá hạn).
-- Văn thư (vtden, vtdi, vtnb) không đổi. Không đổi bảng/cột; chỉ thêm hai hàm. API (POST /dms/cases/:id/record) gọi hàm xem trước và
-- từ chối REQUIRED_COLUMNS_MISSING trước khi gọi dms_case_record; hàm ghi sổ ở DB giữ nguyên để công cụ nhập/seed không bị ảnh hưởng.

CREATE FUNCTION dms_case_record_problems_of(p_domain text, p_attrs jsonb)
RETURNS TABLE (key text, problem text) LANGUAGE sql IMMUTABLE AS $$
  WITH req(k) AS (
    SELECT unnest(CASE p_domain
      WHEN 'vibang'  THEN ARRAY['nguoi_yeu_cau', 'noi_dung_yeu_cau', 'so_ngay_vi_bang', 'dia_chi_noi_lap']
      WHEN 'tongdat' THEN ARRAY['loai_van_ban', 'so_ngay_van_ban']
      WHEN 'xacminh' THEN ARRAY['nguoi_yeu_cau_thi_hanh_an', 'nguoi_phai_thi_hanh_an', 'noi_dung_xac_minh']
      WHEN 'tochuc'  THEN ARRAY['quyet_dinh_thi_hanh_an', 'ben_phai_thi_hanh_an', 'ben_duoc_thi_hanh_an', 'cac_khoan_phai_thi_hanh_an']
      ELSE ARRAY[]::text[] END)
  )
  SELECT r.k, 'missing'::text FROM req r WHERE btrim(coalesce(p_attrs->>r.k, '')) = ''
  UNION ALL
  SELECT 'co_quan_toa_an', 'missing' WHERE p_domain = 'tongdat'
     AND btrim(coalesce(p_attrs->>'co_quan_toa_an', '')) = '' AND btrim(coalesce(p_attrs->>'co_quan_thads', '')) = ''
     AND btrim(coalesce(p_attrs->>'co_quan_kiem_sat', '')) = ''
  UNION ALL
  SELECT 'so_ngay_vi_bang', 'bad_date' WHERE p_domain = 'vibang' AND btrim(coalesce(p_attrs->>'so_ngay_vi_bang', '')) <> ''
     AND dms_parse_vn_date(regexp_replace(btrim(p_attrs->>'so_ngay_vi_bang'), '^ngày\s*', '', 'i')) IS NULL
  UNION ALL
  SELECT 'ngay_tong_dat', 'bad_date' WHERE p_domain = 'tongdat' AND btrim(coalesce(p_attrs->>'ngay_tong_dat', '')) <> ''
     AND dms_parse_vn_date(p_attrs->>'ngay_tong_dat') IS NULL
$$;

-- Xem trước cho giao diện: cùng luật với lúc ghi sổ. Chỉ trả cho người được xem hồ sơ nháp này (người tạo hoặc có quyền đọc).
CREATE FUNCTION dms_case_record_problems(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (key text, problem text) LANGUAGE sql STABLE AS $$
  SELECT p.key, p.problem
    FROM dms_case_files c, LATERAL dms_case_record_problems_of(c.domain, c.attributes) p
   WHERE c.id = p_case AND c.tenant_id = p_tenant AND c.status = 'DRAFT'
     AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
$$;
