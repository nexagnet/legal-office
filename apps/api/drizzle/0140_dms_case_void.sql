-- Admin HỦY hồ sơ đã ghi sổ (Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA).
-- Không xóa, không đổi hàng hồ sơ, không đổi STT/số hồ sơ: hồ sơ đã ghi sổ vẫn bất biến (dms_draft_guard).
-- "Đã hủy" là một dấu riêng (bảng chỉ ghi thêm, mỗi hồ sơ tối đa một dòng), giống cách lưu cờ "đã trả kết quả".
-- Dòng sổ S-0x giữ nguyên; cột Ghi chú hiện thêm "Đã hủy vi bằng" (… tống đạt / xác minh / tổ chức THA) khi đọc/xuất sổ.
-- Chỉ Admin (dms.permission.approve), có lý do, ghi nhật ký. Hồ sơ đã hủy bị chặn thêm tài liệu, sửa, đánh dấu trả kết quả, yêu cầu sửa đổi.

CREATE TABLE dms_case_voids (
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  voided_by uuid NOT NULL,
  voided_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  PRIMARY KEY (tenant_id, case_id),
  CONSTRAINT dms_case_voids_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id)
);
ALTER TABLE dms_case_voids ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_case_voids FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_case_voids
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER dms_case_voids_ro BEFORE UPDATE OR DELETE ON dms_case_voids FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_case_voids_no_truncate BEFORE TRUNCATE ON dms_case_voids FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Chữ ghi vào cột Ghi chú theo nghiệp vụ.
CREATE FUNCTION dms_void_note(p_domain text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_domain WHEN 'vibang' THEN 'Đã hủy vi bằng' WHEN 'tongdat' THEN 'Đã hủy tống đạt'
                       WHEN 'xacminh' THEN 'Đã hủy xác minh' WHEN 'tochuc' THEN 'Đã hủy tổ chức thi hành án' END
$$;

CREATE FUNCTION dms_case_void(p_tenant uuid, p_actor uuid, p_case uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c dms_case_files;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.void', false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF NOT dms_has_permission(p_tenant, p_actor, c.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.void', false, 'ADMIN_ONLY', c.office_id, NULL, p_case::text);
  END IF;
  IF c.domain NOT IN ('vibang', 'tongdat', 'xacminh', 'tochuc') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.void', false, 'INVALID_DOMAIN', c.office_id, NULL, p_case::text);
  END IF;
  IF c.status <> 'RECORDED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.void', false, 'CASE_NOT_RECORDED', c.office_id, NULL, p_case::text);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_case_voids v WHERE v.tenant_id = p_tenant AND v.case_id = p_case) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.void', false, 'CASE_VOIDED', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.void', false, 'REASON_REQUIRED', c.office_id, NULL, p_case::text);
  END IF;
  INSERT INTO dms_case_voids (tenant_id, case_id, voided_by, reason) VALUES (p_tenant, p_case, p_actor, btrim(p_reason));
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.void', 'case', p_case, jsonb_build_object('domain', c.domain));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.void', true, 'CASE_VOIDED_SET', c.office_id, NULL, p_case::text);
END $$;

-- Chặn ghi thêm vào hồ sơ đã hủy: mọi hàm ghi đi qua dms_case_load (thêm tài liệu, tệp, sửa của Admin, cờ trả kết quả, OCR).
CREATE OR REPLACE FUNCTION dms_case_load(p_tenant uuid, p_actor uuid, p_case uuid, p_action text, p_perm_action text, OUT c dms_case_files, OUT denied text)
LANGUAGE plpgsql AS $$
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id) THEN
    PERFORM vibang_audit(p_tenant, p_actor, p_action, false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
    denied := 'CASE_NOT_FOUND';
    RETURN;
  END IF;
  denied := dms_authorize(p_tenant, p_actor, c.office_id, c.domain, p_perm_action, c.created_by);
  IF denied IS NULL AND EXISTS (SELECT 1 FROM dms_case_voids v WHERE v.tenant_id = p_tenant AND v.case_id = p_case) THEN
    denied := 'CASE_VOIDED';
  END IF;
  IF denied IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, p_action, false, denied, c.office_id, NULL, p_case::text);
  END IF;
END $$;

-- Yêu cầu sửa đổi cũng bị chặn.
DO $$
DECLARE r oid; def text; patched text;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema() AND p.proname = 'dms_amendment_propose';
  def := pg_get_functiondef(r);
  patched := replace(def, 'IF c.status <> ''RECORDED'' THEN',
    'IF EXISTS (SELECT 1 FROM dms_case_voids v WHERE v.tenant_id = p_tenant AND v.case_id = p_case) THEN
    RETURN vibang_audit(p_tenant, p_actor, ''dms.amendment.propose'', false, ''CASE_VOIDED'', c.office_id, NULL, p_case::text);
  END IF;
  IF c.status <> ''RECORDED'' THEN');
  IF patched = def THEN RAISE EXCEPTION 'dms_case_void: dms_amendment_propose không có gì để vá'; END IF;
  EXECUTE patched;
END $$;

-- Thêm cờ hủy và chữ ghi chú vào dms_case_extras (danh sách, chi tiết, dòng sổ đều đọc qua hàm này).
DROP FUNCTION dms_case_extras(uuid, uuid, uuid[]);
CREATE FUNCTION dms_case_extras(p_tenant uuid, p_actor uuid, p_cases uuid[])
RETURNS TABLE (case_id uuid, case_number text, returned boolean, phone text, created_by_name text, voided boolean, void_note text, void_reason text)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.case_number, coalesce(r.returned, false),
         nullif(btrim(coalesce((SELECT e.attributes ->> 'so_dien_thoai' FROM dms_case_effective(c.tenant_id, c.id) e), '')), ''),
         (SELECT ad_user_label(u.full_name, ac.email, u.external_ref) FROM users u
            LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
           WHERE u.id = c.created_by AND u.tenant_id = c.tenant_id),
         v.case_id IS NOT NULL, CASE WHEN v.case_id IS NOT NULL THEN dms_void_note(c.domain) END, v.reason
    FROM dms_case_files c
    LEFT JOIN dms_case_returned r ON r.tenant_id = c.tenant_id AND r.case_id = c.id
    LEFT JOIN dms_case_voids v ON v.tenant_id = c.tenant_id AND v.case_id = c.id
   WHERE c.tenant_id = p_tenant AND c.id = ANY (p_cases)
     AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
$$;
