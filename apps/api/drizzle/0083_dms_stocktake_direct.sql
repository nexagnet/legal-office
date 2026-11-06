-- Kiểm kê (owner 2026-10-31): điều chỉnh tồn KHÔNG cần ai duyệt, nhưng BẮT BUỘC có lý do.
-- Ghi số đếm lệch = áp dụng NGAY (phiếu ADJUSTMENT + số còn của lô). "Chốt phiên" chỉ đóng phiên, không còn duyệt/từ chối
-- và không còn STALE_COUNT. Cổng quyền: Nhóm quyền dms.stock.write hoặc vai cũ (giai đoạn chuyển tiếp).

CREATE OR REPLACE FUNCTION of_stocktake_count(p_tenant uuid, p_actor uuid, p_stocktake uuid, p_batch uuid, p_counted integer, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s of_stocktakes%ROWTYPE; b of_batches%ROWTYPE; denied text; reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  SELECT * INTO s FROM of_stocktakes WHERE id = p_stocktake AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'STOCKTAKE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := of_stock_gate(p_tenant, p_actor, s.office_id, s.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU']);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, denied, s.office_id, s.branch_id, NULL); END IF;
  IF s.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'STOCKTAKE_CLOSED', s.office_id, s.branch_id, NULL); END IF;
  SELECT * INTO b FROM of_batches WHERE id = p_batch AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR b.branch_id <> s.branch_id THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'BATCH_NOT_FOUND', s.office_id, s.branch_id, NULL);
  END IF;
  IF p_counted IS NULL OR p_counted < 0 OR p_counted > b.qty_received THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'INVALID_QUANTITY', s.office_id, s.branch_id, NULL);
  END IF;
  IF p_counted <> b.qty_remaining AND reason IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', false, 'REASON_REQUIRED', s.office_id, s.branch_id, NULL);
  END IF;
  INSERT INTO of_stocktake_lines (tenant_id, stocktake_id, batch_id, system_qty, counted_qty, reason, counted_by)
  VALUES (p_tenant, p_stocktake, p_batch, b.qty_remaining, p_counted, reason, p_actor)
  ON CONFLICT (stocktake_id, batch_id) DO UPDATE
    SET system_qty = EXCLUDED.system_qty, counted_qty = EXCLUDED.counted_qty, reason = EXCLUDED.reason,
        counted_by = p_actor, counted_at = now();
  IF p_counted <> b.qty_remaining THEN
    UPDATE of_batches SET qty_remaining = p_counted WHERE id = p_batch AND tenant_id = p_tenant;
    INSERT INTO of_movements (tenant_id, batch_id, kind, delta, purpose, actor_user_id)
    VALUES (p_tenant, p_batch, 'ADJUSTMENT', p_counted - b.qty_remaining, 'Kiểm kê: ' || reason, p_actor);
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.count', true, 'ALLOWED', s.office_id, s.branch_id, p_stocktake::text);
END $$;

-- Chốt phiên (p_approve giữ để tương thích): chỉ đóng phiên OPEN, không điều chỉnh gì thêm. label = số dòng lệch đã áp dụng.
CREATE OR REPLACE FUNCTION of_stocktake_decide(p_tenant uuid, p_actor uuid, p_stocktake uuid, p_approve boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s of_stocktakes%ROWTYPE; n integer;
BEGIN
  SELECT * INTO s FROM of_stocktakes WHERE id = p_stocktake AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'STOCKTAKE_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF of_stock_gate(p_tenant, p_actor, s.office_id, s.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU']) IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'ADMIN_OR_HEAD_ONLY', s.office_id, s.branch_id, NULL);
  END IF;
  IF s.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'STOCKTAKE_CLOSED', s.office_id, s.branch_id, NULL); END IF;
  SELECT count(*)::integer INTO n FROM of_stocktake_lines WHERE stocktake_id = p_stocktake AND tenant_id = p_tenant;
  IF n = 0 THEN RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', false, 'NO_LINES', s.office_id, s.branch_id, NULL); END IF;
  SELECT count(*)::integer INTO n FROM of_stocktake_lines WHERE stocktake_id = p_stocktake AND tenant_id = p_tenant AND counted_qty <> system_qty;
  UPDATE of_stocktakes SET status = 'APPROVED', decided_by = p_actor, decided_at = now() WHERE id = p_stocktake AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'of.stocktake.decide', true, 'ALLOWED', s.office_id, s.branch_id, n::text);
END $$;
