-- Lát #7: xác nhận MISA thủ công (chỉ trạng thái, KHÔNG số tiền), đánh số Vi bằng toàn văn phòng theo năm,
-- cổng thu hồi. Dữ liệu giả lập. MISA là sổ kế toán duy nhất; ở đây không có bảng thu/chi/công nợ/VAT.
-- Quyền được kiểm tra Ở TẦNG DB trong từng hàm (vai + chi nhánh được cấp), và MỌI kết quả (kể cả từ chối)
-- được ghi vào audit_log trong cùng transaction. Từ chối trả về mã, không ném lỗi, để audit không bị rollback.

CREATE TYPE vibang_op AS (ok boolean, code text, label text);

CREATE TABLE vibang_misa_confirmations (
  case_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('NOT_CONFIRMED', 'CONFIRMED_FULL')),
  reference text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  revoke_status text NOT NULL DEFAULT 'NONE' CHECK (revoke_status IN ('NONE', 'PROPOSED')),
  revoke_reason text,
  revoke_proposed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_misa_case_tenant_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id),
  CONSTRAINT vibang_misa_confirmed_chk CHECK (status <> 'CONFIRMED_FULL' OR (btrim(coalesce(reference, '')) <> '' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CONSTRAINT vibang_misa_revoke_chk CHECK (revoke_status = 'NONE' OR (status = 'CONFIRMED_FULL' AND btrim(coalesce(revoke_reason, '')) <> '' AND revoke_proposed_by IS NOT NULL))
);

-- Lịch sử chỉ ghi thêm của mọi thay đổi xác nhận/thu hồi.
CREATE TABLE vibang_misa_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('CONFIRMED_FULL', 'NOT_CONFIRMED', 'REVOKE_PROPOSED', 'REVOKE_ACCEPTED', 'REVOKE_REJECTED')),
  actor_user_id uuid NOT NULL,
  reference text,
  reason text,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_misa_events_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);

CREATE TABLE vibang_number_counters (
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  last_seq integer NOT NULL CHECK (last_seq >= 0),
  PRIMARY KEY (tenant_id, office_id, year),
  CONSTRAINT vibang_counters_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE TABLE vibang_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  case_id uuid NOT NULL,
  year integer NOT NULL,
  seq integer NOT NULL CHECK (seq >= 1),
  label text NOT NULL,
  allocated_by uuid NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_numbers_case_uq UNIQUE (case_id),
  CONSTRAINT vibang_numbers_seq_uq UNIQUE (tenant_id, office_id, year, seq),
  CONSTRAINT vibang_numbers_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id),
  CONSTRAINT vibang_numbers_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE TABLE vibang_number_imports (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  year integer NOT NULL,
  previous_seq integer NOT NULL,
  imported_seq integer NOT NULL,
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_imports_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE FUNCTION vibang_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER vibang_misa_events_ro BEFORE UPDATE OR DELETE ON vibang_misa_events
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER vibang_numbers_ro BEFORE UPDATE OR DELETE ON vibang_numbers
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER vibang_imports_ro BEFORE UPDATE OR DELETE ON vibang_number_imports
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Bộ đếm chỉ tăng; không bao giờ tái sử dụng số (kể cả khi hồ sơ bị huỷ). Không xoá.
CREATE FUNCTION vibang_counter_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.last_seq < OLD.last_seq
     OR NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.year <> OLD.year THEN
    RAISE EXCEPTION 'number counters only move forward' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vibang_counter_guard_trg BEFORE UPDATE OR DELETE ON vibang_number_counters
  FOR EACH ROW EXECUTE FUNCTION vibang_counter_guard();

-- Hàng trong vibang_misa_confirmations không được xoá.
CREATE TRIGGER vibang_misa_no_delete BEFORE DELETE ON vibang_misa_confirmations
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vibang_misa_confirmations', 'vibang_misa_events', 'vibang_number_counters', 'vibang_numbers', 'vibang_number_imports'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- Cổng DB: chuyển SIGNED cần có số đã cấp; RETURNED cần xác nhận MISA đầy đủ, KHÔNG có đề xuất thu hồi đang chờ,
-- và bản scan cuối. Thay thế kiểm tra mảng `proofs` của lát #6 bằng dữ liệu thật của lát này.
CREATE OR REPLACE FUNCTION vibang_cases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vibang_cases rows are never hard-deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'INTAKE' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'new vibang case must start as INTAKE version 1' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF OLD.status IN ('RETURNED', 'CANCELLED') THEN
      RAISE EXCEPTION 'vibang case is final (%)', OLD.status USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.branch_id <> OLD.branch_id
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'tenant, office, branch and created_at are immutable' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status = 'INTAKE'   AND NEW.status IN ('ASSIGNED', 'CANCELLED')) OR
      (OLD.status = 'ASSIGNED' AND NEW.status IN ('SIGNED', 'CANCELLED')) OR
      (OLD.status = 'SIGNED'   AND NEW.status IN ('STAMPED', 'CANCELLED')) OR
      (OLD.status = 'STAMPED'  AND NEW.status IN ('RETURNED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'invalid vibang transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'SIGNED' AND OLD.status <> 'SIGNED' AND NOT EXISTS (
      SELECT 1 FROM vibang_numbers n WHERE n.case_id = NEW.id AND n.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'missing legal proof for SIGNED: number not allocated' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'RETURNED' AND OLD.status <> 'RETURNED' AND (
      NOT EXISTS (
        SELECT 1 FROM vibang_misa_confirmations s
        WHERE s.case_id = NEW.id AND s.tenant_id = NEW.tenant_id
          AND s.status = 'CONFIRMED_FULL' AND s.revoke_status = 'NONE')
      OR NOT ('FINAL_SCAN_WITH_SIGNATURE_AND_STAMP' = ANY (NEW.proofs))
    ) THEN
      RAISE EXCEPTION 'missing legal proof for RETURNED' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.responsible_thv_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = NEW.responsible_thv_user_id AND m.tenant_id = NEW.tenant_id
      AND m.role = 'THV' AND m.office_id = NEW.office_id
  ) THEN
    RAISE EXCEPTION 'responsible THV must be a THV member of the same office' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---- Hàm nghiệp vụ. SECURITY INVOKER: RLS theo app.tenant_id vẫn áp dụng cho người gọi. ----

-- NULL nếu hợp lệ, ngược lại là mã từ chối. p_need_branch: vai cần được cấp đúng chi nhánh.
CREATE FUNCTION vibang_actor_check(p_tenant uuid, p_user uuid, p_office uuid, p_branch uuid, p_role text, p_need_branch boolean)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE m_id uuid;
BEGIN
  SELECT m.id INTO m_id FROM memberships m
  WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office AND m.role = p_role
  LIMIT 1;
  IF m_id IS NULL THEN RETURN 'ROLE_LACKS_PERMISSION'; END IF;
  IF p_need_branch AND NOT EXISTS (
    SELECT 1 FROM branch_grants g WHERE g.membership_id = m_id AND g.tenant_id = p_tenant AND g.branch_id = p_branch
  ) THEN RETURN 'BRANCH_NOT_GRANTED'; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION vibang_audit(p_tenant uuid, p_actor uuid, p_action text, p_ok boolean, p_reason text, p_office uuid, p_branch uuid, p_label text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_log (tenant_id, actor_id, action, outcome, reason, office_id, branch_id)
  VALUES (p_tenant, p_actor::text, p_action, CASE WHEN p_ok THEN 'allow' ELSE 'deny' END, p_reason, p_office, p_branch);
  RETURN ROW(p_ok, p_reason, p_label)::vibang_op;
END $$;

-- Kế toán (có chi nhánh) ghi tay trạng thái MISA. Không nhận số tiền.
CREATE FUNCTION vibang_record_misa(p_tenant uuid, p_case uuid, p_actor uuid, p_status text, p_reference text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; s vibang_misa_confirmations%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_actor_check(p_tenant, p_actor, c.office_id, c.branch_id, 'KE_TOAN', true);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF p_status NOT IN ('NOT_CONFIRMED', 'CONFIRMED_FULL') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', false, 'INVALID_STATUS', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_status = 'CONFIRMED_FULL' AND btrim(coalesce(p_reference, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', false, 'REFERENCE_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO s FROM vibang_misa_confirmations WHERE case_id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF FOUND AND s.revoke_status = 'PROPOSED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', false, 'REVOKE_PENDING', c.office_id, c.branch_id, NULL);
  END IF;
  -- Đã cấp số thì không hạ xác nhận trực tiếp; phải đi đường đề xuất thu hồi + Admin duyệt.
  IF p_status = 'NOT_CONFIRMED' AND EXISTS (SELECT 1 FROM vibang_numbers n WHERE n.case_id = p_case AND n.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', false, 'USE_REVOKE_AFTER_NUMBER', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_misa_confirmations (case_id, tenant_id, status, reference, confirmed_by, confirmed_at)
  VALUES (p_case, p_tenant, p_status,
          CASE WHEN p_status = 'CONFIRMED_FULL' THEN btrim(p_reference) END,
          CASE WHEN p_status = 'CONFIRMED_FULL' THEN p_actor END,
          CASE WHEN p_status = 'CONFIRMED_FULL' THEN now() END)
  ON CONFLICT (case_id) DO UPDATE SET status = EXCLUDED.status, reference = EXCLUDED.reference,
    confirmed_by = EXCLUDED.confirmed_by, confirmed_at = EXCLUDED.confirmed_at, updated_at = now();
  INSERT INTO vibang_misa_events (tenant_id, case_id, event, actor_user_id, reference)
  VALUES (p_tenant, p_case, p_status, p_actor, CASE WHEN p_status = 'CONFIRMED_FULL' THEN btrim(p_reference) END);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.record', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Kế toán đề xuất thu hồi xác nhận; trong lúc chờ, xác nhận bị coi là chưa đủ để trả hồ sơ.
CREATE FUNCTION vibang_propose_revoke(p_tenant uuid, p_case uuid, p_actor uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; s vibang_misa_confirmations%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.propose_revoke', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_actor_check(p_tenant, p_actor, c.office_id, c.branch_id, 'KE_TOAN', true);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.propose_revoke', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.propose_revoke', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.propose_revoke', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO s FROM vibang_misa_confirmations WHERE case_id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR s.status <> 'CONFIRMED_FULL' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.propose_revoke', false, 'NOT_CONFIRMED', c.office_id, c.branch_id, NULL);
  END IF;
  IF s.revoke_status = 'PROPOSED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.propose_revoke', false, 'REVOKE_ALREADY_PENDING', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vibang_misa_confirmations SET revoke_status = 'PROPOSED', revoke_reason = btrim(p_reason),
    revoke_proposed_by = p_actor, updated_at = now() WHERE case_id = p_case AND tenant_id = p_tenant;
  INSERT INTO vibang_misa_events (tenant_id, case_id, event, actor_user_id, reason)
  VALUES (p_tenant, p_case, 'REVOKE_PROPOSED', p_actor, btrim(p_reason));
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.propose_revoke', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Chỉ Admin của văn phòng quyết định. Chấp nhận: xác nhận về NOT_CONFIRMED; số đã cấp và bản ký giữ nguyên.
CREATE FUNCTION vibang_decide_revoke(p_tenant uuid, p_case uuid, p_actor uuid, p_accept boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; s vibang_misa_confirmations%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_actor_check(p_tenant, p_actor, c.office_id, c.branch_id, 'ADMIN', false);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, CASE WHEN denied = 'ROLE_LACKS_PERMISSION' THEN 'ADMIN_ONLY' ELSE denied END, c.office_id, c.branch_id, NULL);
  END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO s FROM vibang_misa_confirmations WHERE case_id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR s.revoke_status <> 'PROPOSED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, 'NO_PENDING_REVOKE', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_accept THEN
    UPDATE vibang_misa_confirmations SET status = 'NOT_CONFIRMED', reference = NULL, confirmed_by = NULL,
      confirmed_at = NULL, revoke_status = 'NONE', updated_at = now() WHERE case_id = p_case AND tenant_id = p_tenant;
  ELSE
    UPDATE vibang_misa_confirmations SET revoke_status = 'NONE', updated_at = now()
    WHERE case_id = p_case AND tenant_id = p_tenant;
  END IF;
  INSERT INTO vibang_misa_events (tenant_id, case_id, event, actor_user_id, reason)
  VALUES (p_tenant, p_case, CASE WHEN p_accept THEN 'REVOKE_ACCEPTED' ELSE 'REVOKE_REJECTED' END, p_actor, s.revoke_reason);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Văn thư (có chi nhánh) cấp số đúng một lần cho mỗi hồ sơ, sau khi MISA xác nhận đầy đủ và không có thu hồi chờ.
-- Số = <seq>/<năm>/VB-THV, đếm theo VĂN PHÒNG, reset theo năm (múi giờ Asia/Ho_Chi_Minh). Gọi lại là idempotent.
CREATE FUNCTION vibang_allocate_number(p_tenant uuid, p_case uuid, p_actor uuid, p_at timestamptz DEFAULT now())
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; s vibang_misa_confirmations%ROWTYPE; ex vibang_numbers%ROWTYPE;
        denied text; y integer; n integer; lbl text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.allocate', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_actor_check(p_tenant, p_actor, c.office_id, c.branch_id, 'VAN_THU', true);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.allocate', false, denied, c.office_id, c.branch_id, NULL); END IF;
  SELECT * INTO ex FROM vibang_numbers WHERE case_id = p_case AND tenant_id = p_tenant;
  IF FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.allocate', true, 'ALREADY_ALLOCATED', c.office_id, c.branch_id, ex.label);
  END IF;
  IF c.status <> 'ASSIGNED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.allocate', false, 'INVALID_CASE_STATUS', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO s FROM vibang_misa_confirmations WHERE case_id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND OR s.status <> 'CONFIRMED_FULL' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.allocate', false, 'MISA_NOT_CONFIRMED', c.office_id, c.branch_id, NULL);
  END IF;
  IF s.revoke_status <> 'NONE' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.allocate', false, 'REVOKE_PENDING', c.office_id, c.branch_id, NULL);
  END IF;
  y := extract(year FROM p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  INSERT INTO vibang_number_counters (tenant_id, office_id, year, last_seq) VALUES (p_tenant, c.office_id, y, 1)
  ON CONFLICT (tenant_id, office_id, year) DO UPDATE SET last_seq = vibang_number_counters.last_seq + 1
  RETURNING last_seq INTO n;
  lbl := n || '/' || y || '/VB-THV';
  INSERT INTO vibang_numbers (tenant_id, office_id, case_id, year, seq, label, allocated_by, allocated_at)
  VALUES (p_tenant, c.office_id, p_case, y, n, lbl, p_actor, p_at);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.allocate', true, 'ALLOWED', c.office_id, c.branch_id, lbl);
END $$;

-- Admin nhập số cuối đã dùng ngoài hệ thống (đã được xác minh) cho một năm. Chỉ tiến, không lùi.
CREATE FUNCTION vibang_import_last_number(p_tenant uuid, p_office uuid, p_actor uuid, p_year integer, p_last integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; prev integer;
BEGIN
  denied := vibang_actor_check(p_tenant, p_actor, p_office, NULL, 'ADMIN', false);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.import', false, CASE WHEN denied = 'ROLE_LACKS_PERMISSION' THEN 'ADMIN_ONLY' ELSE denied END, p_office, NULL, NULL);
  END IF;
  IF p_year NOT BETWEEN 2000 AND 2100 OR p_last < 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.import', false, 'INVALID_NUMBER', p_office, NULL, NULL);
  END IF;
  SELECT last_seq INTO prev FROM vibang_number_counters
  WHERE tenant_id = p_tenant AND office_id = p_office AND year = p_year FOR UPDATE;
  IF FOUND AND prev > p_last THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.import', false, 'WOULD_MOVE_BACKWARDS', p_office, NULL, NULL);
  END IF;
  INSERT INTO vibang_number_counters (tenant_id, office_id, year, last_seq) VALUES (p_tenant, p_office, p_year, p_last)
  ON CONFLICT (tenant_id, office_id, year) DO UPDATE SET last_seq = EXCLUDED.last_seq;
  INSERT INTO vibang_number_imports (tenant_id, office_id, year, previous_seq, imported_seq, actor_user_id)
  VALUES (p_tenant, p_office, p_year, coalesce(prev, 0), p_last, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.number.import', true, 'ALLOWED', p_office, NULL, NULL);
END $$;
