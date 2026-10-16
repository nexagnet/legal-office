-- Kiểm kê vật tư theo phiên + nhãn nhóm vật tư. Dữ liệu giả lập; chỉ số lượng, KHÔNG đơn giá/giá vốn.
-- Phiên kiểm kê (OPEN) gom các dòng "đếm thực tế" theo lô; Trưởng VP/Admin duyệt thì mới ghi ADJUSTMENT (phiếu điều chỉnh),
-- từ chối thì huỷ phiên. Nếu số còn của lô đã đổi sau lúc đếm (có xuất/nhập xen) thì không duyệt được (STALE_COUNT).

CREATE TABLE of_stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  CONSTRAINT of_stocktakes_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT of_stocktakes_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id)
);

CREATE TABLE of_stocktake_lines (
  tenant_id uuid NOT NULL,
  stocktake_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  system_qty integer NOT NULL CHECK (system_qty >= 0),
  counted_qty integer NOT NULL CHECK (counted_qty >= 0),
  reason text,
  counted_by uuid NOT NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stocktake_id, batch_id),
  CONSTRAINT of_stocktake_lines_st_fk FOREIGN KEY (stocktake_id, tenant_id) REFERENCES of_stocktakes (id, tenant_id),
  CONSTRAINT of_stocktake_lines_batch_fk FOREIGN KEY (batch_id, tenant_id) REFERENCES of_batches (id, tenant_id),
  CONSTRAINT of_stocktake_lines_reason_chk CHECK (counted_qty = system_qty OR btrim(coalesce(reason, '')) <> '')
);

-- Nhãn nhóm của vật tư (do Admin quản lý). of_items là chỉ-ghi-thêm nên nhãn nằm ở bảng riêng.
CREATE TABLE of_item_categories (
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  category text NOT NULL CHECK (btrim(category) <> ''),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id),
  CONSTRAINT of_item_categories_item_fk FOREIGN KEY (item_id, tenant_id) REFERENCES of_items (id, tenant_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['of_stocktakes', 'of_stocktake_lines', 'of_item_categories'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- Mở phiên kiểm kê tại một chi nhánh. Admin/Trưởng VP/Thư ký/Văn thư (Văn thư theo chi nhánh). label = id phiên.
CREATE FUNCTION of_stocktake_open(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; sid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.open', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.open', false, denied, p_office, p_branch, NULL); END IF;
  INSERT INTO of_stocktakes (tenant_id, office_id, branch_id, note, created_by)
  VALUES (p_tenant, p_office, p_branch, nullif(btrim(coalesce(p_note, '')), ''), p_actor) RETURNING id INTO sid;
  RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.open', true, 'ALLOWED', p_office, p_branch, sid::text);
END $$;

-- Ghi/đổi số đếm thực tế của một lô trong phiên OPEN. Lô phải cùng chi nhánh; lệch với sổ thì bắt buộc có lý do.
CREATE FUNCTION of_stocktake_count(p_tenant uuid, p_actor uuid, p_stocktake uuid, p_batch uuid, p_counted integer, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s of_stocktakes%ROWTYPE; b of_batches%ROWTYPE; denied text;
BEGIN
  SELECT * INTO s FROM of_stocktakes WHERE id = p_stocktake AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'STOCKTAKE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, s.office_id, s.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, denied, s.office_id, s.branch_id, NULL); END IF;
  IF s.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'STOCKTAKE_CLOSED', s.office_id, s.branch_id, NULL); END IF;
  SELECT * INTO b FROM of_batches WHERE id = p_batch AND tenant_id = p_tenant;
  IF NOT FOUND OR b.branch_id <> s.branch_id THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'BATCH_NOT_FOUND', s.office_id, s.branch_id, NULL);
  END IF;
  IF p_counted IS NULL OR p_counted < 0 OR p_counted > b.qty_received THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'INVALID_QUANTITY', s.office_id, s.branch_id, NULL);
  END IF;
  IF p_counted <> b.qty_remaining AND btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'REASON_REQUIRED', s.office_id, s.branch_id, NULL);
  END IF;
  INSERT INTO of_stocktake_lines (tenant_id, stocktake_id, batch_id, system_qty, counted_qty, reason, counted_by)
  VALUES (p_tenant, p_stocktake, p_batch, b.qty_remaining, p_counted, nullif(btrim(coalesce(p_reason, '')), ''), p_actor)
  ON CONFLICT (stocktake_id, batch_id) DO UPDATE
    SET system_qty = EXCLUDED.system_qty, counted_qty = EXCLUDED.counted_qty, reason = EXCLUDED.reason,
        counted_by = p_actor, counted_at = now();
  RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', true, 'ALLOWED', s.office_id, s.branch_id, p_stocktake::text);
END $$;

-- Duyệt (p_approve = true) hoặc từ chối phiên. Admin/Trưởng VP. Duyệt = ghi ADJUSTMENT cho từng dòng lệch.
-- label = số dòng đã điều chỉnh.
CREATE FUNCTION of_stocktake_decide(p_tenant uuid, p_actor uuid, p_stocktake uuid, p_approve boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s of_stocktakes%ROWTYPE; l record; b of_batches%ROWTYPE; n integer := 0; stale boolean := false;
BEGIN
  SELECT * INTO s FROM of_stocktakes WHERE id = p_stocktake AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'STOCKTAKE_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF td_authorize(p_tenant, p_actor, s.office_id, s.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL) IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'ADMIN_OR_HEAD_ONLY', s.office_id, s.branch_id, NULL);
  END IF;
  IF s.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'STOCKTAKE_CLOSED', s.office_id, s.branch_id, NULL); END IF;
  IF p_approve THEN
    IF NOT EXISTS (SELECT 1 FROM of_stocktake_lines WHERE stocktake_id = p_stocktake AND tenant_id = p_tenant) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'NO_LINES', s.office_id, s.branch_id, NULL);
    END IF;
    FOR l IN SELECT * FROM of_stocktake_lines WHERE stocktake_id = p_stocktake AND tenant_id = p_tenant ORDER BY batch_id LOOP
      SELECT * INTO b FROM of_batches WHERE id = l.batch_id AND tenant_id = p_tenant FOR UPDATE;
      IF b.qty_remaining <> l.system_qty THEN stale := true; END IF;
    END LOOP;
    IF stale THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'STALE_COUNT', s.office_id, s.branch_id, NULL); END IF;
    FOR l IN SELECT * FROM of_stocktake_lines WHERE stocktake_id = p_stocktake AND tenant_id = p_tenant AND counted_qty <> system_qty LOOP
      UPDATE of_batches SET qty_remaining = l.counted_qty WHERE id = l.batch_id AND tenant_id = p_tenant;
      INSERT INTO of_movements (tenant_id, batch_id, kind, delta, purpose, actor_user_id)
      VALUES (p_tenant, l.batch_id, 'ADJUSTMENT', l.counted_qty - l.system_qty, 'Kiểm kê: ' || l.reason, p_actor);
      n := n + 1;
    END LOOP;
  END IF;
  UPDATE of_stocktakes SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END, decided_by = p_actor, decided_at = now()
  WHERE id = p_stocktake AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', true, 'ALLOWED', s.office_id, s.branch_id, n::text);
END $$;

-- Danh sách phiên theo phạm vi đọc kho (cùng of_can_read).
CREATE FUNCTION of_search_stocktakes(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (id uuid, branch_id uuid, branch_name text, note text, status text, created_by uuid, created_at timestamptz,
  decided_by uuid, decided_at timestamptz, lines integer, variance_lines integer)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.stocktake.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT s.id, s.branch_id, br.name, s.note, s.status, s.created_by, s.created_at, s.decided_by, s.decided_at,
           (SELECT count(*)::integer FROM of_stocktake_lines l WHERE l.stocktake_id = s.id AND l.tenant_id = s.tenant_id),
           (SELECT count(*)::integer FROM of_stocktake_lines l WHERE l.stocktake_id = s.id AND l.tenant_id = s.tenant_id AND l.counted_qty <> l.system_qty)
    FROM of_stocktakes s JOIN branches br ON br.id = s.branch_id AND br.tenant_id = s.tenant_id
    WHERE s.tenant_id = p_tenant AND s.office_id = p_office
      AND of_can_read(p_tenant, p_actor, s.office_id, s.branch_id, NULL)
    ORDER BY s.created_at DESC LIMIT 200;
END $$;

CREATE FUNCTION of_search_stocktake_lines(p_tenant uuid, p_actor uuid, p_office uuid, p_stocktake uuid)
RETURNS TABLE (batch_id uuid, item_id uuid, item_name text, receipt_ref text, system_qty integer, counted_qty integer, diff integer, reason text)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.stocktake.search', true, 'ALLOWED', p_office, NULL, p_stocktake::text);
  RETURN QUERY
    SELECT l.batch_id, b.item_id, i.name, b.receipt_ref, l.system_qty, l.counted_qty, l.counted_qty - l.system_qty, l.reason
    FROM of_stocktake_lines l
    JOIN of_stocktakes s ON s.id = l.stocktake_id AND s.tenant_id = l.tenant_id
    JOIN of_batches b ON b.id = l.batch_id AND b.tenant_id = l.tenant_id
    JOIN of_items i ON i.id = b.item_id AND i.tenant_id = b.tenant_id
    WHERE l.tenant_id = p_tenant AND l.stocktake_id = p_stocktake AND s.office_id = p_office
      AND of_can_read(p_tenant, p_actor, s.office_id, s.branch_id, NULL)
    ORDER BY i.name, b.received_at, b.seq;
END $$;

-- Gán nhãn nhóm cho vật tư (Admin). Chuỗi rỗng = bỏ nhãn.
CREATE FUNCTION of_set_item_category(p_tenant uuid, p_actor uuid, p_item uuid, p_category text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE i of_items%ROWTYPE;
BEGIN
  SELECT * INTO i FROM of_items WHERE id = p_item AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.item.category', false, 'ITEM_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF NOT of_is_office_admin(p_tenant, p_actor, i.office_id) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.item.category', false, 'ADMIN_ONLY', i.office_id, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_category, '')) = '' THEN
    DELETE FROM of_item_categories WHERE item_id = p_item AND tenant_id = p_tenant;
  ELSE
    INSERT INTO of_item_categories (tenant_id, item_id, category, updated_by) VALUES (p_tenant, p_item, btrim(p_category), p_actor)
    ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, updated_by = p_actor, updated_at = now();
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'of.item.category', true, 'ALLOWED', i.office_id, NULL, p_item::text);
END $$;

CREATE FUNCTION of_search_item_categories(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (item_id uuid, category text)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.stock.search', true, 'ALLOWED', p_office, NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN RETURN; END IF;
  RETURN QUERY SELECT c.item_id, c.category FROM of_item_categories c JOIN of_items i ON i.id = c.item_id AND i.tenant_id = c.tenant_id
    WHERE c.tenant_id = p_tenant AND i.office_id = p_office ORDER BY c.category, c.item_id;
END $$;
