-- Thêm thành viên và quản lý chi nhánh ngay trên giao diện Quản trị (chủ dự án giao 27/10/2026).
--   * Thành viên mới: Admin tạo tài khoản (họ tên, email, tuỳ chọn mật khẩu tạm) và đồng thời lập MỘT đề xuất ADD_MEMBER
--     (vai, quyền ký pháp lý, chi nhánh). Người đó CHƯA có vai nào, tức chưa vào được hệ thống, cho đến khi Trưởng văn phòng
--     (khác người) duyệt ở Hộp duyệt, đúng nguyên tắc hai người của 0024. Không có đường đi tắt qua duyệt.
--   * Chi nhánh (địa điểm hoạt động): Admin thêm / đổi tên. Không xoá (hồ sơ và sổ tham chiếu chi nhánh). Tên không trùng trong
--     văn phòng (không phân biệt hoa thường).
-- Dữ liệu giả lập; không lưu mật khẩu gốc, chỉ băm do API tính.

ALTER TABLE users ADD COLUMN full_name text CHECK (full_name IS NULL OR (btrim(full_name) <> '' AND length(full_name) <= 200));

ALTER TABLE ad_access_requests DROP CONSTRAINT ad_access_requests_kind_check;
ALTER TABLE ad_access_requests ADD CONSTRAINT ad_access_requests_kind_check
  CHECK (kind IN ('GRANT_ROLE', 'REVOKE_ROLE', 'SET_LEGAL_SIGNER', 'GRANT_BRANCH', 'REVOKE_BRANCH', 'ADD_MEMBER'));
ALTER TABLE ad_access_requests DROP CONSTRAINT ad_access_shape_chk;
ALTER TABLE ad_access_requests ADD CONSTRAINT ad_access_shape_chk CHECK (
  (kind IN ('GRANT_ROLE', 'REVOKE_ROLE') AND role IS NOT NULL AND flag IS NULL AND branch_id IS NULL)
  OR (kind = 'SET_LEGAL_SIGNER' AND role IS NULL AND flag IS NOT NULL AND branch_id IS NULL)
  OR (kind IN ('GRANT_BRANCH', 'REVOKE_BRANCH') AND role IS NULL AND flag IS NULL AND branch_id IS NOT NULL)
  OR (kind = 'ADD_MEMBER' AND role IS NOT NULL AND flag IS NOT NULL));

-- Nhãn hiển thị: "Họ tên (email)" khi đã có họ tên, ngược lại email / mã ngoài.
CREATE FUNCTION ad_user_label(p_full_name text, p_email text, p_ref text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_full_name IS NULL THEN coalesce(p_email, p_ref)
              WHEN p_email IS NULL THEN p_full_name ELSE p_full_name || ' (' || p_email || ')' END
$$;

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
    SELECT m.user_id, ad_user_label(u.full_name, ac.email, u.external_ref), m.role, m.legal_signer, ac.user_id IS NOT NULL,
           coalesce((SELECT array_agg(b.name ORDER BY b.name) FROM branch_grants g
                     JOIN branches b ON b.id = g.branch_id AND b.tenant_id = g.tenant_id
                     WHERE g.membership_id = m.id AND g.tenant_id = p_tenant), ARRAY[]::text[])
    FROM memberships m
    JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
    LEFT JOIN auth_credentials ac ON ac.user_id = m.user_id AND ac.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.office_id = p_office
    UNION ALL
    SELECT u.id, ad_user_label(u.full_name, ac.email, u.external_ref), NULL::text, false, ac.user_id IS NOT NULL, ARRAY[]::text[]
    FROM users u
    LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
    WHERE u.tenant_id = p_tenant
      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = u.id AND m.office_id = p_office)
    ORDER BY 3 NULLS LAST, 2, 1;
END $$;

-- Danh sách đề xuất (thay bản 0024): nhãn có họ tên; ADD_MEMBER trả thêm cờ ký và chi nhánh.
CREATE OR REPLACE FUNCTION of_search_access_requests(p_tenant uuid, p_actor uuid, p_office uuid)
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
    SELECT r.id, r.target_user_id, ad_user_label(u.full_name, ac.email, u.external_ref), r.kind, r.role, r.flag, b.name, r.status, r.reason,
           r.proposed_by, r.proposed_at, r.decided_by, r.decision_note
    FROM ad_access_requests r
    JOIN users u ON u.id = r.target_user_id AND u.tenant_id = r.tenant_id
    LEFT JOIN auth_credentials ac ON ac.user_id = r.target_user_id AND ac.tenant_id = r.tenant_id
    LEFT JOIN branches b ON b.id = r.branch_id AND b.tenant_id = r.tenant_id
    WHERE r.tenant_id = p_tenant AND r.office_id = p_office
    ORDER BY (r.status = 'PENDING') DESC, r.proposed_at DESC, r.id LIMIT 200;
END $$;

-- Kiểm tra nội dung đề xuất (thay bản 0024): thêm ADD_MEMBER. Người chưa có vai nào ở văn phòng này; cờ ký chỉ cho Admin / Trưởng VP;
-- chi nhánh chỉ cho Văn thư / Kế toán.
CREATE OR REPLACE FUNCTION ad_access_check(p_tenant uuid, p_office uuid, p_user uuid, p_kind text, p_role text, p_flag boolean, p_branch uuid)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.tenant_id = p_tenant) THEN RETURN 'USER_NOT_FOUND'; END IF;
  IF p_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN 'BRANCH_NOT_FOUND';
  END IF;
  IF p_kind = 'ADD_MEMBER' THEN
    IF EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user) THEN RETURN 'ROLE_ALREADY_GRANTED'; END IF;
    IF p_flag IS TRUE AND p_role NOT IN ('ADMIN', 'TRUONG_VP') THEN RETURN 'SIGNER_ROLE_INVALID'; END IF;
    IF p_branch IS NOT NULL AND p_role NOT IN ('VAN_THU', 'KE_TOAN') THEN RETURN 'BRANCH_ROLE_INVALID'; END IF;
  ELSIF p_kind = 'GRANT_ROLE' THEN
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

-- Duyệt / từ chối (thay bản 0024): chặn duyệt đề xuất về chính mình (chốt 27/10/2026), trừ quyền ký pháp lý vì văn phòng một Trưởng VP không còn ai khác để cấp; thêm nhánh ADD_MEMBER, tạo vai đầu tiên kèm cờ ký và chi nhánh trong cùng giao dịch.
CREATE OR REPLACE FUNCTION ad_access_decide(p_tenant uuid, p_actor uuid, p_request uuid, p_approve boolean, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r ad_access_requests%ROWTYPE; denied text; mid uuid;
BEGIN
  SELECT * INTO r FROM ad_access_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = r.office_id AND a.role = 'TRUONG_VP') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'HEAD_ONLY', r.office_id, NULL, NULL);
  END IF;
  IF r.proposed_by = p_actor THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'SEPARATE_APPROVER_REQUIRED', r.office_id, NULL, NULL); END IF;
  IF r.target_user_id = p_actor AND r.kind <> 'SET_LEGAL_SIGNER' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'SELF_TARGET_NOT_ALLOWED', r.office_id, NULL, NULL); END IF;
  IF r.status <> 'PENDING' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'REQUEST_FINAL', r.office_id, NULL, NULL); END IF;
  IF p_approve IS NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'INVALID_REQUEST', r.office_id, NULL, NULL); END IF;
  IF NOT p_approve THEN
    IF btrim(coalesce(p_note, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, 'REASON_REQUIRED', r.office_id, NULL, NULL); END IF;
    UPDATE ad_access_requests SET status = 'REJECTED', decided_by = p_actor, decided_at = now(), decision_note = btrim(p_note) WHERE id = r.id AND tenant_id = p_tenant;
    RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', true, 'ALLOWED', r.office_id, NULL, 'REJECTED');
  END IF;
  denied := ad_access_check(p_tenant, r.office_id, r.target_user_id, r.kind, r.role, r.flag, r.branch_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.access.decide', false, denied, r.office_id, NULL, NULL); END IF;
  IF r.kind = 'ADD_MEMBER' THEN
    INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer)
    VALUES (p_tenant, r.target_user_id, r.office_id, r.role, coalesce(r.flag, false)) RETURNING id INTO mid;
    IF r.branch_id IS NOT NULL THEN
      INSERT INTO branch_grants (tenant_id, membership_id, branch_id) VALUES (p_tenant, mid, r.branch_id);
    END IF;
  ELSIF r.kind = 'GRANT_ROLE' THEN
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

-- Admin thêm thành viên: tạo người dùng + thông tin đăng nhập + một đề xuất ADD_MEMBER chờ Trưởng VP duyệt. label = id đề xuất.
-- p_hash là băm do API tính (mật khẩu tạm do Admin đặt, hoặc băm ngẫu nhiên không ai biết khi chỉ dùng link email).
CREATE FUNCTION ad_member_add(p_tenant uuid, p_actor uuid, p_office uuid, p_email text, p_full_name text, p_role text, p_flag boolean,
                              p_branch uuid, p_hash text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE em text := lower(btrim(coalesce(p_email, ''))); uid uuid; rid uuid;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF em !~ '^[^@\s]+@[^@\s]+$' OR length(em) > 254 OR p_hash IS NULL OR btrim(p_hash) = ''
     OR btrim(coalesce(p_full_name, '')) = '' OR length(p_full_name) > 200
     OR p_role IS NULL OR p_role NOT IN ('ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN') OR p_flag IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', false, 'INVALID_REQUEST', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', false, 'REASON_REQUIRED', p_office, NULL, NULL); END IF;
  IF p_flag AND p_role NOT IN ('ADMIN', 'TRUONG_VP') THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', false, 'SIGNER_ROLE_INVALID', p_office, NULL, NULL); END IF;
  IF p_branch IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
    END IF;
    IF p_role NOT IN ('VAN_THU', 'KE_TOAN') THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', false, 'BRANCH_ROLE_INVALID', p_office, NULL, NULL); END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.email = em) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', false, 'EMAIL_IN_USE', p_office, NULL, NULL);
  END IF;
  INSERT INTO users (tenant_id, external_ref, full_name) VALUES (p_tenant, em, btrim(p_full_name)) RETURNING id INTO uid;
  INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES (p_tenant, uid, em, p_hash);
  INSERT INTO ad_access_requests (tenant_id, office_id, target_user_id, kind, role, flag, branch_id, reason, proposed_by)
  VALUES (p_tenant, p_office, uid, 'ADD_MEMBER', p_role, p_flag, p_branch, btrim(p_reason), p_actor) RETURNING id INTO rid;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.member.add', true, 'ALLOWED', p_office, NULL, rid::text);
END $$;

-- Chi nhánh (địa điểm hoạt động): chỉ Admin văn phòng; tên 1..100 ký tự, không trùng trong văn phòng (không phân biệt hoa thường).
CREATE FUNCTION ad_branch_create(p_tenant uuid, p_actor uuid, p_office uuid, p_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE nm text := btrim(coalesce(p_name, '')); bid uuid;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.create', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF nm = '' OR length(nm) > 100 THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.create', false, 'INVALID_REQUEST', p_office, NULL, NULL); END IF;
  IF EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office AND lower(b.name) = lower(nm)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.create', false, 'BRANCH_NAME_TAKEN', p_office, NULL, NULL);
  END IF;
  INSERT INTO branches (tenant_id, office_id, name) VALUES (p_tenant, p_office, nm) RETURNING id INTO bid;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.create', true, 'ALLOWED', p_office, bid, bid::text);
END $$;

CREATE FUNCTION ad_branch_rename(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE nm text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.rename', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.rename', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF nm = '' OR length(nm) > 100 THEN RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.rename', false, 'INVALID_REQUEST', p_office, p_branch, NULL); END IF;
  IF EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office AND lower(b.name) = lower(nm) AND b.id <> p_branch) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.rename', false, 'BRANCH_NAME_TAKEN', p_office, p_branch, NULL);
  END IF;
  UPDATE branches SET name = nm WHERE id = p_branch AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.branch.rename', true, 'ALLOWED', p_office, p_branch, p_branch::text);
END $$;
