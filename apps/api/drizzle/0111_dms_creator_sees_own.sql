-- DMS (0111): người tạo hồ sơ luôn thấy hồ sơ do mình tạo; thêm Lịch sử hồ sơ.
--
-- Quy tắc cũ: người tạo vẫn cần quyền xem (<nghiệp vụ>.read.own hoặc .read.all) và còn bị chặn bởi chi nhánh.
-- Hệ quả: tài khoản chỉ có quyền tạo nháp (draft) tạo xong lại không thấy hồ sơ của chính mình.
-- Quy tắc mới (chủ dự án chốt 04/11/2026): hồ sơ do mình tạo luôn thấy, KHÔNG phụ thuộc quyền xem và chi nhánh.
-- Ngoại lệ duy nhất: tài khoản đang bị tạm khóa không thấy gì. Người khác (kể cả Admin) vẫn không thấy bản nháp của người
-- tạo nếu không được cấp quyền như trước. Quyền tải tệp, in, thêm tài liệu... vẫn kiểm riêng, không đổi.
--
-- Ba nơi phải sửa cùng lúc để kết quả không lệch nhau (bài so khớp dms-scale.itest):
--   1. dms_case_visible        (kiểm từng hồ sơ),
--   2. dms_visible_scope       (quyền xem tính một lần cho mỗi truy vấn),
--   3. dms_ci_vis_sql          (điều kiện SQL ghép vào tìm kiếm).

-- ===== 1. Kiểm từng hồ sơ =====
CREATE OR REPLACE FUNCTION dms_case_visible(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_created_by uuid, p_branch uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (p_created_by = p_actor AND NOT dms_user_suspended(p_tenant, p_actor))
      OR (CASE WHEN p_status = 'RECORDED' THEN dms_authorize(p_tenant, p_actor, p_office, p_domain, 'read', p_created_by) IS NULL
               ELSE p_created_by = p_actor
                    AND (dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.read.own')
                      OR dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.read.all')) END
          AND dms_user_in_branch(p_tenant, p_actor, p_office, p_branch));
$$;

-- ===== 2. Quyền xem tính một lần: thêm cột creator_ok =====
DROP FUNCTION dms_visible_scope(uuid, uuid, uuid);
CREATE FUNCTION dms_visible_scope(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (all_domains text[], own_domains text[], branch_ids uuid[], unassigned_ok boolean, creator_ok boolean)
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT array_agg(d) FROM unnest(ARRAY['vibang','tongdat','xacminh','tochuc','vtden','vtdi','vtnb']) d
                    WHERE dms_has_permission(p_tenant, p_actor, p_office, d || '.read.all')), '{}'::text[]),
         coalesce((SELECT array_agg(d) FROM unnest(ARRAY['vibang','tongdat','xacminh','tochuc','vtden','vtdi','vtnb']) d
                    WHERE dms_has_permission(p_tenant, p_actor, p_office, d || '.read.own')), '{}'::text[]),
         coalesce((SELECT array_agg(b) FROM dms_branch_ids(p_tenant, p_actor, p_office) b), '{}'::uuid[]),
         NOT EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office)
           OR (NOT dms_user_suspended(p_tenant, p_actor) AND dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')),
         NOT dms_user_suspended(p_tenant, p_actor)
$$;

-- ===== 3. Điều kiện SQL (alias bảng = ci) =====
CREATE OR REPLACE FUNCTION dms_ci_vis_sql(p_tenant uuid, p_actor uuid, p_office uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM dms_visible_scope(p_tenant, p_actor, p_office);
  RETURN format(
    '(((ci.status = ''RECORDED'' AND (ci.domain = ANY(%1$L::text[]) OR (ci.created_by = %3$L AND ci.domain = ANY(%2$L::text[])))) '
    'OR (ci.status <> ''RECORDED'' AND ci.created_by = %3$L AND (ci.domain = ANY(%1$L::text[]) OR ci.domain = ANY(%2$L::text[])))) '
    'AND ((ci.branch_id IS NULL AND %5$L::boolean) OR ci.branch_id = ANY(%4$L::uuid[])) '
    'OR (ci.created_by = %3$L AND %6$L::boolean))',
    s.all_domains, s.own_domains, p_actor, s.branch_ids, s.unassigned_ok, s.creator_ok);
END $$;

-- ===== 4. Thẻ số "việc còn dở" (0102) gọi dms_case_visible thiếu chi nhánh =====
-- Hàm 0102 được viết sau khi 0092 đã vá các nơi gọi, nên truyền 6 tham số: chi nhánh = NULL = không giới hạn.
-- Ở văn phòng có chi nhánh, người xem đếm cả hồ sơ ngoài chi nhánh được cấp. Vá cho cùng luật với danh sách.
DO $do$
DECLARE r record; def text; patched text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = current_schema() AND p.proname = 'dms_domain_pending_counts'
  LOOP
    def := pg_get_functiondef(r.oid);
    patched := regexp_replace(def, '(dms_case_visible\([^()]*c\.created_by)\)', '\1, c.branch_id)', 'g');
    IF patched = def THEN RAISE EXCEPTION 'dms_domain_pending_counts not patched'; END IF;
    EXECUTE patched;
  END LOOP;
END $do$;

-- ===== 4b. Tên người tạo cho mọi trạng thái hồ sơ =====
-- Trang chi tiết chỉ hiện "Người tạo" ở bản nháp. Thêm cột created_by_name vào hàm đọc phần bổ sung (số hồ sơ, đã trả, SĐT)
-- để danh sách và chi tiết hiện người tạo ở cả hồ sơ đã ghi sổ và đã hủy. Cùng luật hiển thị như trước.
DROP FUNCTION dms_case_extras(uuid, uuid, uuid[]);
CREATE FUNCTION dms_case_extras(p_tenant uuid, p_actor uuid, p_cases uuid[])
RETURNS TABLE (case_id uuid, case_number text, returned boolean, phone text, created_by_name text)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.case_number, coalesce(r.returned, false),
         nullif(btrim(coalesce((SELECT e.attributes ->> 'so_dien_thoai' FROM dms_case_effective(c.tenant_id, c.id) e), '')), ''),
         (SELECT ad_user_label(u.full_name, ac.email, u.external_ref) FROM users u
            LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
           WHERE u.id = c.created_by AND u.tenant_id = c.tenant_id)
    FROM dms_case_files c
    LEFT JOIN dms_case_returned r ON r.tenant_id = c.tenant_id AND r.case_id = c.id
   WHERE c.tenant_id = p_tenant AND c.id = ANY (p_cases)
     AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
$$;

-- ===== 5. Lịch sử hồ sơ =====
-- Mọi việc đã làm trên MỘT hồ sơ (tạo nháp, sửa, thêm tài liệu, tải tệp, ghi sổ, hủy...), mới nhất trước.
-- Đọc từ dms_audit_records (chỉ ghi thêm). Ai xem được hồ sơ (dms_case_visible) thì xem được lịch sử của nó;
-- người khác nhận danh sách rỗng, không lộ hồ sơ có tồn tại hay không.
CREATE FUNCTION dms_case_history(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id bigint, at timestamptz, actor_id uuid, actor_label text, action text, target_type text, target_id uuid, detail jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE c dms_case_files%ROWTYPE;
BEGIN
  SELECT * INTO c FROM dms_case_files f WHERE f.id = p_case AND f.tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.at, a.actor_id,
           (SELECT ad_user_label(u.full_name, ac.email, u.external_ref) FROM users u
              LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
             WHERE u.id = a.actor_id AND u.tenant_id = p_tenant),
           a.action, a.target_type, a.target_id, a.detail
      FROM dms_audit_records a
     WHERE a.tenant_id = p_tenant
       AND ((a.target_type = 'case' AND a.target_id = p_case)
         OR (a.target_type = 'document' AND a.target_id IN (SELECT d.id FROM dms_documents d WHERE d.case_id = p_case AND d.tenant_id = p_tenant))
         OR (a.target_type = 'file' AND a.target_id IN (SELECT f.id FROM dms_document_files f JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
                                                          WHERE d.case_id = p_case AND d.tenant_id = p_tenant)))
     ORDER BY a.at DESC, a.id DESC
     LIMIT 500;
END $$;
