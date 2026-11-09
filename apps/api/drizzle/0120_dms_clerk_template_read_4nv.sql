-- DMS (0120): nhóm mẫu "Văn thư" được thêm quyền XEM 4 nghiệp vụ (Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA) toàn văn phòng
-- (owner 2026-11-09): vibang|tongdat|xacminh|tochuc .read.all. Các quyền ghi của 3 sổ văn thư giữ nguyên.
--   * Sửa hàm gieo nhóm mẫu để văn phòng MỚI có sẵn quyền này.
--   * Bù cho nhóm mẫu "Văn thư" của văn phòng đang chạy (kể cả hậu tố " (mẫu)"); chỉ nhóm kind = TEMPLATE, không đụng nhóm
--     tùy chỉnh văn phòng đã sao chép và chỉnh. Việc bù là thao tác hệ thống của migration, tăng phiên bản nhóm.
-- Dữ liệu giả lập.

DO $do$
DECLARE r record; def text; patched text;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema() AND p.proname = 'dms_seed_template_groups';
  def := pg_get_functiondef(r.oid);
  patched := replace(def,
    $q$ARRAY(SELECT d || '.' || a || '.all' FROM unnest(vt) d, unnest(ARRAY['read', 'draft', 'confirm', 'add_document', 'amend_request']) a)),$q$,
    $q$ARRAY(SELECT d || '.' || a || '.all' FROM unnest(vt) d, unnest(ARRAY['read', 'draft', 'confirm', 'add_document', 'amend_request']) a)
          || ARRAY(SELECT d || '.read.all' FROM unnest(nv) d)),$q$);
  patched := replace(patched, $q$'Ba sổ văn thư: đến, đi, nội bộ.'$q$,
    $q$'Ba sổ văn thư: đến, đi, nội bộ; xem được bốn nghiệp vụ Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA toàn văn phòng.'$q$);
  IF patched = def THEN RAISE EXCEPTION '0120: dms_seed_template_groups không có gì để vá'; END IF;
  EXECUTE patched;
END $do$;

WITH target AS (
  SELECT g.tenant_id, g.id AS group_id FROM dms_permission_groups g
   WHERE g.kind = 'TEMPLATE' AND g.name IN ('Văn thư', 'Văn thư (mẫu)')
), added AS (
  INSERT INTO dms_group_permissions (tenant_id, group_id, permission)
  SELECT t.tenant_id, t.group_id, d || '.read.all'
    FROM target t, unnest(ARRAY['vibang', 'tongdat', 'xacminh', 'tochuc']) d
  ON CONFLICT DO NOTHING
  RETURNING group_id
)
UPDATE dms_permission_groups g SET version = g.version + 1 WHERE g.id IN (SELECT group_id FROM added);

UPDATE dms_permission_groups
   SET description = 'Ba sổ văn thư: đến, đi, nội bộ; xem được bốn nghiệp vụ Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA toàn văn phòng.'
 WHERE kind = 'TEMPLATE' AND name IN ('Văn thư', 'Văn thư (mẫu)') AND description = 'Ba sổ văn thư: đến, đi, nội bộ.';
