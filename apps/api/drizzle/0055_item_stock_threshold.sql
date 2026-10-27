-- Ngưỡng cảnh báo tồn kho của vật tư (Admin đặt). Chỉ số lượng, KHÔNG đơn giá.
-- of_items là chỉ-ghi-thêm nên ngưỡng nằm ở bảng riêng như nhãn nhóm. Chưa đặt ngưỡng = không cảnh báo "Sắp hết".
CREATE TABLE of_item_thresholds (
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  low_stock_qty integer NOT NULL CHECK (low_stock_qty >= 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id),
  CONSTRAINT of_item_thresholds_item_fk FOREIGN KEY (item_id, tenant_id) REFERENCES of_items (id, tenant_id)
);

ALTER TABLE of_item_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE of_item_thresholds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON of_item_thresholds
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Đặt ngưỡng cho vật tư (Admin). p_qty NULL = bỏ ngưỡng.
CREATE FUNCTION of_set_item_threshold(p_tenant uuid, p_actor uuid, p_item uuid, p_qty integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE i of_items%ROWTYPE;
BEGIN
  SELECT * INTO i FROM of_items WHERE id = p_item AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.item.threshold', false, 'ITEM_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF NOT of_is_office_admin(p_tenant, p_actor, i.office_id) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.item.threshold', false, 'ADMIN_ONLY', i.office_id, NULL, NULL);
  END IF;
  IF p_qty IS NOT NULL AND p_qty < 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.item.threshold', false, 'INVALID_QUANTITY', i.office_id, NULL, p_item::text);
  END IF;
  IF p_qty IS NULL THEN
    DELETE FROM of_item_thresholds WHERE item_id = p_item AND tenant_id = p_tenant;
  ELSE
    INSERT INTO of_item_thresholds (tenant_id, item_id, low_stock_qty, updated_by) VALUES (p_tenant, p_item, p_qty, p_actor)
    ON CONFLICT (item_id) DO UPDATE SET low_stock_qty = EXCLUDED.low_stock_qty, updated_by = p_actor, updated_at = now();
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'of.item.threshold', true, 'ALLOWED', i.office_id, NULL, p_item::text);
END $$;

CREATE FUNCTION of_search_item_thresholds(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (item_id uuid, low_stock_qty integer)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.stock.search', true, 'ALLOWED', p_office, NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN RETURN; END IF;
  RETURN QUERY SELECT t.item_id, t.low_stock_qty FROM of_item_thresholds t JOIN of_items i ON i.id = t.item_id AND i.tenant_id = t.tenant_id
    WHERE t.tenant_id = p_tenant AND i.office_id = p_office ORDER BY t.item_id;
END $$;
