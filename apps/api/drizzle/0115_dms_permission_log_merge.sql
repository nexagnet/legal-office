-- P4d: nhật ký phân quyền gộp vào Lịch sử hoạt động.
-- 1) Các thao tác quản trị chưa ghi dms_audit_records (tạo/đổi tên thành viên, chi nhánh, cài đặt văn phòng, email gửi thư,
--    lịch làm việc, hồ sơ lao động, gán chi nhánh cho hồ sơ) được chép từ audit_log khi thành công. Chỉ ghi thêm; không chép CCCD
--    hay nội dung, chỉ mã hành động và mã kết quả. Đối tượng là chi nhánh nếu có, không thì văn phòng (audit_log chưa lưu đối tượng riêng).
-- 2) dms_activity_list: người có quyền duyệt thay đổi quyền (không chỉ vai ADMIN) đọc được; nhóm "permission" thêm các hành động trên.
CREATE OR REPLACE FUNCTION dms_audit_log_mirror() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome = 'allow'
     AND NEW.action IN ('ad.member.create', 'ad.member.add', 'ad.member.rename', 'ad.branch.create', 'ad.branch.rename',
                        'ad.case.assign_branch', 'of.settings.set', 'of.mail_settings.set', 'of.calendar.holiday.add',
                        'of.calendar.holiday.remove', 'of.calendar.weekdays', 'of.personnel.save')
     AND NEW.office_id IS NOT NULL AND NEW.actor_id ~ '^[0-9a-f-]{36}$' THEN
    INSERT INTO dms_audit_records (tenant_id, office_id, actor_id, action, target_type, target_id, detail)
    VALUES (NEW.tenant_id, NEW.office_id, NEW.actor_id::uuid, NEW.action,
            CASE WHEN NEW.branch_id IS NULL THEN 'office' ELSE 'branch' END, coalesce(NEW.branch_id, NEW.office_id),
            jsonb_build_object('code', NEW.reason, 'branch_id', NEW.branch_id));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS audit_log_mirror_dms ON audit_log;
CREATE TRIGGER audit_log_mirror_dms AFTER INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION dms_audit_log_mirror();

CREATE OR REPLACE FUNCTION dms_activity_list(p_tenant uuid, p_actor uuid, p_office uuid, p_group text, p_q text, p_limit integer, p_offset integer)
RETURNS TABLE (id bigint, at timestamptz, actor_id uuid, actor_label text, action text, target_type text, target_id uuid, detail jsonb,
               case_id uuid, case_number text, case_title text, domain text, submission_id uuid, submission_title text, total bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE needle text := nullif(btrim(coalesce(p_q, '')), '');
BEGIN
  IF p_office IS NULL OR NOT (dms_office_admin(p_tenant, p_actor, p_office)
                              OR dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')) THEN RETURN; END IF;
  IF p_group IS NOT NULL AND p_group NOT IN ('case', 'document', 'file', 'submission', 'permission') THEN RETURN; END IF;
  RETURN QUERY
    WITH ctx AS (
      SELECT a.id, a.at, a.actor_id, a.action, a.target_type, a.target_id, a.detail,
             coalesce(c1.id, c2.id, c3.id) AS case_id,
             coalesce(c1.case_number, c2.case_number, c3.case_number) AS case_number,
             coalesce(c1.title, c2.title, c3.title) AS case_title,
             coalesce(c1.domain, c2.domain, c3.domain) AS domain,
             coalesce(s1.id, s2.id) AS submission_id,
             coalesce(s1.title, s2.title) AS submission_title
        FROM dms_audit_records a
        LEFT JOIN dms_case_files c1 ON a.target_type = 'case' AND c1.id = a.target_id AND c1.tenant_id = a.tenant_id
        LEFT JOIN dms_documents d2 ON a.target_type = 'document' AND d2.id = a.target_id AND d2.tenant_id = a.tenant_id
        LEFT JOIN dms_case_files c2 ON c2.id = d2.case_id AND c2.tenant_id = d2.tenant_id
        LEFT JOIN dms_document_files f3 ON a.target_type = 'file' AND f3.id = a.target_id AND f3.tenant_id = a.tenant_id
        LEFT JOIN dms_documents d3 ON d3.id = f3.document_id AND d3.tenant_id = f3.tenant_id
        LEFT JOIN dms_case_files c3 ON c3.id = d3.case_id AND c3.tenant_id = d3.tenant_id
        LEFT JOIN dms_submissions s1 ON a.target_type = 'submission' AND s1.id = a.target_id AND s1.tenant_id = a.tenant_id
        LEFT JOIN dms_submission_files sf ON a.target_type = 'submission_file' AND sf.id = a.target_id AND sf.tenant_id = a.tenant_id
        LEFT JOIN dms_submissions s2 ON s2.id = sf.submission_id AND s2.tenant_id = sf.tenant_id
       WHERE a.tenant_id = p_tenant AND a.office_id = p_office
         AND (p_group IS NULL
              OR (p_group = 'case' AND a.action LIKE 'dms.case.%')
              OR (p_group = 'document' AND a.action LIKE 'dms.document.%')
              OR (p_group = 'file' AND (a.action LIKE 'dms.file.%' OR a.action LIKE 'dms.scan.%'))
              OR (p_group = 'submission' AND a.action LIKE 'dms.submission.%')
              OR (p_group = 'permission' AND (a.action LIKE 'dms.permission.%' OR a.action LIKE 'dms.group.%'
                                          OR a.action LIKE 'ad.%' OR a.action LIKE 'auth.%' OR a.action LIKE 'of.settings.%'
                                          OR a.action LIKE 'of.mail_settings.%' OR a.action LIKE 'of.calendar.%'
                                          OR a.action LIKE 'of.personnel.%')))
    )
    SELECT x.id, x.at, x.actor_id,
           (SELECT ad_user_label(u.full_name, ac.email, u.external_ref) FROM users u
              LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
             WHERE u.id = x.actor_id AND u.tenant_id = p_tenant),
           x.action, x.target_type, x.target_id, x.detail,
           x.case_id, x.case_number, x.case_title, x.domain, x.submission_id, x.submission_title,
           count(*) OVER ()
      FROM ctx x
     WHERE needle IS NULL
        OR x.case_number ILIKE '%' || needle || '%'
        OR x.case_title ILIKE '%' || needle || '%'
        OR x.submission_title ILIKE '%' || needle || '%'
        OR EXISTS (SELECT 1 FROM users u
                     LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
                    WHERE u.id = x.actor_id AND u.tenant_id = p_tenant
                      AND ad_user_label(u.full_name, ac.email, u.external_ref) ILIKE '%' || needle || '%')
     ORDER BY x.at DESC, x.id DESC
     LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;
