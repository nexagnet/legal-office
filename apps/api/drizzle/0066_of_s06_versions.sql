-- Hồ sơ lao động S-06: xem các phiên bản cũ của một người (mỗi lần lưu là một phiên bản, chỉ ghi thêm).
-- Cùng phạm vi xem với of_s06_read: chỉ ADMIN và TRUONG_VP; mọi lần đọc đều ghi nhật ký. Không có cột số tiền.
CREATE FUNCTION of_s06_versions(p_tenant uuid, p_actor uuid, p_office uuid, p_person uuid)
RETURNS TABLE (person_id uuid, version integer, branch_id uuid, full_name text, gender text, specialty text, bailiff_decision_ref text,
  executor_decision_ref text, is_office_head boolean, is_partner boolean, labor_contract_ref text, insurance_purchased boolean,
  insurance_note text, contributing boolean, contribution_note text, note text, work_status text, saved_by uuid, saved_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE denied text;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.versions', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.s06.versions', true, 'ALLOWED', p_office, NULL, p_person::text);
  RETURN QUERY
    SELECT p.person_id, p.version, p.branch_id, p.full_name, p.gender, p.specialty, p.bailiff_decision_ref, p.executor_decision_ref,
           p.is_office_head, p.is_partner, p.labor_contract_ref, p.insurance_purchased, p.insurance_note, p.contributing,
           p.contribution_note, p.note, p.work_status, p.saved_by, p.at
    FROM of_personnel p
    WHERE p.tenant_id = p_tenant AND p.office_id = p_office AND p.person_id = p_person
    ORDER BY p.version DESC;
END $$;
