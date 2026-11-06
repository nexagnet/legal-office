-- DMS: nhập hàng loạt TÀI LIỆU CŨ (kho tệp có sẵn của khách). Chỉ lưu tệp và đánh dấu "tài liệu cũ":
-- không tạo hồ sơ nghiệp vụ, không nhập dữ liệu nghiệp vụ. Nhập theo ĐỢT; đóng đợt xong thì không thêm được nữa.
-- Nguyên tắc DMS giữ nguyên: không xoá, không ghi đè, không sửa trực tiếp, kể cả Admin (ép bằng trigger append-only).
-- Quyền theo Nhóm quyền: dms.legacy.import (nhập), dms.legacy.read (xem/tải). Không dùng Role.
-- Khoá đối tượng do máy chủ dựng từ sha256 (client không chọn); tệp trùng nội dung trong cùng văn phòng chỉ lưu MỘT lần.
-- Dữ liệu giả lập khi thử; nhật ký không chứa tên tệp/đường dẫn (có thể chứa PII).

-- ===== Mã quyền mới =====
ALTER TABLE dms_group_permissions DROP CONSTRAINT dms_group_permissions_permission_check;
ALTER TABLE dms_group_permissions ADD CONSTRAINT dms_group_permissions_permission_check CHECK (
  permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.stock.write', 'dms.legacy.import', 'dms.legacy.read')
);
ALTER TABLE dms_permission_requests DROP CONSTRAINT dms_perm_req_permission_chk;
ALTER TABLE dms_permission_requests ADD CONSTRAINT dms_perm_req_permission_chk CHECK (
  permission IS NULL
  OR permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.stock.write', 'dms.legacy.import', 'dms.legacy.read')
);

DO $$
DECLARE r record; def text; patched text;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema() AND p.proname = 'dms_permission_propose';
  def := pg_get_functiondef(r.oid);
  patched := replace(def, '''dms.permission.propose'', ''dms.permission.approve'', ''dms.stock.write'')',
                          '''dms.permission.propose'', ''dms.permission.approve'', ''dms.stock.write'', ''dms.legacy.import'', ''dms.legacy.read'')');
  IF patched = def THEN RAISE EXCEPTION 'dms_legacy_import: dms_permission_propose không có gì để vá'; END IF;
  EXECUTE patched;
END $$;

-- ===== Đợt nhập =====
CREATE TABLE dms_legacy_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> '' AND char_length(label) <= 200),
  -- Chỉ để hiển thị (ví dụ "Ổ D:\Lưu trữ"); không dùng để truy cập.
  source_root text CHECK (source_root IS NULL OR char_length(source_root) <= 300),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  CONSTRAINT dms_legacy_batches_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_legacy_batches_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT dms_legacy_batches_closed_chk CHECK (status <> 'CLOSED' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL))
);

-- ===== Tệp tài liệu cũ: chỉ ghi thêm =====
CREATE TABLE dms_legacy_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  -- Đường dẫn tương đối trong kho gốc, dùng '/', giữ nguyên cấu trúc thư mục.
  rel_path text NOT NULL CHECK (
    btrim(rel_path) <> '' AND char_length(rel_path) <= 1000 AND rel_path !~ '^/' AND rel_path !~ '\\' AND rel_path !~ '(^|/)\.\.(/|$)' AND rel_path !~ '/$'
  ),
  file_name text NOT NULL CHECK (btrim(file_name) <> ''),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (btrim(mime) <> ''),
  object_key text NOT NULL CHECK (btrim(object_key) <> ''),
  source_mtime timestamptz,
  is_legacy boolean NOT NULL DEFAULT true CHECK (is_legacy),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_legacy_files_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_legacy_files_path_uq UNIQUE (batch_id, rel_path),
  CONSTRAINT dms_legacy_files_batch_fk FOREIGN KEY (batch_id, tenant_id) REFERENCES dms_legacy_batches (id, tenant_id),
  CONSTRAINT dms_legacy_files_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
CREATE INDEX dms_legacy_files_hash_idx ON dms_legacy_files (tenant_id, office_id, sha256);
CREATE INDEX dms_legacy_files_path_idx ON dms_legacy_files (tenant_id, office_id, rel_path text_pattern_ops);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dms_legacy_batches', 'dms_legacy_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- ===== Bất biến =====
CREATE TRIGGER dms_legacy_files_ro BEFORE UPDATE OR DELETE ON dms_legacy_files FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_legacy_files_no_truncate BEFORE TRUNCATE ON dms_legacy_files FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_legacy_batches_no_truncate BEFORE TRUNCATE ON dms_legacy_batches FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Lớp bảo vệ thứ hai: không thêm tệp vào đợt đã đóng, dù ai gọi trực tiếp bảng.
CREATE FUNCTION dms_legacy_files_open_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dms_legacy_batches b WHERE b.id = NEW.batch_id AND b.tenant_id = NEW.tenant_id AND b.status = 'OPEN') THEN
    RAISE EXCEPTION 'cannot add a file to a closed legacy batch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_legacy_files_open_trg BEFORE INSERT ON dms_legacy_files FOR EACH ROW EXECUTE FUNCTION dms_legacy_files_open_guard();

-- Đợt: không xoá; chỉ đi OPEN -> CLOSED một lần, các cột khác không đổi.
CREATE FUNCTION dms_legacy_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'OPEN' OR NEW.status <> 'CLOSED'
     OR (NEW.id, NEW.tenant_id, NEW.office_id, NEW.label, NEW.source_root, NEW.created_by, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.office_id, OLD.label, OLD.source_root, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'dms_legacy_batches only allows OPEN -> CLOSED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_legacy_batch_guard_trg BEFORE UPDATE OR DELETE ON dms_legacy_batches FOR EACH ROW EXECUTE FUNCTION dms_legacy_batch_guard();

-- ===== Khoá đối tượng (máy chủ dựng, ứng dụng dựng giống hệt rồi hàm đăng ký so khớp) =====
CREATE FUNCTION dms_legacy_object_key(p_tenant uuid, p_office uuid, p_sha text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 't/' || p_tenant::text || '/legacy/' || p_office::text || '/' || substr(p_sha, 1, 2) || '/' || p_sha;
$$;

-- ===== Ghi: mở đợt / đóng đợt =====
CREATE FUNCTION dms_legacy_batch_open(p_tenant uuid, p_actor uuid, p_office uuid, p_label text, p_source_root text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.legacy.import') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_open', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_label, '')) = '' OR char_length(p_label) > 200 OR char_length(coalesce(p_source_root, '')) > 300 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_open', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  INSERT INTO dms_legacy_batches (tenant_id, office_id, label, source_root, created_by)
  VALUES (p_tenant, p_office, btrim(p_label), nullif(btrim(coalesce(p_source_root, '')), ''), p_actor)
  RETURNING id INTO new_id;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.legacy.batch_open', 'legacy_batch', new_id, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_open', true, 'LEGACY_BATCH_OPENED', p_office, NULL, new_id::text);
END $$;

CREATE FUNCTION dms_legacy_batch_close(p_tenant uuid, p_actor uuid, p_batch uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE b dms_legacy_batches; n bigint;
BEGIN
  SELECT * INTO b FROM dms_legacy_batches WHERE id = p_batch AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, b.office_id, 'dms.legacy.import') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_close', false, 'BATCH_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF b.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_close', false, 'BATCH_CLOSED', b.office_id, NULL, NULL);
  END IF;
  UPDATE dms_legacy_batches SET status = 'CLOSED', closed_by = p_actor, closed_at = now() WHERE id = b.id;
  SELECT count(*) INTO n FROM dms_legacy_files f WHERE f.batch_id = b.id AND f.tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, b.office_id, p_actor, 'dms.legacy.batch_close', 'legacy_batch', b.id, jsonb_build_object('files', n));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_close', true, 'LEGACY_BATCH_CLOSED', b.office_id, NULL, b.id::text);
END $$;

-- ===== Ghi: đăng ký một tệp ĐÃ nằm trong kho (ứng dụng đã kiểm tra tệp tồn tại và đúng kích thước) =====
-- Cùng đường dẫn + cùng nội dung: thành công, không ghi lại. Cùng đường dẫn khác nội dung: từ chối (không ghi đè).
CREATE FUNCTION dms_legacy_register(p_tenant uuid, p_actor uuid, p_batch uuid, p_rel_path text, p_size bigint, p_sha text,
                                    p_mime text, p_mtime timestamptz, p_key text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE b dms_legacy_batches; existing dms_legacy_files; new_id uuid; fname text;
BEGIN
  SELECT * INTO b FROM dms_legacy_batches WHERE id = p_batch AND tenant_id = p_tenant FOR SHARE;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, b.office_id, 'dms.legacy.import') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.register', false, 'BATCH_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF b.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.register', false, 'BATCH_CLOSED', b.office_id, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_rel_path, '')) = '' OR char_length(p_rel_path) > 1000 OR p_rel_path ~ '^/' OR p_rel_path ~ '\\'
     OR p_rel_path ~ '(^|/)\.\.(/|$)' OR p_rel_path ~ '/$'
     OR coalesce(p_size, -1) < 0 OR coalesce(p_sha, '') !~ '^[0-9a-f]{64}$' OR btrim(coalesce(p_mime, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.register', false, 'INVALID_INPUT', b.office_id, NULL, NULL);
  END IF;
  IF p_key IS DISTINCT FROM dms_legacy_object_key(p_tenant, b.office_id, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.register', false, 'INVALID_OBJECT_KEY', b.office_id, NULL, NULL);
  END IF;
  SELECT * INTO existing FROM dms_legacy_files WHERE batch_id = b.id AND rel_path = p_rel_path;
  IF FOUND THEN
    IF existing.sha256 = p_sha THEN
      RETURN ROW(true, 'LEGACY_FILE_ALREADY_REGISTERED', existing.id::text)::vibang_op;
    END IF;
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.register', false, 'PATH_CONFLICT', b.office_id, NULL, NULL);
  END IF;
  fname := regexp_replace(p_rel_path, '^.*/', '');
  INSERT INTO dms_legacy_files (tenant_id, office_id, batch_id, rel_path, file_name, size_bytes, sha256, mime, object_key, source_mtime, created_by)
  VALUES (p_tenant, b.office_id, b.id, p_rel_path, fname, p_size, p_sha, btrim(p_mime), p_key, p_mtime, p_actor)
  RETURNING id INTO new_id;
  RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.register', true, 'LEGACY_FILE_REGISTERED', b.office_id, NULL, new_id::text);
END $$;

-- ===== Đọc =====
-- Trong số các hash gửi lên, hash nào ĐÃ có trong văn phòng này (để bỏ qua tải lại). Chỉ trả hash, không lộ đường dẫn.
CREATE FUNCTION dms_legacy_known_hashes(p_tenant uuid, p_actor uuid, p_office uuid, p_hashes text[])
RETURNS TABLE (sha256 text, size_bytes bigint)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.legacy.import') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.known', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT ON (f.sha256) f.sha256, f.size_bytes
    FROM dms_legacy_files f
    WHERE f.tenant_id = p_tenant AND f.office_id = p_office AND f.sha256 = ANY (p_hashes)
    ORDER BY f.sha256, f.created_at;
END $$;

CREATE FUNCTION dms_legacy_batch_report(p_tenant uuid, p_actor uuid, p_batch uuid)
RETURNS TABLE (id uuid, office_id uuid, label text, status text, created_at timestamptz, closed_at timestamptz,
               file_count bigint, total_bytes numeric, unique_objects bigint)
LANGUAGE plpgsql AS $$
DECLARE b dms_legacy_batches;
BEGIN
  SELECT * INTO b FROM dms_legacy_batches WHERE dms_legacy_batches.id = p_batch AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT (dms_has_permission(p_tenant, p_actor, b.office_id, 'dms.legacy.import')
                       OR dms_has_permission(p_tenant, p_actor, b.office_id, 'dms.legacy.read')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.report', false, 'BATCH_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT b.id, b.office_id, b.label, b.status, b.created_at, b.closed_at,
           count(f.id), coalesce(sum(f.size_bytes), 0)::numeric, count(DISTINCT f.sha256)
    FROM (SELECT 1) one LEFT JOIN dms_legacy_files f ON f.batch_id = b.id AND f.tenant_id = p_tenant;
END $$;

-- Danh sách theo thư mục (tiền tố đường dẫn). Cần quyền xem.
CREATE FUNCTION dms_legacy_list(p_tenant uuid, p_actor uuid, p_office uuid, p_prefix text, p_limit integer, p_offset integer)
RETURNS TABLE (id uuid, batch_id uuid, rel_path text, file_name text, size_bytes bigint, sha256 text, mime text,
               source_mtime timestamptz, created_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE pat text;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.legacy.read') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.list', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.list', true, 'ALLOWED', p_office, NULL, NULL);
  pat := replace(replace(replace(coalesce(p_prefix, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  RETURN QUERY
    SELECT f.id, f.batch_id, f.rel_path, f.file_name, f.size_bytes, f.sha256, f.mime, f.source_mtime, f.created_at
    FROM dms_legacy_files f
    WHERE f.tenant_id = p_tenant AND f.office_id = p_office AND f.rel_path LIKE pat
    ORDER BY f.rel_path COLLATE "C", f.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

-- Mở một tệp để xem/tải: cần quyền xem, ghi nhật ký mỗi lần. Trả khoá đối tượng để ứng dụng cấp liên kết ngắn hạn.
CREATE FUNCTION dms_legacy_open(p_tenant uuid, p_actor uuid, p_file uuid)
RETURNS TABLE (ok boolean, code text, object_key text, mime text, file_name text, size_bytes bigint)
LANGUAGE plpgsql AS $$
DECLARE f dms_legacy_files;
BEGIN
  SELECT * INTO f FROM dms_legacy_files WHERE dms_legacy_files.id = p_file AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, f.office_id, 'dms.legacy.read') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.open', false, 'FILE_NOT_FOUND', NULL, NULL, NULL);
    RETURN QUERY SELECT false, 'FILE_NOT_FOUND'::text, NULL::text, NULL::text, NULL::text, NULL::bigint;
    RETURN;
  END IF;
  PERFORM dms_audit_rec(p_tenant, f.office_id, p_actor, 'dms.legacy.open', 'legacy_file', f.id, '{}'::jsonb);
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.open', true, 'ALLOWED', f.office_id, NULL, NULL);
  RETURN QUERY SELECT true, 'ALLOWED'::text, f.object_key, f.mime, f.file_name, f.size_bytes;
END $$;
