-- Thêm thành viên theo Figma Q2 + quyết định owner "quyền chỉ theo nhóm quyền, không theo vai" (2026-10-30/31).
--   * Vai mới THANH_VIEN: tư cách thành viên văn phòng (cần để đăng nhập và thuộc văn phòng) và TUYỆT ĐỐI không kèm quyền nào.
--     Mọi hàm cũ kiểm theo danh sách vai cụ thể (ADMIN, TRUONG_VP, THV, ...) nên THANH_VIEN không lọt vào danh sách nào.
--     Mọi quyền DMS của người này chỉ đến từ nhóm quyền.
--   * ad_member_create: người có quyền duyệt phân quyền (Admin) tạo tài khoản + tư cách thành viên + xếp vào các nhóm quyền
--     trong MỘT giao dịch. Việc xếp nhóm đi qua dms_permission_propose nên Admin áp dụng ngay (đã duyệt tự động, có
--     auto_applied), vẫn có yêu cầu ADD_MEMBER trong nhật ký phân quyền. Không có đường tắt cho người không phải Admin.
--   * ad_member_add (đường cũ theo vai + đề xuất ADD_MEMBER) GIỮ NGUYÊN trong CSDL để dữ liệu cũ còn đọc được;
--     API/giao diện không còn gọi nó.
-- Dữ liệu giả lập; không lưu mật khẩu gốc, chỉ băm do API tính.

ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THANH_VIEN'));

-- label = id người dùng mới (để giao diện chuyển tới trang quyền hiệu lực của người đó).
CREATE FUNCTION ad_member_create(p_tenant uuid, p_actor uuid, p_office uuid, p_email text, p_full_name text,
                                 p_groups uuid[], p_hash text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE em text := lower(btrim(coalesce(p_email, ''))); uid uuid; gid uuid; op vibang_op; groups uuid[];
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF em !~ '^[^@\s]+@[^@\s]+$' OR length(em) > 254 OR p_hash IS NULL OR btrim(p_hash) = ''
     OR btrim(coalesce(p_full_name, '')) = '' OR length(p_full_name) > 200 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'INVALID_REQUEST', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'REASON_REQUIRED', p_office, NULL, NULL);
  END IF;
  -- Bỏ nhóm trùng; mọi nhóm phải thuộc văn phòng này.
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO groups FROM unnest(coalesce(p_groups, ARRAY[]::uuid[])) x;
  IF EXISTS (SELECT 1 FROM unnest(groups) g
             WHERE NOT EXISTS (SELECT 1 FROM dms_permission_groups pg
                               WHERE pg.id = g AND pg.tenant_id = p_tenant AND pg.office_id = p_office)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'GROUP_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.email = em) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'EMAIL_IN_USE', p_office, NULL, NULL);
  END IF;
  INSERT INTO users (tenant_id, external_ref, full_name) VALUES (p_tenant, em, btrim(p_full_name)) RETURNING id INTO uid;
  INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES (p_tenant, uid, em, p_hash);
  INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES (p_tenant, uid, p_office, 'THANH_VIEN', false);
  FOREACH gid IN ARRAY groups LOOP
    op := dms_permission_propose(p_tenant, p_actor, gid, 'ADD_MEMBER', NULL, uid, btrim(p_reason));
    -- Admin + nhóm hợp lệ + người mới thì không có lý do để từ chối; nếu có thì huỷ cả giao dịch, không để người nửa vời.
    IF op.code <> 'REQUEST_APPLIED' THEN
      RAISE EXCEPTION 'ad_member_create: cannot add member to group (%)', op.code USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', true, 'ALLOWED', p_office, NULL, uid::text);
END $$;
