-- Văn phòng phẩm: cổng quyền theo NHÓM QUYỀN (owner 2026-10-30/31: không dùng Role). Hai mã quyền mới:
--   dms.stock.write : nhập kho, xuất kho, điều chỉnh tồn (điều chỉnh KHÔNG cần Admin duyệt nhưng BẮT BUỘC có lý do, đã có sẵn ở of_adjust).
-- Giai đoạn chuyển tiếp: người có mã quyền này được phép NGAY CẢ khi chưa có vai cũ; người đã có vai cũ (ADMIN/TRUONG_VP/THU_KY/VAN_THU)
-- vẫn giữ quyền như trước cho tới khi bỏ hẳn bảng vai. Không đổi dữ liệu kho, không đổi luật FIFO/lý do.

ALTER TABLE dms_group_permissions DROP CONSTRAINT dms_group_permissions_permission_check;
ALTER TABLE dms_group_permissions ADD CONSTRAINT dms_group_permissions_permission_check CHECK (
  permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.stock.write')
);
ALTER TABLE dms_permission_requests DROP CONSTRAINT dms_perm_req_permission_chk;
ALTER TABLE dms_permission_requests ADD CONSTRAINT dms_perm_req_permission_chk CHECK (
  permission IS NULL
  OR permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.stock.write')
);

-- NULL = được phép. Quyền theo Nhóm quyền, hoặc vai cũ như trước.
CREATE FUNCTION of_stock_gate(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_roles text[])
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF dms_has_permission(p_tenant, p_actor, p_office, 'dms.stock.write') THEN RETURN NULL; END IF;
  RETURN td_authorize(p_tenant, p_actor, p_office, p_branch, p_roles, NULL);
END $$;

DO $$
DECLARE r record; def text; patched text; i integer;
  edits text[][] := ARRAY[
    ['of_stock_authorize', 'RETURN td_authorize(p_tenant, p_actor, p_item.office_id, p_branch, ARRAY[''ADMIN'', ''TRUONG_VP'', ''THU_KY'', ''VAN_THU''], NULL);',
     'RETURN of_stock_gate(p_tenant, p_actor, p_item.office_id, p_branch, ARRAY[''ADMIN'', ''TRUONG_VP'', ''THU_KY'', ''VAN_THU'']);'],
    ['of_adjust', 'denied := td_authorize(p_tenant, p_actor, b.office_id, b.branch_id, ARRAY[''ADMIN'', ''TRUONG_VP''], NULL);',
     'denied := of_stock_gate(p_tenant, p_actor, b.office_id, b.branch_id, ARRAY[''ADMIN'', ''TRUONG_VP'']);'],
    ['dms_permission_propose', '''dms.permission.propose'', ''dms.permission.approve'')', '''dms.permission.propose'', ''dms.permission.approve'', ''dms.stock.write'')']
  ];
BEGIN
  FOR i IN 1 .. array_length(edits, 1) LOOP
    SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = current_schema() AND p.proname = edits[i][1];
    def := pg_get_functiondef(r.oid);
    patched := replace(def, edits[i][2], edits[i][3]);
    IF patched = def THEN RAISE EXCEPTION 'dms_stock_permissions: % không có gì để vá', edits[i][1]; END IF;
    EXECUTE patched;
  END LOOP;
END $$;
