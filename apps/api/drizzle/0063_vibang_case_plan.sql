-- Kế hoạch lập Vi bằng (Figma N17 V1, bước Nội dung yêu cầu): thời gian dự kiến, ghi chú nội bộ và người tham gia.
-- Nơi lập (place_address) đã có từ 0043. Chỉ sửa được khi hồ sơ chưa trả hoặc huỷ. Dữ liệu giả lập; không số tiền.
ALTER TABLE vibang_cases
  ADD COLUMN scheduled_at timestamptz,
  ADD COLUMN internal_note text CHECK (internal_note IS NULL OR char_length(internal_note) <= 2000);

CREATE TABLE vibang_case_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  seq smallint NOT NULL CHECK (seq >= 1),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 300),
  role text NOT NULL CHECK (role IN ('SELLER', 'BUYER', 'WITNESS', 'OTHER')),
  CONSTRAINT vibang_case_parties_seq_uq UNIQUE (case_id, seq),
  CONSTRAINT vibang_case_parties_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id)
);
ALTER TABLE vibang_case_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE vibang_case_parties FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vibang_case_parties
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Ghi kế hoạch: thay toàn bộ danh sách người tham gia bằng p_parties (mảng {name, role}, tối đa 20). Cùng quyền với vb_set_case_place.
CREATE FUNCTION vb_set_case_plan(p_tenant uuid, p_actor uuid, p_case uuid, p_scheduled timestamptz, p_note text, p_parties jsonb)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; denied text; n integer; i integer; p jsonb;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.plan', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_authorize(p_tenant, p_actor, c, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'THV']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.case.plan', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.plan', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  p_parties := coalesce(p_parties, '[]'::jsonb);
  IF jsonb_typeof(p_parties) <> 'array' OR jsonb_array_length(p_parties) > 20 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.plan', false, 'INVALID_PLAN', c.office_id, c.branch_id, NULL);
  END IF;
  n := jsonb_array_length(p_parties);
  FOR i IN 0 .. n - 1 LOOP
    p := p_parties -> i;
    IF jsonb_typeof(p) <> 'object' OR btrim(coalesce(p ->> 'name', '')) = '' OR char_length(p ->> 'name') > 300
       OR coalesce(p ->> 'role', '') NOT IN ('SELLER', 'BUYER', 'WITNESS', 'OTHER') THEN
      RETURN vibang_audit(p_tenant, p_actor, 'vb.case.plan', false, 'INVALID_PLAN', c.office_id, c.branch_id, NULL);
    END IF;
  END LOOP;
  IF char_length(coalesce(p_note, '')) > 2000 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.case.plan', false, 'INVALID_PLAN', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vibang_cases SET scheduled_at = p_scheduled, internal_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE id = p_case AND tenant_id = p_tenant;
  DELETE FROM vibang_case_parties WHERE case_id = p_case AND tenant_id = p_tenant;
  FOR i IN 0 .. n - 1 LOOP
    p := p_parties -> i;
    INSERT INTO vibang_case_parties (tenant_id, case_id, seq, name, role)
    VALUES (p_tenant, p_case, i + 1, btrim(p ->> 'name'), p ->> 'role');
  END LOOP;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.case.plan', true, 'ALLOWED', c.office_id, c.branch_id, p_case::text);
END $$;

-- Đọc kế hoạch của một hồ sơ. Cùng phạm vi xem với vb_case_progress.
CREATE FUNCTION vb_case_plan(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (scheduled_at timestamptz, internal_note text, parties jsonb)
LANGUAGE sql STABLE AS $$
  SELECT c.scheduled_at, c.internal_note,
         coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'role', x.role) ORDER BY x.seq)
                   FROM vibang_case_parties x WHERE x.case_id = c.id AND x.tenant_id = c.tenant_id), '[]'::jsonb)
  FROM vibang_cases c
  WHERE c.id = p_case AND c.tenant_id = p_tenant
    AND EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
$$;
