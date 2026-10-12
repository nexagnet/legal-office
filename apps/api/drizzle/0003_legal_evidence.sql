-- Lát #8: bằng chứng pháp lý của Vi bằng. Chỉ SIÊU DỮ LIỆU (khoá đối tượng, sha256, mime, kích thước); chưa có
-- kho tệp thật (thuộc #5). Dữ liệu giả lập. Bản scan giấy KHÔNG phải chữ ký số; giai đoạn 1 không có chữ ký số pháp lý.
-- Quyền kiểm tra trong DB; mọi kết quả (kể cả từ chối) ghi audit_log cùng transaction (xem 0002).

CREATE TABLE vibang_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('DRAFT_N03', 'DRAFT_N04', 'FINAL_SCAN', 'N11_CORRECTION')),
  version integer NOT NULL CHECK (version >= 1),
  source text NOT NULL CHECK (source IN ('GENERATED', 'UPLOADED')),
  object_key text NOT NULL CHECK (btrim(object_key) <> '' AND object_key !~ '(^/|\.\.)'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_documents_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT vibang_documents_version_uq UNIQUE (case_id, kind, version),
  CONSTRAINT vibang_documents_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id),
  -- Bản scan cuối chỉ nhận PDF (tệp khác cần review bảo mật tệp, ngoài phạm vi).
  CONSTRAINT vibang_documents_scan_pdf_chk CHECK (kind <> 'FINAL_SCAN' OR (mime = 'application/pdf' AND source = 'UPLOADED'))
);

CREATE TABLE vibang_evidence (
  case_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  signed_by uuid,
  signed_at timestamptz,
  stamped_by uuid,
  stamped_at timestamptz,
  final_scan_document_id uuid,
  final_scan_sha256 text,
  locked_at timestamptz,
  CONSTRAINT vibang_evidence_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id),
  CONSTRAINT vibang_evidence_doc_fk FOREIGN KEY (final_scan_document_id, tenant_id) REFERENCES vibang_documents (id, tenant_id),
  CONSTRAINT vibang_evidence_signed_chk CHECK ((signed_by IS NULL) = (signed_at IS NULL)),
  CONSTRAINT vibang_evidence_stamped_chk CHECK ((stamped_by IS NULL) = (stamped_at IS NULL)),
  CONSTRAINT vibang_evidence_scan_chk CHECK ((final_scan_document_id IS NULL) = (final_scan_sha256 IS NULL) AND (final_scan_document_id IS NULL) = (locked_at IS NULL))
);

-- Các mốc đã ghi và bản scan đã khoá thì không đổi, không xoá.
CREATE FUNCTION vibang_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (OLD.signed_by IS NOT NULL AND (NEW.signed_by IS DISTINCT FROM OLD.signed_by OR NEW.signed_at IS DISTINCT FROM OLD.signed_at))
     OR (OLD.stamped_by IS NOT NULL AND (NEW.stamped_by IS DISTINCT FROM OLD.stamped_by OR NEW.stamped_at IS DISTINCT FROM OLD.stamped_at))
     OR (OLD.final_scan_document_id IS NOT NULL AND (NEW.final_scan_document_id IS DISTINCT FROM OLD.final_scan_document_id
         OR NEW.final_scan_sha256 IS DISTINCT FROM OLD.final_scan_sha256 OR NEW.locked_at IS DISTINCT FROM OLD.locked_at)) THEN
    RAISE EXCEPTION 'vibang evidence is immutable once recorded' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vibang_evidence_guard_trg BEFORE UPDATE OR DELETE ON vibang_evidence
  FOR EACH ROW EXECUTE FUNCTION vibang_evidence_guard();
CREATE TRIGGER vibang_documents_ro BEFORE UPDATE OR DELETE ON vibang_documents
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Theo dõi đăng ký Sở/CSDL: ĐỘC LẬP với trạng thái hồ sơ; không bao giờ đổi RETURNED.
CREATE TABLE vibang_registrations (
  case_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED')),
  deadline_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_registrations_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);
CREATE TABLE vibang_registration_incidents (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('SO_REJECTED', 'SYSTEM_UNAVAILABLE', 'DEADLINE_MISSED', 'OTHER')),
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT vibang_incidents_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);

-- Nhắc/kết quả liên hệ khách thủ công: chỉ mã kết quả (không PII), KHÁC với trạng thái RETURNED.
CREATE TABLE vibang_contact_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('REMINDER', 'RESULT')),
  outcome text NOT NULL CHECK (outcome IN ('REMINDED', 'REACHED', 'NO_ANSWER')),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vibang_contact_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);
CREATE TRIGGER vibang_contact_ro BEFORE UPDATE OR DELETE ON vibang_contact_log
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- N-11: đính chính chính thức bản đã ký/đóng dấu. Tách khỏi Change Request 48h; không sửa hay xoá tài liệu cũ.
CREATE TABLE vibang_n11_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  before_document_id uuid,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'APPLIED')),
  correction_document_id uuid,
  signatory_user_id uuid,
  applied_at timestamptz,
  CONSTRAINT vibang_n11_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id),
  CONSTRAINT vibang_n11_before_fk FOREIGN KEY (before_document_id, tenant_id) REFERENCES vibang_documents (id, tenant_id),
  CONSTRAINT vibang_n11_doc_fk FOREIGN KEY (correction_document_id, tenant_id) REFERENCES vibang_documents (id, tenant_id),
  CONSTRAINT vibang_n11_applied_chk CHECK ((status = 'APPLIED') = (correction_document_id IS NOT NULL AND signatory_user_id IS NOT NULL AND applied_at IS NOT NULL))
);
CREATE FUNCTION vibang_n11_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'APPLIED'
     OR NEW.case_id <> OLD.case_id OR NEW.reason <> OLD.reason OR NEW.requested_by <> OLD.requested_by
     OR NEW.before_document_id IS DISTINCT FROM OLD.before_document_id THEN
    RAISE EXCEPTION 'applied N-11 correction is immutable; content is frozen' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vibang_n11_guard_trg BEFORE UPDATE OR DELETE ON vibang_n11_corrections
  FOR EACH ROW EXECUTE FUNCTION vibang_n11_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vibang_documents', 'vibang_evidence', 'vibang_registrations', 'vibang_registration_incidents', 'vibang_contact_log', 'vibang_n11_corrections'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- Cổng DB (thay các kiểm tra mảng `proofs` còn lại): SIGNED cần số + THV xác nhận đã ký; STAMPED cần đã ký;
-- RETURNED cần Văn thư xác nhận đóng dấu, bản scan cuối đã khoá hash, MISA xác nhận đầy đủ không thu hồi chờ.
CREATE OR REPLACE FUNCTION vibang_cases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev vibang_evidence%ROWTYPE;
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
    IF NEW.status <> OLD.status AND NEW.status IN ('SIGNED', 'STAMPED', 'RETURNED') THEN
      SELECT * INTO ev FROM vibang_evidence WHERE case_id = NEW.id AND tenant_id = NEW.tenant_id;
      IF NEW.status = 'SIGNED' AND (NOT EXISTS (SELECT 1 FROM vibang_numbers n WHERE n.case_id = NEW.id AND n.tenant_id = NEW.tenant_id)
                                    OR ev.signed_by IS NULL) THEN
        RAISE EXCEPTION 'missing legal proof for SIGNED: number or signature confirmation' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'STAMPED' AND ev.signed_by IS NULL THEN
        RAISE EXCEPTION 'missing legal proof for STAMPED: signature confirmation' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'RETURNED' AND (
        ev.stamped_by IS NULL OR ev.final_scan_document_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM vibang_misa_confirmations s
          WHERE s.case_id = NEW.id AND s.tenant_id = NEW.tenant_id
            AND s.status = 'CONFIRMED_FULL' AND s.revoke_status = 'NONE')
      ) THEN
        RAISE EXCEPTION 'missing legal proof for RETURNED' USING ERRCODE = 'check_violation';
      END IF;
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

-- ---- Hàm nghiệp vụ ----

-- NULL nếu hợp lệ. THV chỉ khi là THV phụ trách; Văn thư/Kế toán cần chi nhánh được cấp; Admin/Thư ký/Trưởng VP theo văn phòng.
CREATE FUNCTION vibang_authorize(p_tenant uuid, p_user uuid, c vibang_cases, p_roles text[])
RETURNS text LANGUAGE plpgsql AS $$
DECLARE has_role boolean; has_thv boolean;
BEGIN
  SELECT bool_or(true), coalesce(bool_or(m.role = 'THV'), false) INTO has_role, has_thv
  FROM memberships m
  WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = c.office_id AND m.role = ANY (p_roles);
  IF has_role IS NULL THEN RETURN 'ROLE_LACKS_PERMISSION'; END IF;
  IF EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = c.office_id AND m.role = ANY (p_roles)
      AND ((m.role = 'THV' AND c.responsible_thv_user_id = p_user)
        OR (m.role IN ('VAN_THU', 'KE_TOAN') AND EXISTS (
              SELECT 1 FROM branch_grants g WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND g.branch_id = c.branch_id))
        OR m.role IN ('ADMIN', 'THU_KY', 'TRUONG_VP'))
  ) THEN RETURN NULL; END IF;
  RETURN CASE WHEN has_thv THEN 'NOT_RESPONSIBLE_THV' ELSE 'BRANCH_NOT_GRANTED' END;
END $$;

-- Lưu siêu dữ liệu một phiên bản tài liệu (bản nháp N-03/N-04, bản scan cuối, văn bản N-11). Phiên bản tự tăng.
CREATE FUNCTION vibang_add_document(p_tenant uuid, p_case uuid, p_actor uuid, p_kind text, p_source text,
  p_object_key text, p_sha256 text, p_mime text, p_size bigint)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text; v integer; ok_input boolean;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.document.add', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c,
    CASE WHEN p_kind = 'FINAL_SCAN' THEN ARRAY['VAN_THU', 'THV'] ELSE ARRAY['ADMIN', 'THV', 'THU_KY', 'VAN_THU'] END);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.document.add', false, denied, c.office_id, c.branch_id, NULL); END IF;
  -- Hồ sơ đã trả vẫn nhận văn bản N-11 (đính chính); mọi loại khác bị chặn.
  IF c.status = 'CANCELLED' OR (c.status = 'RETURNED' AND p_kind <> 'N11_CORRECTION') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.document.add', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  ok_input := p_kind IN ('DRAFT_N03', 'DRAFT_N04', 'FINAL_SCAN', 'N11_CORRECTION') AND p_source IN ('GENERATED', 'UPLOADED')
    AND p_sha256 ~ '^[0-9a-f]{64}$' AND p_size > 0 AND btrim(coalesce(p_object_key, '')) <> '' AND p_object_key !~ '(^/|\.\.)'
    AND p_mime IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  IF NOT ok_input OR (p_kind = 'FINAL_SCAN' AND (p_mime <> 'application/pdf' OR p_source <> 'UPLOADED')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.document.add', false, 'INVALID_DOCUMENT', c.office_id, c.branch_id, NULL);
  END IF;
  -- Bản scan cuối chỉ hợp lệ khi đã có xác nhận đóng dấu.
  IF p_kind = 'FINAL_SCAN' AND NOT EXISTS (SELECT 1 FROM vibang_evidence e WHERE e.case_id = p_case AND e.tenant_id = p_tenant AND e.stamped_by IS NOT NULL) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.document.add', false, 'STAMP_NOT_CONFIRMED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v FROM vibang_documents WHERE case_id = p_case AND tenant_id = p_tenant AND kind = p_kind;
  INSERT INTO vibang_documents (tenant_id, case_id, kind, version, source, object_key, sha256, mime, size_bytes, created_by)
  VALUES (p_tenant, p_case, p_kind, v, p_source, p_object_key, p_sha256, p_mime, p_size, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.document.add', true, 'ALLOWED', c.office_id, c.branch_id, p_kind || ' v' || v);
END $$;

-- THV phụ trách xác nhận ĐÃ KÝ (ngoài phần mềm). Hồ sơ phải ASSIGNED và đã có số.
CREATE FUNCTION vibang_confirm_signed(p_tenant uuid, p_case uuid, p_actor uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.sign.confirm', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['THV']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.sign.confirm', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'ASSIGNED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.sign.confirm', false, 'INVALID_CASE_STATUS', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vibang_numbers n WHERE n.case_id = p_case AND n.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.sign.confirm', false, 'NUMBER_NOT_ALLOCATED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_evidence (case_id, tenant_id, signed_by, signed_at) VALUES (p_case, p_tenant, p_actor, now())
  ON CONFLICT (case_id) DO UPDATE SET signed_by = EXCLUDED.signed_by, signed_at = EXCLUDED.signed_at;
  UPDATE vibang_cases SET status = 'SIGNED', version = version + 1 WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.sign.confirm', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Văn thư (có chi nhánh) xác nhận ĐÃ ĐÓNG DẤU, sau khi THV xác nhận đã ký.
CREATE FUNCTION vibang_confirm_stamped(p_tenant uuid, p_case uuid, p_actor uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.stamp.confirm', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['VAN_THU']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.stamp.confirm', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'SIGNED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.stamp.confirm', false, 'INVALID_CASE_STATUS', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vibang_evidence SET stamped_by = p_actor, stamped_at = now() WHERE case_id = p_case AND tenant_id = p_tenant;
  UPDATE vibang_cases SET status = 'STAMPED', version = version + 1 WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.stamp.confirm', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Trả hồ sơ: cần STAMPED, bản scan cuối (khoá đúng phiên bản + sha256 mới nhất), MISA đầy đủ không thu hồi chờ.
-- Đăng ký Sở KHÔNG là điều kiện. Từ chối trả về mã cụ thể.
CREATE FUNCTION vibang_return_case(p_tenant uuid, p_case uuid, p_actor uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text; ev vibang_evidence%ROWTYPE; s vibang_misa_confirmations%ROWTYPE; d vibang_documents%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['VAN_THU', 'THV']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'STAMPED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, 'INVALID_CASE_STATUS', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO ev FROM vibang_evidence WHERE case_id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR ev.signed_by IS NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, 'SIGNATURE_NOT_CONFIRMED', c.office_id, c.branch_id, NULL); END IF;
  IF ev.stamped_by IS NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, 'STAMP_NOT_CONFIRMED', c.office_id, c.branch_id, NULL); END IF;
  SELECT * INTO s FROM vibang_misa_confirmations WHERE case_id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND OR s.status <> 'CONFIRMED_FULL' THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, 'MISA_NOT_CONFIRMED', c.office_id, c.branch_id, NULL); END IF;
  IF s.revoke_status <> 'NONE' THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, 'REVOKE_PENDING', c.office_id, c.branch_id, NULL); END IF;
  SELECT * INTO d FROM vibang_documents WHERE case_id = p_case AND tenant_id = p_tenant AND kind = 'FINAL_SCAN' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', false, 'FINAL_SCAN_MISSING', c.office_id, c.branch_id, NULL); END IF;
  UPDATE vibang_evidence SET final_scan_document_id = d.id, final_scan_sha256 = d.sha256, locked_at = now()
  WHERE case_id = p_case AND tenant_id = p_tenant;
  UPDATE vibang_cases SET status = 'RETURNED', version = version + 1 WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.return', true, 'ALLOWED', c.office_id, c.branch_id, d.sha256);
END $$;

-- Cập nhật theo dõi Sở/CSDL. Cho phép cả sau RETURNED; không bao giờ đổi trạng thái hồ sơ hay tệp đã ký.
CREATE FUNCTION vibang_set_registration(p_tenant uuid, p_case uuid, p_actor uuid, p_status text, p_deadline timestamptz, p_reason_code text DEFAULT NULL)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text; cur vibang_registrations%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.registration.set', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['ADMIN', 'THV', 'THU_KY', 'VAN_THU']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.registration.set', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF p_status NOT IN ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED') OR p_deadline IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.registration.set', false, 'INVALID_REGISTRATION', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.status IN ('INTAKE', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.registration.set', false, 'INVALID_CASE_STATUS', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_status = 'FAILED' AND (p_reason_code IS NULL OR p_reason_code NOT IN ('SO_REJECTED', 'SYSTEM_UNAVAILABLE', 'DEADLINE_MISSED', 'OTHER')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.registration.set', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO cur FROM vibang_registrations WHERE case_id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF FOUND AND cur.status = 'CONFIRMED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.registration.set', false, 'REGISTRATION_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_registrations (case_id, tenant_id, status, deadline_at, updated_by) VALUES (p_case, p_tenant, p_status, p_deadline, p_actor)
  ON CONFLICT (case_id) DO UPDATE SET status = EXCLUDED.status, deadline_at = EXCLUDED.deadline_at, updated_by = EXCLUDED.updated_by, updated_at = now();
  IF p_status = 'FAILED' THEN
    INSERT INTO vibang_registration_incidents (tenant_id, case_id, reason_code, opened_by) VALUES (p_tenant, p_case, p_reason_code, p_actor);
  ELSIF p_status = 'CONFIRMED' THEN
    UPDATE vibang_registration_incidents SET resolved_at = now() WHERE case_id = p_case AND tenant_id = p_tenant AND resolved_at IS NULL;
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.registration.set', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Nhắc/kết quả liên hệ khách (thủ công, chỉ mã). Không đổi trạng thái hồ sơ.
CREATE FUNCTION vibang_log_contact(p_tenant uuid, p_case uuid, p_actor uuid, p_kind text, p_outcome text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.contact.log', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['ADMIN', 'THV', 'THU_KY', 'VAN_THU']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.contact.log', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF p_kind NOT IN ('REMINDER', 'RESULT') OR p_outcome NOT IN ('REMINDED', 'REACHED', 'NO_ANSWER') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.contact.log', false, 'INVALID_CONTACT', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vibang_contact_log (tenant_id, case_id, kind, outcome, actor_user_id) VALUES (p_tenant, p_case, p_kind, p_outcome, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.contact.log', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- N-11: đề xuất đính chính bản đã ký (Admin hoặc THV phụ trách). Chưa đổi gì; ghi lại bản scan hiện hành làm "trước".
CREATE FUNCTION vibang_propose_n11(p_tenant uuid, p_case uuid, p_actor uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text; before_id uuid;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.propose', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['ADMIN', 'THV']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.propose', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status NOT IN ('SIGNED', 'STAMPED', 'RETURNED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.propose', false, 'NOT_SIGNED_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.propose', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT id INTO before_id FROM vibang_documents WHERE case_id = p_case AND tenant_id = p_tenant AND kind = 'FINAL_SCAN' ORDER BY version DESC LIMIT 1;
  INSERT INTO vibang_n11_corrections (tenant_id, case_id, reason, requested_by, before_document_id) VALUES (p_tenant, p_case, btrim(p_reason), p_actor, before_id);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.propose', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- N-11: chỉ thành viên có cấp phép ký pháp lý (memberships.legal_signer) áp dụng, kèm văn bản N-11 đã lưu. Không sửa tài liệu cũ.
CREATE FUNCTION vibang_apply_n11(p_tenant uuid, p_correction uuid, p_actor uuid, p_document uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE k vibang_n11_corrections%ROWTYPE; c vibang_cases%ROWTYPE; d vibang_documents%ROWTYPE;
BEGIN
  SELECT * INTO k FROM vibang_n11_corrections WHERE id = p_correction AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.apply', false, 'CORRECTION_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM vibang_cases WHERE id = k.case_id AND tenant_id = p_tenant;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.apply', false, 'SIGNING_AUTHORITY_NOT_GRANTED', c.office_id, c.branch_id, NULL);
  END IF;
  IF k.status <> 'PROPOSED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.apply', false, 'ALREADY_APPLIED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO d FROM vibang_documents WHERE id = p_document AND tenant_id = p_tenant AND case_id = k.case_id AND kind = 'N11_CORRECTION';
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.apply', false, 'CORRECTION_DOCUMENT_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vibang_n11_corrections SET status = 'APPLIED', correction_document_id = d.id, signatory_user_id = p_actor, applied_at = now()
  WHERE id = p_correction AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.n11.apply', true, 'ALLOWED', c.office_id, c.branch_id, d.sha256);
END $$;
