-- DMS: Admin nhập số cuối của sổ giấy cho 4 sổ DMS (S-01, S-02, S-04, S-05) và bộ đếm số hồ sơ Tống đạt, theo năm.
-- Khách lên hệ thống giữa năm khi sổ giấy đã tới số N thì bộ đếm phải bắt đầu từ N để số kế tiếp là N+1.
-- Thay cho khối "Số cuối sổ giấy" cũ (vibang_import_last_number, ghi vào bộ đếm module Vi bằng cũ, không dùng cho DMS).
-- Luật giống hàm cũ: chỉ Admin; chỉ tiến, không lùi; mỗi lần nhập được ghi lại, không sửa, không xoá.
-- Với Vi bằng, Xác minh THA, Tổ chức THA số hồ sơ trùng STT của sổ nên chỉ cần đặt bộ đếm sổ. Tống đạt có hai bộ đếm riêng:
-- STT sổ S-01 (mỗi giấy tờ một STT) và số hồ sơ (CASE-TD, mỗi hồ sơ một số).

CREATE TABLE dms_number_imports (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('S-01', 'S-02', 'S-04', 'S-05', 'CASE-TD')),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  previous_value integer NOT NULL CHECK (previous_value >= 0),
  imported_value integer NOT NULL CHECK (imported_value >= 0),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_number_imports_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
ALTER TABLE dms_number_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_number_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_number_imports
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER dms_number_imports_ro BEFORE UPDATE OR DELETE ON dms_number_imports FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_number_imports_no_truncate BEFORE TRUNCATE ON dms_number_imports FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Nhập số cuối đã dùng trên sổ giấy. p_last = 0 nghĩa là chưa dùng số nào (chỉ ghi lại, không tạo dòng bộ đếm vì last_value >= 1).
CREATE FUNCTION dms_import_last_number(p_tenant uuid, p_actor uuid, p_office uuid, p_kind text, p_year integer, p_last integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; prev integer;
BEGIN
  denied := vibang_actor_check(p_tenant, p_actor, p_office, NULL, 'ADMIN', false);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', false,
                        CASE WHEN denied = 'ROLE_LACKS_PERMISSION' THEN 'ADMIN_ONLY' ELSE denied END, p_office, NULL, NULL);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('S-01', 'S-02', 'S-04', 'S-05', 'CASE-TD')
     OR p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 OR p_last IS NULL OR p_last < 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', false, 'INVALID_NUMBER', p_office, NULL, NULL);
  END IF;
  IF p_kind = 'CASE-TD' THEN
    SELECT last_value INTO prev FROM dms_case_number_counters
     WHERE tenant_id = p_tenant AND office_id = p_office AND domain = 'tongdat' AND year = p_year FOR UPDATE;
  ELSE
    SELECT last_value INTO prev FROM dms_book_counters
     WHERE tenant_id = p_tenant AND office_id = p_office AND book = p_kind AND year = p_year FOR UPDATE;
  END IF;
  IF FOUND AND prev > p_last THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', false, 'WOULD_MOVE_BACKWARDS', p_office, NULL, NULL);
  END IF;
  IF p_last >= 1 THEN
    IF p_kind = 'CASE-TD' THEN
      INSERT INTO dms_case_number_counters (tenant_id, office_id, domain, year, last_value) VALUES (p_tenant, p_office, 'tongdat', p_year, p_last)
      ON CONFLICT (tenant_id, office_id, domain, year) DO UPDATE SET last_value = EXCLUDED.last_value;
    ELSE
      INSERT INTO dms_book_counters (tenant_id, office_id, book, year, last_value) VALUES (p_tenant, p_office, p_kind, p_year, p_last)
      ON CONFLICT (tenant_id, office_id, book, year) DO UPDATE SET last_value = EXCLUDED.last_value;
    END IF;
  END IF;
  INSERT INTO dms_number_imports (tenant_id, office_id, kind, year, previous_value, imported_value, actor_user_id)
  VALUES (p_tenant, p_office, p_kind, p_year, coalesce(prev, 0), p_last, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', true, 'ALLOWED', p_office, NULL, p_kind);
END $$;

-- Số đang dùng và lần nhập gần nhất của 5 bộ đếm trong một năm. Không phải Admin thì không trả dòng nào.
CREATE FUNCTION dms_number_status(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer)
RETURNS TABLE (kind text, last_value integer, imported_value integer, imported_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT k.kind,
         coalesce(CASE WHEN k.kind = 'CASE-TD'
                       THEN (SELECT c.last_value FROM dms_case_number_counters c
                              WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = 'tongdat' AND c.year = p_year)
                       ELSE (SELECT c.last_value FROM dms_book_counters c
                              WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.book = k.kind AND c.year = p_year)
                  END, 0),
         i.imported_value, i.at
    FROM (VALUES ('S-01'), ('S-02'), ('S-04'), ('S-05'), ('CASE-TD')) AS k(kind)
    LEFT JOIN LATERAL (
      SELECT n.imported_value, n.at FROM dms_number_imports n
       WHERE n.tenant_id = p_tenant AND n.office_id = p_office AND n.kind = k.kind AND n.year = p_year
       ORDER BY n.at DESC, n.id DESC LIMIT 1
    ) i ON true
   WHERE vibang_actor_check(p_tenant, p_actor, p_office, NULL, 'ADMIN', false) IS NULL
$$;
