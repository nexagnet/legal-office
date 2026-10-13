-- Đọc tồn kho vật tư theo phạm vi ghi: Admin/Trưởng VP/Thư ký thấy cả văn phòng; Văn thư/Kế toán thấy chi nhánh được cấp;
-- THV và người khác không thấy dòng tồn nào (vật tư vẫn liệt kê, on_hand rỗng). Chỉ đọc, có audit.
CREATE FUNCTION of_search_stock(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (item_id uuid, name text, unit text, branch_id uuid, branch_name text, on_hand integer, batches integer)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.stock.search', true, 'ALLOWED', p_office, NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT i.id, i.name, i.unit, s.branch_id, br.name, s.on_hand, s.batches
    FROM of_items i
    LEFT JOIN of_stock s ON s.tenant_id = i.tenant_id AND s.item_id = i.id
         AND of_can_read(p_tenant, p_actor, s.office_id, s.branch_id, NULL)
    LEFT JOIN branches br ON br.id = s.branch_id AND br.tenant_id = i.tenant_id
    WHERE i.tenant_id = p_tenant AND i.office_id = p_office
    ORDER BY i.name, br.name NULLS FIRST
    LIMIT 500;
END $$;

-- Các lô còn hàng (để kiểm kê), cùng phạm vi đọc.
CREATE FUNCTION of_search_batches(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (batch_id uuid, item_id uuid, item_name text, branch_id uuid, receipt_ref text, qty_received integer, qty_remaining integer, received_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.stock.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT b.id, b.item_id, i.name, b.branch_id, b.receipt_ref, b.qty_received, b.qty_remaining, b.received_at
    FROM of_batches b JOIN of_items i ON i.id = b.item_id AND i.tenant_id = b.tenant_id
    WHERE b.tenant_id = p_tenant AND b.office_id = p_office AND b.qty_remaining > 0
      AND of_can_read(p_tenant, p_actor, b.office_id, b.branch_id, NULL)
    ORDER BY i.name, b.received_at, b.seq LIMIT 500;
END $$;
