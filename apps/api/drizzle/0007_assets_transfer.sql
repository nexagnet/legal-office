-- Lát #11: Tài sản THA, lệnh của cơ quan có thẩm quyền và chuyển giao hồ sơ (N-08).
-- Dữ liệu giả lập. THV/văn phòng chỉ ĐỀ XUẤT biện pháp; không có đóng băng/kê biên tự động. Một đề xuất chỉ thành
-- "đã áp dụng" khi có lệnh có chữ ký của cơ quan có thẩm quyền (bằng chứng) do Admin/Trưởng VP ghi nhận. Chuyển giao hồ sơ
-- cần duyệt trong ứng dụng, quyết định/chữ ký pháp lý riêng (legal_signer) và bằng chứng bàn giao thật N-08.
-- Không sổ sách tài chính/kho. Quyền kiểm tra trong DB (td_authorize), mọi kết quả ghi audit_log. Dùng th_cases (0006).

CREATE TABLE as_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  obligation_id uuid,
  party_id uuid,
  category text NOT NULL CHECK (btrim(category) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  sensitivity text NOT NULL CHECK (sensitivity IN ('NORMAL', 'SENSITIVE')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT as_assets_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT as_assets_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES th_cases (id, tenant_id),
  CONSTRAINT as_assets_obligation_fk FOREIGN KEY (obligation_id, tenant_id) REFERENCES th_obligations (id, tenant_id),
  CONSTRAINT as_assets_party_fk FOREIGN KEY (party_id, tenant_id) REFERENCES th_parties (id, tenant_id)
);

-- Lịch sử từng tài sản: chỉ ghi thêm, luôn có bằng chứng. ORDER_RECORDED do hệ thống ghi khi nhận lệnh.
CREATE TABLE as_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('DISCOVERY', 'VERIFICATION', 'DISPUTE', 'HANDOVER', 'ORDER_RECORDED')),
  note text NOT NULL CHECK (btrim(note) <> ''),
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  idem_key text NOT NULL CHECK (btrim(idem_key) <> ''),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT as_events_idem_uq UNIQUE (asset_id, idem_key),
  CONSTRAINT as_events_asset_fk FOREIGN KEY (asset_id, tenant_id) REFERENCES as_assets (id, tenant_id)
);

-- Lệnh của cơ quan có thẩm quyền: chỉ ghi thêm; luôn có tên cơ quan, số lệnh, bản có chữ ký (khoá + SHA-256).
CREATE TABLE as_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  agency_name text NOT NULL CHECK (btrim(agency_name) <> ''),
  order_ref text NOT NULL CHECK (btrim(order_ref) <> ''),
  signed_evidence_key text NOT NULL CHECK (btrim(signed_evidence_key) <> '' AND signed_evidence_key !~ '(^/|\.\.)'),
  signed_evidence_sha256 text NOT NULL CHECK (signed_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT as_orders_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT as_orders_one_per_proposal_uq UNIQUE (proposal_id)
);

CREATE TABLE as_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  measure text NOT NULL CHECK (btrim(measure) <> ''),
  rationale text NOT NULL CHECK (btrim(rationale) <> ''),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'WITHDRAWN', 'APPLIED')),
  order_id uuid,
  proposed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT as_proposals_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT as_proposals_asset_fk FOREIGN KEY (asset_id, tenant_id) REFERENCES as_assets (id, tenant_id),
  CONSTRAINT as_proposals_order_fk FOREIGN KEY (order_id, tenant_id) REFERENCES as_orders (id, tenant_id),
  -- Không thể ở trạng thái "đã áp dụng" nếu không có lệnh gắn kèm (và ngược lại).
  CONSTRAINT as_proposals_applied_chk CHECK ((status = 'APPLIED') = (order_id IS NOT NULL))
);
ALTER TABLE as_orders ADD CONSTRAINT as_orders_proposal_fk FOREIGN KEY (proposal_id, tenant_id) REFERENCES as_proposals (id, tenant_id);

CREATE TABLE as_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'COMPLETED')),
  proposed_by uuid NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT as_transfers_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT as_transfers_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES th_cases (id, tenant_id),
  CONSTRAINT as_transfers_to_fk FOREIGN KEY (to_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT as_transfers_done_chk CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE TABLE as_transfer_steps (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  transfer_id uuid NOT NULL,
  step text NOT NULL CHECK (step IN ('APP_APPROVAL', 'LEGAL_DECISION', 'HANDOVER_N08')),
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT as_transfer_steps_uq UNIQUE (transfer_id, step),
  CONSTRAINT as_transfer_steps_fk FOREIGN KEY (transfer_id, tenant_id) REFERENCES as_transfers (id, tenant_id)
);

CREATE TRIGGER as_events_ro BEFORE UPDATE OR DELETE ON as_events FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER as_orders_ro BEFORE UPDATE OR DELETE ON as_orders FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER as_assets_ro BEFORE UPDATE OR DELETE ON as_assets FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER as_transfer_steps_ro BEFORE UPDATE OR DELETE ON as_transfer_steps FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Đề xuất: không xoá; APPLIED/WITHDRAWN là cuối; nội dung không đổi.
CREATE FUNCTION as_proposals_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'measure proposals are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'measure proposal is final (%)', OLD.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.asset_id <> OLD.asset_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.measure <> OLD.measure OR NEW.rationale <> OLD.rationale THEN
    RAISE EXCEPTION 'measure proposal content is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER as_proposals_guard_trg BEFORE UPDATE OR DELETE ON as_proposals FOR EACH ROW EXECUTE FUNCTION as_proposals_guard();

CREATE FUNCTION as_transfers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'transfer is completed or immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.case_id <> OLD.case_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.to_user_id <> OLD.to_user_id THEN
    RAISE EXCEPTION 'transfer identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER as_transfers_guard_trg BEFORE UPDATE OR DELETE ON as_transfers FOR EACH ROW EXECUTE FUNCTION as_transfers_guard();

-- Nguồn chiếu sổ S-05: không lộ nhãn/ghi chú tài sản, chỉ loại, mức nhạy cảm, số sự kiện, trạng thái biện pháp mới nhất.
CREATE VIEW as_s05_book WITH (security_invoker = true) AS
SELECT a.tenant_id, c.office_id, c.branch_id, c.id AS case_id, c.case_ref, a.id AS asset_id, a.category, a.sensitivity,
       (SELECT count(*)::int FROM as_events e WHERE e.asset_id = a.id AND e.tenant_id = a.tenant_id) AS events,
       (SELECT p.status FROM as_proposals p WHERE p.asset_id = a.id AND p.tenant_id = a.tenant_id ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS latest_measure_status
FROM as_assets a JOIN th_cases c ON c.id = a.case_id AND c.tenant_id = a.tenant_id;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['as_assets', 'as_events', 'as_orders', 'as_proposals', 'as_transfers', 'as_transfer_steps'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- ---- Hàm nghiệp vụ ----

-- Đăng ký tài sản vào hồ sơ THA. label = id tài sản.
CREATE FUNCTION as_add_asset(p_tenant uuid, p_actor uuid, p_case uuid, p_category text, p_label text, p_sensitivity text,
  p_obligation uuid, p_party uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text; aid uuid;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.asset.add', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.asset.add', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'as.asset.add', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_category, '')) = '' OR btrim(coalesce(p_label, '')) = '' OR p_sensitivity IS NULL OR p_sensitivity NOT IN ('NORMAL', 'SENSITIVE') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.asset.add', false, 'INVALID_ASSET', c.office_id, c.branch_id, NULL);
  END IF;
  IF (p_obligation IS NOT NULL AND NOT EXISTS (SELECT 1 FROM th_obligations o WHERE o.id = p_obligation AND o.tenant_id = p_tenant AND o.case_id = p_case))
     OR (p_party IS NOT NULL AND NOT EXISTS (SELECT 1 FROM th_parties p WHERE p.id = p_party AND p.tenant_id = p_tenant AND p.case_id = p_case)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.asset.add', false, 'LINK_NOT_FOUND', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO as_assets (tenant_id, case_id, obligation_id, party_id, category, label, sensitivity, created_by)
  VALUES (p_tenant, p_case, p_obligation, p_party, btrim(p_category), btrim(p_label), p_sensitivity, p_actor) RETURNING id INTO aid;
  RETURN vibang_audit(p_tenant, p_actor, 'as.asset.add', true, 'ALLOWED', c.office_id, c.branch_id, aid::text);
END $$;

-- Ghi sự kiện của một tài sản (phát hiện/xác minh/tranh chấp/bàn giao), luôn có bằng chứng. Idempotent theo khoá.
CREATE FUNCTION as_record_event(p_tenant uuid, p_actor uuid, p_asset uuid, p_kind text, p_note text, p_key text, p_sha text, p_idem text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE a as_assets%ROWTYPE; c th_cases%ROWTYPE; denied text; eid bigint;
BEGIN
  SELECT * INTO a FROM as_assets WHERE id = p_asset AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', false, 'ASSET_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM th_cases WHERE id = a.case_id AND tenant_id = p_tenant FOR UPDATE;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_idem, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', false, 'IDEMPOTENCY_KEY_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT e.id INTO eid FROM as_events e WHERE e.asset_id = p_asset AND e.tenant_id = p_tenant AND e.idem_key = p_idem;
  IF eid IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', true, 'ALREADY_RECORDED', c.office_id, c.branch_id, eid::text); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('DISCOVERY', 'VERIFICATION', 'DISPUTE', 'HANDOVER') OR btrim(coalesce(p_note, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', false, 'INVALID_EVENT', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO as_events (tenant_id, asset_id, kind, note, evidence_key, evidence_sha256, idem_key, actor_user_id)
  VALUES (p_tenant, p_asset, p_kind, btrim(p_note), p_key, p_sha, p_idem, p_actor) RETURNING id INTO eid;
  RETURN vibang_audit(p_tenant, p_actor, 'as.event.record', true, 'ALLOWED', c.office_id, c.branch_id, eid::text);
END $$;

-- Truy cập metadata tài sản: luôn audit; tài sản nhạy cảm cần nêu mục đích. Trả nhãn trong label. THV phụ trách/Admin/Trưởng VP.
CREATE FUNCTION as_access_asset(p_tenant uuid, p_actor uuid, p_asset uuid, p_purpose text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE a as_assets%ROWTYPE; c th_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO a FROM as_assets WHERE id = p_asset AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.asset.access', false, 'ASSET_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM th_cases WHERE id = a.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.asset.access', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF a.sensitivity = 'SENSITIVE' AND btrim(coalesce(p_purpose, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.asset.access', false, 'PURPOSE_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'as.asset.access', true, 'ALLOWED', c.office_id, c.branch_id, a.label);
END $$;

-- Đề xuất biện pháp bảo đảm (chưa phải biện pháp đã áp dụng). THV phụ trách/Admin/Trưởng VP. label = id đề xuất.
CREATE FUNCTION as_propose_measure(p_tenant uuid, p_actor uuid, p_asset uuid, p_measure text, p_rationale text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE a as_assets%ROWTYPE; c th_cases%ROWTYPE; denied text; pid uuid;
BEGIN
  SELECT * INTO a FROM as_assets WHERE id = p_asset AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.measure.propose', false, 'ASSET_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM th_cases WHERE id = a.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.measure.propose', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'as.measure.propose', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_measure, '')) = '' OR btrim(coalesce(p_rationale, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.measure.propose', false, 'INVALID_PROPOSAL', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO as_proposals (tenant_id, asset_id, measure, rationale, proposed_by) VALUES (p_tenant, p_asset, btrim(p_measure), btrim(p_rationale), p_actor)
  RETURNING id INTO pid;
  RETURN vibang_audit(p_tenant, p_actor, 'as.measure.propose', true, 'ALLOWED', c.office_id, c.branch_id, pid::text);
END $$;

CREATE FUNCTION as_withdraw_proposal(p_tenant uuid, p_actor uuid, p_proposal uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE p as_proposals%ROWTYPE; a as_assets%ROWTYPE; c th_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO p FROM as_proposals WHERE id = p_proposal AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.measure.withdraw', false, 'PROPOSAL_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO a FROM as_assets WHERE id = p.asset_id AND tenant_id = p_tenant;
  SELECT * INTO c FROM th_cases WHERE id = a.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.measure.withdraw', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF p.status <> 'PROPOSED' THEN RETURN vibang_audit(p_tenant, p_actor, 'as.measure.withdraw', false, 'PROPOSAL_FINAL', c.office_id, c.branch_id, NULL); END IF;
  UPDATE as_proposals SET status = 'WITHDRAWN' WHERE id = p_proposal AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'as.measure.withdraw', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Ghi nhận lệnh của cơ quan có thẩm quyền (CHỈ ghi nhận quyết định đã có; hệ thống không tự đóng băng/kê biên).
-- Cần tên cơ quan, số lệnh, bản có chữ ký. Admin/Trưởng VP. Chuyển đề xuất sang APPLIED và ghi ORDER_RECORDED vào lịch sử tài sản.
CREATE FUNCTION as_record_order(p_tenant uuid, p_actor uuid, p_proposal uuid, p_agency text, p_order_ref text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE p as_proposals%ROWTYPE; a as_assets%ROWTYPE; c th_cases%ROWTYPE; denied text; oid uuid;
BEGIN
  SELECT * INTO p FROM as_proposals WHERE id = p_proposal AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.order.record', false, 'PROPOSAL_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO a FROM as_assets WHERE id = p.asset_id AND tenant_id = p_tenant;
  SELECT * INTO c FROM th_cases WHERE id = a.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.order.record', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF p.status <> 'PROPOSED' THEN RETURN vibang_audit(p_tenant, p_actor, 'as.order.record', false, 'PROPOSAL_FINAL', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_agency, '')) = '' OR btrim(coalesce(p_order_ref, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.order.record', false, 'INVALID_ORDER', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.order.record', false, 'SIGNED_ORDER_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO as_orders (tenant_id, proposal_id, agency_name, order_ref, signed_evidence_key, signed_evidence_sha256, recorded_by)
  VALUES (p_tenant, p_proposal, btrim(p_agency), btrim(p_order_ref), p_key, p_sha, p_actor) RETURNING id INTO oid;
  UPDATE as_proposals SET status = 'APPLIED', order_id = oid WHERE id = p_proposal AND tenant_id = p_tenant;
  INSERT INTO as_events (tenant_id, asset_id, kind, note, evidence_key, evidence_sha256, idem_key, actor_user_id)
  VALUES (p_tenant, a.id, 'ORDER_RECORDED', 'Đã ghi nhận lệnh cơ quan có thẩm quyền', p_key, p_sha, 'order:' || oid::text, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'as.order.record', true, 'ALLOWED', c.office_id, c.branch_id, oid::text);
END $$;

-- ---- Chuyển giao hồ sơ THA (N-08) ----

-- Đề xuất chuyển giao sang THV khác cùng văn phòng. label = id chuyển giao.
CREATE FUNCTION as_transfer_propose(p_tenant uuid, p_actor uuid, p_case uuid, p_to uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text; tid uuid;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.propose', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.propose', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.propose', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_to AND m.office_id = c.office_id AND m.role = 'THV')
     OR p_to IS NOT DISTINCT FROM c.handler_user_id THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.propose', false, 'INVALID_HANDLER', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO as_transfers (tenant_id, case_id, to_user_id, proposed_by) VALUES (p_tenant, p_case, p_to, p_actor) RETURNING id INTO tid;
  RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.propose', true, 'ALLOWED', c.office_id, c.branch_id, tid::text);
END $$;

--  APP_APPROVAL   duyệt trong ứng dụng — chỉ Admin/Trưởng VP (đây KHÔNG phải chữ ký pháp lý).
--  LEGAL_DECISION quyết định/chữ ký pháp lý riêng — chỉ Admin/Trưởng VP có legal_signer.
--  HANDOVER_N08   bằng chứng bàn giao thật N-08 — Admin/Trưởng VP/Thư ký.
CREATE FUNCTION as_transfer_step(p_tenant uuid, p_actor uuid, p_transfer uuid, p_step text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE t as_transfers%ROWTYPE; c th_cases%ROWTYPE; denied text; roles text[];
BEGIN
  SELECT * INTO t FROM as_transfers WHERE id = p_transfer AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', false, 'TRANSFER_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM th_cases WHERE id = t.case_id AND tenant_id = p_tenant;
  IF p_step IS NULL OR p_step NOT IN ('APP_APPROVAL', 'LEGAL_DECISION', 'HANDOVER_N08') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', false, 'INVALID_STEP', c.office_id, c.branch_id, NULL);
  END IF;
  roles := CASE p_step WHEN 'HANDOVER_N08' THEN ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY'] ELSE ARRAY['ADMIN', 'TRUONG_VP'] END;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, roles, NULL);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', false,
      CASE WHEN p_step = 'HANDOVER_N08' THEN denied ELSE 'ADMIN_OR_HEAD_ONLY' END, c.office_id, c.branch_id, NULL);
  END IF;
  IF p_step = 'LEGAL_DECISION' AND NOT EXISTS (
       SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id
         AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', false, 'SIGNING_AUTHORITY_NOT_GRANTED', c.office_id, c.branch_id, NULL);
  END IF;
  IF t.status <> 'PROPOSED' THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', false, 'TRANSFER_NOT_PENDING', c.office_id, c.branch_id, NULL); END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM as_transfer_steps s WHERE s.transfer_id = p_transfer AND s.tenant_id = p_tenant AND s.step = p_step) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', false, 'STEP_ALREADY_RECORDED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO as_transfer_steps (tenant_id, transfer_id, step, evidence_key, evidence_sha256, actor_user_id)
  VALUES (p_tenant, p_transfer, p_step, p_key, p_sha, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.step', true, 'ALLOWED', c.office_id, c.branch_id, p_step);
END $$;

-- Hoàn tất chuyển giao khi đủ 3 bước (thiếu bước nào trả mã bước đầu tiên thiếu); đổi THV phụ trách hồ sơ.
CREATE FUNCTION as_transfer_complete(p_tenant uuid, p_actor uuid, p_transfer uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE t as_transfers%ROWTYPE; c th_cases%ROWTYPE; denied text; missing text;
BEGIN
  SELECT * INTO t FROM as_transfers WHERE id = p_transfer AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, 'TRANSFER_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM th_cases WHERE id = t.case_id AND tenant_id = p_tenant FOR UPDATE;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF t.status <> 'PROPOSED' OR c.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, 'TRANSFER_NOT_PENDING', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT x.code INTO missing FROM (VALUES (1, 'APP_APPROVAL', 'APP_APPROVAL_MISSING'), (2, 'LEGAL_DECISION', 'LEGAL_DECISION_MISSING'),
      (3, 'HANDOVER_N08', 'HANDOVER_N08_MISSING')) AS x(ord, step, code)
    WHERE NOT EXISTS (SELECT 1 FROM as_transfer_steps s WHERE s.transfer_id = p_transfer AND s.tenant_id = p_tenant AND s.step = x.step)
    ORDER BY x.ord LIMIT 1;
  IF missing IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, missing, c.office_id, c.branch_id, NULL); END IF;
  UPDATE as_transfers SET status = 'COMPLETED', completed_at = now() WHERE id = p_transfer AND tenant_id = p_tenant;
  UPDATE th_cases SET handler_user_id = t.to_user_id WHERE id = t.case_id AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;
