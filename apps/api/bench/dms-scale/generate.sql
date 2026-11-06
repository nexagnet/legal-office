-- Sinh dữ liệu GIẢ (không có dữ liệu khách thật) để đo tìm kiếm/lọc DMS ở quy mô lớn.
-- Chạy bằng tài khoản chủ DB trên DB CÁCH LY (không bao giờ trên dev/prod):
--   psql -v cases=150000 -d lo_bench -f generate.sql
-- Quy mô tham chiếu 200GB: ~1,2 triệu tệp scan (~170KB/tệp) => 150k hồ sơ, ~450k tài liệu, ~900k tệp/phiên bản/OCR.
-- Kết quả cố định (setseed) để so sánh trước/sau.
\set ON_ERROR_STOP on
\if :{?cases} \else \set cases 150000 \endif
SELECT setseed(0.42);
SET synchronous_commit = off;

CREATE OR REPLACE FUNCTION bench_fold(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(lower(normalize(t, NFC)),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd') $$;

DROP TABLE IF EXISTS bench_ctx;
CREATE TABLE bench_ctx AS SELECT gen_random_uuid() AS tenant_id, gen_random_uuid() AS office_id;
INSERT INTO tenants (id, name) SELECT tenant_id, 'bench-tenant' FROM bench_ctx;
INSERT INTO offices (id, tenant_id, name) SELECT office_id, tenant_id, 'Văn phòng bench' FROM bench_ctx;

-- 8 chi nhánh, 60 người dùng (user 1 = Admin, 2 = Văn thư 2 chi nhánh, 3 = THV chỉ của mình + 1 chi nhánh)
CREATE TABLE bench_branches AS
SELECT n, gen_random_uuid() AS id FROM generate_series(1, 8) n;
INSERT INTO branches (id, tenant_id, office_id, name)
SELECT b.id, c.tenant_id, c.office_id, 'Chi nhánh ' || b.n FROM bench_branches b, bench_ctx c;

CREATE TABLE bench_users AS SELECT n, gen_random_uuid() AS id FROM generate_series(1, 60) n;
INSERT INTO users (id, tenant_id, external_ref, full_name)
SELECT u.id, c.tenant_id, 'user' || u.n || '@bench.invalid',
       (ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Phan','Vũ','Đặng','Bùi','Đỗ'])[1 + u.n % 10] || ' ' ||
       (ARRAY['Văn','Thị','Minh','Quốc','Thu','Hữu'])[1 + u.n % 6] || ' ' ||
       (ARRAY['An','Bình','Cường','Dũng','Hà','Khánh','Lan','Mai','Nam','Phương'])[1 + (u.n / 7) % 10]
FROM bench_users u, bench_ctx c;
INSERT INTO memberships (tenant_id, user_id, office_id, role)
SELECT c.tenant_id, u.id, c.office_id, CASE WHEN u.n = 1 THEN 'ADMIN' WHEN u.n = 3 THEN 'THV' ELSE 'VAN_THU' END
FROM bench_users u, bench_ctx c;

-- Nhóm quyền: ALLR (đọc tất cả mọi miền), OWNR (chỉ đọc hồ sơ của chính mình)
CREATE TABLE bench_groups AS SELECT 'ALLR'::text AS k, gen_random_uuid() AS id UNION ALL SELECT 'OWNR', gen_random_uuid();
INSERT INTO dms_permission_groups (id, tenant_id, office_id, name)
SELECT g.id, c.tenant_id, c.office_id, 'bench-' || g.k FROM bench_groups g, bench_ctx c;
INSERT INTO dms_group_permissions (tenant_id, group_id, permission)
SELECT c.tenant_id, g.id, d || '.read.' || CASE WHEN g.k = 'ALLR' THEN 'all' ELSE 'own' END
FROM bench_groups g, bench_ctx c,
     unnest(ARRAY['vibang','tongdat','xacminh','tochuc','vtden','vtdi','vtnb']) d;
INSERT INTO dms_group_members (tenant_id, group_id, user_id)
SELECT c.tenant_id, g.id, u.id FROM bench_ctx c, bench_groups g, bench_users u
 WHERE (g.k = 'ALLR' AND u.n = 2) OR (g.k = 'OWNR' AND u.n BETWEEN 3 AND 60);
INSERT INTO dms_branch_access (tenant_id, office_id, user_id, branch_id, granted_by, grant_reason)
SELECT c.tenant_id, c.office_id, u.id, b.id, (SELECT id FROM bench_users WHERE n = 1), 'bench'
FROM bench_ctx c, bench_users u, bench_branches b
WHERE (u.n = 2 AND b.n IN (1, 2)) OR (u.n = 3 AND b.n = 1) OR (u.n BETWEEN 4 AND 60 AND b.n = 1 + u.n % 8);

-- Kho từ vựng + đoạn văn (để OCR có chữ có dấu, có từ hiếm lẫn từ phổ biến)
CREATE TABLE bench_words AS SELECT row_number() OVER () AS i, w FROM unnest(ARRAY[
 'bản','án','quyết','định','thi','hành','thừa','phát','lại','văn','phòng','đương','sự','người','yêu','cầu','nghĩa','vụ','tài','sản',
 'hợp','đồng','mua','bán','chuyển','nhượng','quyền','sử','dụng','đất','nhà','ở','giấy','chứng','nhận','biên','xác','minh','điều','kiện',
 'tống','đạt','thông','báo','tòa','nhân','dân','thành','phố','quận','huyện','phường','xã','ngày','tháng','năm','số','ký','hiệu','cơ','quan',
 'công','ty','cổ','phần','trách','nhiệm','hữu','hạn','ngân','hàng','khoản','vay','thế','chấp','bảo','lãnh','kê','biên','cưỡng','chế',
 'đấu','giá','thanh','toán','tiền','phí','lệ','thu','chi','nộp','ngân','sách','nhà','nước','giao','nhận','chứng','kiến','lập','vi','bằng',
 'người','làm','chứng','địa','chỉ','số','điện','thoại','căn','cước','hộ','khẩu','thường','trú','tạm','trú','ông','bà','anh','chị',
 'Hà','Nội','Hồ','Chí','Minh','Đà','Nẵng','Hải','Phòng','Cần','Thơ','Hai','Bà','Trưng','Hoàn','Kiếm','Đống','Đa','Cầu','Giấy','Thanh','Xuân']) w;
CREATE TABLE bench_wordarr AS SELECT array_agg(w ORDER BY i) AS a FROM bench_words;
CREATE TABLE bench_paras AS
SELECT p AS i, (SELECT string_agg(a[1 + ((p * 7919 + k * 104729 + (random() * 1000)::int) % array_length(a, 1))], ' ')
                FROM generate_series(1, 100) k) AS txt
FROM generate_series(1, 4000) p, bench_wordarr;
CREATE TABLE bench_parr AS SELECT array_agg(txt ORDER BY i) AS a FROM bench_paras;
CREATE TABLE bench_uarr AS SELECT array_agg(id ORDER BY n) AS a FROM bench_users;
CREATE TABLE bench_barr AS SELECT array_agg(id ORDER BY n) AS a FROM bench_branches;

-- Hồ sơ
CREATE TABLE bench_cases AS
SELECT gen_random_uuid() AS id, g AS n,
       (ARRAY['vibang','vibang','vibang','tongdat','tongdat','tongdat','xacminh','tochuc','vtden','vtdi','vtnb'])[1 + floor(random()*11)::int] AS domain,
       ua.a[1 + floor(random() ^ 2 * 60)::int] AS creator,
       CASE WHEN random() < 0.03 THEN NULL ELSE ba.a[1 + floor(random()*8)::int] END AS branch,
       CASE WHEN random() < 0.92 THEN 'RECORDED' WHEN random() < 0.62 THEN 'DRAFT' ELSE 'CANCELLED' END AS status,
       timestamptz '2018-01-01' + random() * interval '3000 days' AS created_at,
       (ARRAY['Nguyễn Văn An','Trần Thị Bình','Lê Minh Cường','Phạm Quốc Dũng','Hoàng Thu Hà','Phan Hữu Khánh','Vũ Thị Lan','Đặng Minh Nam','Bùi Văn Phương','Đỗ Quốc Việt'])[1 + floor(random()*10)::int]
         || ' ' || (ARRAY['Hải','Long','Sơn','Tú','Yến','Hạnh','Thảo','Tâm'])[1 + floor(random()*8)::int] AS party
FROM generate_series(1, :cases) g, bench_uarr ua, bench_barr ba;

INSERT INTO dms_case_files (id, tenant_id, office_id, domain, title, attributes, status, created_by, created_at, recorded_by, recorded_at,
                            cancelled_by, cancelled_at, cancel_reason, branch_id)
SELECT b.id, c.tenant_id, c.office_id, b.domain,
       CASE b.domain WHEN 'vibang' THEN 'Vi bằng ' WHEN 'tongdat' THEN 'Tống đạt ' WHEN 'xacminh' THEN 'Xác minh điều kiện thi hành án '
                     WHEN 'tochuc' THEN 'Tổ chức thi hành án ' ELSE 'Văn bản ' END
         || b.n || '/' || extract(year FROM b.created_at)::int || ' - ' || b.party,
       jsonb_build_object('nguoi_yeu_cau', b.party, 'so_ky_hieu', (b.n % 997) || '/' || (ARRAY['GTT','QĐ','CV-VP','TB'])[1 + b.n % 4],
                          'noi_dung_yeu_cau', 'Lập vi bằng ghi nhận ' || (ARRAY['hiện trạng nhà','việc giao nhận tiền','việc bàn giao tài sản','nội dung cuộc họp'])[1 + b.n % 4]),
       b.status, b.creator, b.created_at,
       CASE WHEN b.status = 'RECORDED' THEN b.creator END, CASE WHEN b.status = 'RECORDED' THEN b.created_at + interval '1 day' END,
       CASE WHEN b.status = 'CANCELLED' THEN b.creator END, CASE WHEN b.status = 'CANCELLED' THEN b.created_at + interval '2 days' END,
       CASE WHEN b.status = 'CANCELLED' THEN 'bench' END, b.branch
FROM bench_cases b, bench_ctx c;

-- Tài liệu: 1..5 / hồ sơ
CREATE TABLE bench_docs AS
SELECT gen_random_uuid() AS id, b.id AS case_id, b.n AS case_n, d AS seq, b.creator, b.created_at, b.status
FROM bench_cases b, LATERAL generate_series(1, 1 + floor(random()*5)::int) d;
INSERT INTO dms_documents (id, tenant_id, case_id, kind, title, is_official, status, created_by, created_at, attributes)
SELECT d.id, c.tenant_id, d.case_id,
       (ARRAY['Biên bản','Quyết định','Thông báo','Giấy ủy quyền','Hợp đồng','Đơn yêu cầu','Giấy xác nhận','Phiếu thu'])[1 + floor(random()*8)::int],
       'Tài liệu ' || d.seq || ' của hồ sơ ' || d.case_n, d.seq = 1, d.status, d.creator, d.created_at,
       jsonb_build_object('so_ngay_van_ban', (d.case_n % 500) || '/GTT, ' || to_char(d.created_at, 'DD/MM/YYYY'))
FROM bench_docs d, bench_ctx c;

-- Tệp + phiên bản + OCR: 1..3 / tài liệu
CREATE TABLE bench_files AS
SELECT gen_random_uuid() AS id, gen_random_uuid() AS ver_id, d.id AS doc_id, d.case_n, f AS seq, d.creator, d.created_at, random() < 0.85 AS is_scan
FROM bench_docs d, LATERAL generate_series(1, 1 + floor(random()*3)::int) f;
INSERT INTO dms_document_files (id, tenant_id, document_id, label, is_scan, created_by, created_at)
SELECT f.id, c.tenant_id, f.doc_id, 'trang-' || f.seq || '.pdf', f.is_scan, f.creator, f.created_at FROM bench_files f, bench_ctx c;
INSERT INTO dms_document_versions (id, tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by, created_at)
SELECT f.ver_id, c.tenant_id, f.id, 1, 'bench/' || f.id, md5(f.id::text) || md5(f.ver_id::text), 'application/pdf',
       (50000 + random() * 300000)::bigint, f.creator, f.created_at FROM bench_files f, bench_ctx c;
CREATE UNIQUE INDEX IF NOT EXISTS bench_paras_i ON bench_paras (i);
CREATE TABLE bench_ocr_src AS
SELECT f.ver_id, f.case_n, f.created_at,
       1 + (f.case_n * 31 + f.seq * 7) % 4000 AS p1, 1 + floor(random() * 4000)::int AS p2
FROM bench_files f WHERE f.is_scan AND random() < 0.97;
-- Chia lô để không giữ một transaction khổng lồ.
DO $$
DECLARE lo bigint := 0; hi bigint; mx bigint;
BEGIN
  SELECT max(case_n) INTO mx FROM bench_ocr_src;
  WHILE lo <= mx LOOP
    hi := lo + 20000;
    INSERT INTO dms_ocr_results (tenant_id, version_id, status, engine, lang, page_count, ocr_text, search_text, finished_at)
    SELECT c.tenant_id, s.ver_id, 'DONE', 'bench', 'vie', 1, t.txt, bench_fold(t.txt), s.created_at
    FROM bench_ocr_src s, bench_ctx c, bench_paras a, bench_paras b,
         LATERAL (SELECT 'Số ' || (s.case_n % 997) || '/GTT. ' || a.txt || ' ' || b.txt ||
                         CASE WHEN s.case_n % 5000 = 0 THEN ' tranh chấp đồng thau' ELSE '' END AS txt) t
    WHERE s.case_n >= lo AND s.case_n < hi AND a.i = s.p1 AND b.i = s.p2;
    lo := hi;
  END LOOP;
END $$;

ANALYZE;
SELECT (SELECT count(*) FROM dms_case_files) cases, (SELECT count(*) FROM dms_documents) docs,
       (SELECT count(*) FROM dms_document_files) files, (SELECT count(*) FROM dms_ocr_results) ocr,
       (SELECT pg_size_pretty(pg_database_size(current_database()))) db_size;
