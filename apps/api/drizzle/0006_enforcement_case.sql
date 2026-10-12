-- Lát #13: Tổ chức thi hành án (THA) — một hồ sơ nhiều đương sự, nhiều nghĩa vụ, kết quả từng phần có bằng chứng.
-- Không sổ sách tài chính, không thu/chi, không thay MISA (không có cột tiền). Dữ liệu giả lập. Quyền kiểm tra trong DB
-- (dùng lại td_authorize của 0004), mọi kết quả kể cả từ chối ghi audit_log. Hoàn tất một nghĩa vụ KHÔNG hoàn tất hồ sơ cha.

CREATE TABLE th_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  case_ref text NOT NULL CHECK (btrim(case_ref) <> ''),
  agreement_ref text NOT NULL CHECK (btrim(agreement_ref) <> ''),          -- N-07: tham chiếu hợp đồng dịch vụ
  decision_ref text NOT NULL CHECK (btrim(decision_ref) <> ''),            -- quyết định/bản án liên quan (siêu dữ liệu)
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED')),
  handler_user_id uuid,
  completion_evidence_key text,
  completion_evidence_sha256 text,
  completed_by uuid,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT th_cases_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT th_cases_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id),
  CONSTRAINT th_cases_handler_fk FOREIGN KEY (handler_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT th_cases_done_chk CHECK (
    (status = 'COMPLETED') = (completion_evidence_key IS NOT NULL AND completion_evidence_sha256 IS NOT NULL
                              AND completed_by IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE TABLE th_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  kind text NOT NULL CHECK (kind IN ('PERSON', 'ORGANIZATION')),
  role text NOT NULL CHECK (role IN ('CREDITOR', 'DEBTOR', 'RELATED_PARTY', 'REPRESENTATIVE')),
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT th_parties_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT th_parties_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES th_cases (id, tenant_id)
);

CREATE TABLE th_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq >= 1),
  description text NOT NULL CHECK (btrim(description) <> ''),
  obligor_party_id uuid,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIAL', 'COMPLETED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT th_obligations_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT th_obligations_seq_uq UNIQUE (case_id, seq),
  CONSTRAINT th_obligations_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES th_cases (id, tenant_id),
  CONSTRAINT th_obligations_party_fk FOREIGN KEY (obligor_party_id, tenant_id) REFERENCES th_parties (id, tenant_id)
);

-- Lịch sử kết quả thực hiện: chỉ ghi thêm, không sửa/xoá. idem_key giúp ghi lại cùng một sự kiện không tạo bản sao.
CREATE TABLE th_obligation_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  obligation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PARTIAL_RESULT', 'COMPLETION', 'NOTE')),
  note text NOT NULL CHECK (btrim(note) <> ''),
  evidence_key text CHECK (evidence_key IS NULL OR (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)')),
  evidence_sha256 text CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
  idem_key text NOT NULL CHECK (btrim(idem_key) <> ''),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT th_events_idem_uq UNIQUE (obligation_id, idem_key),
  CONSTRAINT th_events_obligation_fk FOREIGN KEY (obligation_id, tenant_id) REFERENCES th_obligations (id, tenant_id),
  CONSTRAINT th_events_evidence_chk CHECK ((evidence_key IS NULL) = (evidence_sha256 IS NULL)),
  CONSTRAINT th_events_proof_chk CHECK (kind = 'NOTE' OR evidence_key IS NOT NULL)
);

CREATE TRIGGER th_obligation_events_ro BEFORE UPDATE OR DELETE ON th_obligation_events
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER th_parties_ro BEFORE UPDATE OR DELETE ON th_parties
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

CREATE FUNCTION th_cases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'enforcement cases are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'enforcement case is completed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.case_ref <> OLD.case_ref OR NEW.agreement_ref <> OLD.agreement_ref OR NEW.decision_ref <> OLD.decision_ref THEN
    RAISE EXCEPTION 'enforcement case identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER th_cases_guard_trg BEFORE UPDATE OR DELETE ON th_cases
  FOR EACH ROW EXECUTE FUNCTION th_cases_guard();

CREATE FUNCTION th_obligations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'obligations are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'obligation is completed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.case_id <> OLD.case_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.seq <> OLD.seq
     OR NEW.description <> OLD.description OR NEW.obligor_party_id IS DISTINCT FROM OLD.obligor_party_id THEN
    RAISE EXCEPTION 'obligation identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER th_obligations_guard_trg BEFORE UPDATE OR DELETE ON th_obligations
  FOR EACH ROW EXECUTE FUNCTION th_obligations_guard();

-- Nguồn chiếu: mỗi nghĩa vụ một dòng, đếm sự kiện, không lộ nội dung/khoá tệp.
CREATE VIEW th_obligation_book WITH (security_invoker = true) AS
SELECT o.tenant_id, c.office_id, c.branch_id, c.id AS case_id, c.case_ref, c.status AS case_status,
       o.id AS obligation_id, o.seq, o.status AS obligation_status,
       (SELECT count(*)::int FROM th_obligation_events e WHERE e.obligation_id = o.id AND e.tenant_id = o.tenant_id) AS events
FROM th_obligations o JOIN th_cases c ON c.id = o.case_id AND c.tenant_id = o.tenant_id;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['th_cases', 'th_parties', 'th_obligations', 'th_obligation_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- ---- Hàm nghiệp vụ ----

-- Tạo hồ sơ THA (N-07). label = id hồ sơ.
CREATE FUNCTION th_create_case(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_ref text, p_agreement text, p_decision text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; cid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.create', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.create', false, denied, p_office, p_branch, NULL); END IF;
  IF btrim(coalesce(p_ref, '')) = '' OR btrim(coalesce(p_agreement, '')) = '' OR btrim(coalesce(p_decision, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.create', false, 'REFERENCE_REQUIRED', p_office, p_branch, NULL);
  END IF;
  INSERT INTO th_cases (tenant_id, office_id, branch_id, case_ref, agreement_ref, decision_ref, created_by)
  VALUES (p_tenant, p_office, p_branch, btrim(p_ref), btrim(p_agreement), btrim(p_decision), p_actor) RETURNING id INTO cid;
  RETURN vibang_audit(p_tenant, p_actor, 'th.case.create', true, 'ALLOWED', p_office, p_branch, cid::text);
END $$;

CREATE FUNCTION th_assign(p_tenant uuid, p_actor uuid, p_case uuid, p_handler uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'th.assign', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.assign', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'th.assign', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_handler AND m.office_id = c.office_id AND m.role = 'THV') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.assign', false, 'INVALID_HANDLER', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE th_cases SET handler_user_id = p_handler WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'th.assign', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Thêm đương sự (người/tổ chức) với vai trò riêng. label = id đương sự.
CREATE FUNCTION th_add_party(p_tenant uuid, p_actor uuid, p_case uuid, p_name text, p_kind text, p_role text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text; pid uuid;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'th.party.add', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.party.add', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'th.party.add', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_name, '')) = '' OR p_kind IS NULL OR p_kind NOT IN ('PERSON', 'ORGANIZATION')
     OR p_role IS NULL OR p_role NOT IN ('CREDITOR', 'DEBTOR', 'RELATED_PARTY', 'REPRESENTATIVE') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.party.add', false, 'INVALID_PARTY', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO th_parties (tenant_id, case_id, display_name, kind, role, added_by) VALUES (p_tenant, p_case, btrim(p_name), p_kind, p_role, p_actor)
  RETURNING id INTO pid;
  RETURN vibang_audit(p_tenant, p_actor, 'th.party.add', true, 'ALLOWED', c.office_id, c.branch_id, pid::text);
END $$;

-- Thêm nghĩa vụ (có thể gắn bên có nghĩa vụ). label = id nghĩa vụ.
CREATE FUNCTION th_add_obligation(p_tenant uuid, p_actor uuid, p_case uuid, p_description text, p_obligor uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text; oid uuid; n integer;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'th.obligation.add', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.obligation.add', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'th.obligation.add', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_description, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.obligation.add', false, 'INVALID_OBLIGATION', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_obligor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM th_parties p WHERE p.id = p_obligor AND p.tenant_id = p_tenant AND p.case_id = p_case) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.obligation.add', false, 'PARTY_NOT_FOUND', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO n FROM th_obligations WHERE case_id = p_case AND tenant_id = p_tenant;
  INSERT INTO th_obligations (tenant_id, case_id, seq, description, obligor_party_id, created_by)
  VALUES (p_tenant, p_case, n, btrim(p_description), p_obligor, p_actor) RETURNING id INTO oid;
  RETURN vibang_audit(p_tenant, p_actor, 'th.obligation.add', true, 'ALLOWED', c.office_id, c.branch_id, oid::text);
END $$;

-- Ghi kết quả thực hiện của MỘT nghĩa vụ. PARTIAL_RESULT/COMPLETION cần bằng chứng; chỉ COMPLETION mới hoàn tất nghĩa vụ.
-- Cùng idem_key ghi lại cho kết quả ok (không tạo bản sao) để client thử lại an toàn.
CREATE FUNCTION th_record_event(p_tenant uuid, p_actor uuid, p_obligation uuid, p_kind text, p_note text,
  p_key text, p_sha text, p_idem text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE o th_obligations%ROWTYPE; c th_cases%ROWTYPE; denied text; eid bigint;
BEGIN
  SELECT * INTO o FROM th_obligations WHERE id = p_obligation AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', false, 'OBLIGATION_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM th_cases WHERE id = o.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_idem, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', false, 'IDEMPOTENCY_KEY_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT e.id INTO eid FROM th_obligation_events e WHERE e.obligation_id = p_obligation AND e.tenant_id = p_tenant AND e.idem_key = p_idem;
  IF eid IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', true, 'ALREADY_RECORDED', c.office_id, c.branch_id, eid::text);
  END IF;
  IF o.status = 'COMPLETED' OR c.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', false, 'OBLIGATION_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('PARTIAL_RESULT', 'COMPLETION', 'NOTE') OR btrim(coalesce(p_note, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', false, 'INVALID_EVENT', c.office_id, c.branch_id, NULL);
  END IF;
  IF (p_key IS NULL) <> (p_sha IS NULL) OR (p_key IS NOT NULL AND NOT vx_valid_evidence(p_key, p_sha)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_kind <> 'NOTE' AND p_key IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', false, 'EVIDENCE_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO th_obligation_events (tenant_id, obligation_id, kind, note, evidence_key, evidence_sha256, idem_key, actor_user_id)
  VALUES (p_tenant, p_obligation, p_kind, btrim(p_note), p_key, p_sha, p_idem, p_actor) RETURNING id INTO eid;
  IF p_kind = 'COMPLETION' THEN
    UPDATE th_obligations SET status = 'COMPLETED' WHERE id = p_obligation AND tenant_id = p_tenant;
  ELSIF p_kind = 'PARTIAL_RESULT' THEN
    UPDATE th_obligations SET status = 'PARTIAL' WHERE id = p_obligation AND tenant_id = p_tenant;
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'th.event.record', true, 'ALLOWED', c.office_id, c.branch_id, eid::text);
END $$;

-- Hoàn tất hồ sơ cha CHỈ khi có ≥1 nghĩa vụ, mọi nghĩa vụ đã COMPLETED và có bằng chứng hoàn tất ở cấp hồ sơ. Admin/Trưởng VP.
CREATE FUNCTION th_complete_case(p_tenant uuid, p_actor uuid, p_case uuid, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.complete', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.complete', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.complete', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.complete', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM th_obligations o WHERE o.case_id = p_case AND o.tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM th_obligations o WHERE o.case_id = p_case AND o.tenant_id = p_tenant AND o.status <> 'COMPLETED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.complete', false, 'OBLIGATIONS_NOT_COMPLETE', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE th_cases SET status = 'COMPLETED', completion_evidence_key = p_key, completion_evidence_sha256 = p_sha,
    completed_by = p_actor, completed_at = now() WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'th.case.complete', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;
