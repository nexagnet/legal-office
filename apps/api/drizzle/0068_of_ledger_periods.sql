-- Đóng quyển sổ theo tháng (TT 08/2026/TT-BTP, Phụ lục I: in hàng tháng, đóng quyển, giáp lai).
-- Giả định (chủ dự án ủy quyền chốt): hệ thống LƯU trạng thái đã đóng quyển của từng sổ theo từng tháng, kèm người và thời điểm;
-- chỉ đóng được tháng đã qua (theo giờ Việt Nam); đã đóng thì không mở lại (chỉ ghi thêm). Không đổi dữ liệu nguồn của sổ.
-- Dữ liệu giả lập; không số tiền.

CREATE TABLE of_ledger_periods (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  ledger_code text NOT NULL CHECK (ledger_code IN ('S-01', 'S-02', 'S-04', 'S-05', 'S-06')),
  period date NOT NULL CHECK (period = date_trunc('month', period)::date),
  sealed_by uuid NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_ledger_periods_uq UNIQUE (tenant_id, office_id, ledger_code, period),
  CONSTRAINT of_ledger_periods_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

ALTER TABLE of_ledger_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE of_ledger_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON of_ledger_periods
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER of_ledger_periods_ro BEFORE UPDATE OR DELETE ON of_ledger_periods FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

-- Các tháng đã đóng quyển của một sổ trong một năm. Admin, Trưởng VP, Thư ký xem (cùng nhóm vai được xem sổ văn phòng).
CREATE FUNCTION of_search_ledger_periods(p_tenant uuid, p_actor uuid, p_office uuid, p_code text, p_year integer)
RETURNS TABLE (period text, sealed_by uuid, sealed_at timestamptz)
LANGUAGE plpgsql AS $$
DECLARE denied text;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY'], NULL);
  IF denied IS NOT NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.ledger.periods', false, 'NOT_ALLOWED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.ledger.periods', true, 'ALLOWED', p_office, NULL, p_code);
  RETURN QUERY
    SELECT to_char(l.period, 'YYYY-MM'), l.sealed_by, l.sealed_at
    FROM of_ledger_periods l
    WHERE l.tenant_id = p_tenant AND l.office_id = p_office AND l.ledger_code = p_code
      AND (p_year IS NULL OR extract(year FROM l.period) = p_year)
    ORDER BY l.period;
END $$;

-- Đóng quyển một tháng ('YYYY-MM') của một sổ. Chỉ Admin và Trưởng VP; tháng phải đã qua; đóng rồi thì từ chối.
-- label = 'YYYY-MM' đã đóng.
CREATE FUNCTION of_ledger_seal(p_tenant uuid, p_actor uuid, p_office uuid, p_code text, p_ym text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; per date; this_month date;
BEGIN
  denied := td_authorize(p_tenant, p_actor, p_office, NULL, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.ledger.seal', false, 'ADMIN_OR_HEAD_ONLY', p_office, NULL, p_code);
  END IF;
  IF p_code IS NULL OR p_code NOT IN ('S-01', 'S-02', 'S-04', 'S-05', 'S-06') OR p_ym IS NULL OR p_ym !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.ledger.seal', false, 'INVALID_LEDGER_PERIOD', p_office, NULL, p_code);
  END IF;
  per := (p_ym || '-01')::date;
  this_month := date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF per >= this_month THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.ledger.seal', false, 'PERIOD_NOT_ENDED', p_office, NULL, p_code);
  END IF;
  IF EXISTS (SELECT 1 FROM of_ledger_periods l WHERE l.tenant_id = p_tenant AND l.office_id = p_office AND l.ledger_code = p_code AND l.period = per) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.ledger.seal', false, 'PERIOD_ALREADY_SEALED', p_office, NULL, p_code);
  END IF;
  INSERT INTO of_ledger_periods (tenant_id, office_id, ledger_code, period, sealed_by) VALUES (p_tenant, p_office, p_code, per, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.ledger.seal', true, 'ALLOWED', p_office, NULL, p_ym);
END $$;
