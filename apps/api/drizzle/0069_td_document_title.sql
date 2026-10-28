-- Tên văn bản cần tống đạt (ví dụ "Quyết định thi hành án số 12"), hiện ở danh sách và trang chi tiết (Figma N15 T2).
-- Cột tùy chọn: văn bản tạo trước migration này và yêu cầu không nhập tên thì để trống. Dữ liệu giả lập.
ALTER TABLE td_documents ADD COLUMN title text CHECK (title IS NULL OR (btrim(title) <> '' AND length(title) <= 300));

-- Thêm tham số thứ bảy (tên văn bản, mặc định rỗng) nên lời gọi sáu tham số cũ vẫn chạy.
DROP FUNCTION td_add_document(uuid, uuid, uuid, text, text, timestamptz);
CREATE FUNCTION td_add_document(p_tenant uuid, p_actor uuid, p_request uuid, p_recipient text, p_address text, p_deadline timestamptz,
                                p_title text DEFAULT NULL)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r td_requests%ROWTYPE; denied text; did uuid; ttl text := nullif(btrim(coalesce(p_title, '')), '');
BEGIN
  SELECT * INTO r FROM td_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, denied, r.office_id, r.branch_id, NULL); END IF;
  IF r.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, 'REQUEST_CLOSED', r.office_id, r.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_recipient, '')) = '' OR btrim(coalesce(p_address, '')) = '' OR p_deadline IS NULL
     OR (ttl IS NOT NULL AND length(ttl) > 300) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', false, 'INVALID_DOCUMENT', r.office_id, r.branch_id, NULL);
  END IF;
  INSERT INTO td_documents (tenant_id, request_id, recipient_name, address, deadline_at, title)
  VALUES (p_tenant, p_request, btrim(p_recipient), btrim(p_address), p_deadline, ttl) RETURNING id INTO did;
  PERFORM td_event(p_tenant, p_request, did, 'DOCUMENT_ADDED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'td.document.add', true, 'ALLOWED', r.office_id, r.branch_id, did::text);
END $$;

-- Danh sách văn bản: thêm cột document_title ở cuối; phạm vi quyền như 0015.
DROP FUNCTION td_list_documents(uuid, uuid, integer);
CREATE FUNCTION td_list_documents(p_tenant uuid, p_actor uuid, p_limit integer)
RETURNS TABLE (document_id uuid, request_id uuid, request_ref text, request_status text, branch_id uuid,
  recipient_name text, address text, deadline_at timestamptz, status text, undeliverable_reason text,
  handler_user_id uuid, attempts integer, last_attempt_at timestamptz, document_title text)
LANGUAGE sql STABLE AS $$
  SELECT b.document_id, b.request_id, b.request_ref, r.status, b.branch_id, b.recipient_name, d.address, b.deadline_at,
         b.status, b.undeliverable_reason, b.handler_user_id, b.attempts, b.last_attempt_at, d.title
  FROM td_s01_book b
  JOIN td_documents d ON d.id = b.document_id AND d.tenant_id = b.tenant_id
  JOIN td_requests r ON r.id = b.request_id AND r.tenant_id = b.tenant_id
  WHERE b.tenant_id = p_tenant
    AND td_authorize(p_tenant, p_actor, b.office_id, b.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], b.handler_user_id) IS NULL
  ORDER BY b.deadline_at, b.document_id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 200))
$$;
