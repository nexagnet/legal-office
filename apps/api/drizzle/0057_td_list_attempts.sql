-- Đọc các lần tống đạt của một văn bản để hiện "Các lần tống đạt" trên trang chi tiết (Figma N15 T2). Chỉ đọc.
-- Cùng phạm vi quyền với td_list_documents: ai không thấy văn bản thì nhận danh sách rỗng. Không trả khoá bằng chứng,
-- hash hay căn cứ pháp lý. Dữ liệu giả lập.
CREATE FUNCTION td_list_attempts(p_tenant uuid, p_actor uuid, p_document uuid)
RETURNS TABLE (seq integer, outcome text, late boolean, at timestamptz, actor_user_id uuid, has_evidence boolean)
LANGUAGE sql STABLE AS $$
  SELECT a.seq, a.outcome, a.late, a.at, a.actor_user_id, a.evidence_key IS NOT NULL
  FROM td_attempts a
  JOIN td_s01_book b ON b.document_id = a.document_id AND b.tenant_id = a.tenant_id
  WHERE a.tenant_id = p_tenant
    AND a.document_id = p_document
    AND td_authorize(p_tenant, p_actor, b.office_id, b.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], b.handler_user_id) IS NULL
  ORDER BY a.seq
$$;
