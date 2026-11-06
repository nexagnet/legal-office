-- Danh mục quyền theo "Bảng quy đổi nhóm mẫu sang mã quyền thật" (owner duyệt 2026-11-01) + gieo 6 nhóm mẫu của Figma P0.
--   * Mã mới: <nghiệp vụ>.amend_request.<own|all> (đề nghị sửa đổi hồ sơ đã lưu) và dms.amendment.approve (duyệt/từ chối yêu cầu sửa đổi).
--     Trước đây đề nghị sửa đổi đi theo quyền `draft` và duyệt sửa đổi dùng chung dms.permission.approve; Figma tách hai quyền duyệt.
--   * dms.permission.approve CHỈ còn duyệt thay đổi quyền. Admin mặc nhiên có cả hai. Người đề xuất vẫn không tự duyệt.
--   * Giữ hành vi cho dữ liệu đang chạy: nhóm đang có `draft` thì được thêm `amend_request` cùng phạm vi; nhóm đang có
--     dms.permission.approve thì được thêm dms.amendment.approve. Việc bù này là thao tác hệ thống của migration, tăng phiên bản nhóm.
--   * dms.amendment.approve là quyền quản trị phân quyền: không sao chép sang nhóm mới khi "Sao chép nhóm".
--   * Nhóm mẫu: kind = TEMPLATE (được bảo vệ, không sửa trực tiếp, không ngừng dùng), chưa có thành viên. Văn phòng sao chép rồi chỉnh.
--     Nếu văn phòng đã có nhóm trùng tên thì nhóm mẫu thêm hậu tố " (mẫu)".
--     Phạm vi theo địa điểm của Văn thư sẽ ép ở PR riêng; trước đó `.all` của nhóm Văn thư là toàn văn phòng.
-- Dữ liệu giả lập.

ALTER TABLE dms_group_permissions DROP CONSTRAINT dms_group_permissions_permission_check;
ALTER TABLE dms_group_permissions ADD CONSTRAINT dms_group_permissions_permission_check CHECK (
  permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download|amend_request)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write', 'dms.legacy.import', 'dms.legacy.read')
);
ALTER TABLE dms_permission_requests DROP CONSTRAINT dms_perm_req_permission_chk;
ALTER TABLE dms_permission_requests ADD CONSTRAINT dms_perm_req_permission_chk CHECK (
  permission IS NULL
  OR permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download|amend_request)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write', 'dms.legacy.import', 'dms.legacy.read')
);

-- Vá tại chỗ từ định nghĩa hiện có (một nguồn, không chép lại thân hàm); mỗi chỗ vá bắt buộc phải thay được.
DO $do$
DECLARE
  edits text[][] := ARRAY[
    ARRAY['dms_permission_propose', $q$download)\.(own|all)$$q$, $q$download|amend_request)\.(own|all)$$q$],
    ARRAY['dms_permission_propose', $q$'dms.permission.approve', 'dms.stock.write'$q$, $q$'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write'$q$],
    ARRAY['dms_my_permissions', $q$'add_document', 'download']$q$, $q$'add_document', 'download', 'amend_request']$q$],
    ARRAY['dms_my_permissions', $q$'dms.permission.approve', 'dms.stock.write'$q$, $q$'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write'$q$],
    ARRAY['dms_amendment_propose', $q$c.domain, 'draft', c.created_by$q$, $q$c.domain, 'amend_request', c.created_by$q$],
    ARRAY['dms_amendment_review', $q$'dms.permission.approve'$q$, $q$'dms.amendment.approve'$q$],
    ARRAY['dms_list_amendments', $q$'dms.permission.approve'$q$, $q$'dms.amendment.approve'$q$],
    ARRAY['dms_amendment_evidence', $q$'dms.permission.approve'$q$, $q$'dms.amendment.approve'$q$],
    ARRAY['dms_group_copy', $q$gp.permission NOT LIKE 'dms.permission.%'$q$, $q$gp.permission NOT LIKE 'dms.permission.%' AND gp.permission <> 'dms.amendment.approve'$q$],
    ARRAY['dms_bootstrap_admin', $q$(p_tenant, gid, 'dms.permission.approve') ON CONFLICT$q$, $q$(p_tenant, gid, 'dms.permission.approve'), (p_tenant, gid, 'dms.amendment.approve') ON CONFLICT$q$]
  ];
  i integer; r record; def text; patched text;
BEGIN
  FOR i IN 1 .. array_length(edits, 1) LOOP
    SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = current_schema() AND p.proname = edits[i][1];
    def := pg_get_functiondef(r.oid);
    patched := replace(def, edits[i][2], edits[i][3]);
    IF patched = def THEN RAISE EXCEPTION '0091: % không có gì để vá (%)', edits[i][1], edits[i][2]; END IF;
    EXECUTE patched;
  END LOOP;
END $do$;

-- Bù quyền cho nhóm đang chạy để hành vi hiện tại không đổi, rồi tăng phiên bản đúng các nhóm bị đổi.
WITH added AS (
  INSERT INTO dms_group_permissions (tenant_id, group_id, permission)
  SELECT gp.tenant_id, gp.group_id, split_part(gp.permission, '.', 1) || '.amend_request.' || split_part(gp.permission, '.', 3)
    FROM dms_group_permissions gp WHERE gp.permission ~ '\.draft\.(own|all)$'
  UNION
  SELECT gp.tenant_id, gp.group_id, 'dms.amendment.approve'
    FROM dms_group_permissions gp WHERE gp.permission = 'dms.permission.approve'
  ON CONFLICT DO NOTHING
  RETURNING group_id
)
UPDATE dms_permission_groups g SET version = g.version + 1 WHERE g.id IN (SELECT group_id FROM added);

-- ===== Nhóm mẫu (Figma P0) =====
CREATE FUNCTION dms_seed_template_groups(p_tenant uuid, p_office uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  nv text[] := ARRAY['vibang', 'tongdat', 'xacminh', 'tochuc'];
  vt text[] := ARRAY['vtden', 'vtdi', 'vtnb'];
  t record; gid uuid; nm text; made integer := 0;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('Admin hệ thống', 'Toàn quyền quản trị phân quyền và duyệt sửa đổi hồ sơ; không có quyền nghiệp vụ riêng.',
        ARRAY['dms.permission.propose', 'dms.permission.approve', 'dms.amendment.approve']),
      ('Thừa hành viên', 'Tạo nháp, xác nhận lưu chính thức, tải tệp, đề nghị sửa đổi hồ sơ của mình ở bốn nghiệp vụ.',
        ARRAY(SELECT d || '.' || a || '.own' FROM unnest(nv) d, unnest(ARRAY['read', 'draft', 'confirm', 'add_document', 'download', 'amend_request']) a)),
      ('Thư ký / Trợ lý hồ sơ', 'Chỉ tạo nháp và đề nghị sửa đổi, xem không tải, không xác nhận lưu chính thức.',
        ARRAY(SELECT d || '.' || a || '.own' FROM unnest(nv) d, unnest(ARRAY['read', 'draft', 'add_document', 'amend_request']) a)),
      ('Văn thư', 'Ba sổ văn thư: đến, đi, nội bộ.',
        ARRAY(SELECT d || '.' || a || '.all' FROM unnest(vt) d, unnest(ARRAY['read', 'draft', 'confirm', 'add_document', 'amend_request']) a)),
      ('Kế toán', 'Nhập, xuất, kiểm kê văn phòng phẩm.', ARRAY['dms.stock.write']),
      ('Báo cáo tổng hợp', 'Chỉ xem số liệu tổng hợp qua quyền đọc toàn văn phòng.',
        ARRAY(SELECT d || '.read.all' FROM unnest(nv || vt) d))
    ) AS v(name, descr, perms)
  LOOP
    IF EXISTS (SELECT 1 FROM dms_permission_groups g WHERE g.tenant_id = p_tenant AND g.office_id = p_office
                 AND g.kind = 'TEMPLATE' AND g.name IN (t.name, t.name || ' (mẫu)')) THEN CONTINUE; END IF;
    nm := CASE WHEN EXISTS (SELECT 1 FROM dms_permission_groups g WHERE g.tenant_id = p_tenant AND g.office_id = p_office AND g.name = t.name)
               THEN t.name || ' (mẫu)' ELSE t.name END;
    INSERT INTO dms_permission_groups (tenant_id, office_id, name, kind, description) VALUES (p_tenant, p_office, nm, 'TEMPLATE', t.descr)
    RETURNING id INTO gid;
    INSERT INTO dms_group_permissions (tenant_id, group_id, permission) SELECT p_tenant, gid, x FROM unnest(t.perms) x;
    made := made + 1;
  END LOOP;
  RETURN made;
END $$;

DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id, tenant_id FROM offices LOOP PERFORM dms_seed_template_groups(o.tenant_id, o.id); END LOOP;
END $$;
