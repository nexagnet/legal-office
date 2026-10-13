-- Cấp / đổi quyền thành viên theo nguyên tắc HAI NGƯỜI (chủ chọn 13/10/2026): Admin ĐỀ XUẤT, Trưởng văn phòng DUYỆT, hai người
-- phải khác nhau. Chỉ khi duyệt thì thay đổi mới được áp vào memberships / branch_grants. Mọi đề xuất và quyết định được giữ lại.
--   GRANT_ROLE        thêm vai cho một người đã có tài khoản trong tenant
--   REVOKE_ROLE       gỡ một vai (kèm chi nhánh được cấp của vai đó); không được gỡ Admin cuối cùng
--   SET_LEGAL_SIGNER  bật/tắt quyền ký pháp lý (chỉ người có vai Admin hoặc Trưởng VP)
--   GRANT_BRANCH / REVOKE_BRANCH  cấp / thu hồi chi nhánh cho vai Văn thư, Kế toán
CREATE TABLE ad_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('GRANT_ROLE', 'REVOKE_ROLE', 'SET_LEGAL_SIGNER', 'GRANT_BRANCH', 'REVOKE_BRANCH')),
  role text CHECK (role IN ('ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN')),
  flag boolean,
  branch_id uuid,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  proposed_by uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  CONSTRAINT ad_access_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT ad_access_target_fk FOREIGN KEY (target_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT ad_access_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT ad_access_branch_fk FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id),
  CONSTRAINT ad_access_shape_chk CHECK (
    (kind IN ('GRANT_ROLE', 'REVOKE_ROLE') AND role IS NOT NULL AND flag IS NULL AND branch_id IS NULL)
    OR (kind = 'SET_LEGAL_SIGNER' AND role IS NULL AND flag IS NOT NULL AND branch_id IS NULL)
    OR (kind IN ('GRANT_BRANCH', 'REVOKE_BRANCH') AND role IS NULL AND flag IS NULL AND branch_id IS NOT NULL)),
  CONSTRAINT ad_access_decided_chk CHECK (
    (status = 'PENDING') = (decided_by IS NULL AND decided_at IS NULL)),
  CONSTRAINT ad_access_two_person_chk CHECK (status <> 'APPROVED' OR decided_by <> proposed_by)
);
CREATE INDEX ad_access_office_idx ON ad_access_requests (tenant_id, office_id, proposed_at DESC);
ALTER TABLE ad_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_access_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ad_access_requests USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Không xoá; chỉ chuyển PENDING -> trạng thái cuối; nội dung đề xuất không đổi.
CREATE FUNCTION ad_access_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'access requests are never deleted' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF OLD.status <> 'PENDING' THEN RAISE EXCEPTION 'access request is final (%)', OLD.status USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.target_user_id <> OLD.target_user_id
     OR NEW.kind <> OLD.kind OR NEW.role IS DISTINCT FROM OLD.role OR NEW.flag IS DISTINCT FROM OLD.flag
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.reason <> OLD.reason OR NEW.proposed_by <> OLD.proposed_by THEN
    RAISE EXCEPTION 'access request content is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ad_access_guard_trg BEFORE UPDATE OR DELETE ON ad_access_requests FOR EACH ROW EXECUTE FUNCTION ad_access_guard();

-- Kiểm tra nội dung đề xuất dùng cả lúc đề xuất và lúc áp dụng (trạng thái có thể đã đổi giữa hai thời điểm).
-- Trả mã lỗi hoặc NULL.
CREATE FUNCTION ad_access_check(p_tenant uuid, p_office uuid, p_user uuid, p_kind text, p_role text, p_flag boolean, p_branch uuid)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.tenant_id = p_tenant) THEN RETURN 'USER_NOT_FOUND'; END IF;
  IF p_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN 'BRANCH_NOT_FOUND';
  END IF;
  IF p_kind = 'GRANT_ROLE' THEN
    IF EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user AND m.role = p_role) THEN RETURN 'ROLE_ALREADY_GRANTED'; END IF;
  ELSIF p_kind = 'REVOKE_ROLE' THEN
    IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user AND m.role = p_role) THEN RETURN 'ROLE_NOT_HELD'; END IF;
    IF p_role = 'ADMIN' AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.role = 'ADMIN' AND m.user_id <> p_user) THEN
      RETURN 'LAST_ADMIN';
    END IF;
  ELSIF p_kind = 'SET_LEGAL_SIGNER' THEN
    IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user AND m.role IN ('ADMIN', 'TRUONG_VP')) THEN
      RETURN 'SIGNER_ROLE_INVALID';
    END IF;
  ELSIF p_kind IN ('GRANT_BRANCH', 'REVOKE_BRANCH') THEN
    IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user AND m.role IN ('VAN_THU', 'KE_TOAN')) THEN
      RETURN 'BRANCH_ROLE_INVALID';
    END IF;
  ELSE
    RETURN 'INVALID_REQUEST';
  END IF;
  RETURN NULL;
END $$;

-- Admin đề xuất. label = id đề xuất.
CREATE FUNCTION ad_access_propose(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_kind text, p_role text, p_flag boolean, p_branch uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; rid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = p_office AND a.role = 'ADMIN') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.access.propose', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.propose', false, 'REASON_REQUIRED', p_office, NULL, NULL); END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('GRANT_ROLE', 'REVOKE_ROLE', 'SET_LEGAL_SIGNER', 'GRANT_BRANCH', 'REVOKE_BRANCH')
     OR (p_kind IN ('GRANT_ROLE', 'REVOKE_ROLE') AND (p_role IS NULL OR p_role NOT IN ('ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN')))
     OR (p_kind = 'SET_LEGAL_SIGNER' AND p_flag IS NULL)
     OR (p_kind IN ('GRANT_BRANCH', 'REVOKE_BRANCH') AND p_branch IS NULL) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.access.propose', false, 'INVALID_REQUEST', p_office, NULL, NULL);
  END IF;
  denied := ad_access_check(p_tenant, p_office, p_user, p_kind, CASE WHEN p_kind IN ('GRANT_ROLE', 'REVOKE_ROLE') THEN p_role END, p_flag,
                            CASE WHEN p_kind IN ('GRANT_BRANCH', 'REVOKE_BRANCH') THEN p_branch END);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.propose', false, denied, p_office, NULL, NULL); END IF;
  IF EXISTS (SELECT 1 FROM ad_access_requests r WHERE r.tenant_id = p_tenant AND r.office_id = p_office AND r.target_user_id = p_user AND r.kind = p_kind
             AND r.status = 'PENDING' AND r.role IS NOT DISTINCT FROM CASE WHEN p_kind IN ('GRANT_ROLE', 'REVOKE_ROLE') THEN p_role END
             AND r.branch_id IS NOT DISTINCT FROM CASE WHEN p_kind IN ('GRANT_BRANCH', 'REVOKE_BRANCH') THEN p_branch END) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.access.propose', false, 'DUPLICATE_PENDING', p_office, NULL, NULL);
  END IF;
  INSERT INTO ad_access_requests (tenant_id, office_id, target_user_id, kind, role, flag, branch_id, reason, proposed_by)
  VALUES (p_tenant, p_office, p_user, p_kind,
          CASE WHEN p_kind IN ('GRANT_ROLE', 'REVOKE_ROLE') THEN p_role END,
          CASE WHEN p_kind = 'SET_LEGAL_SIGNER' THEN p_flag END,
          CASE WHEN p_kind IN ('GRANT_BRANCH', 'REVOKE_BRANCH') THEN p_branch END,
          btrim(p_reason), p_actor) RETURNING id INTO rid;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.access.propose', true, 'ALLOWED', p_office, NULL, rid::text);
END $$;

-- Trưởng văn phòng duyệt hoặc từ chối (khác người đề xuất). Duyệt thì áp thay đổi ngay trong cùng giao dịch.
CREATE FUNCTION ad_access_decide(p_tenant uuid, p_actor uuid, p_request uuid, p_approve boolean, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r ad_access_requests%ROWTYPE; denied text; mid uuid;
BEGIN
  SELECT * INTO r FROM ad_access_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = r.office_id AND a.role = 'TRUONG_VP') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'HEAD_ONLY', r.office_id, NULL, NULL);
  END IF;
  IF r.proposed_by = p_actor THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'SEPARATE_APPROVER_REQUIRED', r.office_id, NULL, NULL); END IF;
  IF r.status <> 'PENDING' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'REQUEST_FINAL', r.office_id, NULL, NULL); END IF;
  IF p_approve IS NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'INVALID_REQUEST', r.office_id, NULL, NULL); END IF;
  IF NOT p_approve THEN
    IF btrim(coalesce(p_note, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'REASON_REQUIRED', r.office_id, NULL, NULL); END IF;
    UPDATE ad_access_requests SET status = 'REJECTED', decided_by = p_actor, decided_at = now(), decision_note = btrim(p_note) WHERE id = r.id AND tenant_id = p_tenant;
    RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', true, 'ALLOWED', r.office_id, NULL, 'REJECTED');
  END IF;
  denied := ad_access_check(p_tenant, r.office_id, r.target_user_id, r.kind, r.role, r.flag, r.branch_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, denied, r.office_id, NULL, NULL); END IF;
  IF r.kind = 'GRANT_ROLE' THEN
    INSERT INTO memberships (tenant_id, user_id, office_id, role) VALUES (p_tenant, r.target_user_id, r.office_id, r.role);
  ELSIF r.kind = 'REVOKE_ROLE' THEN
    DELETE FROM branch_grants g USING memberships m WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND m.tenant_id = p_tenant
      AND m.user_id = r.target_user_id AND m.office_id = r.office_id AND m.role = r.role;
    DELETE FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = r.target_user_id AND m.office_id = r.office_id AND m.role = r.role;
  ELSIF r.kind = 'SET_LEGAL_SIGNER' THEN
    UPDATE memberships m SET legal_signer = r.flag
    WHERE m.tenant_id = p_tenant AND m.user_id = r.target_user_id AND m.office_id = r.office_id AND m.role IN ('ADMIN', 'TRUONG_VP');
  ELSIF r.kind = 'GRANT_BRANCH' THEN
    FOR mid IN SELECT m.id FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = r.target_user_id AND m.office_id = r.office_id AND m.role IN ('VAN_THU', 'KE_TOAN') LOOP
      INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES (p_tenant, mid, r.branch_id) ON CONFLICT (membership_id, branch_id) DO NOTHING;
    END LOOP;
  ELSE
    DELETE FROM branch_grants g USING memberships m WHERE g.membership_id = m.id AND g.tenant_id = p_tenant AND m.tenant_id = p_tenant
      AND m.user_id = r.target_user_id AND m.office_id = r.office_id AND m.role IN ('VAN_THU', 'KE_TOAN') AND g.branch_id = r.branch_id;
  END IF;
  UPDATE ad_access_requests SET status = 'APPROVED', decided_by = p_actor, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
  WHERE id = r.id AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', true, 'ALLOWED', r.office_id, NULL, 'APPROVED');
END $$;

-- Người đề xuất rút lại khi còn chờ.
CREATE FUNCTION ad_access_withdraw(p_tenant uuid, p_actor uuid, p_request uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r ad_access_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM ad_access_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.withdraw', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF r.proposed_by <> p_actor THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.withdraw', false, 'PROPOSER_ONLY', r.office_id, NULL, NULL); END IF;
  IF r.status <> 'PENDING' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.withdraw', false, 'REQUEST_FINAL', r.office_id, NULL, NULL); END IF;
  UPDATE ad_access_requests SET status = 'WITHDRAWN', decided_by = p_actor, decided_at = now() WHERE id = r.id AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.access.withdraw', true, 'ALLOWED', r.office_id, NULL, NULL);
END $$;

-- Danh sách đề xuất: Admin và Trưởng VP của văn phòng; người khác nhận rỗng.
CREATE FUNCTION of_search_access_requests(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (id uuid, target_user_id uuid, target_label text, kind text, role text, flag boolean, branch_name text, status text, reason text,
               proposed_by uuid, proposed_at timestamptz, decided_by uuid, decision_note text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = p_office AND a.role IN ('ADMIN', 'TRUONG_VP')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'ad.access.search', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'ad.access.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT r.id, r.target_user_id, coalesce(ac.email, u.external_ref), r.kind, r.role, r.flag, b.name, r.status, r.reason,
           r.proposed_by, r.proposed_at, r.decided_by, r.decision_note
    FROM ad_access_requests r
    JOIN users u ON u.id = r.target_user_id AND u.tenant_id = r.tenant_id
    LEFT JOIN auth_credentials ac ON ac.user_id = r.target_user_id AND ac.tenant_id = r.tenant_id
    LEFT JOIN branches b ON b.id = r.branch_id AND b.tenant_id = r.tenant_id
    WHERE r.tenant_id = p_tenant AND r.office_id = p_office
    ORDER BY (r.status = 'PENDING') DESC, r.proposed_at DESC, r.id LIMIT 200;
END $$;

-- Danh bạ thành viên (thay bản 0023): thêm những người dùng của tenant CHƯA có vai nào ở văn phòng này (role = NULL) để
-- Admin có thể đề xuất cấp vai cho họ. Vẫn chỉ Admin của văn phòng, vẫn không trả băm mật khẩu.
CREATE OR REPLACE FUNCTION of_search_members(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, label text, role text, legal_signer boolean, has_login boolean, branches text[])
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = p_office AND a.role = 'ADMIN') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.members.search', false, 'ADMIN_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.members.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT m.user_id, coalesce(ac.email, u.external_ref), m.role, m.legal_signer, ac.user_id IS NOT NULL,
           coalesce((SELECT array_agg(b.name ORDER BY b.name) FROM branch_grants g
                     JOIN branches b ON b.id = g.branch_id AND b.tenant_id = g.tenant_id
                     WHERE g.membership_id = m.id AND g.tenant_id = p_tenant), ARRAY[]::text[])
    FROM memberships m
    JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
    LEFT JOIN auth_credentials ac ON ac.user_id = m.user_id AND ac.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.office_id = p_office
    UNION ALL
    SELECT u.id, coalesce(ac.email, u.external_ref), NULL::text, false, ac.user_id IS NOT NULL, ARRAY[]::text[]
    FROM users u
    LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
    WHERE u.tenant_id = p_tenant
      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = u.id AND m.office_id = p_office)
    ORDER BY 3 NULLS LAST, 2, 1;
END $$;
