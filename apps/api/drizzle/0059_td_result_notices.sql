-- Điều 25.2: báo kết quả tống đạt cho cơ quan yêu cầu trong 2 ngày làm việc (Figma N17 D1). Ghi lại việc ĐÃ báo: ai báo,
-- khi nào, báo cho cơ quan nào, nội dung. Chỉ ghi thêm. Báo xong thì các hạn TD_RESULT_REPORT còn mở của yêu cầu được đóng.
-- Giả định (chủ dự án ủy quyền): chưa đính kèm tệp; tệp văn bản gửi cơ quan sẽ bổ sung khi có mẫu từ khách. Dữ liệu giả lập.
CREATE TABLE td_result_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  agency text NOT NULL CHECK (btrim(agency) <> ''),
  note text NOT NULL CHECK (btrim(note) <> ''),
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT td_result_notices_request_fk FOREIGN KEY (request_id, tenant_id) REFERENCES td_requests (id, tenant_id)
);
CREATE TRIGGER td_result_notices_ro BEFORE UPDATE OR DELETE ON td_result_notices
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
ALTER TABLE td_result_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE td_result_notices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON td_result_notices
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Ghi việc đã báo kết quả. Admin, Trưởng VP, Thư ký; THV nếu là người xử lý một văn bản của yêu cầu.
-- Chỉ báo khi mọi văn bản đã có kết cục cuối (không còn PENDING/ASSIGNED).
CREATE FUNCTION td_report_result(p_tenant uuid, p_actor uuid, p_request uuid, p_agency text, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r td_requests%ROWTYPE; denied text; handler uuid; nid uuid;
BEGIN
  SELECT * INTO r FROM td_requests WHERE id = p_request AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'td.request.report', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT d.handler_user_id INTO handler FROM td_documents d
   WHERE d.request_id = p_request AND d.tenant_id = p_tenant AND d.handler_user_id = p_actor LIMIT 1;
  denied := td_authorize(p_tenant, p_actor, r.office_id, r.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'], handler);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'td.request.report', false, denied, r.office_id, r.branch_id, NULL); END IF;
  IF btrim(coalesce(p_agency, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'td.request.report', false, 'AGENCY_REQUIRED', r.office_id, r.branch_id, NULL); END IF;
  IF btrim(coalesce(p_note, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'td.request.report', false, 'NOTE_REQUIRED', r.office_id, r.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM td_documents d WHERE d.request_id = p_request AND d.tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM td_documents d WHERE d.request_id = p_request AND d.tenant_id = p_tenant AND d.status IN ('PENDING', 'ASSIGNED')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'td.request.report', false, 'DOCUMENTS_NOT_FINAL', r.office_id, r.branch_id, NULL);
  END IF;
  INSERT INTO td_result_notices (tenant_id, request_id, agency, note, sent_by)
  VALUES (p_tenant, p_request, btrim(p_agency), btrim(p_note), p_actor) RETURNING id INTO nid;
  UPDATE office_statutory_deadlines
     SET status = 'DONE', done_by = p_actor, done_at = now(), done_note = 'Đã báo kết quả cho ' || btrim(p_agency)
   WHERE tenant_id = p_tenant AND kind = 'TD_RESULT_REPORT' AND case_id = p_request AND status = 'OPEN';
  RETURN vibang_audit(p_tenant, p_actor, 'td.request.report', true, 'ALLOWED', r.office_id, r.branch_id, nid::text);
END $$;

-- Đọc các lần đã báo của một yêu cầu, mới đến cũ. Cùng phạm vi quyền với td_list_documents: không thấy yêu cầu thì rỗng.
CREATE FUNCTION td_list_result_notices(p_tenant uuid, p_actor uuid, p_request uuid)
RETURNS TABLE (id uuid, agency text, note text, sent_by uuid, sent_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT n.id, n.agency, n.note, n.sent_by, n.sent_at
  FROM td_result_notices n
  WHERE n.tenant_id = p_tenant AND n.request_id = p_request
    AND EXISTS (SELECT 1 FROM td_list_documents(p_tenant, p_actor, 200) d WHERE d.request_id = p_request)
  ORDER BY n.sent_at DESC, n.id
$$;
