-- Hạn pháp định tự sinh theo NĐ 151/2026 (chủ dự án ủy quyền chọn đề xuất tốt nhất 21/10/2026; giả định ghi trong docs):
--   TD_RESULT_REPORT  Điều 25.2  báo kết quả tống đạt cho cơ quan yêu cầu: 2 ngày làm việc kể từ ngày tống đạt xong
--   VB_N11_CSDL       Điều 31.3  cập nhật CSDL + gửi văn bản sửa lỗi cho người yêu cầu: 2 ngày làm việc kể từ ngày lập văn bản N-11
--   VX_DECISION       Điều 35.1  Trưởng VP ra quyết định xác minh: 3 ngày làm việc kể từ ngày ký hợp đồng dịch vụ xác minh
--   TH_REVOKE         Điều 46.1  Trưởng VP ra quyết định thu hồi quyết định THA: 2 ngày làm việc kể từ ngày chấm dứt THA/thanh lý hợp đồng
-- "Trừ trường hợp các bên có thỏa thuận khác" => Admin/Trưởng VP ghi hạn thỏa thuận kèm lý do (of_deadline_agree).
-- Hạn là hạn để NHẮC: không chặn, không đổi trạng thái hồ sơ. Hạn tính theo lịch làm việc của văn phòng (0026), hết ngày 23:59:59 giờ Việt Nam.
-- Kèm Điều 46: chấm dứt tổ chức THA khi chưa hoàn tất nghĩa vụ (th_terminate_case). Dữ liệu giả lập; không số tiền.

CREATE TABLE office_statutory_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('TD_RESULT_REPORT', 'VB_N11_CSDL', 'VX_DECISION', 'TH_REVOKE')),
  ref_id uuid NOT NULL,
  case_id uuid NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  handler_user_id uuid,
  start_at timestamptz NOT NULL,
  working_days smallint NOT NULL CHECK (working_days BETWEEN 1 AND 30),
  due_at timestamptz NOT NULL,
  agreed_note text CHECK (agreed_note IS NULL OR btrim(agreed_note) <> ''),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE')),
  done_by uuid,
  done_at timestamptz,
  done_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_statutory_deadlines_ref_uq UNIQUE (tenant_id, kind, ref_id),
  CONSTRAINT office_statutory_deadlines_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT office_statutory_deadlines_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id),
  CONSTRAINT office_statutory_deadlines_done_chk CHECK ((status = 'DONE') = (done_by IS NOT NULL AND done_at IS NOT NULL AND btrim(coalesce(done_note, '')) <> ''))
);
CREATE INDEX office_statutory_deadlines_open_idx ON office_statutory_deadlines (tenant_id, office_id, due_at) WHERE status = 'OPEN';
ALTER TABLE office_statutory_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_statutory_deadlines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON office_statutory_deadlines
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Hạn sau N ngày làm việc (không tính ngày bắt đầu), hết ngày làm việc cuối 23:59:59 giờ Việt Nam. Cùng quy tắc working-days.ts.
CREATE FUNCTION of_working_due(p_tenant uuid, p_office uuid, p_start timestamptz, p_days integer)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE wd smallint[]; d date; remaining integer := p_days; scanned integer := 0;
BEGIN
  SELECT c.work_weekdays INTO wd FROM office_calendar c WHERE c.office_id = p_office AND c.tenant_id = p_tenant;
  wd := coalesce(wd, ARRAY[1, 2, 3, 4, 5]::smallint[]);
  d := (p_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  LOOP
    EXIT WHEN remaining <= 0 AND extract(isodow FROM d)::smallint = ANY (wd)
      AND NOT EXISTS (SELECT 1 FROM office_holidays h WHERE h.office_id = p_office AND h.tenant_id = p_tenant AND h.day = d);
    scanned := scanned + 1;
    IF scanned > 7300 THEN RAISE EXCEPTION 'calendar has no reachable working day' USING ERRCODE = 'data_exception'; END IF;
    d := d + 1;
    IF remaining > 0 AND extract(isodow FROM d)::smallint = ANY (wd)
       AND NOT EXISTS (SELECT 1 FROM office_holidays h WHERE h.office_id = p_office AND h.tenant_id = p_tenant AND h.day = d) THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  RETURN ((d + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '1 second';
END $$;

CREATE FUNCTION of_statutory_open(p_tenant uuid, p_office uuid, p_branch uuid, p_kind text, p_ref uuid, p_case uuid,
  p_label text, p_handler uuid, p_start timestamptz, p_days integer)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO office_statutory_deadlines (tenant_id, office_id, branch_id, kind, ref_id, case_id, label, handler_user_id, start_at, working_days, due_at)
  VALUES (p_tenant, p_office, p_branch, p_kind, p_ref, p_case, p_label, p_handler, p_start, p_days, of_working_due(p_tenant, p_office, p_start, p_days))
  ON CONFLICT (tenant_id, kind, ref_id) DO NOTHING
$$;

-- Điều 25.2: văn bản tống đạt xong (kết quả cuối) => hạn báo kết quả.
CREATE FUNCTION td_documents_deadline_trg() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r td_requests%ROWTYPE; started timestamptz;
BEGIN
  IF NEW.status IN ('DELIVERED', 'UNDELIVERABLE') AND OLD.status NOT IN ('DELIVERED', 'UNDELIVERABLE') THEN
    SELECT * INTO r FROM td_requests WHERE id = NEW.request_id AND tenant_id = NEW.tenant_id;
    SELECT coalesce(max(a.at), now()) INTO started FROM td_attempts a WHERE a.document_id = NEW.id AND a.tenant_id = NEW.tenant_id;
    PERFORM of_statutory_open(NEW.tenant_id, r.office_id, r.branch_id, 'TD_RESULT_REPORT', NEW.id, NEW.request_id,
                              NEW.recipient_name, NEW.handler_user_id, started, 2);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER td_documents_deadline_after AFTER UPDATE ON td_documents
  FOR EACH ROW EXECUTE FUNCTION td_documents_deadline_trg();

-- Điều 31.3: văn bản sửa lỗi N-11 đã lập => hạn cập nhật CSDL và gửi người yêu cầu.
CREATE FUNCTION vibang_n11_deadline_trg() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE;
BEGIN
  IF NEW.status = 'APPLIED' AND OLD.status <> 'APPLIED' THEN
    SELECT * INTO c FROM vibang_cases WHERE id = NEW.case_id AND tenant_id = NEW.tenant_id;
    PERFORM of_statutory_open(NEW.tenant_id, c.office_id, c.branch_id, 'VB_N11_CSDL', NEW.id, NEW.case_id,
                              c.title, c.responsible_thv_user_id, NEW.applied_at, 2);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER vibang_n11_deadline_after AFTER UPDATE ON vibang_n11_corrections
  FOR EACH ROW EXECUTE FUNCTION vibang_n11_deadline_trg();

-- Điều 46: chấm dứt tổ chức THA khi chưa hoàn tất mọi nghĩa vụ (thỏa thuận chấm dứt, người yêu cầu rút, không có điều kiện thi hành, khác).
-- Căn cứ pháp lý (điểm b, c, đ khoản 5 Điều 31 Luật THADS) do người ghi nhập; hệ thống không suy diễn điểm nào.
ALTER TABLE th_cases DROP CONSTRAINT th_cases_status_check;
ALTER TABLE th_cases ADD CONSTRAINT th_cases_status_check CHECK (status IN ('OPEN', 'COMPLETED', 'TERMINATED'));
ALTER TABLE th_cases
  ADD COLUMN terminated_reason text CHECK (terminated_reason IN ('AGREEMENT', 'REQUESTER_WITHDRAWAL', 'NO_CONDITIONS', 'OTHER')),
  ADD COLUMN terminated_basis text,
  ADD COLUMN terminated_evidence_key text,
  ADD COLUMN terminated_evidence_sha256 text,
  ADD COLUMN terminated_by uuid,
  ADD COLUMN terminated_at timestamptz;
ALTER TABLE th_cases ADD CONSTRAINT th_cases_terminated_chk CHECK (
  (status = 'TERMINATED') = (terminated_reason IS NOT NULL AND btrim(coalesce(terminated_basis, '')) <> ''
    AND terminated_evidence_key IS NOT NULL AND terminated_evidence_sha256 IS NOT NULL AND terminated_by IS NOT NULL AND terminated_at IS NOT NULL)
);

CREATE OR REPLACE FUNCTION th_cases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'enforcement cases are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'enforcement case is completed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'TERMINATED' THEN
    RAISE EXCEPTION 'enforcement case is terminated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.case_ref <> OLD.case_ref OR NEW.agreement_ref <> OLD.agreement_ref OR NEW.decision_ref <> OLD.decision_ref THEN
    RAISE EXCEPTION 'enforcement case identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION th_terminate_case(p_tenant uuid, p_actor uuid, p_case uuid, p_reason text, p_basis text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('AGREEMENT', 'REQUESTER_WITHDRAWAL', 'NO_CONDITIONS', 'OTHER') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'INVALID_REASON', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_basis, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'BASIS_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE th_cases SET status = 'TERMINATED', terminated_reason = p_reason, terminated_basis = btrim(p_basis),
    terminated_evidence_key = p_key, terminated_evidence_sha256 = p_sha, terminated_by = p_actor, terminated_at = now()
  WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', true, 'ALLOWED', c.office_id, c.branch_id, p_reason);
END $$;

-- Điều 46.1: hồ sơ THA chấm dứt (hoàn tất hoặc chấm dứt sớm) => hạn thu hồi quyết định THA.
CREATE FUNCTION th_cases_deadline_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('COMPLETED', 'TERMINATED') AND OLD.status = 'OPEN' THEN
    PERFORM of_statutory_open(NEW.tenant_id, NEW.office_id, NEW.branch_id, 'TH_REVOKE', NEW.id, NEW.id,
                              NEW.case_ref, NEW.handler_user_id, coalesce(NEW.completed_at, NEW.terminated_at), 2);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER th_cases_deadline_after AFTER UPDATE ON th_cases
  FOR EACH ROW EXECUTE FUNCTION th_cases_deadline_trg();

-- Điều 35.1: ghi ngày ký hợp đồng dịch vụ xác minh => hạn Trưởng VP ra quyết định xác minh. Sửa được khi hạn còn mở.
CREATE FUNCTION vx_set_contract_date(p_tenant uuid, p_actor uuid, p_case uuid, p_signed_on date)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vx_cases%ROWTYPE; denied text; started timestamptz; cur office_statutory_deadlines%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vx_cases WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.contract_date.set', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.contract_date.set', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF p_signed_on IS NULL OR p_signed_on > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.contract_date.set', false, 'INVALID_DATE', c.office_id, c.branch_id, NULL);
  END IF;
  started := (p_signed_on::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  SELECT * INTO cur FROM office_statutory_deadlines WHERE tenant_id = p_tenant AND kind = 'VX_DECISION' AND ref_id = p_case FOR UPDATE;
  IF FOUND AND cur.status = 'DONE' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.contract_date.set', false, 'ALREADY_DONE', c.office_id, c.branch_id, NULL);
  END IF;
  IF FOUND THEN
    UPDATE office_statutory_deadlines SET start_at = started, due_at = of_working_due(p_tenant, c.office_id, started, working_days), agreed_note = NULL
    WHERE id = cur.id;
  ELSE
    PERFORM of_statutory_open(p_tenant, c.office_id, c.branch_id, 'VX_DECISION', p_case, p_case, c.case_ref, c.handler_user_id, started, 3);
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.contract_date.set', true, 'ALLOWED', c.office_id, c.branch_id, p_signed_on::text);
END $$;

-- Đánh dấu đã làm xong việc luật định (báo kết quả / cập nhật CSDL / ra quyết định). Quyết định xác minh và thu hồi THA cần Trưởng VP có quyền ký pháp lý.
CREATE FUNCTION of_deadline_done(p_tenant uuid, p_actor uuid, p_id uuid, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d office_statutory_deadlines%ROWTYPE; denied text;
BEGIN
  SELECT * INTO d FROM office_statutory_deadlines WHERE id = p_id AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.done', false, 'DEADLINE_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF d.kind IN ('VX_DECISION', 'TH_REVOKE') THEN
    IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = d.office_id
                   AND m.role = 'TRUONG_VP' AND m.legal_signer) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.done', false, 'SIGNING_AUTHORITY_NOT_GRANTED', d.office_id, d.branch_id, NULL);
    END IF;
  ELSE
    denied := td_authorize(p_tenant, p_actor, d.office_id, d.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'], d.handler_user_id);
    IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.done', false, denied, d.office_id, d.branch_id, NULL); END IF;
  END IF;
  IF d.status = 'DONE' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.done', false, 'ALREADY_DONE', d.office_id, d.branch_id, NULL); END IF;
  IF btrim(coalesce(p_note, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.done', false, 'NOTE_REQUIRED', d.office_id, d.branch_id, NULL); END IF;
  UPDATE office_statutory_deadlines SET status = 'DONE', done_by = p_actor, done_at = now(), done_note = btrim(p_note) WHERE id = p_id;
  RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.done', true, 'ALLOWED', d.office_id, d.branch_id, d.kind);
END $$;

-- "Các bên có thỏa thuận khác": ghi hạn thỏa thuận kèm lý do. Chỉ Admin/Trưởng VP; hạn mới phải sau ngày bắt đầu.
CREATE FUNCTION of_deadline_agree(p_tenant uuid, p_actor uuid, p_id uuid, p_due timestamptz, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d office_statutory_deadlines%ROWTYPE; denied text;
BEGIN
  SELECT * INTO d FROM office_statutory_deadlines WHERE id = p_id AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.agree', false, 'DEADLINE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, d.office_id, d.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.agree', false, 'ADMIN_OR_HEAD_ONLY', d.office_id, d.branch_id, NULL); END IF;
  IF d.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.agree', false, 'ALREADY_DONE', d.office_id, d.branch_id, NULL); END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.agree', false, 'REASON_REQUIRED', d.office_id, d.branch_id, NULL); END IF;
  IF p_due IS NULL OR p_due <= d.start_at THEN RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.agree', false, 'INVALID_DUE', d.office_id, d.branch_id, NULL); END IF;
  UPDATE office_statutory_deadlines SET due_at = p_due, agreed_note = btrim(p_reason) WHERE id = p_id;
  RETURN vibang_audit(p_tenant, p_actor, 'of.deadline.agree', true, 'ALLOWED', d.office_id, d.branch_id, d.kind);
END $$;

-- Danh sách hạn mở rộng: thêm các hạn pháp định còn mở. Thêm cột can_close; với hạn pháp định, ref_id là id dòng hạn và case_id là hồ sơ để mở màn hình.
DROP FUNCTION of_search_deadlines(uuid, uuid, uuid, timestamptz);
CREATE FUNCTION of_search_deadlines(p_tenant uuid, p_actor uuid, p_office uuid, p_until timestamptz)
RETURNS TABLE (domain text, ref_id uuid, case_id uuid, label text, deadline_at timestamptz, status text, overdue boolean, can_close boolean)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.deadlines.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
  WITH src AS (
    SELECT 'TONG_DAT'::text AS domain, d.id AS ref_id, d.request_id AS case_id, d.recipient_name AS label, d.deadline_at,
           d.status, r.branch_id, d.handler_user_id AS handler, false AS closable
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office AND d.status IN ('PENDING', 'ASSIGNED')
    UNION ALL
    SELECT 'VIBANG_CSDL', g.case_id, g.case_id, c.title, g.deadline_at, g.status, c.branch_id, c.responsible_thv_user_id, false
    FROM vibang_registrations g JOIN vibang_cases c ON c.id = g.case_id AND c.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND c.office_id = p_office AND g.status IN ('PENDING', 'SUBMITTED')
    UNION ALL
    SELECT 'CONG_VAN', o.id, CASE WHEN o.case_id IS NULL THEN o.id ELSE o.case_id END, o.subject, o.due_at, o.status, o.branch_id, o.handler_user_id, false
    FROM of_correspondence o
    WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND o.due_at IS NOT NULL AND o.status IN ('RECEIVED', 'DRAFT', 'SUBMITTED', 'APPROVED')
    UNION ALL
    SELECT CASE s.kind WHEN 'TD_RESULT_REPORT' THEN 'TONG_DAT_BAO_KET_QUA' WHEN 'VB_N11_CSDL' THEN 'VIBANG_N11'
                       WHEN 'VX_DECISION' THEN 'XAC_MINH_QUYET_DINH' ELSE 'THA_THU_HOI' END,
           s.id, s.case_id, s.label, s.due_at, s.status, s.branch_id, s.handler_user_id, true
    FROM office_statutory_deadlines s
    WHERE s.tenant_id = p_tenant AND s.office_id = p_office AND s.status = 'OPEN'
  )
  SELECT s.domain, s.ref_id, s.case_id, s.label, s.deadline_at, s.status, s.deadline_at < now(), s.closable
  FROM src s
  WHERE s.deadline_at <= p_until AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  ORDER BY s.deadline_at, s.ref_id;
END $$;

CREATE OR REPLACE FUNCTION of_sync_notifications(p_tenant uuid, p_actor uuid, p_office uuid, p_within_days integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO office_notifications (tenant_id, office_id, user_id, kind, domain, ref_id, case_id, label, deadline_at)
  WITH src AS (
    SELECT 'TONG_DAT'::text AS domain, d.id AS ref_id, d.request_id AS case_id, d.recipient_name AS label, d.deadline_at,
           r.branch_id, d.handler_user_id AS handler
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office AND d.status IN ('PENDING', 'ASSIGNED')
    UNION ALL
    SELECT 'VIBANG_CSDL', g.case_id, g.case_id, c.title, g.deadline_at, c.branch_id, c.responsible_thv_user_id
    FROM vibang_registrations g JOIN vibang_cases c ON c.id = g.case_id AND c.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND c.office_id = p_office AND g.status IN ('PENDING', 'SUBMITTED')
    UNION ALL
    SELECT 'CONG_VAN', o.id, CASE WHEN o.case_id IS NULL THEN o.id ELSE o.case_id END, o.subject, o.due_at, o.branch_id, o.handler_user_id
    FROM of_correspondence o
    WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND o.due_at IS NOT NULL AND o.status IN ('RECEIVED', 'DRAFT', 'SUBMITTED', 'APPROVED')
    UNION ALL
    SELECT CASE s.kind WHEN 'TD_RESULT_REPORT' THEN 'TONG_DAT_BAO_KET_QUA' WHEN 'VB_N11_CSDL' THEN 'VIBANG_N11'
                       WHEN 'VX_DECISION' THEN 'XAC_MINH_QUYET_DINH' ELSE 'THA_THU_HOI' END,
           s.id, s.case_id, s.label, s.due_at, s.branch_id, s.handler_user_id
    FROM office_statutory_deadlines s
    WHERE s.tenant_id = p_tenant AND s.office_id = p_office AND s.status = 'OPEN'
  )
  SELECT p_tenant, p_office, p_actor,
         CASE WHEN s.deadline_at < now() THEN 'DEADLINE_OVERDUE' ELSE 'DEADLINE_DUE_SOON' END,
         s.domain, s.ref_id, s.case_id, s.label, s.deadline_at
  FROM src s
  WHERE s.deadline_at <= now() + make_interval(days => p_within_days)
    AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  ON CONFLICT ON CONSTRAINT office_notifications_once_uq DO NOTHING;
END $$;
