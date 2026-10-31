-- DMS Phase 4: sửa đổi hồ sơ ĐÃ LƯU CHÍNH THỨC qua yêu cầu sửa đổi (AmendmentRequest). Không xoá, không ghi đè, không sửa trực tiếp.
-- Luật (owner 2026-10-30/31):
--   * Mọi thay đổi sau khi lưu chính thức chỉ qua yêu cầu có LÝ DO và BẢN SCAN VĂN BẢN SỬA ĐỔI có thật (bằng chứng). Dòng hồ sơ gốc giữ nguyên;
--     giá trị hiện hành là bản sửa đổi mới nhất (bảng revisions chỉ ghi thêm). Tệp: thêm PHIÊN BẢN mới (version > 1), bản cũ vẫn còn.
--   * "Admin" = thành viên nhóm có dms.permission.approve. Yêu cầu của Admin có hiệu lực ngay (ghi nhật ký). Người khác: chờ Admin duyệt,
--     không tự duyệt. Duyệt tự động nếu yêu cầu gửi trong N giờ sau khi lưu chính thức (mặc định 48, Admin đổi được, 0 = tắt).
--   * N-11 (sửa lỗi kỹ thuật, Điều 31 NĐ 151) chỉ dành cho hồ sơ Vi bằng.
--   * Phạm vi lát này: tiêu đề + thuộc tính hồ sơ, thuộc tính tài liệu, phiên bản tệp mới. Không đổi miền, văn phòng, người tạo, STT.

ALTER TABLE dms_document_versions DROP CONSTRAINT dms_document_versions_version_check;
ALTER TABLE dms_document_versions ADD COLUMN amendment_id uuid;
ALTER TABLE dms_document_versions ADD CONSTRAINT dms_document_versions_version_chk
  CHECK (version >= 1 AND (version = 1 OR amendment_id IS NOT NULL));

CREATE TABLE dms_office_settings (
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  amendment_auto_hours integer NOT NULL DEFAULT 48 CHECK (amendment_auto_hours BETWEEN 0 AND 720),
  PRIMARY KEY (tenant_id, office_id),
  CONSTRAINT dms_office_settings_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE TABLE dms_amendment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  case_id uuid NOT NULL,
  document_id uuid,
  file_id uuid,
  kind text NOT NULL CHECK (kind IN ('CASE_FIELDS', 'DOCUMENT_FIELDS', 'FILE_VERSION')),
  n11 boolean NOT NULL DEFAULT false,
  proposed jsonb NOT NULL CHECK (jsonb_typeof(proposed) = 'object'),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  evidence_object_key text NOT NULL CHECK (btrim(evidence_object_key) <> ''),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_mime text NOT NULL CHECK (btrim(evidence_mime) <> ''),
  evidence_size_bytes bigint NOT NULL CHECK (evidence_size_bytes > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  auto_via text CHECK (auto_via IN ('ADMIN', 'WINDOW')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  CONSTRAINT dms_amend_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id),
  CONSTRAINT dms_amend_doc_fk FOREIGN KEY (document_id, tenant_id) REFERENCES dms_documents (id, tenant_id),
  CONSTRAINT dms_amend_file_fk FOREIGN KEY (file_id, tenant_id) REFERENCES dms_document_files (id, tenant_id),
  CONSTRAINT dms_amend_target_chk CHECK (
    (kind = 'CASE_FIELDS' AND document_id IS NULL AND file_id IS NULL)
    OR (kind = 'DOCUMENT_FIELDS' AND document_id IS NOT NULL AND file_id IS NULL)
    OR (kind = 'FILE_VERSION' AND document_id IS NOT NULL AND file_id IS NOT NULL)
  ),
  CONSTRAINT dms_amend_review_chk CHECK (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND auto_via IS NULL)
    OR (status <> 'PENDING' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT dms_amend_reject_note_chk CHECK (status <> 'REJECTED' OR btrim(coalesce(review_note, '')) <> ''),
  CONSTRAINT dms_amend_self_review_chk CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by OR auto_via IS NOT NULL),
  CONSTRAINT dms_amend_auto_chk CHECK (auto_via IS NULL OR (status = 'APPROVED' AND reviewed_by = requested_by))
);
CREATE UNIQUE INDEX dms_amend_evidence_key_uq ON dms_amendment_requests (tenant_id, evidence_object_key);
CREATE INDEX dms_amend_list_idx ON dms_amendment_requests (tenant_id, office_id, status, requested_at DESC);

ALTER TABLE dms_document_versions ADD CONSTRAINT dms_document_versions_amend_fk
  FOREIGN KEY (amendment_id) REFERENCES dms_amendment_requests (id);

CREATE TABLE dms_case_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  rev integer NOT NULL CHECK (rev >= 1),
  title text NOT NULL CHECK (btrim(title) <> ''),
  attributes jsonb NOT NULL CHECK (jsonb_typeof(attributes) = 'object'),
  amendment_id uuid NOT NULL REFERENCES dms_amendment_requests (id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_case_revisions_uq UNIQUE (tenant_id, case_id, rev),
  CONSTRAINT dms_case_revisions_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id)
);
CREATE TABLE dms_document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  rev integer NOT NULL CHECK (rev >= 1),
  attributes jsonb NOT NULL CHECK (jsonb_typeof(attributes) = 'object'),
  amendment_id uuid NOT NULL REFERENCES dms_amendment_requests (id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_document_revisions_uq UNIQUE (tenant_id, document_id, rev),
  CONSTRAINT dms_document_revisions_doc_fk FOREIGN KEY (document_id, tenant_id) REFERENCES dms_documents (id, tenant_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dms_office_settings', 'dms_amendment_requests', 'dms_case_revisions', 'dms_document_revisions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['dms_case_revisions', 'dms_document_revisions'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION vibang_append_only()', t || '_ro', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- Yêu cầu sửa đổi: không xoá; chỉ chuyển PENDING -> APPROVED/REJECTED, các cột nội dung bất biến.
CREATE FUNCTION dms_amendment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dms_amendment_requests is append-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'dms_amendment_requests decision is final' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.office_id, NEW.case_id, NEW.document_id, NEW.file_id, NEW.kind, NEW.n11, NEW.proposed, NEW.reason,
      NEW.evidence_object_key, NEW.evidence_sha256, NEW.requested_by, NEW.requested_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.office_id, OLD.case_id, OLD.document_id, OLD.file_id, OLD.kind, OLD.n11, OLD.proposed, OLD.reason,
      OLD.evidence_object_key, OLD.evidence_sha256, OLD.requested_by, OLD.requested_at) THEN
    RAISE EXCEPTION 'dms_amendment_requests content cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_amendment_guard_trg BEFORE UPDATE OR DELETE ON dms_amendment_requests FOR EACH ROW EXECUTE FUNCTION dms_amendment_guard();
CREATE TRIGGER dms_amendment_no_truncate BEFORE TRUNCATE ON dms_amendment_requests FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Giá trị hiện hành = bản sửa đổi mới nhất, nếu chưa sửa thì giá trị gốc.
CREATE FUNCTION dms_case_effective(p_tenant uuid, p_case uuid)
RETURNS TABLE (title text, attributes jsonb) LANGUAGE sql STABLE AS $$
  SELECT coalesce(r.title, c.title), coalesce(r.attributes, c.attributes)
  FROM dms_case_files c
  LEFT JOIN LATERAL (SELECT x.title, x.attributes FROM dms_case_revisions x
                      WHERE x.tenant_id = c.tenant_id AND x.case_id = c.id ORDER BY x.rev DESC LIMIT 1) r ON true
  WHERE c.id = p_case AND c.tenant_id = p_tenant
$$;
CREATE FUNCTION dms_doc_effective_attrs(p_tenant uuid, p_doc uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT x.attributes FROM dms_document_revisions x WHERE x.tenant_id = p_tenant AND x.document_id = p_doc ORDER BY x.rev DESC LIMIT 1),
    (SELECT d.attributes FROM dms_documents d WHERE d.tenant_id = p_tenant AND d.id = p_doc))
$$;

-- Các hàm đọc đổi sang giá trị hiện hành (vá tại chỗ từ định nghĩa hiện có).
DO $$
DECLARE def text; patched text; r record;
  edits text[][] := ARRAY[
    ['dms_get_case', 'c.title, c.status, c.attributes, c.created_by',
     '(dms_case_effective(c.tenant_id, c.id)).title, c.status, (dms_case_effective(c.tenant_id, c.id)).attributes, c.created_by'],
    ['dms_list_cases', 'SELECT c.id, c.domain, c.title, c.status',
     'SELECT c.id, c.domain, (dms_case_effective(c.tenant_id, c.id)).title, c.status'],
    ['dms_list_documents', E'           d.attributes\n    FROM dms_documents d',
     E'           dms_doc_effective_attrs(d.tenant_id, d.id)\n    FROM dms_documents d'],
    ['dms_book_rows', 'c.title, c.attributes, d.kind, d.title, d.attributes, c.recorded_at',
     '(dms_case_effective(c.tenant_id, c.id)).title, (dms_case_effective(c.tenant_id, c.id)).attributes, d.kind, d.title, dms_doc_effective_attrs(d.tenant_id, d.id), c.recorded_at']
  ];
  i integer;
BEGIN
  FOR i IN 1 .. array_length(edits, 1) LOOP
    SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = current_schema() AND p.proname = edits[i][1];
    def := pg_get_functiondef(r.oid);
    patched := replace(def, edits[i][2], edits[i][3]);
    IF patched = def THEN RAISE EXCEPTION 'dms_amendments: % không có gì để vá', edits[i][1]; END IF;
    EXECUTE patched;
  END LOOP;
END $$;

-- ===== Cấu hình cửa sổ duyệt tự động (Admin đổi) =====
CREATE FUNCTION dms_amendment_window(p_tenant uuid, p_office uuid)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT amendment_auto_hours FROM dms_office_settings WHERE tenant_id = p_tenant AND office_id = p_office), 48)
$$;

CREATE FUNCTION dms_amendment_window_set(p_tenant uuid, p_actor uuid, p_office uuid, p_hours integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.window', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_hours IS NULL OR p_hours < 0 OR p_hours > 720 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.window', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  INSERT INTO dms_office_settings (tenant_id, office_id, amendment_auto_hours) VALUES (p_tenant, p_office, p_hours)
  ON CONFLICT (tenant_id, office_id) DO UPDATE SET amendment_auto_hours = EXCLUDED.amendment_auto_hours;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.amendment.window', 'office', p_office, jsonb_build_object('hours', p_hours));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.window', true, 'WINDOW_SET', p_office, NULL, p_hours::text);
END $$;

-- ===== Áp dụng một yêu cầu đã được chấp thuận. Trả mã lỗi hoặc NULL; kiểm tra trước khi ghi. =====
CREATE FUNCTION dms_amendment_apply(r dms_amendment_requests, p_by uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE cur record; n integer; nxt integer; new_title text; new_attrs jsonb;
BEGIN
  IF r.kind = 'CASE_FIELDS' THEN
    SELECT * INTO cur FROM dms_case_effective(r.tenant_id, r.case_id);
    new_title := coalesce(nullif(btrim(r.proposed ->> 'title'), ''), cur.title);
    new_attrs := cur.attributes || coalesce(r.proposed -> 'attributes', '{}'::jsonb);
    IF new_title = cur.title AND new_attrs = cur.attributes THEN RETURN 'NOTHING_TO_CHANGE'; END IF;
    SELECT coalesce(max(rev), 0) + 1 INTO n FROM dms_case_revisions WHERE tenant_id = r.tenant_id AND case_id = r.case_id;
    INSERT INTO dms_case_revisions (tenant_id, case_id, rev, title, attributes, amendment_id, created_by)
    VALUES (r.tenant_id, r.case_id, n, new_title, new_attrs, r.id, p_by);
  ELSIF r.kind = 'DOCUMENT_FIELDS' THEN
    new_attrs := dms_doc_effective_attrs(r.tenant_id, r.document_id) || coalesce(r.proposed -> 'attributes', '{}'::jsonb);
    IF new_attrs = dms_doc_effective_attrs(r.tenant_id, r.document_id) THEN RETURN 'NOTHING_TO_CHANGE'; END IF;
    SELECT coalesce(max(rev), 0) + 1 INTO n FROM dms_document_revisions WHERE tenant_id = r.tenant_id AND document_id = r.document_id;
    INSERT INTO dms_document_revisions (tenant_id, document_id, rev, attributes, amendment_id, created_by)
    VALUES (r.tenant_id, r.document_id, n, new_attrs, r.id, p_by);
  ELSE
    IF EXISTS (SELECT 1 FROM dms_document_versions WHERE tenant_id = r.tenant_id AND object_key = r.proposed ->> 'object_key')
       OR EXISTS (SELECT 1 FROM dms_amendment_requests WHERE tenant_id = r.tenant_id AND evidence_object_key = r.proposed ->> 'object_key') THEN
      RETURN 'OBJECT_KEY_IN_USE';
    END IF;
    SELECT coalesce(max(version), 0) + 1 INTO nxt FROM dms_document_versions WHERE tenant_id = r.tenant_id AND file_id = r.file_id;
    INSERT INTO dms_document_versions (tenant_id, file_id, version, object_key, sha256, mime, size_bytes, created_by, amendment_id)
    VALUES (r.tenant_id, r.file_id, nxt, r.proposed ->> 'object_key', r.proposed ->> 'sha256', r.proposed ->> 'mime',
            (r.proposed ->> 'size_bytes')::bigint, p_by, r.id);
  END IF;
  RETURN NULL;
END $$;

-- ===== Gửi yêu cầu sửa đổi =====
CREATE FUNCTION dms_amendment_propose(p_tenant uuid, p_actor uuid, p_case uuid, p_document uuid, p_file uuid, p_kind text,
                                      p_proposed jsonb, p_reason text, p_n11 boolean,
                                      p_ev_key text, p_ev_sha text, p_ev_mime text, p_ev_size bigint)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; is_admin boolean; via text; req dms_amendment_requests; err text; win_hours integer; new_id uuid; d dms_documents;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  is_admin := dms_has_permission(p_tenant, p_actor, c.office_id, 'dms.permission.approve');
  IF NOT is_admin AND dms_authorize(p_tenant, p_actor, c.office_id, c.domain, 'draft', c.created_by) IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'PERMISSION_DENIED', c.office_id, NULL, p_case::text);
  END IF;
  IF c.status <> 'RECORDED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'CASE_NOT_RECORDED', c.office_id, NULL, p_case::text);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('CASE_FIELDS', 'DOCUMENT_FIELDS', 'FILE_VERSION')
     OR p_proposed IS NULL OR jsonb_typeof(p_proposed) <> 'object' OR p_proposed = '{}'::jsonb
     OR (coalesce(p_n11, false) AND (c.domain <> 'vibang' OR p_kind <> 'CASE_FIELDS'))
     OR (p_kind = 'CASE_FIELDS' AND (p_document IS NOT NULL OR p_file IS NOT NULL))
     OR (p_kind = 'DOCUMENT_FIELDS' AND (p_document IS NULL OR p_file IS NOT NULL))
     OR (p_kind = 'FILE_VERSION' AND (p_document IS NULL OR p_file IS NULL
         OR btrim(coalesce(p_proposed ->> 'object_key', '')) = '' OR coalesce(p_proposed ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
         OR btrim(coalesce(p_proposed ->> 'mime', '')) = '' OR coalesce((p_proposed ->> 'size_bytes')::bigint, 0) <= 0)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'INVALID_INPUT', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'REASON_REQUIRED', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_ev_key, '')) = '' OR coalesce(p_ev_sha, '') !~ '^[0-9a-f]{64}$' OR btrim(coalesce(p_ev_mime, '')) = ''
     OR coalesce(p_ev_size, 0) <= 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'EVIDENCE_REQUIRED', c.office_id, NULL, p_case::text);
  END IF;
  IF p_document IS NOT NULL THEN
    SELECT * INTO d FROM dms_documents WHERE id = p_document AND tenant_id = p_tenant AND case_id = p_case;
    IF NOT FOUND OR d.status <> 'RECORDED' THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'DOCUMENT_NOT_FOUND', c.office_id, NULL, p_case::text);
    END IF;
  END IF;
  IF p_file IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dms_document_files WHERE id = p_file AND tenant_id = p_tenant AND document_id = p_document) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'FILE_NOT_FOUND', c.office_id, NULL, p_case::text);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_document_versions WHERE tenant_id = p_tenant AND object_key = p_ev_key)
     OR EXISTS (SELECT 1 FROM dms_amendment_requests WHERE tenant_id = p_tenant AND (evidence_object_key = p_ev_key
                OR (kind = 'FILE_VERSION' AND proposed ->> 'object_key' = p_ev_key))) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, 'OBJECT_KEY_IN_USE', c.office_id, NULL, p_case::text);
  END IF;

  win_hours := dms_amendment_window(p_tenant, c.office_id);
  via := CASE WHEN is_admin THEN 'ADMIN'
              WHEN win_hours > 0 AND now() < c.recorded_at + make_interval(hours => win_hours) THEN 'WINDOW' END;

  INSERT INTO dms_amendment_requests (tenant_id, office_id, case_id, document_id, file_id, kind, n11, proposed, reason,
                                      evidence_object_key, evidence_sha256, evidence_mime, evidence_size_bytes, requested_by)
  VALUES (p_tenant, c.office_id, p_case, p_document, p_file, p_kind, coalesce(p_n11, false), p_proposed, btrim(p_reason),
          btrim(p_ev_key), p_ev_sha, btrim(p_ev_mime), p_ev_size, p_actor)
  RETURNING * INTO req;
  new_id := req.id;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.amendment.propose', 'amendment', new_id,
                        jsonb_build_object('case_id', p_case, 'kind', p_kind, 'n11', coalesce(p_n11, false), 'via', via));
  IF via IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', true, 'AMENDMENT_PENDING', c.office_id, NULL, new_id::text);
  END IF;
  err := dms_amendment_apply(req, p_actor);
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'dms_amendment_propose:%', err USING ERRCODE = 'P0001';
  END IF;
  UPDATE dms_amendment_requests SET status = 'APPROVED', auto_via = via, reviewed_by = p_actor, reviewed_at = now() WHERE id = new_id;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.amendment.apply', 'amendment', new_id, jsonb_build_object('via', via));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', true, 'AMENDMENT_APPLIED', c.office_id, NULL, new_id::text);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  -- Không có gì để đổi / khoá đối tượng trùng: huỷ cả giao dịch con, trả mã rõ ràng.
  IF SQLERRM LIKE 'dms_amendment_propose:%' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false, substr(SQLERRM, length('dms_amendment_propose:') + 1), c.office_id, NULL, p_case::text);
  END IF;
  RAISE;
END $$;

-- ===== Duyệt / từ chối (chỉ Admin; không tự duyệt yêu cầu của chính mình, trừ khi đã tự hiệu lực lúc gửi) =====
CREATE FUNCTION dms_amendment_review(p_tenant uuid, p_actor uuid, p_request uuid, p_approve boolean, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r dms_amendment_requests; err text;
BEGIN
  SELECT * INTO r FROM dms_amendment_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, r.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.review', false,
                        CASE WHEN FOUND THEN 'ADMIN_ONLY' ELSE 'REQUEST_NOT_FOUND' END, NULL, NULL, NULL);
  END IF;
  IF r.status <> 'PENDING' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.review', false, 'REQUEST_NOT_PENDING', r.office_id, NULL, p_request::text);
  END IF;
  IF r.requested_by = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.review', false, 'SELF_APPROVAL', r.office_id, NULL, p_request::text);
  END IF;
  IF p_approve IS NULL OR (NOT p_approve AND btrim(coalesce(p_note, '')) = '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.review', false, 'REASON_REQUIRED', r.office_id, NULL, p_request::text);
  END IF;
  IF p_approve THEN
    err := dms_amendment_apply(r, p_actor);
    IF err IS NOT NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.review', false, err, r.office_id, NULL, p_request::text);
    END IF;
  END IF;
  UPDATE dms_amendment_requests
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END, reviewed_by = p_actor, reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE id = p_request;
  PERFORM dms_audit_rec(p_tenant, r.office_id, p_actor, 'dms.amendment.review', 'amendment', p_request,
                        jsonb_build_object('approved', p_approve));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.review', true,
                      CASE WHEN p_approve THEN 'AMENDMENT_APPROVED' ELSE 'AMENDMENT_REJECTED' END, r.office_id, NULL, p_request::text);
END $$;

-- ===== Đọc: Admin thấy mọi yêu cầu của văn phòng; người khác chỉ thấy yêu cầu do mình gửi =====
CREATE FUNCTION dms_list_amendments(p_tenant uuid, p_actor uuid, p_office uuid, p_case uuid, p_status text, p_limit integer, p_offset integer)
RETURNS TABLE (id uuid, case_id uuid, document_id uuid, file_id uuid, kind text, n11 boolean, proposed jsonb, reason text,
               status text, auto_via text, requested_by uuid, requested_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
               review_note text, has_evidence boolean)
LANGUAGE plpgsql AS $$
DECLARE is_admin boolean := dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve');
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.amendment.list', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT a.id, a.case_id, a.document_id, a.file_id, a.kind, a.n11,
           CASE WHEN a.kind = 'FILE_VERSION' THEN a.proposed - 'object_key' ELSE a.proposed END,
           a.reason, a.status, a.auto_via, a.requested_by, a.requested_at, a.reviewed_by, a.reviewed_at, a.review_note, true
    FROM dms_amendment_requests a
    JOIN dms_case_files c ON c.id = a.case_id AND c.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant AND a.office_id = p_office
      AND (p_case IS NULL OR a.case_id = p_case)
      AND (p_status IS NULL OR a.status = p_status)
      AND (is_admin OR a.requested_by = p_actor)
      AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)
    ORDER BY a.requested_at DESC, a.id
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

-- Khoá đối tượng của bản scan bằng chứng (Admin hoặc người gửi); mọi lần đều ghi nhật ký.
CREATE FUNCTION dms_amendment_evidence(p_tenant uuid, p_actor uuid, p_request uuid)
RETURNS TABLE (object_key text, mime text, sha256 text, size_bytes bigint, label text)
LANGUAGE plpgsql AS $$
DECLARE r dms_amendment_requests;
BEGIN
  SELECT * INTO r FROM dms_amendment_requests WHERE id = p_request AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT (r.requested_by = p_actor OR dms_has_permission(p_tenant, p_actor, r.office_id, 'dms.permission.approve')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.amendment.evidence', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.amendment.evidence', true, 'ALLOWED', r.office_id, NULL, p_request::text);
  PERFORM dms_audit_rec(p_tenant, r.office_id, p_actor, 'dms.amendment.evidence', 'amendment', p_request, '{}'::jsonb);
  RETURN QUERY SELECT r.evidence_object_key, r.evidence_mime, r.evidence_sha256, r.evidence_size_bytes, 'Văn bản sửa đổi'::text;
END $$;
