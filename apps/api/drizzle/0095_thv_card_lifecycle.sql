-- Vòng đời Thẻ thừa hành viên (Figma Q7; quyết định owner 2026-11-01: KHÔNG có bước xác nhận, Admin toàn quyền làm trực tiếp,
-- không ai duyệt Admin). Thẻ ghi nhận theo căn cứ thực tế: số thẻ, quyết định/giấy tờ (số + ngày), ngày hiệu lực, bản scan quyết định.
--   * Trạng thái: ACTIVE (còn hiệu lực) | SUSPENDED (ngừng hiệu lực). "Ngừng hiệu lực" không xoá gì: giữ thẻ + lịch sử.
--   * Mọi lần lưu / ngừng hiệu lực ghi một dòng lịch sử (of_thv_card_history, chỉ ghi thêm, không sửa/xoá). Bản scan cũ vẫn được giữ.
--   * Thẻ cũ (trước bản này) chưa có quyết định/bản scan: giữ nguyên, giao diện đánh dấu "Thiếu quyết định".
--   * Không còn đường xoá thẻ: of_set_thv_card (họ tên + số thẻ) để trống cả hai nay bị từ chối thay vì xoá.
-- Dữ liệu giả lập.

ALTER TABLE of_thv_cards
  ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  ADD COLUMN decision_no text CHECK (decision_no IS NULL OR btrim(decision_no) <> ''),
  ADD COLUMN decision_date date,
  ADD COLUMN effective_from date,
  ADD COLUMN effective_to date,
  ADD COLUMN scan_key text,
  ADD COLUMN scan_sha256 text CHECK (scan_sha256 IS NULL OR scan_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN scan_mime text,
  ADD COLUMN scan_size_bytes bigint CHECK (scan_size_bytes IS NULL OR scan_size_bytes > 0),
  ADD CONSTRAINT of_thv_cards_scan_shape_chk CHECK (
    (scan_key IS NULL) = (scan_sha256 IS NULL) AND (scan_key IS NULL) = (scan_mime IS NULL) AND (scan_key IS NULL) = (scan_size_bytes IS NULL)),
  ADD CONSTRAINT of_thv_cards_period_chk CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);

CREATE TABLE of_thv_card_history (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  user_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('ISSUED', 'UPDATED', 'RENEWED', 'SUSPENDED')),
  full_name text NOT NULL,
  card_no text NOT NULL,
  status text NOT NULL,
  decision_no text,
  decision_date date,
  effective_from date,
  effective_to date,
  scan_key text,
  scan_mime text,
  actor_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT of_thv_card_history_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
CREATE INDEX of_thv_card_history_user_idx ON of_thv_card_history (tenant_id, office_id, user_id, id DESC);

ALTER TABLE of_thv_card_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE of_thv_card_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON of_thv_card_history
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER of_thv_card_history_ro BEFORE UPDATE OR DELETE ON of_thv_card_history FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER of_thv_card_history_no_truncate BEFORE TRUNCATE ON of_thv_card_history FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Thẻ không bị xoá nữa (kể cả bằng SQL trực tiếp).
CREATE FUNCTION of_thv_cards_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'of_thv_cards rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER of_thv_cards_no_delete_trg BEFORE DELETE ON of_thv_cards FOR EACH ROW EXECUTE FUNCTION of_thv_cards_no_delete();
CREATE TRIGGER of_thv_cards_no_truncate BEFORE TRUNCATE ON of_thv_cards FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

CREATE FUNCTION of_thv_card_log(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_event text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO of_thv_card_history (tenant_id, office_id, user_id, event, full_name, card_no, status, decision_no, decision_date,
                                   effective_from, effective_to, scan_key, scan_mime, actor_id)
  SELECT c.tenant_id, c.office_id, c.user_id, p_event, c.full_name, c.card_no, c.status, c.decision_no, c.decision_date,
         c.effective_from, c.effective_to, c.scan_key, c.scan_mime, p_actor
  FROM of_thv_cards c WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.user_id = p_user
$$;

-- Thẻ đã nhập trước bản này: ghi một dòng lịch sử gốc để lịch sử không trống.
INSERT INTO of_thv_card_history (tenant_id, office_id, user_id, event, full_name, card_no, status, actor_id, at)
SELECT c.tenant_id, c.office_id, c.user_id, 'ISSUED', c.full_name, c.card_no, c.status, c.updated_by, c.updated_at FROM of_thv_cards c;

-- Họ tên + số thẻ (đường cũ): chỉ sửa hai trường này, không xoá. Để trống = từ chối.
CREATE OR REPLACE FUNCTION of_set_thv_card(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_full_name text, p_card_no text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE existed boolean;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', false, 'USER_NOT_IN_OFFICE', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_full_name, '')) = '' OR btrim(coalesce(p_card_no, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', false, 'INVALID_THV_CARD', p_office, NULL, NULL);
  END IF;
  SELECT EXISTS (SELECT 1 FROM of_thv_cards WHERE tenant_id = p_tenant AND office_id = p_office AND user_id = p_user) INTO existed;
  INSERT INTO of_thv_cards (tenant_id, office_id, user_id, full_name, card_no, updated_by)
  VALUES (p_tenant, p_office, p_user, btrim(p_full_name), btrim(p_card_no), p_actor)
  ON CONFLICT (tenant_id, office_id, user_id)
  DO UPDATE SET full_name = EXCLUDED.full_name, card_no = EXCLUDED.card_no, updated_by = p_actor, updated_at = now();
  PERFORM of_thv_card_log(p_tenant, p_actor, p_office, p_user, CASE WHEN existed THEN 'UPDATED' ELSE 'ISSUED' END);
  RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', true, 'ALLOWED', p_office, NULL, p_user::text);
END $$;

-- Lưu thẻ đầy đủ căn cứ (Admin, có hiệu lực ngay). Bản scan quyết định bắt buộc khi cấp mới hoặc khi đổi số quyết định;
-- lưu lại thẻ đã ngừng hiệu lực thì thẻ có hiệu lực trở lại (RENEWED).
CREATE FUNCTION of_thv_card_save(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_full_name text, p_card_no text,
                                 p_decision_no text, p_decision_date date, p_effective_from date,
                                 p_scan_key text, p_scan_sha text, p_scan_mime text, p_scan_size bigint)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_thv_cards; has_scan boolean := p_scan_key IS NOT NULL; ev text; found_card boolean;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', false, 'USER_NOT_IN_OFFICE', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_full_name, '')) = '' OR btrim(coalesce(p_card_no, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', false, 'INVALID_THV_CARD', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_decision_no, '')) = '' OR p_decision_date IS NULL OR p_effective_from IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', false, 'DECISION_REQUIRED', p_office, NULL, NULL);
  END IF;
  IF has_scan AND (coalesce(p_scan_sha, '') !~ '^[0-9a-f]{64}$' OR btrim(coalesce(p_scan_mime, '')) = '' OR coalesce(p_scan_size, 0) <= 0) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', false, 'SCAN_REQUIRED', p_office, NULL, NULL);
  END IF;
  SELECT * INTO c FROM of_thv_cards WHERE tenant_id = p_tenant AND office_id = p_office AND user_id = p_user FOR UPDATE;
  found_card := FOUND;
  IF NOT has_scan AND (NOT found_card OR c.scan_key IS NULL OR c.decision_no IS DISTINCT FROM btrim(p_decision_no)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', false, 'SCAN_REQUIRED', p_office, NULL, NULL);
  END IF;
  IF has_scan AND EXISTS (SELECT 1 FROM of_thv_card_history h WHERE h.tenant_id = p_tenant AND h.scan_key = p_scan_key) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', false, 'OBJECT_KEY_IN_USE', p_office, NULL, NULL);
  END IF;
  ev := CASE WHEN NOT found_card THEN 'ISSUED' WHEN c.status = 'SUSPENDED' THEN 'RENEWED' ELSE 'UPDATED' END;
  INSERT INTO of_thv_cards (tenant_id, office_id, user_id, full_name, card_no, updated_by, status, decision_no, decision_date,
                            effective_from, effective_to, scan_key, scan_sha256, scan_mime, scan_size_bytes)
  VALUES (p_tenant, p_office, p_user, btrim(p_full_name), btrim(p_card_no), p_actor, 'ACTIVE', btrim(p_decision_no), p_decision_date,
          p_effective_from, NULL, p_scan_key, p_scan_sha, p_scan_mime, p_scan_size)
  ON CONFLICT (tenant_id, office_id, user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name, card_no = EXCLUDED.card_no, updated_by = p_actor, updated_at = now(), status = 'ACTIVE',
    decision_no = EXCLUDED.decision_no, decision_date = EXCLUDED.decision_date, effective_from = EXCLUDED.effective_from,
    effective_to = NULL,
    scan_key = coalesce(EXCLUDED.scan_key, of_thv_cards.scan_key), scan_sha256 = coalesce(EXCLUDED.scan_sha256, of_thv_cards.scan_sha256),
    scan_mime = coalesce(EXCLUDED.scan_mime, of_thv_cards.scan_mime),
    scan_size_bytes = coalesce(EXCLUDED.scan_size_bytes, of_thv_cards.scan_size_bytes);
  PERFORM of_thv_card_log(p_tenant, p_actor, p_office, p_user, ev);
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'ad.thv_card.save', 'user', p_user,
                        jsonb_build_object('event', ev, 'decision_no', btrim(p_decision_no), 'new_scan', has_scan));
  RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.save', true, CASE ev WHEN 'RENEWED' THEN 'THV_CARD_RENEWED' ELSE 'ALLOWED' END,
                      p_office, NULL, p_user::text);
END $$;

-- Ngừng hiệu lực: giữ thẻ + lịch sử; hiệu lực kết thúc hôm nay (giờ Việt Nam).
CREATE FUNCTION of_thv_card_suspend(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_thv_cards; today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.suspend', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  SELECT * INTO c FROM of_thv_cards WHERE tenant_id = p_tenant AND office_id = p_office AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.suspend', false, 'THV_CARD_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF c.status = 'SUSPENDED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.suspend', false, 'NO_CHANGE', p_office, NULL, p_user::text);
  END IF;
  UPDATE of_thv_cards SET status = 'SUSPENDED', effective_to = greatest(today, coalesce(effective_from, today)),
                          updated_by = p_actor, updated_at = now()
   WHERE tenant_id = p_tenant AND office_id = p_office AND user_id = p_user;
  PERFORM of_thv_card_log(p_tenant, p_actor, p_office, p_user, 'SUSPENDED');
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'ad.thv_card.suspend', 'user', p_user, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.suspend', true, 'THV_CARD_SUSPENDED', p_office, NULL, p_user::text);
END $$;

-- Danh sách thẻ (thành viên văn phòng đọc được để sổ hiển thị tên). Thêm cột căn cứ/trạng thái ở cuối.
DROP FUNCTION of_search_thv_cards(uuid, uuid, uuid);
CREATE FUNCTION of_search_thv_cards(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, full_name text, card_no text, status text, decision_no text, decision_date text,
               effective_from text, effective_to text, has_scan boolean)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.thv_card.read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY SELECT c.user_id, c.full_name, c.card_no, c.status, c.decision_no, c.decision_date::text, c.effective_from::text,
                      c.effective_to::text, c.scan_key IS NOT NULL
    FROM of_thv_cards c WHERE c.tenant_id = p_tenant AND c.office_id = p_office ORDER BY c.full_name, c.user_id;
END $$;

-- Lịch sử một thẻ (chỉ Admin), mới nhất trước.
CREATE FUNCTION of_thv_card_history_list(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid)
RETURNS TABLE (id bigint, event text, full_name text, card_no text, status text, decision_no text, decision_date text,
               effective_from text, effective_to text, has_scan boolean, actor_id uuid, at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN RETURN; END IF;
  RETURN QUERY SELECT h.id, h.event, h.full_name, h.card_no, h.status, h.decision_no, h.decision_date::text, h.effective_from::text,
                      h.effective_to::text, h.scan_key IS NOT NULL, h.actor_id, h.at
    FROM of_thv_card_history h WHERE h.tenant_id = p_tenant AND h.office_id = p_office AND h.user_id = p_user
    ORDER BY h.id DESC;
END $$;

-- Khoá đối tượng + loại tệp của bản scan hiện tại (p_history NULL) hoặc của một dòng lịch sử. Chỉ Admin.
CREATE FUNCTION of_thv_card_scan(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_history bigint DEFAULT NULL)
RETURNS TABLE (object_key text, mime text) LANGUAGE plpgsql AS $$
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN RETURN; END IF;
  IF p_history IS NULL THEN
    RETURN QUERY SELECT c.scan_key, c.scan_mime FROM of_thv_cards c
      WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.user_id = p_user AND c.scan_key IS NOT NULL;
  ELSE
    RETURN QUERY SELECT h.scan_key, h.scan_mime FROM of_thv_card_history h
      WHERE h.id = p_history AND h.tenant_id = p_tenant AND h.office_id = p_office AND h.user_id = p_user AND h.scan_key IS NOT NULL;
  END IF;
END $$;
