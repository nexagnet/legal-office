-- Lát #10: đọc danh sách văn bản tống đạt theo quyền (chủ dự án chọn 12/10/2026: theo phạm vi ghi). Admin/Trưởng VP/Thư ký
-- thấy cả văn phòng; Văn thư và Kế toán theo chi nhánh được cấp; THV chỉ văn bản mình xử lý. Chỉ đọc. Dữ liệu giả lập.
CREATE FUNCTION td_list_documents(p_tenant uuid, p_actor uuid, p_limit integer)
RETURNS TABLE (document_id uuid, request_id uuid, request_ref text, request_status text, branch_id uuid,
  recipient_name text, address text, deadline_at timestamptz, status text, undeliverable_reason text,
  handler_user_id uuid, attempts integer, last_attempt_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT b.document_id, b.request_id, b.request_ref, r.status, b.branch_id, b.recipient_name, d.address, b.deadline_at,
         b.status, b.undeliverable_reason, b.handler_user_id, b.attempts, b.last_attempt_at
  FROM td_s01_book b
  JOIN td_documents d ON d.id = b.document_id AND d.tenant_id = b.tenant_id
  JOIN td_requests r ON r.id = b.request_id AND r.tenant_id = b.tenant_id
  WHERE b.tenant_id = p_tenant
    AND td_authorize(p_tenant, p_actor, b.office_id, b.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], b.handler_user_id) IS NULL
  ORDER BY b.deadline_at, b.document_id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 200))
$$;
