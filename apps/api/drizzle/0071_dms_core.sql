-- DMS Phase 1 (lát 1): lõi hồ sơ + tài liệu + tệp + phiên bản + nhật ký, phân quyền CHỈ bằng Nhóm quyền.
-- Căn cứ: issue #265 và các quyết định owner 2026-10-30/31 (Figma "DMS CANONICAL" + N11).
-- Nguyên tắc cứng (ép ở CSDL, không chỉ ở UI/API):
--   * Không xoá, không ghi đè. Hồ sơ/tài liệu: nháp (DRAFT) sửa được; "xác nhận lưu chính thức" -> RECORDED thì bất biến.
--   * "Hủy nháp" -> CANCELLED, giữ lịch sử; KHÔNG có đường quay lại (khôi phục nháp đã hủy là OWNER-DECISION, chưa chọn).
--   * Tệp và phiên bản chỉ ghi thêm. Phiên bản > 1 chỉ sinh từ AmendmentRequest (Phase 4), nên lát này ép version = 1.
--   * Quyền = mã trong Nhóm quyền, dạng '<miền>.<hành động>.<phạm vi>'. Không dùng Role, không "Trưởng văn phòng duyệt".
--   * Bản nháp chỉ người tạo thấy. Hồ sơ đã ghi sổ: thấy theo quyền '.all' hoặc '.own' (do chính mình tạo).
-- Chưa làm ở lát này (có chủ ý): quản lý nhóm quyền (kèm yêu cầu đổi quyền, người đề xuất không tự duyệt), sửa đổi có duyệt,
-- bộ đếm Số đến/STT (Phase 3). Các mục OWNER-DECISION còn chặn không được chọn thay.
-- Dữ liệu giả lập; không số tiền; nhật ký không chứa PII.

-- ===== Nhóm quyền =====
CREATE TABLE dms_permission_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  CONSTRAINT dms_groups_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_groups_name_uq UNIQUE (tenant_id, office_id, name),
  CONSTRAINT dms_groups_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE TABLE dms_group_permissions (
  tenant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  permission text NOT NULL CHECK (
    permission ~ '^(vibang|tongdat|xacminh|tochuc)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  ),
  PRIMARY KEY (group_id, permission),
  CONSTRAINT dms_group_permissions_group_fk FOREIGN KEY (group_id, tenant_id) REFERENCES dms_permission_groups (id, tenant_id)
);

CREATE TABLE dms_group_members (
  tenant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT dms_group_members_group_fk FOREIGN KEY (group_id, tenant_id) REFERENCES dms_permission_groups (id, tenant_id),
  CONSTRAINT dms_group_members_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);

-- ===== Hồ sơ (CaseFile) =====
CREATE TABLE dms_case_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  domain text NOT NULL CHECK (domain IN ('vibang', 'tongdat', 'xacminh', 'tochuc')),
  title text NOT NULL CHECK (btrim(title) <> ''),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RECORDED', 'CANCELLED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  recorded_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  CONSTRAINT dms_case_files_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_case_files_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT dms_case_files_recorded_chk CHECK (status <> 'RECORDED' OR (recorded_by IS NOT NULL AND recorded_at IS NOT NULL)),
  CONSTRAINT dms_case_files_cancelled_chk CHECK (
    status <> 'CANCELLED' OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND btrim(coalesce(cancel_reason, '')) <> '')
  )
);
CREATE INDEX dms_case_files_list_idx ON dms_case_files (tenant_id, office_id, domain, status, created_at DESC);

-- ===== Tài liệu logic (LegalDocument) =====
CREATE TABLE dms_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  kind text NOT NULL CHECK (btrim(kind) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  is_official boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RECORDED', 'CANCELLED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_documents_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_documents_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id)
);
CREATE INDEX dms_documents_case_idx ON dms_documents (tenant_id, case_id);

-- ===== Tệp (DocumentFile) + phiên bản (DocumentVersion): chỉ ghi thêm =====
CREATE TABLE dms_document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  is_scan boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_document_files_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_document_files_doc_fk FOREIGN KEY (document_id, tenant_id) REFERENCES dms_documents (id, tenant_id)
);
CREATE INDEX dms_document_files_doc_idx ON dms_document_files (tenant_id, document_id);

CREATE TABLE dms_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  file_id uuid NOT NULL,
  -- Phiên bản > 1 chỉ được tạo qua AmendmentRequest đã duyệt (Phase 4); mở CHECK này khi đó.
  version integer NOT NULL CHECK (version = 1),
  object_key text NOT NULL CHECK (btrim(object_key) <> ''),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (btrim(mime) <> ''),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_document_versions_file_ver_uq UNIQUE (file_id, version),
  CONSTRAINT dms_document_versions_key_uq UNIQUE (tenant_id, object_key),
  CONSTRAINT dms_document_versions_file_fk FOREIGN KEY (file_id, tenant_id) REFERENCES dms_document_files (id, tenant_id)
);

-- ===== Nhật ký nghiệp vụ DMS (AuditRecord): chỉ ghi thêm, không PII =====
CREATE TABLE dms_audit_records (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  office_id uuid,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dms_audit_records_target_idx ON dms_audit_records (tenant_id, target_type, target_id);

-- ===== RLS: cô lập tenant theo hàng (giống các bảng khác) =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dms_permission_groups', 'dms_group_permissions', 'dms_group_members', 'dms_case_files',
                           'dms_documents', 'dms_document_files', 'dms_document_versions', 'dms_audit_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- ===== Bất biến =====
-- Chỉ ghi thêm (vibang_append_only từ 0002): cả UPDATE/DELETE theo hàng lẫn TRUNCATE.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dms_document_files', 'dms_document_versions', 'dms_audit_records'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION vibang_append_only()', t || '_ro', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- Hồ sơ/tài liệu: không xoá; chỉ bản nháp được sửa; trạng thái chỉ đi DRAFT -> RECORDED | CANCELLED; định danh không đổi.
CREATE FUNCTION dms_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'a % row that is not a draft is immutable', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION '% identity columns cannot change', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_TABLE_NAME = 'dms_case_files' THEN
    IF NEW.office_id <> OLD.office_id OR NEW.domain <> OLD.domain THEN
      RAISE EXCEPTION 'dms_case_files office and domain cannot change' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'dms_documents' THEN
    IF NEW.case_id <> OLD.case_id THEN
      RAISE EXCEPTION 'dms_documents case cannot change' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_case_files_guard_trg BEFORE UPDATE OR DELETE ON dms_case_files FOR EACH ROW EXECUTE FUNCTION dms_draft_guard();
CREATE TRIGGER dms_documents_guard_trg BEFORE UPDATE OR DELETE ON dms_documents FOR EACH ROW EXECUTE FUNCTION dms_draft_guard();
CREATE TRIGGER dms_case_files_no_truncate BEFORE TRUNCATE ON dms_case_files FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_documents_no_truncate BEFORE TRUNCATE ON dms_documents FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- ===== Quyền =====
-- Người dùng có mã quyền này qua một Nhóm quyền của văn phòng không. Mặc định từ chối.
CREATE FUNCTION dms_has_permission(p_tenant uuid, p_actor uuid, p_office uuid, p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office AND gp.permission = p_code
  );
$$;

-- NULL = được phép; ngược lại là mã lý do. '.all' đủ; '.own' chỉ khi người tạo là chính người thao tác.
CREATE FUNCTION dms_authorize(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_action text, p_created_by uuid)
RETURNS text LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.' || p_action || '.all') THEN RETURN NULL; END IF;
  IF p_created_by IS NOT NULL AND p_created_by = p_actor
     AND dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.' || p_action || '.own') THEN RETURN NULL; END IF;
  RETURN 'PERMISSION_DENIED';
END $$;

-- Nháp chỉ người tạo thấy (cần quyền đọc nào đó); đã ghi sổ thì theo '.all' hoặc '.own'.
CREATE FUNCTION dms_case_visible(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_created_by uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_status = 'RECORDED' THEN dms_authorize(p_tenant, p_actor, p_office, p_domain, 'read', p_created_by) IS NULL
              ELSE p_created_by = p_actor
                   AND (dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.read.own')
                     OR dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.read.all')) END;
$$;

CREATE FUNCTION dms_audit_rec(p_tenant uuid, p_office uuid, p_actor uuid, p_action text, p_type text, p_target uuid, p_detail jsonb)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO dms_audit_records (tenant_id, office_id, actor_id, action, target_type, target_id, detail)
  VALUES (p_tenant, p_office, p_actor, p_action, p_type, p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- ===== Ghi: hồ sơ =====
CREATE FUNCTION dms_case_create_draft(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_title text, p_attributes jsonb)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; new_id uuid;
BEGIN
  IF p_domain IS NULL OR p_domain NOT IN ('vibang', 'tongdat', 'xacminh', 'tochuc') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', false, 'INVALID_DOMAIN', p_office, NULL, NULL);
  END IF;
  denied := dms_authorize(p_tenant, p_actor, p_office, p_domain, 'draft', p_actor);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', false, denied, p_office, NULL, p_domain);
  END IF;
  IF btrim(coalesce(p_title, '')) = '' OR jsonb_typeof(coalesce(p_attributes, '{}'::jsonb)) <> 'object' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', false, 'INVALID_INPUT', p_office, NULL, p_domain);
  END IF;
  INSERT INTO dms_case_files (tenant_id, office_id, domain, title, attributes, created_by)
  VALUES (p_tenant, p_office, p_domain, btrim(p_title), coalesce(p_attributes, '{}'::jsonb), p_actor)
  RETURNING id INTO new_id;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.case.create_draft', 'case', new_id, jsonb_build_object('domain', p_domain));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', true, 'CASE_DRAFT_CREATED', p_office, NULL, new_id::text);
END $$;

-- Khoá hàng hồ sơ và kiểm tra quyền đọc trước (không lộ sự tồn tại), rồi quyền hành động, rồi trạng thái.
CREATE FUNCTION dms_case_load(p_tenant uuid, p_actor uuid, p_case uuid, p_action text, p_perm_action text, OUT c dms_case_files, OUT denied text)
LANGUAGE plpgsql AS $$
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, p_action, false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
    denied := 'CASE_NOT_FOUND';
    RETURN;
  END IF;
  denied := dms_authorize(p_tenant, p_actor, c.office_id, c.domain, p_perm_action, c.created_by);
  IF denied IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, p_action, false, denied, c.office_id, NULL, p_case::text);
  END IF;
END $$;

CREATE FUNCTION dms_case_update_draft(p_tenant uuid, p_actor uuid, p_case uuid, p_title text, p_attributes jsonb)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.update_draft', 'draft');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.update_draft', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_title, '')) = '' OR jsonb_typeof(coalesce(p_attributes, '{}'::jsonb)) <> 'object' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.update_draft', false, 'INVALID_INPUT', c.office_id, NULL, p_case::text);
  END IF;
  UPDATE dms_case_files SET title = btrim(p_title), attributes = coalesce(p_attributes, '{}'::jsonb) WHERE id = p_case AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.update_draft', 'case', p_case, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.update_draft', true, 'CASE_DRAFT_UPDATED', c.office_id, NULL, p_case::text);
END $$;

-- "Xác nhận lưu chính thức": hồ sơ và mọi tài liệu nháp của nó cùng thành RECORDED trong một giao dịch.
CREATE FUNCTION dms_case_record(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; n integer;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.record', 'confirm');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
  END IF;
  UPDATE dms_documents SET status = 'RECORDED' WHERE case_id = p_case AND tenant_id = p_tenant AND status = 'DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE dms_case_files SET status = 'RECORDED', recorded_by = p_actor, recorded_at = now() WHERE id = p_case AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.record', 'case', p_case, jsonb_build_object('documents_recorded', n));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', true, 'CASE_RECORDED', c.office_id, NULL, p_case::text);
END $$;

-- "Hủy nháp": giữ lịch sử, không xoá. Không có hàm khôi phục (chờ owner quyết).
CREATE FUNCTION dms_case_cancel_draft(p_tenant uuid, p_actor uuid, p_case uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.cancel_draft', 'draft');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.cancel_draft', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.cancel_draft', false, 'REASON_REQUIRED', c.office_id, NULL, p_case::text);
  END IF;
  UPDATE dms_documents SET status = 'CANCELLED' WHERE case_id = p_case AND tenant_id = p_tenant AND status = 'DRAFT';
  UPDATE dms_case_files SET status = 'CANCELLED', cancelled_by = p_actor, cancelled_at = now(), cancel_reason = btrim(p_reason)
   WHERE id = p_case AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.cancel_draft', 'case', p_case, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.cancel_draft', true, 'CASE_DRAFT_CANCELLED', c.office_id, NULL, p_case::text);
END $$;

-- ===== Ghi: tài liệu, tệp =====
-- Tài liệu mới thêm vào hồ sơ nháp thì là nháp; thêm vào hồ sơ đã ghi sổ thì ghi sổ ngay (bổ sung mới, không sửa cái cũ).
CREATE FUNCTION dms_document_add(p_tenant uuid, p_actor uuid, p_case uuid, p_kind text, p_title text, p_is_official boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; new_id uuid;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.document.add', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status = 'CANCELLED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.add', false, 'CASE_CANCELLED', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_title, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.add', false, 'INVALID_INPUT', c.office_id, NULL, p_case::text);
  END IF;
  INSERT INTO dms_documents (tenant_id, case_id, kind, title, is_official, status, created_by)
  VALUES (p_tenant, p_case, btrim(p_kind), btrim(p_title), coalesce(p_is_official, false), c.status, p_actor)
  RETURNING id INTO new_id;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.document.add', 'document', new_id, jsonb_build_object('case_id', p_case, 'status', c.status));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.document.add', true, 'DOCUMENT_ADDED', c.office_id, NULL, new_id::text);
END $$;

CREATE FUNCTION dms_document_update_draft(p_tenant uuid, p_actor uuid, p_document uuid, p_kind text, p_title text, p_is_official boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d dms_documents; l record; c dms_case_files;
BEGIN
  SELECT * INTO d FROM dms_documents WHERE id = p_document AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, d.case_id, 'dms.document.update_draft', 'draft');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, CASE WHEN l.denied = 'CASE_NOT_FOUND' THEN 'DOCUMENT_NOT_FOUND' ELSE l.denied END, NULL)::vibang_op; END IF;
  c := l.c;
  SELECT * INTO d FROM dms_documents WHERE id = p_document AND tenant_id = p_tenant FOR UPDATE;
  IF d.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', false, 'DOCUMENT_NOT_DRAFT', c.office_id, NULL, p_document::text);
  END IF;
  IF btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_title, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', false, 'INVALID_INPUT', c.office_id, NULL, p_document::text);
  END IF;
  UPDATE dms_documents SET kind = btrim(p_kind), title = btrim(p_title), is_official = coalesce(p_is_official, false)
   WHERE id = p_document AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.document.update_draft', 'document', p_document, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', true, 'DOCUMENT_DRAFT_UPDATED', c.office_id, NULL, p_document::text);
END $$;

-- Tải lên tệp MỚI (luôn tạo tệp + phiên bản 1). Không có đường ghi đè tệp đã có.
CREATE FUNCTION dms_file_attach(p_tenant uuid, p_actor uuid, p_document uuid, p_label text, p_is_scan boolean,
                                p_object_key text, p_sha256 text, p_mime text, p_size bigint)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d dms_documents; l record; c dms_case_files; new_file uuid;
BEGIN
  SELECT * INTO d FROM dms_documents WHERE id = p_document AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.file.attach', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, d.case_id, 'dms.file.attach', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, CASE WHEN l.denied = 'CASE_NOT_FOUND' THEN 'DOCUMENT_NOT_FOUND' ELSE l.denied END, NULL)::vibang_op; END IF;
  c := l.c;
  IF d.status = 'CANCELLED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.file.attach', false, 'DOCUMENT_CANCELLED', c.office_id, NULL, p_document::text);
  END IF;
  IF btrim(coalesce(p_label, '')) = '' OR btrim(coalesce(p_object_key, '')) = '' OR btrim(coalesce(p_mime, '')) = ''
     OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_size IS NULL OR p_size <= 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.file.attach', false, 'INVALID_INPUT', c.office_id, NULL, p_document::text);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_document_versions WHERE tenant_id = p_tenant AND object_key = p_object_key) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.file.attach', false, 'OBJECT_KEY_IN_USE', c.office_id, NULL, p_document::text);
  END IF;
  INSERT INTO dms_document_files (tenant_id, document_id, label, is_scan, created_by)
  VALUES (p_tenant, p_document, btrim(p_label), coalesce(p_is_scan, false), p_actor) RETURNING id INTO new_file;
  INSERT INTO dms_document_versions (tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by)
  VALUES (p_tenant, new_file, 1, p_object_key, p_sha256, btrim(p_mime), p_size, p_actor);
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.file.attach', 'file', new_file,
                        jsonb_build_object('document_id', p_document, 'sha256', p_sha256, 'is_scan', coalesce(p_is_scan, false)));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.file.attach', true, 'FILE_ATTACHED', c.office_id, NULL, new_file::text);
END $$;

-- ===== Đọc (lọc quyền ngay trong truy vấn; từ chối thì trả rỗng và ghi nhật ký) =====
-- Đếm: số TÀI LIỆU logic còn hiệu lực (không tính đã hủy) và số TỆP SCAN của chúng. Phiên bản cũ / bằng chứng sửa đổi chờ duyệt
-- sẽ đếm riêng ở Phase 4, không trộn vào đây.
CREATE FUNCTION dms_list_cases(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_limit integer, p_offset integer)
RETURNS TABLE (id uuid, domain text, title text, status text, created_by uuid, created_at timestamptz, recorded_at timestamptz,
               document_count integer, scan_count integer)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.list', true, 'ALLOWED', p_office, NULL, p_domain);
  RETURN QUERY
    SELECT c.id, c.domain, c.title, c.status, c.created_by, c.created_at, c.recorded_at,
           (SELECT count(*)::integer FROM dms_documents d WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'),
           (SELECT count(*)::integer FROM dms_document_files f JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
             WHERE f.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED' AND f.is_scan)
    FROM dms_case_files c
    WHERE c.tenant_id = p_tenant AND c.office_id = p_office
      AND (p_domain IS NULL OR c.domain = p_domain)
      AND (CASE WHEN p_status IS NULL THEN c.status <> 'CANCELLED' ELSE c.status = p_status END)
      AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)
    ORDER BY c.created_at DESC, c.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

CREATE FUNCTION dms_list_documents(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, kind text, title text, is_official boolean, status text, created_by uuid, created_at timestamptz,
               file_count integer, scan_count integer)
LANGUAGE plpgsql AS $$
DECLARE c dms_case_files;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE dms_case_files.id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.document.list', false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.document.list', true, 'ALLOWED', c.office_id, NULL, p_case::text);
  RETURN QUERY
    SELECT d.id, d.kind, d.title, d.is_official, d.status, d.created_by, d.created_at,
           (SELECT count(*)::integer FROM dms_document_files f WHERE f.tenant_id = d.tenant_id AND f.document_id = d.id),
           (SELECT count(*)::integer FROM dms_document_files f WHERE f.tenant_id = d.tenant_id AND f.document_id = d.id AND f.is_scan)
    FROM dms_documents d
    WHERE d.tenant_id = p_tenant AND d.case_id = p_case AND d.status <> 'CANCELLED'
    ORDER BY d.created_at, d.id;
END $$;

-- Siêu dữ liệu tệp (không có khoá đối tượng). Xem cần quyền đọc hồ sơ.
CREATE FUNCTION dms_list_files(p_tenant uuid, p_actor uuid, p_document uuid)
RETURNS TABLE (id uuid, label text, is_scan boolean, version integer, sha256 text, mime text, size_bytes bigint, created_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE d dms_documents; c dms_case_files;
BEGIN
  SELECT * INTO d FROM dms_documents WHERE dms_documents.id = p_document AND tenant_id = p_tenant;
  IF FOUND THEN SELECT * INTO c FROM dms_case_files WHERE dms_case_files.id = d.case_id AND tenant_id = p_tenant; END IF;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.file.list', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.file.list', true, 'ALLOWED', c.office_id, NULL, p_document::text);
  RETURN QUERY
    SELECT f.id, f.label, f.is_scan, v.version, v.sha256, v.mime, v.size_bytes, f.created_at
    FROM dms_document_files f
    JOIN dms_document_versions v ON v.file_id = f.id AND v.tenant_id = f.tenant_id
    WHERE f.tenant_id = p_tenant AND f.document_id = p_document
    ORDER BY f.created_at, f.id, v.version;
END $$;

-- Lấy khoá đối tượng để tải/xem. Cần quyền 'download' (own/all) trên hồ sơ; mọi lần đều ghi nhật ký.
CREATE FUNCTION dms_file_download(p_tenant uuid, p_actor uuid, p_file uuid)
RETURNS TABLE (object_key text, mime text, sha256 text, size_bytes bigint, label text)
LANGUAGE plpgsql AS $$
DECLARE f dms_document_files; d dms_documents; c dms_case_files; denied text;
BEGIN
  SELECT * INTO f FROM dms_document_files WHERE dms_document_files.id = p_file AND tenant_id = p_tenant;
  IF FOUND THEN SELECT * INTO d FROM dms_documents WHERE dms_documents.id = f.document_id AND tenant_id = p_tenant; END IF;
  IF FOUND THEN SELECT * INTO c FROM dms_case_files WHERE dms_case_files.id = d.case_id AND tenant_id = p_tenant; END IF;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.file.download', false, 'FILE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  denied := dms_authorize(p_tenant, p_actor, c.office_id, c.domain, 'download', c.created_by);
  IF denied IS NOT NULL OR d.status = 'CANCELLED' THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.file.download', false, coalesce(denied, 'DOCUMENT_CANCELLED'), c.office_id, NULL, p_file::text);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.file.download', true, 'ALLOWED', c.office_id, NULL, p_file::text);
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.file.download', 'file', p_file, '{}'::jsonb);
  RETURN QUERY
    SELECT v.object_key, v.mime, v.sha256, v.size_bytes, f.label
    FROM dms_document_versions v WHERE v.tenant_id = p_tenant AND v.file_id = p_file ORDER BY v.version DESC LIMIT 1;
END $$;
