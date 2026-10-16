-- Lớp ĐỌC cho giao diện: xử lý MISA, đề nghị sửa lỗi N-11, tài liệu/chứng cứ hồ sơ Vi bằng và chi tiết bàn giao thi hành án.
-- Chỉ đọc, không đổi hàm/quyền hiện có, không có số tiền. Dữ liệu giả lập.
-- Hồ sơ Vi bằng: cùng cổng vb_list_cases (THV xem mọi hồ sơ của văn phòng theo quyết định 16/10/2026); hồ sơ không xem được
-- thì không trả dòng nào. Bàn giao THA: cùng phạm vi th_list_cases (THV chỉ hồ sơ mình phụ trách).

-- Trạng thái/tham chiếu MISA hiện tại. Chưa có xác nhận nào thì vẫn trả một dòng (status NOT_CONFIRMED) nếu xem được hồ sơ.
CREATE FUNCTION vb_case_misa(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (status text, reference text, confirmed_by uuid, confirmed_at timestamptz, revoke_status text,
  revoke_reason text, revoke_proposed_by uuid, updated_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT coalesce(m.status, 'NOT_CONFIRMED'), m.reference, m.confirmed_by, m.confirmed_at, coalesce(m.revoke_status, 'NONE'),
         m.revoke_reason, m.revoke_proposed_by, m.updated_at
  FROM (SELECT 1) one
  LEFT JOIN vibang_misa_confirmations m ON m.case_id = p_case AND m.tenant_id = p_tenant
  WHERE EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
$$;

-- Các đề xuất thu hồi MISA (mới nhất trước). Mỗi đề xuất ghép với quyết định đầu tiên sau nó (ACCEPTED/REJECTED); chưa có thì PENDING.
CREATE FUNCTION vb_list_revokes(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id bigint, proposed_by uuid, reason text, proposed_at timestamptz, status text, decided_by uuid, decided_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT p.id, p.actor_user_id, p.reason, p.at,
         CASE d.event WHEN 'REVOKE_ACCEPTED' THEN 'ACCEPTED' WHEN 'REVOKE_REJECTED' THEN 'REJECTED' ELSE 'PENDING' END,
         d.actor_user_id, d.at
  FROM vibang_misa_events p
  LEFT JOIN LATERAL (
    SELECT e.event, e.actor_user_id, e.at FROM vibang_misa_events e
    WHERE e.tenant_id = p.tenant_id AND e.case_id = p.case_id AND e.id > p.id AND e.event IN ('REVOKE_ACCEPTED', 'REVOKE_REJECTED')
    ORDER BY e.id LIMIT 1) d ON true
  WHERE p.tenant_id = p_tenant AND p.case_id = p_case AND p.event = 'REVOKE_PROPOSED'
    AND EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
  ORDER BY p.id DESC
$$;

-- Đề nghị sửa lỗi N-11 của hồ sơ (mới nhất trước) kèm trạng thái áp dụng.
CREATE FUNCTION vb_list_n11(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, reason text, requested_by uuid, requested_at timestamptz, before_document_id uuid, status text,
  correction_document_id uuid, signatory_user_id uuid, applied_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT k.id, k.reason, k.requested_by, k.requested_at, k.before_document_id, k.status, k.correction_document_id,
         k.signatory_user_id, k.applied_at
  FROM vibang_n11_corrections k
  WHERE k.tenant_id = p_tenant AND k.case_id = p_case
    AND EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
  ORDER BY k.requested_at DESC, k.id
$$;

-- Tài liệu đã đính kèm (mới nhất trước). Không trả khoá đối tượng; tải tệp đi qua vb_document_file.
CREATE FUNCTION vb_list_documents(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, kind text, version integer, source text, sha256 text, mime text, size_bytes bigint,
  created_by uuid, created_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT d.id, d.kind, d.version, d.source, d.sha256, d.mime, d.size_bytes, d.created_by, d.created_at
  FROM vibang_documents d
  WHERE d.tenant_id = p_tenant AND d.case_id = p_case
    AND EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
  ORDER BY d.created_at DESC, d.id
$$;

-- Mốc xác nhận chữ ký/đóng dấu và bản scan cuối đã khoá. Luôn một dòng nếu xem được hồ sơ (mốc chưa có thì NULL).
CREATE FUNCTION vb_case_evidence(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (signed_by uuid, signed_at timestamptz, stamped_by uuid, stamped_at timestamptz,
  final_scan_document_id uuid, final_scan_sha256 text, locked_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT e.signed_by, e.signed_at, e.stamped_by, e.stamped_at, e.final_scan_document_id, e.final_scan_sha256, e.locked_at
  FROM (SELECT 1) one
  LEFT JOIN vibang_evidence e ON e.case_id = p_case AND e.tenant_id = p_tenant
  WHERE EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
$$;

-- Khoá đối tượng của một tài liệu để máy chủ đọc tệp từ kho. Mọi lần tải (kể cả bị từ chối) đều ghi audit.
CREATE FUNCTION vb_document_file(p_tenant uuid, p_actor uuid, p_case uuid, p_doc uuid)
RETURNS TABLE (object_key text, mime text, kind text, sha256 text)
LANGUAGE plpgsql AS $$
DECLARE c RECORD; seen boolean;
BEGIN
  SELECT x.office_id, x.branch_id INTO c FROM vb_list_cases(p_tenant, p_actor, p_case, 1) x;
  seen := FOUND;
  PERFORM vibang_audit(p_tenant, p_actor, 'vb.document.download', seen, CASE WHEN seen THEN 'ALLOWED' ELSE 'CASE_NOT_FOUND' END,
                       CASE WHEN seen THEN c.office_id END, CASE WHEN seen THEN c.branch_id END, NULL);
  IF NOT seen THEN RETURN; END IF;
  RETURN QUERY SELECT d.object_key, d.mime, d.kind, d.sha256 FROM vibang_documents d
    WHERE d.id = p_doc AND d.tenant_id = p_tenant AND d.case_id = p_case;
END $$;

-- Chi tiết bàn giao hồ sơ THA (N-08): một dòng mỗi lần bàn giao kèm các bước, quyết định duyệt và trạng thái duyệt hiện tại.
-- Lọc theo hồ sơ (p_case) và/hoặc theo mã bàn giao (p_transfer); NULL = không lọc. Mới nhất trước.
CREATE FUNCTION as_list_transfers(p_tenant uuid, p_actor uuid, p_case uuid, p_transfer uuid)
RETURNS TABLE (id uuid, case_id uuid, case_ref text, to_user_id uuid, proposed_by uuid, current_handler_user_id uuid, status text,
  approval_state text, created_at timestamptz, completed_at timestamptz, steps jsonb, decisions jsonb)
LANGUAGE sql STABLE AS $$
  SELECT t.id, t.case_id, c.case_ref, t.to_user_id, t.proposed_by, c.handler_user_id, t.status,
         ap_blocked('TRANSFER', t.id, p_tenant), t.created_at, t.completed_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('step', s.step, 'evidenceKey', s.evidence_key,
                     'evidenceSha256', s.evidence_sha256, 'actorUserId', s.actor_user_id, 'at', s.at) ORDER BY s.at, s.id)
                   FROM as_transfer_steps s WHERE s.transfer_id = t.id AND s.tenant_id = t.tenant_id), '[]'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('decision', d.decision, 'reason', d.reason,
                     'actorUserId', d.actor_user_id, 'at', d.at) ORDER BY d.id)
                   FROM ap_decisions d WHERE d.tenant_id = t.tenant_id AND d.subject_kind = 'TRANSFER' AND d.subject_id = t.id), '[]'::jsonb)
  FROM as_transfers t
  JOIN th_cases c ON c.id = t.case_id AND c.tenant_id = t.tenant_id
  WHERE t.tenant_id = p_tenant AND (p_case IS NULL OR t.case_id = p_case) AND (p_transfer IS NULL OR t.id = p_transfer)
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
  ORDER BY t.created_at DESC, t.id
$$;
