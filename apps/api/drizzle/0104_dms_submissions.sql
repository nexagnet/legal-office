-- DMS GĐ 1 (PR 2): Trình / Duyệt chung (N4), thay "Yêu cầu sửa đổi". Căn cứ: reports/ke-hoach-code-theo-figma-2026-11-03.md.
-- Luật (chủ dự án chốt 03/11/2026):
--   * Một bản trình gồm TIÊU ĐỀ + MÔ TẢ + file scan. Mọi thành viên của văn phòng đều trình được; CHỈ Admin của văn phòng duyệt hoặc từ chối.
--   * Hồ sơ liên quan là tuỳ chọn (một hồ sơ mà người trình thấy được, cùng văn phòng). KHÔNG có "Loại", KHÔNG có "Từ khoá".
--   * Mục đích là tra cứu về sau: tìm theo tiêu đề, mô tả (không dấu). Tìm theo nội dung OCR của scan thuộc PR sau (cần mở rộng bảng OCR).
--   * Bản trình là một bản ghi: không sửa tiêu đề/mô tả, không xoá. Người trình chỉ TẢI THÊM scan khi còn chờ duyệt; sau khi Admin quyết định thì khoá.
--     Việc xoá file scan (kể cả scan của bản trình) làm ở PR sau bằng bảng sự kiện riêng, nên các dòng tệp ở đây luôn chỉ ghi thêm.
--   * Người trình thấy bản trình của mình; Admin thấy tất cả của văn phòng; người khác không thấy (không lộ sự tồn tại).
--   * Tệp đi qua bước đệm (dms_staged_uploads, 0081): khách không tự chọn khoá đối tượng, mỗi tệp đệm dùng một lần.
--   * Luồng đề xuất đổi quyền (P8/P9) KHÔNG đổi. Bảng/hàm "yêu cầu sửa đổi" cũ giữ nguyên để xem dữ liệu cũ, gỡ ở PR sau.

-- ===== Vai trò theo văn phòng =====
CREATE FUNCTION dms_office_member(p_tenant uuid, p_actor uuid, p_office uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships ms WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office)
$$;
CREATE FUNCTION dms_office_admin(p_tenant uuid, p_actor uuid, p_office uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships ms WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN')
$$;

-- ===== Bản trình =====
CREATE TABLE dms_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 300),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  case_id uuid,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  CONSTRAINT dms_submissions_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_submissions_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT dms_submissions_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id),
  CONSTRAINT dms_submissions_decision_chk CHECK (
    (status = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status <> 'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT dms_submissions_reject_note_chk CHECK (status <> 'REJECTED' OR btrim(coalesce(decision_note, '')) <> '')
);
CREATE INDEX dms_submissions_office_idx ON dms_submissions (tenant_id, office_id, status, submitted_at DESC);
CREATE INDEX dms_submissions_mine_idx ON dms_submissions (tenant_id, submitted_by, submitted_at DESC);

CREATE TABLE dms_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> '' AND char_length(label) <= 255),
  object_key text NOT NULL CHECK (btrim(object_key) <> ''),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (btrim(mime) <> ''),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_submission_files_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT dms_submission_files_key_uq UNIQUE (tenant_id, object_key),
  CONSTRAINT dms_submission_files_sub_fk FOREIGN KEY (submission_id, tenant_id) REFERENCES dms_submissions (id, tenant_id)
);
CREATE INDEX dms_submission_files_sub_idx ON dms_submission_files (tenant_id, submission_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dms_submissions', 'dms_submission_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only()', t || '_no_truncate', t);
  END LOOP;
END $$;
CREATE TRIGGER dms_submission_files_ro BEFORE UPDATE OR DELETE ON dms_submission_files FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Bản trình: không xoá; chỉ chuyển PENDING -> APPROVED/REJECTED; nội dung bất biến.
CREATE FUNCTION dms_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dms_submissions is append-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'dms_submissions decision is final' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.office_id, NEW.title, NEW.description, NEW.case_id, NEW.submitted_by, NEW.submitted_at)
     IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.office_id, OLD.title, OLD.description, OLD.case_id, OLD.submitted_by, OLD.submitted_at) THEN
    RAISE EXCEPTION 'dms_submissions content cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_submissions_guard_trg BEFORE UPDATE OR DELETE ON dms_submissions FOR EACH ROW EXECUTE FUNCTION dms_submission_guard();

-- Người xem có thấy bản trình không: Admin văn phòng thấy tất cả; người khác chỉ thấy bản mình trình (và vẫn phải còn là thành viên).
CREATE FUNCTION dms_submission_visible(p_tenant uuid, p_actor uuid, p_office uuid, p_submitted_by uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT dms_office_admin(p_tenant, p_actor, p_office)
      OR (p_submitted_by = p_actor AND dms_office_member(p_tenant, p_actor, p_office))
$$;

-- ===== Ghi =====
-- Nhận các tệp đệm của CHÍNH người tải và gắn vào bản trình. Trả NULL nếu xong, ngược lại là mã lỗi (không ghi nhật ký ở đây).
CREATE FUNCTION dms_submission_attach_files(p_tenant uuid, p_actor uuid, p_submission uuid, p_staged uuid[], p_labels text[])
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n integer := coalesce(cardinality(p_staged), 0); i integer; s dms_staged_uploads; found_n integer; used_n integer;
BEGIN
  IF n < 1 OR n > 20 OR p_labels IS NULL OR cardinality(p_labels) <> n
     OR (SELECT count(DISTINCT x) FROM unnest(p_staged) x) <> n
     OR EXISTS (SELECT 1 FROM unnest(p_labels) l WHERE l IS NULL OR btrim(l) = '' OR char_length(l) > 255) THEN
    RETURN 'INVALID_INPUT';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE q.used_at IS NOT NULL) INTO found_n, used_n
    FROM (SELECT u.used_at FROM dms_staged_uploads u WHERE u.tenant_id = p_tenant AND u.uploaded_by = p_actor AND u.id = ANY (p_staged) FOR UPDATE) q;
  IF found_n <> n THEN RETURN 'UPLOAD_NOT_FOUND'; END IF;
  IF used_n > 0 THEN RETURN 'UPLOAD_ALREADY_USED'; END IF;
  FOR i IN 1..n LOOP
    SELECT * INTO s FROM dms_staged_uploads WHERE id = p_staged[i] AND tenant_id = p_tenant;
    INSERT INTO dms_submission_files (tenant_id, submission_id, label, object_key, sha256, mime, size_bytes, created_by)
    VALUES (p_tenant, p_submission, btrim(p_labels[i]), s.object_key, s.sha256, s.mime, s.size_bytes, p_actor);
    UPDATE dms_staged_uploads SET used_at = now() WHERE id = s.id AND tenant_id = p_tenant;
  END LOOP;
  RETURN NULL;
END $$;

-- Trình mới: mọi thành viên văn phòng. Cần ít nhất một file scan (đã tải lên bước đệm).
-- Tệp đệm được kiểm TRƯỚC khi ghi bản trình, nên lỗi tệp không để lại bản trình rỗng.
CREATE FUNCTION dms_submission_create(p_tenant uuid, p_actor uuid, p_office uuid, p_title text, p_description text, p_case uuid,
                                      p_staged uuid[], p_labels text[])
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; new_id uuid; err text;
BEGIN
  IF p_office IS NULL OR NOT dms_office_member(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_title, '')) = '' OR char_length(p_title) > 300 OR char_length(coalesce(p_description, '')) > 5000 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  IF p_case IS NOT NULL THEN
    SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
    IF NOT FOUND OR c.office_id <> p_office
       OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, 'CASE_NOT_FOUND', p_office, NULL, NULL);
    END IF;
  END IF;
  new_id := gen_random_uuid();
  INSERT INTO dms_submissions (id, tenant_id, office_id, title, description, case_id, submitted_by)
  VALUES (new_id, p_tenant, p_office, btrim(p_title), btrim(coalesce(p_description, '')), p_case, p_actor);
  err := dms_submission_attach_files(p_tenant, p_actor, new_id, p_staged, p_labels);
  IF err IS NOT NULL THEN
    -- Chưa có tệp nào được gắn nhưng bản trình đã ghi: huỷ bằng ngoại lệ có chủ đích để khối con hoàn tác, rồi trả mã lỗi.
    RAISE EXCEPTION 'submission_attach_failed:%', err USING ERRCODE = 'P0001';
  END IF;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.submission.create', 'submission', new_id,
                        jsonb_build_object('files', cardinality(p_staged), 'case_id', p_case));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', true, 'SUBMISSION_CREATED', p_office, NULL, new_id::text);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM LIKE 'submission_attach_failed:%' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, substring(SQLERRM FROM 'submission_attach_failed:(.*)$'), p_office, NULL, NULL);
  END IF;
  RAISE;
END $$;

-- Tải thêm scan: chỉ người trình, chỉ khi còn chờ duyệt.
CREATE FUNCTION dms_submission_add_files(p_tenant uuid, p_actor uuid, p_submission uuid, p_staged uuid[], p_labels text[])
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s dms_submissions; err text;
BEGIN
  SELECT * INTO s FROM dms_submissions WHERE id = p_submission AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_submission_visible(p_tenant, p_actor, s.office_id, s.submitted_by) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.add_files', false, 'SUBMISSION_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF s.submitted_by <> p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.add_files', false, 'PERMISSION_DENIED', s.office_id, NULL, p_submission::text);
  END IF;
  IF s.status <> 'PENDING' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.add_files', false, 'SUBMISSION_NOT_PENDING', s.office_id, NULL, p_submission::text);
  END IF;
  err := dms_submission_attach_files(p_tenant, p_actor, p_submission, p_staged, p_labels);
  IF err IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.add_files', false, err, s.office_id, NULL, p_submission::text);
  END IF;
  PERFORM dms_audit_rec(p_tenant, s.office_id, p_actor, 'dms.submission.add_files', 'submission', p_submission,
                        jsonb_build_object('files', cardinality(p_staged)));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.add_files', true, 'SUBMISSION_FILES_ADDED', s.office_id, NULL, p_submission::text);
END $$;

-- Duyệt / từ chối: CHỈ Admin văn phòng. Từ chối bắt buộc có lý do. Quyết định là cuối cùng.
CREATE FUNCTION dms_submission_decide(p_tenant uuid, p_actor uuid, p_submission uuid, p_approve boolean, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s dms_submissions; new_status text;
BEGIN
  IF p_approve IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.decide', false, 'INVALID_INPUT', NULL, NULL, p_submission::text);
  END IF;
  SELECT * INTO s FROM dms_submissions WHERE id = p_submission AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_submission_visible(p_tenant, p_actor, s.office_id, s.submitted_by) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.decide', false, 'SUBMISSION_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF NOT dms_office_admin(p_tenant, p_actor, s.office_id) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.decide', false, 'PERMISSION_DENIED', s.office_id, NULL, p_submission::text);
  END IF;
  IF s.status <> 'PENDING' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.decide', false, 'SUBMISSION_NOT_PENDING', s.office_id, NULL, p_submission::text);
  END IF;
  IF NOT p_approve AND btrim(coalesce(p_note, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.decide', false, 'REASON_REQUIRED', s.office_id, NULL, p_submission::text);
  END IF;
  new_status := CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END;
  UPDATE dms_submissions SET status = new_status, decided_by = p_actor, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE id = p_submission AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, s.office_id, p_actor, 'dms.submission.decide', 'submission', p_submission, jsonb_build_object('status', new_status));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.decide', true, CASE WHEN p_approve THEN 'SUBMISSION_APPROVED' ELSE 'SUBMISSION_REJECTED' END,
                      s.office_id, NULL, p_submission::text);
END $$;

-- ===== Đọc =====
-- Danh sách (Admin: cả văn phòng; người khác: của mình). Tìm không dấu theo tiêu đề và mô tả; lọc trạng thái. `total` là số khớp bộ lọc.
CREATE FUNCTION dms_submission_list(p_tenant uuid, p_actor uuid, p_office uuid, p_status text, p_q text, p_limit integer, p_offset integer)
RETURNS TABLE (id uuid, title text, description text, status text, case_id uuid, case_title text, case_number text,
               submitted_by uuid, submitted_at timestamptz, decided_by uuid, decided_at timestamptz, decision_note text,
               file_count integer, total bigint)
LANGUAGE plpgsql AS $$
DECLARE q text := nullif(btrim(coalesce(p_q, '')), ''); pat text;
BEGIN
  IF p_office IS NULL OR NOT dms_office_member(p_tenant, p_actor, p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.list', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  IF q IS NOT NULL THEN
    pat := '%' || replace(replace(replace(dms_fold(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.list', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT s.id, s.title, s.description, s.status, s.case_id, c.title, c.case_number, s.submitted_by, s.submitted_at,
           s.decided_by, s.decided_at, s.decision_note,
           (SELECT count(*)::integer FROM dms_submission_files f WHERE f.tenant_id = s.tenant_id AND f.submission_id = s.id),
           count(*) OVER ()
    FROM dms_submissions s
    LEFT JOIN dms_case_files c ON c.id = s.case_id AND c.tenant_id = s.tenant_id
    WHERE s.tenant_id = p_tenant AND s.office_id = p_office
      AND dms_submission_visible(p_tenant, p_actor, s.office_id, s.submitted_by)
      AND (p_status IS NULL OR s.status = p_status)
      AND (pat IS NULL OR dms_fold(s.title || ' ' || s.description) LIKE pat)
    ORDER BY s.submitted_at DESC, s.id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

CREATE FUNCTION dms_submission_get(p_tenant uuid, p_actor uuid, p_submission uuid)
RETURNS TABLE (id uuid, office_id uuid, title text, description text, status text, case_id uuid, case_title text, case_number text,
               submitted_by uuid, submitted_at timestamptz, decided_by uuid, decided_at timestamptz, decision_note text, file_count integer)
LANGUAGE plpgsql AS $$
DECLARE s dms_submissions;
BEGIN
  SELECT * INTO s FROM dms_submissions WHERE dms_submissions.id = p_submission AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_submission_visible(p_tenant, p_actor, s.office_id, s.submitted_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.get', false, 'SUBMISSION_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.get', true, 'ALLOWED', s.office_id, NULL, p_submission::text);
  RETURN QUERY
    SELECT s.id, s.office_id, s.title, s.description, s.status, s.case_id, c.title, c.case_number, s.submitted_by, s.submitted_at,
           s.decided_by, s.decided_at, s.decision_note,
           (SELECT count(*)::integer FROM dms_submission_files f WHERE f.tenant_id = s.tenant_id AND f.submission_id = s.id)
    FROM (SELECT 1) one LEFT JOIN dms_case_files c ON c.id = s.case_id AND c.tenant_id = s.tenant_id;
END $$;

CREATE FUNCTION dms_submission_files_list(p_tenant uuid, p_actor uuid, p_submission uuid)
RETURNS TABLE (id uuid, label text, mime text, sha256 text, size_bytes bigint, created_by uuid, created_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE s dms_submissions;
BEGIN
  SELECT * INTO s FROM dms_submissions WHERE dms_submissions.id = p_submission AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_submission_visible(p_tenant, p_actor, s.office_id, s.submitted_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.files', false, 'SUBMISSION_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.files', true, 'ALLOWED', s.office_id, NULL, p_submission::text);
  RETURN QUERY
    SELECT f.id, f.label, f.mime, f.sha256, f.size_bytes, f.created_by, f.created_at
    FROM dms_submission_files f WHERE f.tenant_id = p_tenant AND f.submission_id = p_submission ORDER BY f.created_at, f.id;
END $$;

-- Lấy khoá đối tượng để xem/tải. Cùng quyền xem bản trình; mọi lần đều ghi nhật ký.
CREATE FUNCTION dms_submission_file_download(p_tenant uuid, p_actor uuid, p_file uuid)
RETURNS TABLE (object_key text, mime text, sha256 text, size_bytes bigint, label text)
LANGUAGE plpgsql AS $$
DECLARE f dms_submission_files; s dms_submissions;
BEGIN
  SELECT * INTO f FROM dms_submission_files WHERE dms_submission_files.id = p_file AND tenant_id = p_tenant;
  IF FOUND THEN SELECT * INTO s FROM dms_submissions WHERE dms_submissions.id = f.submission_id AND tenant_id = p_tenant; END IF;
  IF NOT FOUND OR NOT dms_submission_visible(p_tenant, p_actor, s.office_id, s.submitted_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.download', false, 'FILE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.submission.download', true, 'ALLOWED', s.office_id, NULL, p_file::text);
  PERFORM dms_audit_rec(p_tenant, s.office_id, p_actor, 'dms.submission.download', 'submission_file', p_file, '{}'::jsonb);
  RETURN QUERY SELECT f.object_key, f.mime, f.sha256, f.size_bytes, f.label;
END $$;

-- Số bản trình chờ duyệt cho Admin (huy hiệu ở thanh bên). Người không phải Admin nhận 0.
CREATE FUNCTION dms_submission_pending_count(p_tenant uuid, p_actor uuid, p_office uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN dms_office_admin(p_tenant, p_actor, p_office)
              THEN (SELECT count(*)::integer FROM dms_submissions s WHERE s.tenant_id = p_tenant AND s.office_id = p_office AND s.status = 'PENDING')
              ELSE 0 END
$$;
