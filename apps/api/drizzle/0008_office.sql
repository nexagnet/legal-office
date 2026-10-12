-- Lát #14: Quản lý văn phòng — công văn đi/đến, sổ quyết định, thư viện TT06 (chỉ xem/tải), vật tư FIFO, nguồn S-06.
-- Dữ liệu giả lập. KHÔNG có giá/giá vốn/tiền (vật tư chỉ số lượng, không thay MISA); KHÔNG tự phát hành biểu mẫu TT06;
-- không gộp tài sản THA (as_*) với vật tư văn phòng. Quyền kiểm tra trong DB (td_authorize), mọi kết quả ghi audit_log.

-- Hồ sơ nghiệp vụ nào cũng liên kết được (vibang_cases / td_requests / vx_cases / th_cases), cùng tenant và cùng văn phòng.
CREATE FUNCTION of_case_in_office(p_tenant uuid, p_office uuid, p_kind text, p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE p_kind
    WHEN 'VIBANG' THEN EXISTS (SELECT 1 FROM vibang_cases c WHERE c.id = p_id AND c.tenant_id = p_tenant AND c.office_id = p_office)
    WHEN 'SERVICE' THEN EXISTS (SELECT 1 FROM td_requests c WHERE c.id = p_id AND c.tenant_id = p_tenant AND c.office_id = p_office)
    WHEN 'VERIFICATION' THEN EXISTS (SELECT 1 FROM vx_cases c WHERE c.id = p_id AND c.tenant_id = p_tenant AND c.office_id = p_office)
    WHEN 'ENFORCEMENT' THEN EXISTS (SELECT 1 FROM th_cases c WHERE c.id = p_id AND c.tenant_id = p_tenant AND c.office_id = p_office)
    ELSE false END;
$$;

CREATE TABLE of_correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  status text NOT NULL CHECK (status IN ('RECEIVED', 'HANDLED', 'DRAFT', 'SUBMITTED', 'APPROVED', 'ISSUED')),
  ref_no text,                         -- số, ký hiệu (đến: của nơi gửi; đi: do Văn phòng ghi khi ban hành)
  doc_type text NOT NULL CHECK (btrim(doc_type) <> ''),
  counterparty text NOT NULL CHECK (btrim(counterparty) <> ''),  -- cơ quan/người gửi hoặc nơi nhận
  subject text NOT NULL CHECK (btrim(subject) <> ''),            -- trích yếu
  issued_on date,
  received_on date,
  due_at timestamptz,
  handler_user_id uuid,
  case_kind text CHECK (case_kind IN ('VIBANG', 'SERVICE', 'VERIFICATION', 'ENFORCEMENT')),
  case_id uuid,
  result_note text,
  archive_ref text,
  submitted_by uuid,
  approved_by uuid,
  signer_user_id uuid,
  send_method text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_corr_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT of_corr_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id),
  CONSTRAINT of_corr_handler_fk FOREIGN KEY (handler_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT of_corr_case_chk CHECK ((case_kind IS NULL) = (case_id IS NULL)),
  CONSTRAINT of_corr_dir_chk CHECK (
    (direction = 'INBOUND' AND status IN ('RECEIVED', 'HANDLED') AND received_on IS NOT NULL)
    OR (direction = 'OUTBOUND' AND status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'ISSUED'))
  ),
  CONSTRAINT of_corr_handled_chk CHECK (status <> 'HANDLED' OR btrim(coalesce(result_note, '')) <> ''),
  CONSTRAINT of_corr_issued_chk CHECK (
    status <> 'ISSUED' OR (btrim(coalesce(ref_no, '')) <> '' AND signer_user_id IS NOT NULL AND issued_on IS NOT NULL
                           AND btrim(coalesce(send_method, '')) <> '' AND approved_by IS NOT NULL)
  )
);

CREATE TABLE of_attachments (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  correspondence_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('ATTACHMENT', 'FINAL_DOCUMENT', 'SEND_PROOF')),
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  added_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_attachments_corr_fk FOREIGN KEY (correspondence_id, tenant_id) REFERENCES of_correspondence (id, tenant_id)
);

-- Lịch sử từng công văn: chỉ ghi thêm, không PII.
CREATE TABLE of_corr_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  correspondence_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('CREATED', 'ATTACHED', 'HANDLED', 'SUBMITTED', 'APPROVED', 'ISSUED', 'LINKED')),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_corr_events_fk FOREIGN KEY (correspondence_id, tenant_id) REFERENCES of_correspondence (id, tenant_id)
);

-- Quyết định/văn bản nội bộ của Văn phòng: bất biến sau khi ghi sổ.
CREATE TABLE of_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  decision_no text NOT NULL CHECK (btrim(decision_no) <> ''),
  doc_type text NOT NULL CHECK (btrim(doc_type) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  signer_user_id uuid NOT NULL,
  signed_on date NOT NULL,
  case_kind text CHECK (case_kind IN ('VIBANG', 'SERVICE', 'VERIFICATION', 'ENFORCEMENT')),
  case_id uuid,
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_decisions_no_uq UNIQUE (tenant_id, office_id, decision_no),
  CONSTRAINT of_decisions_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id),
  CONSTRAINT of_decisions_signer_fk FOREIGN KEY (signer_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT of_decisions_case_chk CHECK ((case_kind IS NULL) = (case_id IS NULL))
);

-- Thư viện TT06: CHỈ siêu dữ liệu để tra cứu/xem/tải. Không có hàm điền, ký hay phát hành.
CREATE TABLE of_tt06_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code text NOT NULL CHECK (code IN ('I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX')),
  version integer NOT NULL CHECK (version >= 1),
  title text NOT NULL CHECK (btrim(title) <> ''),
  file_key text NOT NULL CHECK (btrim(file_key) <> '' AND file_key !~ '(^/|\.\.)'),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  registered_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_tt06_uq UNIQUE (tenant_id, code, version)
);

-- Vật tư: chỉ số lượng, KHÔNG đơn giá/giá vốn. Lô nhập theo địa điểm (chi nhánh) để xuất FIFO.
CREATE TABLE of_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  unit text NOT NULL CHECK (btrim(unit) <> ''),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_items_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT of_items_name_uq UNIQUE (tenant_id, office_id, name)
);

CREATE TABLE of_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  receipt_ref text NOT NULL CHECK (btrim(receipt_ref) <> ''),
  qty_received integer NOT NULL CHECK (qty_received > 0),
  qty_remaining integer NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_received),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  seq bigserial,
  received_by uuid NOT NULL,
  CONSTRAINT of_batches_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT of_batches_item_fk FOREIGN KEY (item_id, tenant_id) REFERENCES of_items (id, tenant_id),
  CONSTRAINT of_batches_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id)
);

CREATE TABLE of_movements (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('RECEIPT', 'ISSUE', 'ADJUSTMENT')),
  delta integer NOT NULL CHECK (delta <> 0),
  purpose text,
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT of_movements_batch_fk FOREIGN KEY (batch_id, tenant_id) REFERENCES of_batches (id, tenant_id),
  CONSTRAINT of_movements_sign_chk CHECK ((kind = 'RECEIPT' AND delta > 0) OR (kind = 'ISSUE' AND delta < 0) OR kind = 'ADJUSTMENT'),
  CONSTRAINT of_movements_reason_chk CHECK (kind = 'RECEIPT' OR btrim(coalesce(purpose, '')) <> '')
);

-- Nguồn S-06: mỗi lần lưu là một phiên bản mới (chỉ ghi thêm). Bảo hiểm chỉ ghi tình trạng + ghi chú, không số tiền.
CREATE TABLE of_personnel (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  person_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  branch_id uuid NOT NULL,
  full_name text NOT NULL CHECK (btrim(full_name) <> ''),
  gender text NOT NULL CHECK (gender IN ('M', 'F')),
  specialty text,
  bailiff_decision_ref text,           -- Thừa phát lại (số, ngày)
  executor_decision_ref text,          -- Thừa hành viên (số, ngày)
  is_office_head boolean NOT NULL DEFAULT false,
  is_partner boolean NOT NULL DEFAULT false,
  labor_contract_ref text,
  insurance_purchased boolean,
  insurance_note text,
  contributing boolean,
  contribution_note text,
  note text,
  work_status text NOT NULL CHECK (work_status IN ('ACTIVE', 'LEFT')),
  saved_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_personnel_ver_uq UNIQUE (person_id, version),
  CONSTRAINT of_personnel_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id)
);

CREATE TRIGGER of_attachments_ro BEFORE UPDATE OR DELETE ON of_attachments FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER of_corr_events_ro BEFORE UPDATE OR DELETE ON of_corr_events FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER of_decisions_ro BEFORE UPDATE OR DELETE ON of_decisions FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER of_tt06_ro BEFORE UPDATE OR DELETE ON of_tt06_forms FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER of_items_ro BEFORE UPDATE OR DELETE ON of_items FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER of_movements_ro BEFORE UPDATE OR DELETE ON of_movements FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER of_personnel_ro BEFORE UPDATE OR DELETE ON of_personnel FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Công văn: không xoá; ISSUED/HANDLED là cuối; danh tính không đổi.
CREATE FUNCTION of_corr_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'correspondence is never deleted' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF OLD.status IN ('HANDLED', 'ISSUED') THEN RAISE EXCEPTION 'correspondence is final (%)', OLD.status USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.direction <> OLD.direction OR NEW.subject <> OLD.subject OR NEW.counterparty <> OLD.counterparty THEN
    RAISE EXCEPTION 'correspondence identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER of_corr_guard_trg BEFORE UPDATE OR DELETE ON of_correspondence FOR EACH ROW EXECUTE FUNCTION of_corr_guard();

-- Lô: chỉ qty_remaining đổi (và không thể âm — CHECK); không xoá.
CREATE FUNCTION of_batches_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'batches are never deleted' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.item_id <> OLD.item_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.qty_received <> OLD.qty_received OR NEW.received_at <> OLD.received_at OR NEW.seq <> OLD.seq THEN
    RAISE EXCEPTION 'batch identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER of_batches_guard_trg BEFORE UPDATE OR DELETE ON of_batches FOR EACH ROW EXECUTE FUNCTION of_batches_guard();

CREATE VIEW of_stock WITH (security_invoker = true) AS
SELECT b.tenant_id, b.office_id, b.branch_id, b.item_id, i.name, i.unit, sum(b.qty_remaining)::int AS on_hand, count(*)::int AS batches
FROM of_batches b JOIN of_items i ON i.id = b.item_id AND i.tenant_id = b.tenant_id
GROUP BY b.tenant_id, b.office_id, b.branch_id, b.item_id, i.name, i.unit;

CREATE VIEW of_s06_book WITH (security_invoker = true) AS
SELECT DISTINCT ON (p.person_id) p.* FROM of_personnel p ORDER BY p.person_id, p.version DESC;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['of_correspondence', 'of_attachments', 'of_corr_events', 'of_decisions', 'of_tt06_forms', 'of_items', 'of_batches', 'of_movements', 'of_personnel'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- ---- Hàm nghiệp vụ: công văn ----

CREATE FUNCTION of_corr_event(p_tenant uuid, p_corr uuid, p_event text, p_actor uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO of_corr_events (tenant_id, correspondence_id, event, actor_user_id) VALUES (p_tenant, p_corr, p_event, p_actor);
$$;

-- Quyền ghi công văn: Admin, Trưởng VP, Thư ký; Văn thư theo chi nhánh được cấp.
-- label = id công văn. Công văn đi được tạo ở DRAFT (chưa có số), công văn đến ở RECEIVED.
CREATE FUNCTION of_corr_create(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_direction text, p_doc_type text,
  p_counterparty text, p_subject text, p_ref_no text, p_issued_on date, p_received_on date, p_due timestamptz, p_handler uuid,
  p_case_kind text, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; cid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.create', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.create', false, denied, p_office, p_branch, NULL); END IF;
  IF p_direction IS NULL OR p_direction NOT IN ('INBOUND', 'OUTBOUND') OR btrim(coalesce(p_doc_type, '')) = ''
     OR btrim(coalesce(p_counterparty, '')) = '' OR btrim(coalesce(p_subject, '')) = ''
     OR (p_direction = 'INBOUND' AND p_received_on IS NULL) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.create', false, 'INVALID_CORRESPONDENCE', p_office, p_branch, NULL);
  END IF;
  IF (p_case_kind IS NULL) <> (p_case IS NULL) OR (p_case IS NOT NULL AND NOT of_case_in_office(p_tenant, p_office, p_case_kind, p_case)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.create', false, 'CASE_LINK_NOT_FOUND', p_office, p_branch, NULL);
  END IF;
  IF p_handler IS NOT NULL AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_handler AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.create', false, 'INVALID_HANDLER', p_office, p_branch, NULL);
  END IF;
  INSERT INTO of_correspondence (tenant_id, office_id, branch_id, direction, status, ref_no, doc_type, counterparty, subject, issued_on,
    received_on, due_at, handler_user_id, case_kind, case_id, created_by)
  VALUES (p_tenant, p_office, p_branch, p_direction, CASE p_direction WHEN 'INBOUND' THEN 'RECEIVED' ELSE 'DRAFT' END, nullif(btrim(p_ref_no), ''),
    btrim(p_doc_type), btrim(p_counterparty), btrim(p_subject), p_issued_on, p_received_on, p_due, p_handler, p_case_kind, p_case, p_actor)
  RETURNING id INTO cid;
  PERFORM of_corr_event(p_tenant, cid, 'CREATED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.create', true, 'ALLOWED', p_office, p_branch, cid::text);
END $$;

CREATE FUNCTION of_corr_attach(p_tenant uuid, p_actor uuid, p_corr uuid, p_role text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM of_correspondence WHERE id = p_corr AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.attach', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.attach', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('HANDLED', 'ISSUED') THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.attach', false, 'CORRESPONDENCE_FINAL', c.office_id, c.branch_id, NULL); END IF;
  IF p_role IS NULL OR p_role NOT IN ('ATTACHMENT', 'FINAL_DOCUMENT', 'SEND_PROOF') OR NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.attach', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO of_attachments (tenant_id, correspondence_id, role, evidence_key, evidence_sha256, added_by) VALUES (p_tenant, p_corr, p_role, p_key, p_sha, p_actor);
  PERFORM of_corr_event(p_tenant, p_corr, 'ATTACHED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.attach', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Công văn đến: người nhận xử lý (hoặc Admin/Trưởng VP/Thư ký) ghi kết quả xử lý + nơi lưu → HANDLED (cuối).
CREATE FUNCTION of_corr_handle(p_tenant uuid, p_actor uuid, p_corr uuid, p_result text, p_archive text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM of_correspondence WHERE id = p_corr AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.handle', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF c.handler_user_id IS NOT DISTINCT FROM p_actor AND p_actor IS NOT NULL THEN denied := NULL;
  ELSE denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY'], NULL); END IF;
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.handle', false, 'NOT_ASSIGNED_HANDLER', c.office_id, c.branch_id, NULL); END IF;
  IF c.direction <> 'INBOUND' OR c.status <> 'RECEIVED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.handle', false, 'CORRESPONDENCE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_result, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.handle', false, 'RESULT_REQUIRED', c.office_id, c.branch_id, NULL); END IF;
  UPDATE of_correspondence SET status = 'HANDLED', result_note = btrim(p_result), archive_ref = nullif(btrim(p_archive), '') WHERE id = p_corr AND tenant_id = p_tenant;
  PERFORM of_corr_event(p_tenant, p_corr, 'HANDLED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.handle', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Công văn đi: soạn → trình → phê duyệt nội bộ (Admin/Trưởng VP) → ký ban hành (người có legal_signer). Ba việc tách riêng.
CREATE FUNCTION of_corr_submit(p_tenant uuid, p_actor uuid, p_corr uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM of_correspondence WHERE id = p_corr AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.submit', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.submit', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.direction <> 'OUTBOUND' OR c.status <> 'DRAFT' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.submit', false, 'INVALID_STATUS', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM of_attachments a WHERE a.correspondence_id = p_corr AND a.tenant_id = p_tenant AND a.role = 'FINAL_DOCUMENT') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.submit', false, 'FINAL_DOCUMENT_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE of_correspondence SET status = 'SUBMITTED', submitted_by = p_actor WHERE id = p_corr AND tenant_id = p_tenant;
  PERFORM of_corr_event(p_tenant, p_corr, 'SUBMITTED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.submit', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

CREATE FUNCTION of_corr_approve(p_tenant uuid, p_actor uuid, p_corr uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM of_correspondence WHERE id = p_corr AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.approve', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.approve', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF c.direction <> 'OUTBOUND' OR c.status <> 'SUBMITTED' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.approve', false, 'INVALID_STATUS', c.office_id, c.branch_id, NULL); END IF;
  UPDATE of_correspondence SET status = 'APPROVED', approved_by = p_actor WHERE id = p_corr AND tenant_id = p_tenant;
  PERFORM of_corr_event(p_tenant, p_corr, 'APPROVED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.approve', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Ban hành: người ký (chính p_actor) phải có legal_signer; ghi số/ký hiệu, ngày, phương thức gửi và bằng chứng gửi.
CREATE FUNCTION of_corr_issue(p_tenant uuid, p_actor uuid, p_corr uuid, p_ref_no text, p_issued_on date, p_method text, p_proof_key text, p_proof_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM of_correspondence WHERE id = p_corr AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id
                 AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'SIGNING_AUTHORITY_NOT_GRANTED', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.direction <> 'OUTBOUND' OR c.status <> 'APPROVED' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'INVALID_STATUS', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_ref_no, '')) = '' OR p_issued_on IS NULL OR btrim(coalesce(p_method, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'INVALID_CORRESPONDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_proof_key, p_proof_sha) THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'SEND_PROOF_REQUIRED', c.office_id, c.branch_id, NULL); END IF;
  INSERT INTO of_attachments (tenant_id, correspondence_id, role, evidence_key, evidence_sha256, added_by) VALUES (p_tenant, p_corr, 'SEND_PROOF', p_proof_key, p_proof_sha, p_actor);
  UPDATE of_correspondence SET status = 'ISSUED', ref_no = btrim(p_ref_no), issued_on = p_issued_on, send_method = btrim(p_method), signer_user_id = p_actor
  WHERE id = p_corr AND tenant_id = p_tenant;
  PERFORM of_corr_event(p_tenant, p_corr, 'ISSUED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- ---- Đọc/tìm kiếm theo quyền (kết quả tìm kiếm cũng được audit) ----

-- Admin/Trưởng VP/Thư ký đọc cả văn phòng; Văn thư/Kế toán chỉ chi nhánh được cấp; THV chỉ công văn mình xử lý.
CREATE FUNCTION of_can_read(p_tenant uuid, p_user uuid, p_office uuid, p_branch uuid, p_handler uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office
      AND (m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY')
        OR (m.role IN ('VAN_THU', 'KE_TOAN') AND EXISTS (SELECT 1 FROM branch_grants g WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND g.branch_id = p_branch))
        OR (m.role = 'THV' AND p_handler IS NOT NULL AND p_handler = p_user))
  );
$$;

CREATE FUNCTION of_search_correspondence(p_tenant uuid, p_actor uuid, p_office uuid, p_query text, p_direction text, p_case uuid)
RETURNS TABLE (id uuid, direction text, status text, ref_no text, doc_type text, counterparty text, subject text, branch_id uuid, case_kind text, case_id uuid)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.corr.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT c.id, c.direction, c.status, c.ref_no, c.doc_type, c.counterparty, c.subject, c.branch_id, c.case_kind, c.case_id
    FROM of_correspondence c
    WHERE c.tenant_id = p_tenant AND c.office_id = p_office
      AND of_can_read(p_tenant, p_actor, c.office_id, c.branch_id, c.handler_user_id)
      AND (p_direction IS NULL OR c.direction = p_direction)
      AND (p_case IS NULL OR c.case_id = p_case)
      AND (p_query IS NULL OR c.subject ILIKE '%' || p_query || '%' OR coalesce(c.ref_no, '') ILIKE '%' || p_query || '%' OR c.counterparty ILIKE '%' || p_query || '%')
    ORDER BY c.created_at DESC, c.id LIMIT 200;
END $$;

-- ---- Sổ quyết định ----

-- Ghi sổ một quyết định/văn bản nội bộ đã ký. Người ký phải là Admin/Trưởng VP có legal_signer của văn phòng.
-- Từ chối loại văn bản trùng mã/tên biểu mẫu TT06 (biểu mẫu của cơ quan nhà nước, không phải Văn phòng ban hành).
CREATE FUNCTION of_decision_record(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_no text, p_doc_type text, p_title text,
  p_signer uuid, p_signed_on date, p_case_kind text, p_case uuid, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; did uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, denied, p_office, p_branch, NULL); END IF;
  IF btrim(coalesce(p_no, '')) = '' OR btrim(coalesce(p_doc_type, '')) = '' OR btrim(coalesce(p_title, '')) = '' OR p_signed_on IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, 'INVALID_DECISION', p_office, p_branch, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM of_tt06_forms f WHERE f.tenant_id = p_tenant AND (lower(f.code) = lower(btrim(p_doc_type)) OR lower(f.title) = lower(btrim(p_doc_type)))) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, 'AGENCY_ONLY_FORM', p_office, p_branch, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_signer AND m.office_id = p_office
                 AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, 'SIGNING_AUTHORITY_NOT_GRANTED', p_office, p_branch, NULL);
  END IF;
  IF (p_case_kind IS NULL) <> (p_case IS NULL) OR (p_case IS NOT NULL AND NOT of_case_in_office(p_tenant, p_office, p_case_kind, p_case)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, 'CASE_LINK_NOT_FOUND', p_office, p_branch, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, 'INVALID_EVIDENCE', p_office, p_branch, NULL); END IF;
  IF EXISTS (SELECT 1 FROM of_decisions d WHERE d.tenant_id = p_tenant AND d.office_id = p_office AND d.decision_no = btrim(p_no)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', false, 'DUPLICATE_DECISION_NO', p_office, p_branch, NULL);
  END IF;
  INSERT INTO of_decisions (tenant_id, office_id, branch_id, decision_no, doc_type, title, signer_user_id, signed_on, case_kind, case_id, evidence_key, evidence_sha256, recorded_by)
  VALUES (p_tenant, p_office, p_branch, btrim(p_no), btrim(p_doc_type), btrim(p_title), p_signer, p_signed_on, p_case_kind, p_case, p_key, p_sha, p_actor)
  RETURNING id INTO did;
  RETURN vibang_audit(p_tenant, p_actor, 'of.decision.record', true, 'ALLOWED', p_office, p_branch, did::text);
END $$;

-- Tra cứu theo số, ngày, loại, người ký, hồ sơ, từ khoá. THV không đọc sổ quyết định (giả định, xem doc).
CREATE FUNCTION of_search_decisions(p_tenant uuid, p_actor uuid, p_office uuid, p_query text, p_doc_type text, p_from date, p_to date,
  p_signer uuid, p_case uuid)
RETURNS TABLE (id uuid, decision_no text, doc_type text, title text, signer_user_id uuid, signed_on date, branch_id uuid, case_kind text, case_id uuid)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.decision.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT d.id, d.decision_no, d.doc_type, d.title, d.signer_user_id, d.signed_on, d.branch_id, d.case_kind, d.case_id
    FROM of_decisions d
    WHERE d.tenant_id = p_tenant AND d.office_id = p_office
      AND of_can_read(p_tenant, p_actor, d.office_id, d.branch_id, NULL)
      AND (p_doc_type IS NULL OR d.doc_type = p_doc_type)
      AND (p_from IS NULL OR d.signed_on >= p_from) AND (p_to IS NULL OR d.signed_on <= p_to)
      AND (p_signer IS NULL OR d.signer_user_id = p_signer) AND (p_case IS NULL OR d.case_id = p_case)
      AND (p_query IS NULL OR d.decision_no ILIKE '%' || p_query || '%' OR d.title ILIKE '%' || p_query || '%')
    ORDER BY d.signed_on DESC, d.id LIMIT 200;
END $$;

-- ---- Thư viện TT06: chỉ đăng ký siêu dữ liệu và tải ----

CREATE FUNCTION of_tt06_register(p_tenant uuid, p_actor uuid, p_office uuid, p_code text, p_title text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; v integer;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.tt06.register', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL); END IF;
  IF p_code IS NULL OR p_code NOT IN ('I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX') OR btrim(coalesce(p_title, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.tt06.register', false, 'INVALID_FORM', p_office, NULL, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN RETURN vibang_audit(p_tenant, p_actor, 'of.tt06.register', false, 'INVALID_EVIDENCE', p_office, NULL, NULL); END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM of_tt06_forms WHERE tenant_id = p_tenant AND code = p_code;
  INSERT INTO of_tt06_forms (tenant_id, code, version, title, file_key, file_sha256, registered_by) VALUES (p_tenant, p_code, v, btrim(p_title), p_key, p_sha, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.tt06.register', true, 'ALLOWED', p_office, NULL, p_code || ' v' || v);
END $$;

-- Tải bản mới nhất: trả khoá tệp trong label. Mọi thành viên văn phòng; luôn audit.
CREATE FUNCTION of_tt06_download(p_tenant uuid, p_actor uuid, p_office uuid, p_code text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE f of_tt06_forms%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.tt06.download', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
  END IF;
  SELECT * INTO f FROM of_tt06_forms WHERE tenant_id = p_tenant AND code = p_code ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.tt06.download', false, 'FORM_NOT_FOUND', p_office, NULL, NULL); END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'of.tt06.download', true, 'ALLOWED', p_office, NULL, f.file_key);
END $$;

-- ---- Vật tư FIFO ----

CREATE FUNCTION of_item_add(p_tenant uuid, p_actor uuid, p_office uuid, p_name text, p_unit text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; iid uuid;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.item.add', false, denied, p_office, NULL, NULL); END IF;
  IF btrim(coalesce(p_name, '')) = '' OR btrim(coalesce(p_unit, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.item.add', false, 'INVALID_ITEM', p_office, NULL, NULL); END IF;
  IF EXISTS (SELECT 1 FROM of_items i WHERE i.tenant_id = p_tenant AND i.office_id = p_office AND i.name = btrim(p_name)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.item.add', false, 'DUPLICATE_ITEM', p_office, NULL, NULL);
  END IF;
  INSERT INTO of_items (tenant_id, office_id, name, unit, created_by) VALUES (p_tenant, p_office, btrim(p_name), btrim(p_unit), p_actor) RETURNING id INTO iid;
  RETURN vibang_audit(p_tenant, p_actor, 'of.item.add', true, 'ALLOWED', p_office, NULL, iid::text);
END $$;

CREATE FUNCTION of_stock_authorize(p_tenant uuid, p_actor uuid, p_item of_items, p_branch uuid) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_item.office_id) THEN RETURN 'BRANCH_NOT_FOUND'; END IF;
  RETURN td_authorize(p_tenant, p_actor, p_item.office_id, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
END $$;

-- Nhập một lô tại địa điểm (chi nhánh). label = id lô.
CREATE FUNCTION of_receive(p_tenant uuid, p_actor uuid, p_item uuid, p_branch uuid, p_qty integer, p_receipt text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE i of_items%ROWTYPE; denied text; bid uuid;
BEGIN
  SELECT * INTO i FROM of_items WHERE id = p_item AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.receive', false, 'ITEM_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := of_stock_authorize(p_tenant, p_actor, i, p_branch);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.receive', false, denied, i.office_id, p_branch, NULL); END IF;
  IF p_qty IS NULL OR p_qty <= 0 OR btrim(coalesce(p_receipt, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stock.receive', false, 'INVALID_QUANTITY', i.office_id, p_branch, NULL);
  END IF;
  INSERT INTO of_batches (tenant_id, item_id, office_id, branch_id, receipt_ref, qty_received, qty_remaining, received_by)
  VALUES (p_tenant, p_item, i.office_id, p_branch, btrim(p_receipt), p_qty, p_qty, p_actor) RETURNING id INTO bid;
  INSERT INTO of_movements (tenant_id, batch_id, kind, delta, actor_user_id) VALUES (p_tenant, bid, 'RECEIPT', p_qty, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.stock.receive', true, 'ALLOWED', i.office_id, p_branch, bid::text);
END $$;

-- Xuất FIFO: lấy lần lượt từ lô nhập sớm nhất còn hàng của (vật tư, địa điểm); mỗi lô một dòng of_movements nên giữ được
-- nguồn lô. Khoá hàng vật tư để các lần xuất đồng thời được tuần tự hoá, không xuất vượt tồn, không âm.
CREATE FUNCTION of_issue(p_tenant uuid, p_actor uuid, p_item uuid, p_branch uuid, p_qty integer, p_purpose text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE i of_items%ROWTYPE; denied text; need integer; take integer; b record; total integer;
BEGIN
  SELECT * INTO i FROM of_items WHERE id = p_item AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.issue', false, 'ITEM_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := of_stock_authorize(p_tenant, p_actor, i, p_branch);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.issue', false, denied, i.office_id, p_branch, NULL); END IF;
  IF p_qty IS NULL OR p_qty <= 0 OR btrim(coalesce(p_purpose, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stock.issue', false, 'INVALID_QUANTITY', i.office_id, p_branch, NULL);
  END IF;
  SELECT coalesce(sum(qty_remaining), 0) INTO total FROM of_batches WHERE item_id = p_item AND tenant_id = p_tenant AND branch_id = p_branch;
  IF total < p_qty THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.issue', false, 'INSUFFICIENT_STOCK', i.office_id, p_branch, NULL); END IF;
  need := p_qty;
  FOR b IN SELECT id, qty_remaining FROM of_batches
           WHERE item_id = p_item AND tenant_id = p_tenant AND branch_id = p_branch AND qty_remaining > 0
           ORDER BY received_at, seq FOR UPDATE LOOP
    EXIT WHEN need = 0;
    take := least(need, b.qty_remaining);
    UPDATE of_batches SET qty_remaining = qty_remaining - take WHERE id = b.id AND tenant_id = p_tenant;
    INSERT INTO of_movements (tenant_id, batch_id, kind, delta, purpose, actor_user_id) VALUES (p_tenant, b.id, 'ISSUE', -take, btrim(p_purpose), p_actor);
    need := need - take;
  END LOOP;
  RETURN vibang_audit(p_tenant, p_actor, 'of.stock.issue', true, 'ALLOWED', i.office_id, p_branch, p_qty::text);
END $$;

-- Kiểm kê: đặt lại số còn của một lô, bắt buộc có lý do; ghi dòng ADJUSTMENT. Admin/Trưởng VP.
CREATE FUNCTION of_adjust(p_tenant uuid, p_actor uuid, p_batch uuid, p_new_remaining integer, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE b of_batches%ROWTYPE; denied text; d integer;
BEGIN
  SELECT * INTO b FROM of_batches WHERE id = p_batch AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.adjust', false, 'BATCH_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, b.office_id, b.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.adjust', false, 'ADMIN_OR_HEAD_ONLY', b.office_id, b.branch_id, NULL); END IF;
  IF p_new_remaining IS NULL OR p_new_remaining < 0 OR p_new_remaining > b.qty_received THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stock.adjust', false, 'INVALID_QUANTITY', b.office_id, b.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.adjust', false, 'REASON_REQUIRED', b.office_id, b.branch_id, NULL); END IF;
  d := p_new_remaining - b.qty_remaining;
  IF d = 0 THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stock.adjust', false, 'NO_CHANGE', b.office_id, b.branch_id, NULL); END IF;
  UPDATE of_batches SET qty_remaining = p_new_remaining WHERE id = p_batch AND tenant_id = p_tenant;
  INSERT INTO of_movements (tenant_id, batch_id, kind, delta, purpose, actor_user_id) VALUES (p_tenant, p_batch, 'ADJUSTMENT', d, btrim(p_reason), p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.stock.adjust', true, 'ALLOWED', b.office_id, b.branch_id, d::text);
END $$;

-- ---- Nhân sự (nguồn S-06) ----

-- Lưu một phiên bản mới của hồ sơ nhân sự (p_person NULL = người mới). Admin/Trưởng VP. label = person_id.
CREATE FUNCTION of_personnel_save(p_tenant uuid, p_actor uuid, p_office uuid, p_person uuid, p_branch uuid, p_name text, p_gender text,
  p_specialty text, p_bailiff_ref text, p_executor_ref text, p_head boolean, p_partner boolean, p_contract_ref text,
  p_ins_purchased boolean, p_ins_note text, p_contributing boolean, p_contrib_note text, p_note text, p_status text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; pid uuid; v integer;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_name, '')) = '' OR p_gender IS NULL OR p_gender NOT IN ('M', 'F') OR p_status IS NULL OR p_status NOT IN ('ACTIVE', 'LEFT') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'INVALID_PERSONNEL', p_office, p_branch, NULL);
  END IF;
  IF p_person IS NULL THEN pid := gen_random_uuid(); v := 1;
  ELSE
    SELECT coalesce(max(version), 0) + 1 INTO v FROM of_personnel WHERE person_id = p_person AND tenant_id = p_tenant AND office_id = p_office;
    IF v = 1 THEN RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'PERSON_NOT_FOUND', p_office, p_branch, NULL); END IF;
    pid := p_person;
  END IF;
  INSERT INTO of_personnel (tenant_id, office_id, person_id, version, branch_id, full_name, gender, specialty, bailiff_decision_ref, executor_decision_ref,
    is_office_head, is_partner, labor_contract_ref, insurance_purchased, insurance_note, contributing, contribution_note, note, work_status, saved_by)
  VALUES (p_tenant, p_office, pid, v, p_branch, btrim(p_name), p_gender, p_specialty, p_bailiff_ref, p_executor_ref, coalesce(p_head, false), coalesce(p_partner, false),
    p_contract_ref, p_ins_purchased, p_ins_note, p_contributing, p_contrib_note, p_note, p_status, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', true, 'ALLOWED', p_office, p_branch, pid::text);
END $$;

-- Đọc nguồn S-06: Admin/Trưởng VP (dữ liệu cá nhân nhạy cảm); luôn audit.
CREATE FUNCTION of_s06_read(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (person_id uuid, version integer, branch_id uuid, full_name text, gender text, specialty text, bailiff_decision_ref text,
  executor_decision_ref text, is_office_head boolean, is_partner boolean, labor_contract_ref text, insurance_purchased boolean,
  insurance_note text, contributing boolean, contribution_note text, note text, work_status text)
LANGUAGE plpgsql AS $$
DECLARE denied text;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.read', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.read', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT s.person_id, s.version, s.branch_id, s.full_name, s.gender, s.specialty, s.bailiff_decision_ref, s.executor_decision_ref, s.is_office_head,
           s.is_partner, s.labor_contract_ref, s.insurance_purchased, s.insurance_note, s.contributing, s.contribution_note, s.note, s.work_status
    FROM of_s06_book s WHERE s.tenant_id = p_tenant AND s.office_id = p_office ORDER BY s.full_name, s.person_id;
END $$;
