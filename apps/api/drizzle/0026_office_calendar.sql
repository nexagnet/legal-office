-- Lát #83: lịch làm việc theo văn phòng (ngày làm việc trong tuần + ngày nghỉ/lễ do Admin quản lý) và danh sách hạn sắp tới.
-- NĐ 151/2026 không định nghĩa "ngày làm việc", nên lịch là cấu hình; hạn chỉ để NHẮC (không chặn, không đổi trạng thái).
-- Mặc định thứ Hai–thứ Sáu (owner đã chốt thứ Bảy không tính). Dữ liệu giả lập; không số tiền.

CREATE TABLE office_calendar (
  office_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  work_weekdays smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, tenant_id),
  CONSTRAINT office_calendar_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT office_calendar_weekdays_chk CHECK (cardinality(work_weekdays) BETWEEN 1 AND 7 AND work_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])
);

CREATE TABLE office_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  day date NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_holidays_day_uq UNIQUE (office_id, tenant_id, day),
  CONSTRAINT office_holidays_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['office_calendar', 'office_holidays'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

CREATE FUNCTION of_is_office_admin(p_tenant uuid, p_user uuid, p_office uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user
                 AND m.office_id = p_office AND m.role = 'ADMIN')
$$;

CREATE FUNCTION of_set_work_weekdays(p_tenant uuid, p_actor uuid, p_office uuid, p_weekdays integer[])
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE w smallint[];
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.weekdays', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  SELECT coalesce(array_agg(DISTINCT d::smallint ORDER BY d::smallint), ARRAY[]::smallint[]) INTO w
    FROM unnest(coalesce(p_weekdays, ARRAY[]::integer[])) AS d WHERE d BETWEEN 1 AND 7;
  IF cardinality(w) = 0 OR cardinality(w) <> cardinality(coalesce(p_weekdays, ARRAY[]::integer[])) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.weekdays', false, 'INVALID_WEEKDAYS', p_office, NULL, NULL);
  END IF;
  INSERT INTO office_calendar (office_id, tenant_id, work_weekdays, updated_by) VALUES (p_office, p_tenant, w, p_actor)
  ON CONFLICT (office_id, tenant_id) DO UPDATE SET work_weekdays = EXCLUDED.work_weekdays, updated_by = p_actor, updated_at = now();
  RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.weekdays', true, 'ALLOWED', p_office, NULL, array_to_string(w, ','));
END $$;

CREATE FUNCTION of_add_holiday(p_tenant uuid, p_actor uuid, p_office uuid, p_day date, p_label text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE hid uuid;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.holiday.add', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_day IS NULL OR btrim(coalesce(p_label, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.holiday.add', false, 'INVALID_HOLIDAY', p_office, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM office_holidays WHERE tenant_id = p_tenant AND office_id = p_office AND day = p_day) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.holiday.add', false, 'HOLIDAY_EXISTS', p_office, NULL, NULL);
  END IF;
  INSERT INTO office_holidays (tenant_id, office_id, day, label, created_by) VALUES (p_tenant, p_office, p_day, btrim(p_label), p_actor)
  RETURNING id INTO hid;
  RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.holiday.add', true, 'ALLOWED', p_office, NULL, p_day::text);
END $$;

CREATE FUNCTION of_remove_holiday(p_tenant uuid, p_actor uuid, p_office uuid, p_day date)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.holiday.remove', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  DELETE FROM office_holidays WHERE tenant_id = p_tenant AND office_id = p_office AND day = p_day;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.holiday.remove', false, 'HOLIDAY_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'of.calendar.holiday.remove', true, 'ALLOWED', p_office, NULL, p_day::text);
END $$;

-- Đọc lịch: thành viên văn phòng (mọi vai). Dòng WEEKDAYS mang ngày làm việc trong tuần; các dòng HOLIDAY là ngày nghỉ.
CREATE FUNCTION of_search_calendar(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (kind text, day text, label text, weekdays smallint[])
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.calendar.read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT 'WEEKDAYS'::text, NULL::text, NULL::text,
           coalesce((SELECT c.work_weekdays FROM office_calendar c WHERE c.tenant_id = p_tenant AND c.office_id = p_office),
                    ARRAY[1, 2, 3, 4, 5]::smallint[])
    UNION ALL
    (SELECT 'HOLIDAY'::text, to_char(h.day, 'YYYY-MM-DD'), h.label, NULL::smallint[] FROM office_holidays h
      WHERE h.tenant_id = p_tenant AND h.office_id = p_office ORDER BY h.day);
END $$;

-- Hạn sắp tới để nhắc ở Tổng quan: văn bản tống đạt chưa có kết quả và đăng ký Sở/CSDL chưa xác nhận. Chỉ NHẮC.
CREATE FUNCTION of_search_deadlines(p_tenant uuid, p_actor uuid, p_office uuid, p_until timestamptz)
RETURNS TABLE (domain text, ref_id uuid, case_id uuid, label text, deadline_at timestamptz, status text, overdue boolean)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.deadlines.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
  WITH src AS (
    SELECT 'TONG_DAT'::text AS domain, d.id AS ref_id, d.request_id AS case_id, d.recipient_name AS label, d.deadline_at,
           d.status, r.branch_id, d.handler_user_id AS handler
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office AND d.status IN ('PENDING', 'ASSIGNED')
    UNION ALL
    SELECT 'VIBANG_CSDL', g.case_id, g.case_id, c.title, g.deadline_at, g.status, c.branch_id, c.responsible_thv_user_id
    FROM vibang_registrations g JOIN vibang_cases c ON c.id = g.case_id AND c.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND c.office_id = p_office AND g.status IN ('PENDING', 'SUBMITTED')
  )
  SELECT s.domain, s.ref_id, s.case_id, s.label, s.deadline_at, s.status, s.deadline_at < now()
  FROM src s
  WHERE s.deadline_at <= p_until AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  ORDER BY s.deadline_at, s.ref_id;
END $$;
