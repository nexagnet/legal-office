-- Lát #9: Tống đạt (một yêu cầu N-01 chứa nhiều văn bản, mỗi văn bản có người nhận/hạn/người xử lý/các lần tống đạt và
-- bằng chứng N-02). Dữ liệu giả lập. Không tự đăng/niêm yết, không có thành công tự động, không AI quyết định hiệu lực,
-- không tài chính. Quyền kiểm tra trong DB; mọi kết quả (kể cả từ chối) ghi audit_log (hàm vibang_audit của 0002).

CREATE TABLE td_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  request_ref text NOT NULL CHECK (btrim(request_ref) <> ''),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  CONSTRAINT td_requests_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT td_requests_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id),
  CONSTRAINT td_requests_closed_chk CHECK ((status = 'CLOSED') = (closed_by IS NOT NULL AND closed_at IS NOT NULL))
);

CREATE TABLE td_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  recipient_name text NOT NULL CHECK (btrim(recipient_name) <> ''),
  address text NOT NULL CHECK (btrim(address) <> ''),
  deadline_at timestamptz NOT NULL,
  handler_user_id uuid,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'DELIVERED', 'UNDELIVERABLE')),
  undeliverable_reason text CHECK (undeliverable_reason IN ('NO_RECIPIENT', 'ADDRESS_NOT_FOUND', 'RECIPIENT_REFUSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT td_documents_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT td_documents_request_fk FOREIGN KEY (request_id, tenant_id) REFERENCES td_requests (id, tenant_id),
  CONSTRAINT td_documents_handler_fk FOREIGN KEY (handler_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT td_documents_handler_chk CHECK (status = 'PENDING' OR handler_user_id IS NOT NULL),
  CONSTRAINT td_documents_reason_chk CHECK ((status = 'UNDELIVERABLE') = (undeliverable_reason IS NOT NULL))
);

CREATE TABLE td_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  document_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq >= 1),
  outcome text NOT NULL CHECK (outcome IN ('SERVED', 'REFUSED', 'ABSENT', 'NO_RECIPIENT', 'WRONG_ADDRESS', 'POSTED_NOTICE', 'OTHER_FAILURE')),
  evidence_key text CHECK (evidence_key IS NULL OR (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)')),
  evidence_sha256 text CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
  statutory_basis_ref text,
  late boolean NOT NULL,
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT td_attempts_seq_uq UNIQUE (document_id, seq),
  CONSTRAINT td_attempts_doc_fk FOREIGN KEY (document_id, tenant_id) REFERENCES td_documents (id, tenant_id),
  CONSTRAINT td_attempts_evidence_chk CHECK ((evidence_key IS NULL) = (evidence_sha256 IS NULL)),
  CONSTRAINT td_attempts_served_chk CHECK (outcome <> 'SERVED' OR evidence_key IS NOT NULL),
  CONSTRAINT td_attempts_posted_chk CHECK (outcome <> 'POSTED_NOTICE' OR btrim(coalesce(statutory_basis_ref, '')) <> '')
);

-- Lịch sử việc: tạo, thêm văn bản, giao việc, nhắc, ghi nhận, đóng. Chỉ ghi thêm; không PII.
CREATE TABLE td_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  document_id uuid,
  event text NOT NULL CHECK (event IN ('REQUEST_CREATED', 'DOCUMENT_ADDED', 'ASSIGNED', 'REMINDER', 'ATTEMPT_RECORDED', 'MARKED_UNDELIVERABLE', 'REQUEST_CLOSED')),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT td_events_request_fk FOREIGN KEY (request_id, tenant_id) REFERENCES td_requests (id, tenant_id)
);

CREATE TRIGGER td_attempts_ro BEFORE UPDATE OR DELETE ON td_attempts
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER td_events_ro BEFORE UPDATE OR DELETE ON td_events
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Không xoá; văn bản đã DELIVERED/UNDELIVERABLE là cuối; yêu cầu đã CLOSED bất biến; phạm vi không đổi.
CREATE FUNCTION td_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service documents are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status IN ('DELIVERED', 'UNDELIVERABLE') THEN
    RAISE EXCEPTION 'service document is final (%)', OLD.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.request_id <> OLD.request_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.recipient_name <> OLD.recipient_name
     OR NEW.address <> OLD.address THEN
    RAISE EXCEPTION 'service document identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER td_documents_guard_trg BEFORE UPDATE OR DELETE ON td_documents
  FOR EACH ROW EXECUTE FUNCTION td_documents_guard();

CREATE FUNCTION td_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'CLOSED'
     OR NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.request_ref <> OLD.request_ref THEN
    RAISE EXCEPTION 'service request is closed or immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER td_requests_guard_trg BEFORE UPDATE OR DELETE ON td_requests
  FOR EACH ROW EXECUTE FUNCTION td_requests_guard();

-- Nguồn chiếu cho sổ S-01 (chỉ đọc; RLS của bảng gốc vẫn áp dụng cho người gọi).
CREATE VIEW td_s01_book WITH (security_invoker = true) AS
SELECT d.tenant_id, r.office_id, r.branch_id, r.id AS request_id, r.request_ref, d.id AS document_id,
       d.recipient_name, d.deadline_at, d.status, d.undeliverable_reason, d.handler_user_id,
       (SELECT count(*)::int FROM td_attempts a WHERE a.document_id = d.id AND a.tenant_id = d.tenant_id) AS attempts,
       (SELECT max(a.at) FROM td_attempts a WHERE a.document_id = d.id AND a.tenant_id = d.tenant_id) AS last_attempt_at
FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['td_requests', 'td_documents', 'td_attempts', 'td_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- ---- Hàm nghiệp vụ ----

-- NULL nếu hợp lệ. THV chỉ khi là người xử lý được giao (p_handler); Văn thư/Kế toán cần chi nhánh được cấp;
-- Admin/Thư ký/Trưởng VP theo văn phòng.
CREATE FUNCTION td_authorize(p_tenant uuid, p_user uuid, p_office uuid, p_branch uuid, p_roles text[], p_handler uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE has_role boolean; has_thv boolean;
BEGIN
  SELECT bool_or(true), coalesce(bool_or(m.role = 'THV'), false) INTO has_role, has_thv
  FROM memberships m
  WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office AND m.role = ANY (p_roles);
  IF has_role IS NULL THEN RETURN 'ROLE_LACKS_PERMISSION'; END IF;
  IF EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office AND m.role = ANY (p_roles)
      AND ((m.role = 'THV' AND p_handler IS NOT NULL AND p_handler = p_user)
        OR (m.role IN ('VAN_THU', 'KE_TOAN') AND EXISTS (
              SELECT 1 FROM branch_grants g WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND g.branch_id = p_branch))
        OR m.role IN ('ADMIN', 'THU_KY', 'TRUONG_VP'))
  ) THEN RETURN NULL; END IF;
  RETURN CASE WHEN has_thv THEN 'NOT_ASSIGNED_HANDLER' ELSE 'BRANCH_NOT_GRANTED' END;
END $$;

CREATE FUNCTION td_event(p_tenant uuid, p_request uuid, p_document uuid, p_event text, p_actor uuid)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO td_events (tenant_id, request_id, document_id, event, actor_user_id) VALUES (p_tenant, p_request, p_document, p_event, p_actor);
$$;

-- Tạo yêu cầu (N-01). label = id yêu cầu.
CREATE FUNCTION td_create_request(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_ref text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; rid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.request.create', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.request.create', false, denied, p_office, p_branch, NULL); END IF;
  IF btrim(coalesce(p_ref, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.request.create', false, 'REFERENCE_REQUIRED', p_office, p_branch, NULL);
  END IF;
  INSERT INTO td_requests (tenant_id, office_id, branch_id, request_ref, created_by) VALUES (p_tenant, p_office, p_branch, btrim(p_ref), p_actor)
  RETURNING id INTO rid;
  PERFORM td_event(p_tenant, rid, NULL, 'REQUEST_CREATED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.request.create', true, 'ALLOWED', p_office, p_branch, rid::text);
END $$;

-- Thêm một văn bản cần tống đạt vào yêu cầu đang mở. label = id văn bản.
CREATE FUNCTION td_add_document(p_tenant uuid, p_actor uuid, p_request uuid, p_recipient text, p_address text, p_deadline timestamptz)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r td_requests%ROWTYPE; denied text; did uuid;
BEGIN
  SELECT * INTO r FROM td_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, denied, r.office_id, r.branch_id, NULL); END IF;
  IF r.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, 'REQUEST_CLOSED', r.office_id, r.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_recipient, '')) = '' OR btrim(coalesce(p_address, '')) = '' OR p_deadline IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, 'INVALID_DOCUMENT', r.office_id, r.branch_id, NULL);
  END IF;
  INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at)
  VALUES (p_tenant, p_request, btrim(p_recipient), btrim(p_address), p_deadline) RETURNING id INTO did;
  PERFORM td_event(p_tenant, p_request, did, 'DOCUMENT_ADDED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', true, 'ALLOWED', r.office_id, r.branch_id, did::text);
END $$;

-- Chỉ Admin hoặc Trưởng VP giao người xử lý; người xử lý phải là THV của cùng văn phòng.
CREATE FUNCTION td_assign(p_tenant uuid, p_actor uuid, p_document uuid, p_handler uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d td_documents%ROWTYPE; r td_requests%ROWTYPE; denied text;
BEGIN
  SELECT * INTO d FROM td_documents WHERE id = p_document AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.assign', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO r FROM td_requests WHERE id = d.request_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.assign', false, 'ADMIN_OR_HEAD_ONLY', r.office_id, r.branch_id, NULL);
  END IF;
  IF r.status <> 'OPEN' OR d.status IN ('DELIVERED', 'UNDELIVERABLE') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.assign', false, 'DOCUMENT_FINAL', r.office_id, r.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_handler AND m.office_id = r.office_id AND m.role = 'THV') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.assign', false, 'INVALID_HANDLER', r.office_id, r.branch_id, NULL);
  END IF;
  UPDATE td_documents SET handler_user_id = p_handler, status = 'ASSIGNED' WHERE id = p_document AND tenant_id = p_tenant;
  PERFORM td_event(p_tenant, d.request_id, p_document, 'ASSIGNED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.assign', true, 'ALLOWED', r.office_id, r.branch_id, NULL);
END $$;

-- Nhắc việc (ghi lịch sử). Người xử lý được giao, Admin, Trưởng VP, Thư ký.
CREATE FUNCTION td_remind(p_tenant uuid, p_actor uuid, p_document uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d td_documents%ROWTYPE; r td_requests%ROWTYPE; denied text;
BEGIN
  SELECT * INTO d FROM td_documents WHERE id = p_document AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.remind', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO r FROM td_requests WHERE id = d.request_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'], d.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.remind', false, denied, r.office_id, r.branch_id, NULL); END IF;
  IF d.status IN ('DELIVERED', 'UNDELIVERABLE') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.remind', false, 'DOCUMENT_FINAL', r.office_id, r.branch_id, NULL);
  END IF;
  PERFORM td_event(p_tenant, d.request_id, p_document, 'REMINDER', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.remind', true, 'ALLOWED', r.office_id, r.branch_id, NULL);
END $$;

-- Ghi một lần tống đạt (N-02). SERVED cần bằng chứng và mới đánh dấu DELIVERED; thất bại giữ văn bản mở để thử lại.
-- POSTED_NOTICE (niêm yết) chỉ ghi khi có căn cứ pháp lý đã nêu; không bao giờ tự thành công. `late` ghi nhận quá hạn.
CREATE FUNCTION td_record_attempt(p_tenant uuid, p_actor uuid, p_document uuid, p_outcome text,
  p_evidence_key text, p_evidence_sha256 text, p_statutory_ref text, p_at timestamptz DEFAULT now())
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d td_documents%ROWTYPE; r td_requests%ROWTYPE; denied text; n integer;
BEGIN
  SELECT * INTO d FROM td_documents WHERE id = p_document AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO r FROM td_requests WHERE id = d.request_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], d.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, denied, r.office_id, r.branch_id, NULL); END IF;
  IF r.status <> 'OPEN' OR d.status IN ('DELIVERED', 'UNDELIVERABLE') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, 'DOCUMENT_FINAL', r.office_id, r.branch_id, NULL);
  END IF;
  IF d.status <> 'ASSIGNED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, 'HANDLER_REQUIRED', r.office_id, r.branch_id, NULL);
  END IF;
  IF p_outcome NOT IN ('SERVED', 'REFUSED', 'ABSENT', 'NO_RECIPIENT', 'WRONG_ADDRESS', 'POSTED_NOTICE', 'OTHER_FAILURE') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, 'INVALID_OUTCOME', r.office_id, r.branch_id, NULL);
  END IF;
  IF (p_evidence_key IS NULL) <> (p_evidence_sha256 IS NULL)
     OR (p_evidence_key IS NOT NULL AND (btrim(p_evidence_key) = '' OR p_evidence_key ~ '(^/|\.\.)' OR p_evidence_sha256 !~ '^[0-9a-f]{64}$')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, 'INVALID_EVIDENCE', r.office_id, r.branch_id, NULL);
  END IF;
  IF p_outcome = 'SERVED' AND p_evidence_key IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, 'EVIDENCE_REQUIRED', r.office_id, r.branch_id, NULL);
  END IF;
  IF p_outcome = 'POSTED_NOTICE' AND btrim(coalesce(p_statutory_ref, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', false, 'STATUTORY_PROOF_REQUIRED', r.office_id, r.branch_id, NULL);
  END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO n FROM td_attempts WHERE document_id = p_document AND tenant_id = p_tenant;
  INSERT INTO td_attempts (tenant_id, document_id, seq, outcome, evidence_key, evidence_sha256, statutory_basis_ref, late, actor_user_id, at)
  VALUES (p_tenant, p_document, n, p_outcome, p_evidence_key, p_evidence_sha256, nullif(btrim(p_statutory_ref), ''), p_at > d.deadline_at, p_actor, p_at);
  IF p_outcome = 'SERVED' THEN
    UPDATE td_documents SET status = 'DELIVERED' WHERE id = p_document AND tenant_id = p_tenant;
  END IF;
  PERFORM td_event(p_tenant, d.request_id, p_document, 'ATTEMPT_RECORDED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.attempt.record', true, 'ALLOWED', r.office_id, r.branch_id, 'attempt ' || n);
END $$;

-- Kết luận không tống đạt được (có mã lý do) sau ít nhất một lần thử. Người xử lý được giao, Admin, Trưởng VP.
CREATE FUNCTION td_mark_undeliverable(p_tenant uuid, p_actor uuid, p_document uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d td_documents%ROWTYPE; r td_requests%ROWTYPE; denied text;
BEGIN
  SELECT * INTO d FROM td_documents WHERE id = p_document AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.undeliverable', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO r FROM td_requests WHERE id = d.request_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], d.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.undeliverable', false, denied, r.office_id, r.branch_id, NULL); END IF;
  IF r.status <> 'OPEN' OR d.status IN ('DELIVERED', 'UNDELIVERABLE') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.undeliverable', false, 'DOCUMENT_FINAL', r.office_id, r.branch_id, NULL);
  END IF;
  IF p_reason NOT IN ('NO_RECIPIENT', 'ADDRESS_NOT_FOUND', 'RECIPIENT_REFUSED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.undeliverable', false, 'INVALID_REASON', r.office_id, r.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM td_attempts a WHERE a.document_id = p_document AND a.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.undeliverable', false, 'NO_ATTEMPTS', r.office_id, r.branch_id, NULL);
  END IF;
  UPDATE td_documents SET status = 'UNDELIVERABLE', undeliverable_reason = p_reason WHERE id = p_document AND tenant_id = p_tenant;
  PERFORM td_event(p_tenant, d.request_id, p_document, 'MARKED_UNDELIVERABLE', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.undeliverable', true, 'ALLOWED', r.office_id, r.branch_id, NULL);
END $$;

-- Đóng yêu cầu cha CHỈ khi mọi văn bản đều đã có kết cục cuối (không tự đóng khi một văn bản thành công).
CREATE FUNCTION td_close_request(p_tenant uuid, p_actor uuid, p_request uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r td_requests%ROWTYPE; denied text;
BEGIN
  SELECT * INTO r FROM td_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.request.close', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.request.close', false, 'ADMIN_OR_HEAD_ONLY', r.office_id, r.branch_id, NULL); END IF;
  IF r.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.request.close', false, 'REQUEST_CLOSED', r.office_id, r.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM td_documents d WHERE d.request_id = p_request AND d.tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM td_documents d WHERE d.request_id = p_request AND d.tenant_id = p_tenant AND d.status IN ('PENDING', 'ASSIGNED')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.request.close', false, 'DOCUMENTS_NOT_FINAL', r.office_id, r.branch_id, NULL);
  END IF;
  UPDATE td_requests SET status = 'CLOSED', closed_by = p_actor, closed_at = now() WHERE id = p_request AND tenant_id = p_tenant;
  PERFORM td_event(p_tenant, p_request, NULL, 'REQUEST_CLOSED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.request.close', true, 'ALLOWED', r.office_id, r.branch_id, NULL);
END $$;
