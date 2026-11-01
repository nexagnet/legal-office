-- DMS ở quy mô lớn (khách sẽ nhập ~200GB tài liệu cũ): tìm kiếm và lọc danh sách phải chạy phía DB, có chỉ mục, phân trang keyset.
-- Trước đây danh sách chỉ tải tối đa 200 hồ sơ rồi web lọc/tìm tại chỗ; hàm quyền dms_case_visible chạy từng dòng.
--
-- Thiết kế:
--  * dms_case_index: một dòng cho mỗi hồ sơ, gom sẵn mọi thứ cần để LỌC (miền, trạng thái, chi nhánh, năm ghi sổ, người tạo,
--    số tài liệu/scan, loại tài liệu, số yêu cầu sửa đổi chờ duyệt) và để TÌM (search_text đã bỏ dấu). Do trigger giữ đồng bộ;
--    bảng gốc dms_* KHÔNG đổi, vẫn chỉ ghi thêm.
--  * Quyền xem tính MỘT LẦN cho mỗi truy vấn (dms_visible_scope) rồi lọc bằng cột, thay vì gọi dms_case_visible từng dòng.
--    Ngữ nghĩa giữ nguyên (xem test dms-scale.itest.ts đối chiếu với dms_case_visible): hồ sơ không chi nhánh chỉ Admin thấy
--    khi văn phòng có chi nhánh.
--  * pg_trgm cho tìm chuỗi con trên search_text (số hiệu, tên đương sự). Nếu host không cho CREATE EXTENSION thì chỉ mất chỉ
--    mục, truy vấn vẫn đúng (chậm hơn). Không dùng unaccent: dms_fold() tự bỏ dấu tiếng Việt, IMMUTABLE nên đặt được vào chỉ mục.
--  * OCR: bảng phụ dms_ocr_search_index giữ tsvector lưu sẵn + case_id/file_id/is_current (không đụng bảng dms_ocr_results).
--  * RLS và chỉ mục: toán tử tìm chữ (@@ trên tsvector, LIKE trên trigram, @> trên mảng) KHÔNG "leakproof", nên với vai ứng dụng
--    chịu RLS, PostgreSQL từ chối dùng chỉ mục GIN cho chúng (đo thực tế: 70ms -> 3,3 giây). Vì vậy ba hàm đọc nặng
--    (dms_search_cases, dms_case_facet_counts, dms_search_content) là SECURITY DEFINER, chạy bằng chủ bảng, đọc (và nạp lần đầu) hai bảng chỉ mục
--    mới (không FORCE RLS, nên chủ bảng được miễn). An toàn tenant do hàm tự bảo đảm: từ chối nếu p_tenant khác app.tenant_id của
--    phiên, và mọi truy vấn đều có điều kiện tenant_id. Vai ứng dụng truy cập trực tiếp hai bảng này vẫn bị RLS chặn như mọi bảng khác.

-- ===== Bỏ dấu tiếng Việt (khớp foldChar ở apps/api/src/ocr/text.ts) =====
CREATE FUNCTION dms_fold(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(lower(normalize(t, NFC)),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')
$$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm không khả dụng (%), tìm chuỗi con sẽ quét tuần tự', SQLERRM;
END $$;

-- ===== Chỉ mục hồ sơ =====
CREATE TABLE dms_case_index (
  case_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  domain text NOT NULL,
  status text NOT NULL,
  branch_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  recorded_at timestamptz,
  sort_at timestamptz NOT NULL,          -- coalesce(recorded_at, created_at): khoá sắp xếp
  rec_year integer,                      -- năm ghi sổ theo giờ Việt Nam
  doc_count integer NOT NULL DEFAULT 0,
  scan_count integer NOT NULL DEFAULT 0,
  doc_kinds text[] NOT NULL DEFAULT '{}',
  pending_count integer NOT NULL DEFAULT 0,
  search_text text NOT NULL DEFAULT '',
  CONSTRAINT dms_case_index_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id)
);
CREATE INDEX dms_ci_list_idx ON dms_case_index (tenant_id, office_id, domain, status, sort_at DESC, case_id DESC);
CREATE INDEX dms_ci_year_idx ON dms_case_index (tenant_id, office_id, domain, status, rec_year, sort_at DESC, case_id DESC);
CREATE INDEX dms_ci_branch_idx ON dms_case_index (tenant_id, office_id, branch_id, sort_at DESC);
CREATE INDEX dms_ci_creator_idx ON dms_case_index (tenant_id, office_id, created_by, sort_at DESC);
CREATE INDEX dms_ci_kinds_idx ON dms_case_index USING gin (doc_kinds);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX dms_ci_trgm_idx ON dms_case_index USING gin (search_text gin_trgm_ops)';
  END IF;
END $$;
ALTER TABLE dms_case_index ENABLE ROW LEVEL SECURITY; -- cố ý KHÔNG FORCE: xem ghi chú đầu tệp
CREATE POLICY tenant_isolation ON dms_case_index
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Tenant đã được lập chỉ mục đầy đủ chưa (migration không đọc được dữ liệu các tenant vì RLS, nên nạp lần đầu khi tenant gọi tìm kiếm).
CREATE TABLE dms_index_state (
  tenant_id uuid PRIMARY KEY,
  ready_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dms_index_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_index_state FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_index_state
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Dựng lại dòng chỉ mục của một hồ sơ từ dữ liệu gốc.
CREATE FUNCTION dms_case_index_refresh(p_tenant uuid, p_case uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; ce record;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN; END IF;
  -- Tìm theo giá trị HIỆN HÀNH (sau sửa đổi đã duyệt), đúng như danh sách và sổ hiển thị.
  SELECT * INTO ce FROM dms_case_effective(p_tenant, p_case);
  INSERT INTO dms_case_index AS i (case_id, tenant_id, office_id, domain, status, branch_id, created_by, created_at, recorded_at, sort_at,
                                   rec_year, doc_count, scan_count, doc_kinds, pending_count, search_text)
  SELECT c.id, c.tenant_id, c.office_id, c.domain, c.status, c.branch_id, c.created_by, c.created_at, c.recorded_at,
         coalesce(c.recorded_at, c.created_at),
         CASE WHEN c.recorded_at IS NULL THEN NULL ELSE extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer END,
         (SELECT count(*)::integer FROM dms_documents d WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'),
         (SELECT count(*)::integer FROM dms_document_files f JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
           WHERE f.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED' AND f.is_scan),
         coalesce((SELECT array_agg(DISTINCT d.kind ORDER BY d.kind) FROM dms_documents d
                    WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'), '{}'::text[]),
         (SELECT count(*)::integer FROM dms_amendment_requests a WHERE a.tenant_id = c.tenant_id AND a.case_id = c.id AND a.status = 'PENDING'),
         dms_fold(left(concat_ws(' ', ce.title,
                  (SELECT string_agg(e.value, ' ') FROM jsonb_each_text(ce.attributes) e),
                  (SELECT string_agg(d.title || ' ' || coalesce((SELECT string_agg(e.value, ' ') FROM jsonb_each_text(dms_doc_effective_attrs(d.tenant_id, d.id)) e), ''), ' ')
                     FROM (SELECT * FROM dms_documents x WHERE x.tenant_id = c.tenant_id AND x.case_id = c.id AND x.status <> 'CANCELLED'
                            ORDER BY x.created_at, x.id LIMIT 50) d)), 6000))
  ON CONFLICT (case_id) DO UPDATE SET
    office_id = EXCLUDED.office_id, domain = EXCLUDED.domain, status = EXCLUDED.status, branch_id = EXCLUDED.branch_id,
    created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, recorded_at = EXCLUDED.recorded_at, sort_at = EXCLUDED.sort_at,
    rec_year = EXCLUDED.rec_year, doc_count = EXCLUDED.doc_count, scan_count = EXCLUDED.scan_count, doc_kinds = EXCLUDED.doc_kinds,
    pending_count = EXCLUDED.pending_count, search_text = EXCLUDED.search_text;
END $$;

CREATE FUNCTION dms_ci_trg_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM dms_case_index_refresh(NEW.tenant_id, NEW.id); RETURN NULL; END $$;
CREATE TRIGGER dms_ci_case_trg AFTER INSERT OR UPDATE ON dms_case_files FOR EACH ROW EXECUTE FUNCTION dms_ci_trg_case();

CREATE FUNCTION dms_ci_trg_doc() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM dms_case_index_refresh(NEW.tenant_id, NEW.case_id); RETURN NULL; END $$;
CREATE TRIGGER dms_ci_doc_trg AFTER INSERT OR UPDATE ON dms_documents FOR EACH ROW EXECUTE FUNCTION dms_ci_trg_doc();

CREATE FUNCTION dms_ci_trg_file() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  SELECT d.case_id INTO cid FROM dms_documents d WHERE d.id = NEW.document_id AND d.tenant_id = NEW.tenant_id;
  IF cid IS NOT NULL THEN PERFORM dms_case_index_refresh(NEW.tenant_id, cid); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER dms_ci_file_trg AFTER INSERT ON dms_document_files FOR EACH ROW EXECUTE FUNCTION dms_ci_trg_file();

CREATE FUNCTION dms_ci_trg_amend() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM dms_case_index_refresh(NEW.tenant_id, NEW.case_id); RETURN NULL; END $$;
CREATE TRIGGER dms_ci_amend_trg AFTER INSERT OR UPDATE OF status ON dms_amendment_requests FOR EACH ROW EXECUTE FUNCTION dms_ci_trg_amend();
-- Bản sửa đổi đã duyệt đổi giá trị hiện hành: dựng lại chỉ mục của hồ sơ đó.
CREATE TRIGGER dms_ci_caserev_trg AFTER INSERT ON dms_case_revisions FOR EACH ROW EXECUTE FUNCTION dms_ci_trg_amend();
CREATE FUNCTION dms_ci_trg_docrev() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  SELECT d.case_id INTO cid FROM dms_documents d WHERE d.id = NEW.document_id AND d.tenant_id = NEW.tenant_id;
  IF cid IS NOT NULL THEN PERFORM dms_case_index_refresh(NEW.tenant_id, cid); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER dms_ci_docrev_trg AFTER INSERT ON dms_document_revisions FOR EACH ROW EXECUTE FUNCTION dms_ci_trg_docrev();

-- ===== OCR: bảng phụ phục vụ tìm kiếm =====
-- Mỗi phiên bản tệp đã nhận dạng xong (DONE) có một dòng: tsvector lưu sẵn (không phải tính lại to_tsvector khi xếp hạng), hồ sơ và tệp
-- chứa nó, và cờ is_current (phiên bản mới nhất của tệp). Dẫn xuất hoàn toàn từ dms_ocr_results, do trigger giữ đồng bộ.
CREATE TABLE dms_ocr_search_index (
  tenant_id uuid NOT NULL,
  version_id uuid NOT NULL,
  case_id uuid NOT NULL,
  file_id uuid NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  tsv tsvector NOT NULL,
  PRIMARY KEY (tenant_id, version_id)
);
CREATE INDEX dms_osi_tsv_idx ON dms_ocr_search_index USING gin (tsv);
CREATE INDEX dms_osi_case_idx ON dms_ocr_search_index (tenant_id, case_id);
CREATE INDEX dms_osi_file_idx ON dms_ocr_search_index (tenant_id, file_id);
ALTER TABLE dms_ocr_search_index ENABLE ROW LEVEL SECURITY; -- cố ý KHÔNG FORCE: xem ghi chú đầu tệp
CREATE POLICY tenant_isolation ON dms_ocr_search_index
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE FUNCTION dms_osi_sync_row(p_tenant uuid, p_version uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO dms_ocr_search_index AS i (tenant_id, version_id, case_id, file_id, is_current, tsv)
  SELECT r.tenant_id, r.version_id, d.case_id, v.file_id,
         NOT EXISTS (SELECT 1 FROM dms_document_versions nv WHERE nv.tenant_id = v.tenant_id AND nv.file_id = v.file_id AND nv.version > v.version),
         to_tsvector('simple', coalesce(r.search_text, ''))
    FROM dms_ocr_results r
    JOIN dms_document_versions v ON v.id = r.version_id AND v.tenant_id = r.tenant_id
    JOIN dms_document_files f ON f.id = v.file_id AND f.tenant_id = v.tenant_id
    JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
   WHERE r.tenant_id = p_tenant AND r.version_id = p_version AND r.status = 'DONE'
  ON CONFLICT (tenant_id, version_id) DO UPDATE SET tsv = EXCLUDED.tsv, is_current = EXCLUDED.is_current;
END $$;

CREATE FUNCTION dms_osi_trg_ocr() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'DONE' THEN
    PERFORM dms_osi_sync_row(NEW.tenant_id, NEW.version_id);
  ELSE
    DELETE FROM dms_ocr_search_index WHERE tenant_id = NEW.tenant_id AND version_id = NEW.version_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER dms_osi_ocr_trg AFTER INSERT OR UPDATE OF status, search_text ON dms_ocr_results
  FOR EACH ROW EXECUTE FUNCTION dms_osi_trg_ocr();

-- Phiên bản mới của tệp (qua yêu cầu sửa đổi đã duyệt) làm các dòng OCR cũ của tệp đó hết là bản hiện hành.
CREATE FUNCTION dms_osi_supersede() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE dms_ocr_search_index SET is_current = false
   WHERE tenant_id = NEW.tenant_id AND file_id = NEW.file_id AND version_id <> NEW.id AND is_current;
  RETURN NULL;
END $$;
CREATE TRIGGER dms_osi_supersede_trg AFTER INSERT ON dms_document_versions FOR EACH ROW WHEN (NEW.version > 1) EXECUTE FUNCTION dms_osi_supersede();

-- Nạp lần đầu cho một tenant (dữ liệu có trước migration này). Idempotent; khoá advisory tránh hai lần nạp song song.
CREATE FUNCTION dms_index_ensure(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM dms_index_state WHERE tenant_id = p_tenant) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dms_index_ensure:' || p_tenant::text, 0));
  IF EXISTS (SELECT 1 FROM dms_index_state WHERE tenant_id = p_tenant) THEN RETURN; END IF;
  PERFORM dms_case_index_refresh(p_tenant, c.id) FROM dms_case_files c WHERE c.tenant_id = p_tenant;
  PERFORM dms_osi_sync_row(r.tenant_id, r.version_id) FROM dms_ocr_results r WHERE r.tenant_id = p_tenant AND r.status = 'DONE';
  INSERT INTO dms_index_state (tenant_id) VALUES (p_tenant) ON CONFLICT DO NOTHING;
END $$;

-- ===== Quyền xem, tính một lần =====
-- Cùng ngữ nghĩa dms_case_visible: RECORDED => read.all, hoặc read.own khi là người tạo; chưa ghi sổ => chỉ người tạo (own hoặc all);
-- và chi nhánh: có chi nhánh => thuộc danh sách chi nhánh được cấp; không chi nhánh => chỉ khi văn phòng không có chi nhánh hoặc có quyền duyệt (Admin).
CREATE FUNCTION dms_visible_scope(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (all_domains text[], own_domains text[], branch_ids uuid[], unassigned_ok boolean)
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT array_agg(d) FROM unnest(ARRAY['vibang','tongdat','xacminh','tochuc','vtden','vtdi','vtnb']) d
                    WHERE dms_has_permission(p_tenant, p_actor, p_office, d || '.read.all')), '{}'::text[]),
         coalesce((SELECT array_agg(d) FROM unnest(ARRAY['vibang','tongdat','xacminh','tochuc','vtden','vtdi','vtnb']) d
                    WHERE dms_has_permission(p_tenant, p_actor, p_office, d || '.read.own')), '{}'::text[]),
         coalesce((SELECT array_agg(b) FROM dms_branch_ids(p_tenant, p_actor, p_office) b), '{}'::uuid[]),
         NOT EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office)
           OR (NOT dms_user_suspended(p_tenant, p_actor) AND dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve'))
$$;

-- Điều kiện quyền xem dạng SQL (alias bảng = ci) để ghép vào truy vấn động. Giá trị nhúng bằng quote_literal.
CREATE FUNCTION dms_ci_vis_sql(p_tenant uuid, p_actor uuid, p_office uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM dms_visible_scope(p_tenant, p_actor, p_office);
  RETURN format(
    '((ci.status = ''RECORDED'' AND (ci.domain = ANY(%1$L::text[]) OR (ci.created_by = %3$L AND ci.domain = ANY(%2$L::text[])))) '
    'OR (ci.status <> ''RECORDED'' AND ci.created_by = %3$L AND (ci.domain = ANY(%1$L::text[]) OR ci.domain = ANY(%2$L::text[])))) '
    'AND ((ci.branch_id IS NULL AND %5$L::boolean) OR ci.branch_id = ANY(%4$L::uuid[]))',
    s.all_domains, s.own_domains, p_actor, s.branch_ids, s.unassigned_ok);
END $$;

-- Điều kiện lọc (alias ci). p_skip bỏ MỘT nhóm lọc phụ (creator|branch|kind|scan) để đếm facet kiểu "chọn nhiều giá trị trong cùng nhóm".
CREATE FUNCTION dms_ci_where(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                             p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                             p_pending boolean, p_skip text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE w text; term text; n integer := 0;
BEGIN
  w := format('ci.tenant_id = %L AND ci.office_id = %L AND ', p_tenant, p_office) || dms_ci_vis_sql(p_tenant, p_actor, p_office);
  IF p_domain IS NOT NULL THEN w := w || format(' AND ci.domain = %L', p_domain); END IF;
  IF p_status IS NULL THEN w := w || ' AND ci.status <> ''CANCELLED''';
  ELSE w := w || format(' AND ci.status = %L', p_status); END IF;
  IF p_year IS NOT NULL THEN w := w || format(' AND ci.rec_year = %s', p_year::integer); END IF;
  IF p_from IS NOT NULL THEN w := w || format(' AND ci.sort_at >= %L', p_from); END IF;
  IF p_to IS NOT NULL THEN w := w || format(' AND ci.sort_at < %L', p_to); END IF;
  IF coalesce(p_pending, false) THEN w := w || ' AND ci.pending_count > 0'; END IF;
  -- Từ khoá: đã bỏ dấu, chỉ [a-z0-9/.-] (không thể chèn ký tự đại diện LIKE), tối đa 6 từ; mọi từ phải có mặt (khớp chuỗi con).
  FOR term IN SELECT DISTINCT t FROM unnest(regexp_split_to_array(dms_fold(coalesce(p_q, '')), '[^a-z0-9/.-]+')) t WHERE t <> '' LOOP
    n := n + 1;
    EXIT WHEN n > 6;
    w := w || format(' AND ci.search_text LIKE %L', '%' || term || '%');
  END LOOP;
  IF p_branch IS NOT NULL AND p_skip IS DISTINCT FROM 'branch' THEN w := w || format(' AND ci.branch_id = %L', p_branch); END IF;
  IF p_creator IS NOT NULL AND p_skip IS DISTINCT FROM 'creator' THEN w := w || format(' AND ci.created_by = %L', p_creator); END IF;
  IF p_kind IS NOT NULL AND p_skip IS DISTINCT FROM 'kind' THEN w := w || format(' AND ci.doc_kinds @> ARRAY[%L]::text[]', p_kind); END IF;
  IF p_scan IS NOT NULL AND p_skip IS DISTINCT FROM 'scan' THEN
    w := w || CASE p_scan WHEN 'missing' THEN ' AND ci.doc_count > 0 AND ci.scan_count = 0'
                          WHEN 'complete' THEN ' AND ci.doc_count > 0 AND ci.scan_count > 0'
                          WHEN 'empty' THEN ' AND ci.doc_count = 0'
                          ELSE ' AND false' END;
  END IF;
  RETURN w;
END $$;

-- Con trỏ keyset: 'YYYY-MM-DDTHH24:MI:SS.US+00|uuid' (giữ nguyên micro giây; JS Date làm mất nên con trỏ là chuỗi do DB cấp).
CREATE FUNCTION dms_ci_cursor(p_sort_at timestamptz, p_id uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(p_sort_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') || '|' || p_id::text
$$;

-- ===== Danh sách + tìm hồ sơ =====
-- Trả mỗi trang p_limit dòng theo keyset (p_cursor) hoặc offset (p_offset, cho thanh số trang). total_capped đếm tối đa 10001
-- (hiển thị "10.000+"); chỉ tính khi p_with_total.
CREATE FUNCTION dms_search_cases(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                                 p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                                 p_pending boolean, p_sort text, p_cursor text, p_limit integer, p_offset integer, p_with_total boolean)
RETURNS TABLE (id uuid, domain text, title text, status text, created_by uuid, creator_name text, created_at timestamptz,
               recorded_at timestamptz, branch_id uuid, branch_name text, document_count integer, scan_count integer,
               doc_kinds text[], pending_count integer, attributes jsonb, cursor text, total_capped bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w text; asc_ boolean := (p_sort = 'oldest'); lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
        cur_ts timestamptz; cur_id uuid; cw text := ''; total bigint := NULL; dir text;
BEGIN
  IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM dms_index_ensure(p_tenant);
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.search', true, 'ALLOWED', p_office, NULL, p_domain);
  w := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending);
  dir := CASE WHEN asc_ THEN 'ASC' ELSE 'DESC' END;
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    cur_ts := split_part(p_cursor, '|', 1)::timestamptz;
    cur_id := split_part(p_cursor, '|', 2)::uuid;
    cw := format(' AND (ci.sort_at, ci.case_id) %s (%L, %L)', CASE WHEN asc_ THEN '>' ELSE '<' END, cur_ts, cur_id);
  END IF;
  IF coalesce(p_with_total, false) THEN
    EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM dms_case_index ci WHERE %s LIMIT 10001) x', w) INTO total;
  END IF;
  RETURN QUERY EXECUTE format($q$
    SELECT p.case_id, p.domain, ce.title, p.status, p.created_by,
           coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), '')), p.created_at, p.recorded_at, p.branch_id, b.name,
           p.doc_count, p.scan_count, p.doc_kinds, p.pending_count, ce.attributes, dms_ci_cursor(p.sort_at, p.case_id), %L::bigint
      FROM (SELECT ci.* FROM dms_case_index ci WHERE %s%s ORDER BY ci.sort_at %s, ci.case_id %s LIMIT %s OFFSET %s) p
      CROSS JOIN LATERAL dms_case_effective(p.tenant_id, p.case_id) ce
      LEFT JOIN users u ON u.id = p.created_by AND u.tenant_id = p.tenant_id
      LEFT JOIN branches b ON b.id = p.branch_id AND b.tenant_id = p.tenant_id
     ORDER BY p.sort_at %s, p.case_id %s$q$,
    total, w, cw, dir, dir, lim, greatest(0, coalesce(p_offset, 0)), dir, dir);
END $$;

-- ===== Facet có đếm =====
-- Mỗi nhóm đếm theo MỌI bộ lọc đang chọn trừ chính nhóm đó, nên người dùng thấy "đổi sang giá trị khác sẽ ra bao nhiêu hồ sơ".
-- group_key: creator | branch | kind | scan | year.
CREATE FUNCTION dms_case_facet_counts(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                                      p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                                      p_pending boolean)
RETURNS TABLE (group_key text, value text, label text, n bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE wc text; wb text; wk text; ws text; wy text;
BEGIN
  IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM dms_index_ensure(p_tenant);
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.facets', true, 'ALLOWED', p_office, NULL, p_domain);
  wc := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'creator');
  wb := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'branch');
  wk := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'kind');
  ws := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'scan');
  wy := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, NULL, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending);
  RETURN QUERY EXECUTE format($q$
    SELECT 'creator', g.created_by::text, coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), ''), '(không rõ)'), g.n
      FROM (SELECT ci.created_by, count(*) AS n FROM dms_case_index ci WHERE %1$s GROUP BY ci.created_by) g
      LEFT JOIN users u ON u.id = g.created_by AND u.tenant_id = %5$L
    UNION ALL
    SELECT 'branch', coalesce(g.branch_id::text, ''), coalesce(b.name, '(chưa gắn chi nhánh)'), g.n
      FROM (SELECT ci.branch_id, count(*) AS n FROM dms_case_index ci WHERE %2$s GROUP BY ci.branch_id) g
      LEFT JOIN branches b ON b.id = g.branch_id AND b.tenant_id = %5$L
    UNION ALL
    SELECT 'kind', k, k, count(*) FROM dms_case_index ci, unnest(ci.doc_kinds) k WHERE %3$s GROUP BY k
    UNION ALL
    SELECT 'scan', s, s, count(*) FROM (
      SELECT CASE WHEN ci.doc_count = 0 THEN 'empty' WHEN ci.scan_count = 0 THEN 'missing' ELSE 'complete' END AS s
        FROM dms_case_index ci WHERE %4$s) z GROUP BY s
    UNION ALL
    SELECT 'year', ci.rec_year::text, ci.rec_year::text, count(*) FROM dms_case_index ci WHERE %6$s AND ci.rec_year IS NOT NULL GROUP BY ci.rec_year$q$,
    wc, wb, wk, ws, p_tenant, wy);
END $$;

-- ===== Tìm trong nội dung scan (OCR) =====
-- p_tsquery do ứng dụng dựng (đã bỏ dấu, từ cuối khớp tiền tố). Chọn chiến lược theo độ phổ biến của từ khoá:
--  * recent: từ phổ biến (>= 80 hồ sơ khớp trong 2000 hồ sơ mới nhất sau khi lọc quyền/bộ lọc): duyệt hồ sơ từ mới đến cũ, mỗi hồ sơ
--    lấy một tệp khớp, dừng ngay khi đủ trang. Không bao giờ phải đọc hết hàng trăm nghìn dòng khớp.
--  * ranked: từ hiếm (<= 3000 dòng OCR khớp): lấy qua chỉ mục GIN rồi xếp theo ts_rank.
--  * recent_sorted: vùng giữa (> 3000 khớp nhưng thưa): lấy qua GIN, xếp theo ngày mới nhất.
-- Chỉ phiên bản hiện hành của tệp. Tài liệu đã hủy bị loại sau khi cắt trang (hiếm, có thể làm trang ngắn hơn limit).
CREATE FUNCTION dms_search_content(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_tsquery text, p_year integer,
                                   p_branch uuid, p_creator uuid, p_kind text, p_limit integer, p_offset integer)
RETURNS TABLE (case_id uuid, case_title text, domain text, document_id uuid, document_title text, file_id uuid, file_label text,
               version integer, rank real, ocr_text text, ranked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w text; q tsquery; qs text; n bigint; hits bigint; lim integer := greatest(1, least(coalesce(p_limit, 20), 50));
        off integer := greatest(0, coalesce(p_offset, 0)); base text; ord text; mode_ text; lat text; outer_q text;
BEGIN
  IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM dms_index_ensure(p_tenant);
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.ocr.search', true, 'ALLOWED', p_office, NULL, p_domain);
  IF btrim(coalesce(p_tsquery, '')) = '' THEN RETURN; END IF;
  q := to_tsquery('simple', p_tsquery);
  qs := q::text;
  w := dms_ci_where(p_tenant, p_actor, p_office, p_domain, NULL, NULL, p_year, NULL, NULL, p_branch, p_creator, p_kind, NULL, NULL);
  -- Phần chung: gắn văn bản OCR + tệp + tài liệu + hồ sơ cho các phiên bản đã chọn (m.version_id, m.file_id, m.case_id, m.rank, m.sort_at).
  outer_q := format($o$
      JOIN dms_ocr_results r ON r.tenant_id = %L AND r.version_id = m.version_id
      JOIN dms_document_versions v ON v.id = m.version_id AND v.tenant_id = r.tenant_id
      JOIN dms_document_files f ON f.id = m.file_id AND f.tenant_id = r.tenant_id
      JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
      JOIN dms_case_files c ON c.id = m.case_id AND c.tenant_id = r.tenant_id
     WHERE d.status <> 'CANCELLED'$o$, p_tenant);
  lat := format($l$SELECT r.version_id, r.file_id FROM dms_ocr_search_index r
                    WHERE r.tenant_id = %L AND r.case_id = c.case_id AND r.is_current AND r.tsv @@ %L::tsquery
                    ORDER BY r.version_id LIMIT 1$l$, p_tenant, qs);
  EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM (SELECT ci.case_id FROM dms_case_index ci WHERE %s ORDER BY ci.sort_at DESC, ci.case_id DESC LIMIT 2000) c
                   WHERE EXISTS (SELECT 1 FROM dms_ocr_search_index r WHERE r.tenant_id = %L AND r.case_id = c.case_id AND r.is_current AND r.tsv @@ %L::tsquery) LIMIT 80) x',
                 w, p_tenant, qs) INTO hits;
  IF hits >= 80 THEN
    RETURN QUERY EXECUTE format($q$
      SELECT m.case_id, c.title, c.domain, d.id, d.title, f.id, f.label, v.version, 0::real, r.ocr_text, false
        FROM (SELECT c.case_id, h.version_id, h.file_id, c.sort_at, 0::real AS rank
                FROM (SELECT ci.case_id, ci.sort_at FROM dms_case_index ci WHERE %s ORDER BY ci.sort_at DESC, ci.case_id DESC) c
                CROSS JOIN LATERAL (%s) h
               LIMIT %s OFFSET %s) m %s
       ORDER BY m.sort_at DESC, m.case_id DESC$q$, w, lat, lim, off, outer_q);
    RETURN;
  END IF;
  base := format($b$FROM dms_ocr_search_index r JOIN dms_case_index ci ON ci.case_id = r.case_id AND ci.tenant_id = r.tenant_id
                    WHERE r.tenant_id = %L AND r.is_current AND r.tsv @@ %L::tsquery AND %s$b$, p_tenant, qs, w);
  EXECUTE 'SELECT count(*) FROM (SELECT 1 ' || base || ' LIMIT 3001) x' INTO n;
  mode_ := CASE WHEN n <= 3000 THEN 'ranked' ELSE 'recent_sorted' END;
  ord := CASE WHEN mode_ = 'ranked' THEN format('ts_rank(r.tsv, %L::tsquery) DESC, ci.sort_at DESC, r.version_id', qs) ELSE 'ci.sort_at DESC, r.version_id' END;
  RETURN QUERY EXECUTE format($q$
    SELECT m.case_id, c.title, c.domain, d.id, d.title, f.id, f.label, v.version, m.rank, r.ocr_text, %L::boolean
      FROM (SELECT r.case_id, r.version_id, r.file_id, ci.sort_at, %s AS rank %s ORDER BY %s LIMIT %s OFFSET %s) m %s
     ORDER BY %s$q$,
    mode_ = 'ranked', CASE WHEN mode_ = 'ranked' THEN format('ts_rank(r.tsv, %L::tsquery)', qs) ELSE '0::real' END, base, ord, lim, off, outer_q,
    CASE WHEN mode_ = 'ranked' THEN 'm.rank DESC, m.sort_at DESC, m.version_id' ELSE 'm.sort_at DESC, m.version_id' END);
END $$;

-- ===== Dòng sổ của MỘT TRANG hồ sơ =====
-- Trang danh sách chỉ cần dòng sổ (STT + các ô) của vài chục hồ sơ đang hiện, không phải cả sổ cả năm. Cùng luật hiển thị và giá
-- trị hiện hành như dms_book_rows; không ghi nhật ký xuất sổ vì đây là xem danh sách, không phải xuất.
CREATE FUNCTION dms_book_rows_for_cases(p_tenant uuid, p_actor uuid, p_office uuid, p_book text, p_cases uuid[])
RETURNS TABLE (stt integer, case_id uuid, document_id uuid, case_title text, case_attributes jsonb,
               doc_kind text, doc_title text, doc_attributes jsonb, recorded_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT e.stt, e.case_id, e.document_id, (dms_case_effective(c.tenant_id, c.id)).title, (dms_case_effective(c.tenant_id, c.id)).attributes,
         d.kind, d.title, dms_doc_effective_attrs(d.tenant_id, d.id), c.recorded_at
  FROM dms_book_entries e
  JOIN dms_case_files c ON c.id = e.case_id AND c.tenant_id = e.tenant_id
  LEFT JOIN dms_documents d ON d.id = e.document_id AND d.tenant_id = e.tenant_id
  WHERE e.tenant_id = p_tenant AND e.office_id = p_office AND e.book = p_book
    AND e.case_id = ANY (p_cases[1:200])
    AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
  ORDER BY e.stt, d.created_at
$$;

-- ===== Bộ lọc đã lưu (của riêng từng người dùng; là tuỳ chọn giao diện, không phải hồ sơ nghiệp vụ) =====
CREATE TABLE dms_saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  user_id uuid NOT NULL,
  domain text NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  params jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object' AND length(params::text) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_saved_filters_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT dms_saved_filters_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT dms_saved_filters_name_uq UNIQUE (tenant_id, user_id, domain, name)
);
ALTER TABLE dms_saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_saved_filters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_saved_filters
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE FUNCTION dms_saved_filter_list(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text)
RETURNS TABLE (id uuid, name text, params jsonb)
LANGUAGE sql STABLE AS $$
  SELECT s.id, s.name, s.params FROM dms_saved_filters s
   WHERE s.tenant_id = p_tenant AND s.user_id = p_actor AND s.office_id = p_office AND s.domain = p_domain ORDER BY s.name
$$;

CREATE FUNCTION dms_saved_filter_save(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_name text, p_params jsonb)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    RETURN ROW(false, 'PERMISSION_DENIED', NULL)::vibang_op;
  END IF;
  IF (SELECT count(*) FROM dms_saved_filters s WHERE s.tenant_id = p_tenant AND s.user_id = p_actor AND s.domain = p_domain) >= 30
     AND NOT EXISTS (SELECT 1 FROM dms_saved_filters s WHERE s.tenant_id = p_tenant AND s.user_id = p_actor AND s.domain = p_domain AND s.name = btrim(p_name)) THEN
    RETURN ROW(false, 'INVALID_ITEM', NULL)::vibang_op;
  END IF;
  INSERT INTO dms_saved_filters (tenant_id, office_id, user_id, domain, name, params)
  VALUES (p_tenant, p_office, p_actor, p_domain, btrim(p_name), p_params)
  ON CONFLICT (tenant_id, user_id, domain, name) DO UPDATE SET params = EXCLUDED.params
  RETURNING id INTO new_id;
  RETURN ROW(true, 'SAVED', new_id::text)::vibang_op;
END $$;

CREATE FUNCTION dms_saved_filter_remove(p_tenant uuid, p_actor uuid, p_id uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM dms_saved_filters WHERE id = p_id AND tenant_id = p_tenant AND user_id = p_actor;
  RETURN CASE WHEN FOUND THEN ROW(true, 'REMOVED', p_id::text)::vibang_op ELSE ROW(false, 'ITEM_NOT_FOUND', NULL)::vibang_op END;
END $$;
