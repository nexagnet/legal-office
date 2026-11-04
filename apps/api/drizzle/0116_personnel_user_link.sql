-- P4e: hồ sơ lao động gắn với tài khoản. of_personnel là bảng ghi thêm (mỗi lần lưu một phiên bản): thêm cột user_id cho các
-- phiên bản mới; bản ghi cũ để NULL và được ghép tay (of_personnel_link) vì person_id cũ là uuid ngẫu nhiên, không ghép theo tên.
ALTER TABLE of_personnel ADD COLUMN user_id uuid;
CREATE INDEX of_personnel_user_idx ON of_personnel (tenant_id, user_id) WHERE user_id IS NOT NULL;

-- Bản mới nhất mỗi người, nay có thêm user_id (cột thêm vào cuối nên CREATE OR REPLACE hợp lệ).
CREATE OR REPLACE VIEW of_s06_book WITH (security_invoker = true) AS
SELECT DISTINCT ON (p.person_id) p.* FROM of_personnel p ORDER BY p.person_id, p.version DESC;

-- Lưu phiên bản mới; p_user NULL thì giữ liên kết tài khoản của phiên bản trước. Một tài khoản chỉ gắn với một hồ sơ.
DROP FUNCTION of_personnel_save(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, boolean, boolean, text, boolean, text, boolean, text, text, text);
CREATE FUNCTION of_personnel_save(p_tenant uuid, p_actor uuid, p_office uuid, p_person uuid, p_branch uuid, p_name text, p_gender text,
  p_specialty text, p_bailiff_ref text, p_executor_ref text, p_head boolean, p_partner boolean, p_contract_ref text,
  p_ins_purchased boolean, p_ins_note text, p_contributing boolean, p_contrib_note text, p_note text, p_status text,
  p_user uuid DEFAULT NULL)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; pid uuid; v integer; uid uuid;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_name, '')) = '' OR p_gender IS NULL OR p_gender NOT IN ('M', 'F') OR p_status IS NULL OR p_status NOT IN ('ACTIVE', 'LEFT') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'INVALID_PERSONNEL', p_office, p_branch, NULL);
  END IF;
  IF p_person IS NULL THEN pid := gen_random_uuid(); v := 1; uid := p_user;
  ELSE
    SELECT coalesce(max(version), 0) + 1 INTO v FROM of_personnel WHERE person_id = p_person AND tenant_id = p_tenant AND office_id = p_office;
    IF v = 1 THEN RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'PERSON_NOT_FOUND', p_office, p_branch, NULL); END IF;
    pid := p_person;
    uid := coalesce(p_user, (SELECT s.user_id FROM of_personnel s WHERE s.person_id = p_person AND s.tenant_id = p_tenant ORDER BY s.version DESC LIMIT 1));
  END IF;
  IF uid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = uid AND tenant_id = p_tenant) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'USER_NOT_FOUND', p_office, p_branch, NULL);
    END IF;
    IF EXISTS (SELECT 1 FROM of_s06_book b WHERE b.tenant_id = p_tenant AND b.user_id IS NOT DISTINCT FROM uid AND b.person_id <> pid) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'USER_ALREADY_LINKED', p_office, p_branch, NULL);
    END IF;
  END IF;
  INSERT INTO of_personnel (tenant_id, office_id, person_id, version, branch_id, full_name, gender, specialty, bailiff_decision_ref, executor_decision_ref,
    is_office_head, is_partner, labor_contract_ref, insurance_purchased, insurance_note, contributing, contribution_note, note, work_status, saved_by, user_id)
  VALUES (p_tenant, p_office, pid, v, p_branch, btrim(p_name), p_gender, p_specialty, p_bailiff_ref, p_executor_ref, coalesce(p_head, false), coalesce(p_partner, false),
    p_contract_ref, p_ins_purchased, p_ins_note, p_contributing, p_contrib_note, p_note, p_status, p_actor, uid);
  RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', true, 'ALLOWED', p_office, p_branch, pid::text);
END $$;

-- Hồ sơ lao động (bản mới nhất) của MỘT tài khoản. Admin/Trưởng VP; luôn audit như of_s06_read.
CREATE FUNCTION of_personnel_for_user(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid)
RETURNS TABLE (person_id uuid, version integer, branch_id uuid, full_name text, gender text, specialty text, bailiff_decision_ref text,
  executor_decision_ref text, is_office_head boolean, is_partner boolean, labor_contract_ref text, insurance_purchased boolean,
  insurance_note text, contributing boolean, contribution_note text, note text, work_status text, user_id uuid)
LANGUAGE plpgsql AS $$
BEGIN
  IF td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP'], NULL) IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.read', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.read', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT s.person_id, s.version, s.branch_id, s.full_name, s.gender, s.specialty, s.bailiff_decision_ref, s.executor_decision_ref,
           s.is_office_head, s.is_partner, s.labor_contract_ref, s.insurance_purchased, s.insurance_note, s.contributing,
           s.contribution_note, s.note, s.work_status, s.user_id
      FROM of_s06_book s WHERE s.tenant_id = p_tenant AND s.office_id = p_office AND s.user_id = p_user;
END $$;

-- Hồ sơ lao động chưa gắn tài khoản (để ghép tay). Admin/Trưởng VP.
CREATE FUNCTION of_personnel_unlinked(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (person_id uuid, full_name text, work_status text, specialty text)
LANGUAGE plpgsql AS $$
BEGIN
  IF td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP'], NULL) IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.read', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.read', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT s.person_id, s.full_name, s.work_status, s.specialty
      FROM of_s06_book s WHERE s.tenant_id = p_tenant AND s.office_id = p_office AND s.user_id IS NULL
     ORDER BY s.full_name, s.person_id;
END $$;

-- Ghép (hoặc gỡ, p_user NULL) hồ sơ lao động với tài khoản: ghi một phiên bản mới giữ nguyên nội dung, chỉ đổi user_id.
CREATE FUNCTION of_personnel_link(p_tenant uuid, p_actor uuid, p_office uuid, p_person uuid, p_user uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s of_personnel;
BEGIN
  SELECT * INTO s FROM of_personnel WHERE person_id = p_person AND tenant_id = p_tenant AND office_id = p_office ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'PERSON_NOT_FOUND', p_office, NULL, NULL); END IF;
  IF td_authorize(p_tenant, p_actor, p_office, s.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL) IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_user IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND tenant_id = p_tenant) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'USER_NOT_FOUND', p_office, s.branch_id, NULL);
    END IF;
    IF EXISTS (SELECT 1 FROM of_s06_book b WHERE b.tenant_id = p_tenant AND b.user_id = p_user AND b.person_id <> p_person) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'USER_ALREADY_LINKED', p_office, s.branch_id, NULL);
    END IF;
  END IF;
  IF s.user_id IS NOT DISTINCT FROM p_user THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', false, 'NO_CHANGE', p_office, s.branch_id, NULL);
  END IF;
  INSERT INTO of_personnel (tenant_id, office_id, person_id, version, branch_id, full_name, gender, specialty, bailiff_decision_ref, executor_decision_ref,
    is_office_head, is_partner, labor_contract_ref, insurance_purchased, insurance_note, contributing, contribution_note, note, work_status, saved_by, user_id)
  VALUES (p_tenant, p_office, p_person, s.version + 1, s.branch_id, s.full_name, s.gender, s.specialty, s.bailiff_decision_ref, s.executor_decision_ref,
    s.is_office_head, s.is_partner, s.labor_contract_ref, s.insurance_purchased, s.insurance_note, s.contributing, s.contribution_note, s.note,
    s.work_status, p_actor, p_user);
  RETURN vibang_audit(p_tenant, p_actor, 'of.personnel.save', true, 'ALLOWED', p_office, s.branch_id, p_person::text);
END $$;
