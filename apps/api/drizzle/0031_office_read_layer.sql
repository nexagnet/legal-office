-- Lớp ĐỌC bổ sung cho Công văn và Vật tư + giao người xử lý công văn đến. Dữ liệu giả lập khi thử; không giá/tiền.

-- Sự kiện giao/đổi người xử lý.
ALTER TABLE of_corr_events DROP CONSTRAINT of_corr_events_event_check;
ALTER TABLE of_corr_events ADD CONSTRAINT of_corr_events_event_check
  CHECK (event IN ('CREATED', 'ATTACHED', 'HANDLED', 'SUBMITTED', 'APPROVED', 'ISSUED', 'LINKED', 'ASSIGNED'));

-- Lịch sử nhập/xuất/kiểm kê vật tư: mỗi dòng của of_movements (xuất FIFO ghi một dòng cho mỗi lô) kèm nguồn lô.
-- Cùng phạm vi đọc với tồn kho (of_search_stock): Admin/Trưởng VP/Thư ký cả văn phòng; Văn thư/Kế toán chi nhánh được cấp;
-- THV và người ngoài văn phòng không thấy dòng nào. Ngày theo giờ Việt Nam, cận from/to đều bao gồm. Có audit.
CREATE FUNCTION of_search_movements(p_tenant uuid, p_actor uuid, p_office uuid, p_item uuid, p_branch uuid, p_from date, p_to date, p_limit integer)
RETURNS TABLE (movement_id bigint, at timestamptz, kind text, delta integer, purpose text, actor_user_id uuid,
  item_id uuid, item_name text, unit text, branch_id uuid, batch_id uuid, receipt_ref text, batch_received_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.stock.movements', true, 'ALLOWED', p_office, p_branch, NULL);
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT mv.id, mv.at, mv.kind, mv.delta, mv.purpose, mv.actor_user_id,
           i.id, i.name, i.unit, b.branch_id, b.id, b.receipt_ref, b.received_at
    FROM of_movements mv
    JOIN of_batches b ON b.id = mv.batch_id AND b.tenant_id = mv.tenant_id
    JOIN of_items i ON i.id = b.item_id AND i.tenant_id = b.tenant_id
    WHERE mv.tenant_id = p_tenant AND b.office_id = p_office
      AND of_can_read(p_tenant, p_actor, b.office_id, b.branch_id, NULL)
      AND (p_item IS NULL OR i.id = p_item)
      AND (p_branch IS NULL OR b.branch_id = p_branch)
      AND (p_from IS NULL OR (mv.at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from)
      AND (p_to IS NULL OR (mv.at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to)
    ORDER BY mv.at DESC, mv.id DESC
    LIMIT least(greatest(coalesce(p_limit, 200), 1), 1000);
END $$;

-- Danh sách công văn đầy đủ cột + bộ lọc. overdue = công văn đến chưa xử lý (RECEIVED) có hạn đã qua.
-- p_overdue = true chỉ lấy công văn quá hạn; false/NULL không lọc. from/to lọc theo ngày nhận (đến) hoặc ngày ban hành (đi),
-- không có thì theo ngày tạo (giờ Việt Nam). Cùng of_can_read với of_search_correspondence. Có audit.
CREATE FUNCTION of_list_correspondence(p_tenant uuid, p_actor uuid, p_office uuid, p_direction text, p_status text,
  p_overdue boolean, p_handler uuid, p_from date, p_to date, p_limit integer)
RETURNS TABLE (id uuid, direction text, status text, ref_no text, doc_type text, counterparty text, subject text, branch_id uuid,
  case_kind text, case_id uuid, received_on text, issued_on text, due_at timestamptz, handler_user_id uuid, result_note text,
  archive_ref text, overdue boolean, created_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.corr.list', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT x.* FROM (
      SELECT c.id, c.direction, c.status, c.ref_no, c.doc_type, c.counterparty, c.subject, c.branch_id, c.case_kind, c.case_id,
             c.received_on::text, c.issued_on::text, c.due_at, c.handler_user_id, c.result_note, c.archive_ref,
             (c.direction = 'INBOUND' AND c.status = 'RECEIVED' AND c.due_at IS NOT NULL AND c.due_at < now()) AS overdue,
             c.created_at
      FROM of_correspondence c
      WHERE c.tenant_id = p_tenant AND c.office_id = p_office
        AND of_can_read(p_tenant, p_actor, c.office_id, c.branch_id, c.handler_user_id)
        AND (p_direction IS NULL OR c.direction = p_direction)
        AND (p_status IS NULL OR c.status = p_status)
        AND (p_handler IS NULL OR c.handler_user_id = p_handler)
        AND (p_from IS NULL OR coalesce(c.received_on, c.issued_on, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) >= p_from)
        AND (p_to IS NULL OR coalesce(c.received_on, c.issued_on, (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) <= p_to)
    ) x
    WHERE (p_overdue IS NOT TRUE OR x.overdue)
    ORDER BY x.created_at DESC, x.id
    LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
END $$;

-- Chi tiết một công văn + tệp đính kèm + lịch sử. Không đọc được hoặc không có → 0 dòng (audit từ chối). Có audit.
CREATE FUNCTION of_get_correspondence(p_tenant uuid, p_actor uuid, p_corr uuid)
RETURNS TABLE (id uuid, office_id uuid, direction text, status text, ref_no text, doc_type text, counterparty text, subject text,
  branch_id uuid, case_kind text, case_id uuid, received_on text, issued_on text, due_at timestamptz, handler_user_id uuid,
  result_note text, archive_ref text, send_method text, overdue boolean, created_at timestamptz, attachments jsonb, events jsonb)
LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE;
BEGIN
  SELECT * INTO c FROM of_correspondence o WHERE o.id = p_corr AND o.tenant_id = p_tenant;
  IF NOT FOUND OR NOT of_can_read(p_tenant, p_actor, c.office_id, c.branch_id, c.handler_user_id) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.corr.get', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.corr.get', true, 'ALLOWED', c.office_id, c.branch_id, c.id::text);
  RETURN QUERY
    SELECT c.id, c.office_id, c.direction, c.status, c.ref_no, c.doc_type, c.counterparty, c.subject, c.branch_id, c.case_kind, c.case_id,
           c.received_on::text, c.issued_on::text, c.due_at, c.handler_user_id, c.result_note, c.archive_ref, c.send_method,
           (c.direction = 'INBOUND' AND c.status = 'RECEIVED' AND c.due_at IS NOT NULL AND c.due_at < now()),
           c.created_at,
           coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'role', a.role, 'key', a.evidence_key, 'sha256', a.evidence_sha256,
                       'name', regexp_replace(a.evidence_key, '^.*/', ''), 'addedBy', a.added_by, 'at', a.at) ORDER BY a.id)
                     FROM of_attachments a WHERE a.correspondence_id = c.id AND a.tenant_id = p_tenant), '[]'::jsonb),
           coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor_user_id, 'at', e.at) ORDER BY e.id)
                     FROM of_corr_events e WHERE e.correspondence_id = c.id AND e.tenant_id = p_tenant), '[]'::jsonb);
END $$;

-- Giao/đổi người xử lý công văn ĐẾN khi chưa xử lý (RECEIVED). Admin/Trưởng VP/Thư ký. Người xử lý phải là thành viên văn phòng.
-- label = id người xử lý.
CREATE FUNCTION of_corr_assign(p_tenant uuid, p_actor uuid, p_corr uuid, p_handler uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM of_correspondence o WHERE o.id = p_corr AND o.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.assign', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.assign', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.direction <> 'INBOUND' OR c.status <> 'RECEIVED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.assign', false, 'CORRESPONDENCE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_handler IS NULL OR NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_handler AND m.office_id = c.office_id) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.assign', false, 'INVALID_HANDLER', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE of_correspondence SET handler_user_id = p_handler WHERE id = p_corr AND tenant_id = p_tenant;
  PERFORM of_corr_event(p_tenant, p_corr, 'ASSIGNED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.assign', true, 'ALLOWED', c.office_id, c.branch_id, p_handler::text);
END $$;
