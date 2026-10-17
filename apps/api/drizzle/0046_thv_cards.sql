-- Họ tên + số Thẻ thừa hành viên (THV) để điền cột "Thừa hành viên thực hiện/lập" của sổ S-01/S-02/S-04/S-05.
-- Các sổ chỉ lưu mã người dùng THV (thv_user_id); họ tên + số Thẻ do Admin văn phòng nhập ở đây, ghép ở tầng API.
-- Dữ liệu giả lập; không phải số Thẻ thật.

CREATE TABLE of_thv_cards (
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  user_id uuid NOT NULL,
  full_name text NOT NULL CHECK (btrim(full_name) <> ''),
  card_no text NOT NULL CHECK (btrim(card_no) <> ''),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, office_id, user_id),
  CONSTRAINT of_thv_cards_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

ALTER TABLE of_thv_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE of_thv_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON of_thv_cards
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Chỉ Admin văn phòng được đặt/xoá; người được đặt phải là thành viên văn phòng. Họ tên + số Thẻ để trống = xoá.
CREATE FUNCTION of_set_thv_card(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_full_name text, p_card_no text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.user_id = p_user) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', false, 'USER_NOT_IN_OFFICE', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_full_name, '')) = '' AND btrim(coalesce(p_card_no, '')) = '' THEN
    DELETE FROM of_thv_cards WHERE tenant_id = p_tenant AND office_id = p_office AND user_id = p_user;
  ELSIF btrim(coalesce(p_full_name, '')) = '' OR btrim(coalesce(p_card_no, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', false, 'INVALID_THV_CARD', p_office, NULL, NULL);
  ELSE
    INSERT INTO of_thv_cards (tenant_id, office_id, user_id, full_name, card_no, updated_by)
    VALUES (p_tenant, p_office, p_user, btrim(p_full_name), btrim(p_card_no), p_actor)
    ON CONFLICT (tenant_id, office_id, user_id)
    DO UPDATE SET full_name = EXCLUDED.full_name, card_no = EXCLUDED.card_no, updated_by = p_actor, updated_at = now();
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'of.thv_card.set', true, 'ALLOWED', p_office, NULL, p_user::text);
END $$;

-- Thành viên văn phòng đọc được danh sách (cần để sổ hiển thị tên); người ngoài văn phòng nhận rỗng.
CREATE FUNCTION of_search_thv_cards(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, full_name text, card_no text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.thv_card.read', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY SELECT c.user_id, c.full_name, c.card_no FROM of_thv_cards c
    WHERE c.tenant_id = p_tenant AND c.office_id = p_office ORDER BY c.full_name, c.user_id;
END $$;
