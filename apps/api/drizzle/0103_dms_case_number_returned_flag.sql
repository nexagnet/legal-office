-- DMS GĐ 1 (PR 1): số hồ sơ tự cấp (N3) và ô tích "Đã trả kết quả" (N2). Căn cứ: reports/ke-hoach-code-theo-figma-2026-11-03.md.
-- Luật (chủ dự án chốt 03/11/2026):
--   * Số hồ sơ dạng `030/2026/VB-TPL`, cấp lúc "Xác nhận lưu chính thức" cùng giao dịch với STT; nháp và nháp đã hủy không có số.
--   * Vi bằng, Xác minh THA, Tổ chức THA: phần đầu của số TRÙNG STT của sổ (S-02, S-04, S-05). Tống đạt: một hồ sơ có nhiều dòng S-01
--     (mỗi giấy tờ một STT) nên số đánh RIÊNG theo hồ sơ (bộ đếm riêng), không theo STT.
--   * Hết năm (giờ Việt Nam) cả STT lẫn số về 01. Số có ít nhất 3 chữ số (001); quá 999 thì dài ra tự nhiên.
--   * Số Vi bằng nhập tay (thuộc tính `so_ngay_vi_bang`) KHÔNG đổi ở migration này; hồ sơ ghi sổ trước migration giữ nguyên, case_number để NULL.
--   * "Đã trả kết quả" chỉ là dấu hiệu nhìn thấy: không đổi trạng thái hồ sơ, không vào sổ, báo cáo hay bộ lọc bắt buộc.
-- Hồ sơ đã ghi sổ là bất biến (dms_draft_guard), nên số chỉ được gán trong chính lần chuyển DRAFT -> RECORDED và cờ "đã trả" nằm ở bảng riêng.

-- ===== Số hồ sơ =====
ALTER TABLE dms_case_files ADD COLUMN case_number text;
ALTER TABLE dms_case_files ADD CONSTRAINT dms_case_files_case_number_chk
  CHECK (case_number IS NULL OR (status = 'RECORDED' AND case_number ~ '^[0-9]{3,}/[0-9]{4}/(VB|TĐ|XM|TC)-TPL$'));
CREATE UNIQUE INDEX dms_case_files_case_number_uq ON dms_case_files (tenant_id, office_id, case_number) WHERE case_number IS NOT NULL;

-- Bộ đếm số hồ sơ chỉ cho nghiệp vụ không lấy số theo STT (Tống đạt). Chỉ tăng, không dùng lại số.
CREATE TABLE dms_case_number_counters (
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  domain text NOT NULL CHECK (domain = 'tongdat'),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  last_value integer NOT NULL CHECK (last_value >= 1),
  PRIMARY KEY (tenant_id, office_id, domain, year),
  CONSTRAINT dms_case_number_counters_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
ALTER TABLE dms_case_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_case_number_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_case_number_counters
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER dms_case_number_counters_no_delete BEFORE DELETE ON dms_case_number_counters FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_case_number_counters_no_truncate BEFORE TRUNCATE ON dms_case_number_counters FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Năm theo giờ Việt Nam (cùng cách tính với dms_book_allocate; now() cố định trong giao dịch nên hai nơi luôn trùng năm).
-- Tham số thời điểm chỉ để kiểm thử ranh giới 31/12 -> 01/01; chỗ gọi thật dùng mặc định now().
CREATE FUNCTION dms_vn_year(p_at timestamptz DEFAULT now()) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT extract(year FROM p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer
$$;

-- Định dạng số: 030/2026/VB-TPL. NULL nếu nghiệp vụ không hợp lệ.
CREATE FUNCTION dms_case_number_format(p_seq integer, p_year integer, p_domain text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_seq IS NULL OR p_seq < 1 OR p_year IS NULL THEN NULL
              ELSE (CASE WHEN p_seq < 100 THEN lpad(p_seq::text, 3, '0') ELSE p_seq::text END) || '/' || p_year::text || '/' ||
                   CASE p_domain WHEN 'vibang' THEN 'VB' WHEN 'tongdat' THEN 'TĐ' WHEN 'xacminh' THEN 'XM' WHEN 'tochuc' THEN 'TC' END || '-TPL'
         END
$$;

-- Cấp số kế tiếp của bộ đếm Tống đạt (nguyên tử: khoá dòng bộ đếm trong giao dịch).
CREATE FUNCTION dms_case_number_next_tongdat(p_tenant uuid, p_office uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO dms_case_number_counters (tenant_id, office_id, domain, year, last_value) VALUES (p_tenant, p_office, 'tongdat', dms_vn_year(), 1)
  ON CONFLICT (tenant_id, office_id, domain, year) DO UPDATE SET last_value = dms_case_number_counters.last_value + 1
  RETURNING last_value INTO n;
  RETURN n;
END $$;

-- "Xác nhận lưu chính thức": như 0077 (cổng THV, STT), thêm số hồ sơ. Số được gán trong CÙNG lệnh UPDATE chuyển sang RECORDED
-- vì sau đó dms_draft_guard khoá hàng. Vì vậy STT/bộ đếm được cấp TRƯỚC khi hồ sơ đổi trạng thái (khoá FK chỉ cần hàng hồ sơ tồn tại).
CREATE OR REPLACE FUNCTION dms_case_record(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; n integer; book text; d record; conf_hash text; stt integer; num text;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.record', 'confirm');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
  END IF;
  IF c.thv_user_id IS NOT NULL THEN
    SELECT f.content_hash INTO conf_hash FROM dms_thv_confirmations f
     WHERE f.tenant_id = p_tenant AND f.case_id = p_case AND f.thv_user_id = c.thv_user_id
     ORDER BY f.confirmed_at DESC, f.id DESC LIMIT 1;
    IF conf_hash IS NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'THV_CONFIRMATION_REQUIRED', c.office_id, NULL, p_case::text);
    ELSIF conf_hash <> dms_case_content_hash(p_tenant, p_case) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'THV_CONFIRMATION_STALE', c.office_id, NULL, p_case::text);
    END IF;
  END IF;
  UPDATE dms_documents SET status = 'RECORDED' WHERE case_id = p_case AND tenant_id = p_tenant AND status = 'DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  book := dms_book_of(c.domain);
  IF book = 'S-01' THEN
    FOR d IN SELECT id FROM dms_documents WHERE case_id = p_case AND tenant_id = p_tenant AND status = 'RECORDED' ORDER BY created_at, id LOOP
      PERFORM dms_book_allocate(p_tenant, p_actor, c.office_id, book, p_case, d.id);
    END LOOP;
    num := dms_case_number_format(dms_case_number_next_tongdat(p_tenant, c.office_id), dms_vn_year(), c.domain);
  ELSIF book IS NOT NULL THEN
    stt := dms_book_allocate(p_tenant, p_actor, c.office_id, book, p_case, NULL);
    num := dms_case_number_format(stt, dms_vn_year(), c.domain);
  END IF;
  UPDATE dms_case_files SET status = 'RECORDED', recorded_by = p_actor, recorded_at = now(), case_number = num
   WHERE id = p_case AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.record', 'case', p_case,
                        jsonb_build_object('documents_recorded', n, 'case_number', num));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', true, 'CASE_RECORDED', c.office_id, NULL, p_case::text);
END $$;

-- ===== Đã trả kết quả =====
CREATE TABLE dms_case_returned (
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  returned boolean NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, case_id),
  CONSTRAINT dms_case_returned_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id)
);
ALTER TABLE dms_case_returned ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_case_returned FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_case_returned
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER dms_case_returned_no_delete BEFORE DELETE ON dms_case_returned FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_case_returned_no_truncate BEFORE TRUNCATE ON dms_case_returned FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Đánh dấu / bỏ đánh dấu "đã trả kết quả". Cần quyền thêm tài liệu (add_document) trên hồ sơ, chỉ hồ sơ đã ghi sổ.
-- Mỗi lần đổi giá trị đều ghi nhật ký; đặt lại đúng giá trị hiện có thì không ghi gì thêm.
CREATE FUNCTION dms_case_set_returned(p_tenant uuid, p_actor uuid, p_case uuid, p_returned boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; cur boolean;
BEGIN
  IF p_returned IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.set_returned', false, 'INVALID_INPUT', NULL, NULL, p_case::text);
  END IF;
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.set_returned', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'RECORDED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.set_returned', false, 'CASE_NOT_RECORDED', c.office_id, NULL, p_case::text);
  END IF;
  SELECT r.returned INTO cur FROM dms_case_returned r WHERE r.tenant_id = p_tenant AND r.case_id = p_case;
  IF cur IS DISTINCT FROM p_returned AND NOT (cur IS NULL AND p_returned = false) THEN
    INSERT INTO dms_case_returned (tenant_id, case_id, returned, changed_by) VALUES (p_tenant, p_case, p_returned, p_actor)
    ON CONFLICT (tenant_id, case_id) DO UPDATE SET returned = EXCLUDED.returned, changed_by = EXCLUDED.changed_by, changed_at = now();
    PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.set_returned', 'case', p_case, jsonb_build_object('returned', p_returned));
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.set_returned', true, 'CASE_RETURNED_SET', c.office_id, NULL, p_case::text);
END $$;

-- Đọc cờ theo danh sách hồ sơ. Chỉ trả hồ sơ mà người xem được quyền thấy (cùng luật hiển thị như danh sách).
CREATE FUNCTION dms_case_returned_flags(p_tenant uuid, p_actor uuid, p_cases uuid[])
RETURNS TABLE (case_id uuid, returned boolean, changed_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT r.case_id, r.returned, r.changed_at
    FROM dms_case_returned r
    JOIN dms_case_files c ON c.id = r.case_id AND c.tenant_id = r.tenant_id
   WHERE r.tenant_id = p_tenant AND r.case_id = ANY (p_cases)
     AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
$$;
