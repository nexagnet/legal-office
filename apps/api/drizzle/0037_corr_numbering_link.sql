-- Công văn đi: (1) số công văn do hệ thống cấp khi ban hành nếu không nhập tay (<số>/<năm>/CV-THV, đếm theo văn phòng, reset theo năm);
-- (2) gắn/đổi/bỏ hồ sơ liên quan sau khi tạo, cho tới khi công văn hoàn tất. Số nhập tay vẫn dùng được; chuỗi rỗng vẫn bị từ chối.
-- Mặc định nghiệp vụ do Claude đề xuất (chờ chủ dự án xác nhận). Dữ liệu giả lập; không số tiền.
CREATE TABLE of_corr_number_counters (
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  year integer NOT NULL,
  last_seq integer NOT NULL CHECK (last_seq >= 0),
  PRIMARY KEY (tenant_id, office_id, year),
  CONSTRAINT of_corr_counters_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
ALTER TABLE of_corr_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE of_corr_number_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON of_corr_number_counters
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION of_corr_issue(p_tenant uuid, p_actor uuid, p_corr uuid, p_ref_no text, p_issued_on date, p_method text, p_proof_key text, p_proof_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text; ref text; y integer; n integer;
BEGIN
  SELECT * INTO c FROM of_correspondence WHERE id = p_corr AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id
                 AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'SIGNING_AUTHORITY_NOT_GRANTED', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.direction <> 'OUTBOUND' OR c.status <> 'APPROVED' THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'INVALID_STATUS', c.office_id, c.branch_id, NULL); END IF;
  IF (p_ref_no IS NOT NULL AND btrim(p_ref_no) = '') OR p_issued_on IS NULL OR btrim(coalesce(p_method, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'INVALID_CORRESPONDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_proof_key, p_proof_sha) THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', false, 'SEND_PROOF_REQUIRED', c.office_id, c.branch_id, NULL); END IF;
  -- Không truyền số (NULL) = hệ thống cấp <số>/<năm>/CV-THV theo văn phòng, reset theo năm của ngày ban hành. Số đã nhập tay thì giữ nguyên.
  ref := btrim(p_ref_no);
  IF ref IS NULL THEN
    y := extract(year FROM p_issued_on)::integer;
    INSERT INTO of_corr_number_counters (tenant_id, office_id, year, last_seq) VALUES (p_tenant, c.office_id, y, 1)
    ON CONFLICT (tenant_id, office_id, year) DO UPDATE SET last_seq = of_corr_number_counters.last_seq + 1
    RETURNING last_seq INTO n;
    ref := n || '/' || y || '/CV-THV';
  END IF;
  INSERT INTO of_attachments (tenant_id, correspondence_id, role, evidence_key, evidence_sha256, added_by) VALUES (p_tenant, p_corr, 'SEND_PROOF', p_proof_key, p_proof_sha, p_actor);
  UPDATE of_correspondence SET status = 'ISSUED', ref_no = ref, issued_on = p_issued_on, send_method = btrim(p_method), signer_user_id = p_actor
  WHERE id = p_corr AND tenant_id = p_tenant;
  PERFORM of_corr_event(p_tenant, p_corr, 'ISSUED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.issue', true, 'ALLOWED', c.office_id, c.branch_id, ref);
END $$;

-- Gắn/đổi/bỏ hồ sơ liên quan (p_case_kind và p_case cùng NULL = bỏ liên kết). Chỉ khi công văn chưa hoàn tất (không HANDLED/ISSUED).
CREATE FUNCTION of_corr_link_case(p_tenant uuid, p_actor uuid, p_corr uuid, p_case_kind text, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c of_correspondence%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM of_correspondence WHERE id = p_corr AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.link', false, 'CORRESPONDENCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'of.corr.link', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status IN ('HANDLED', 'ISSUED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.link', false, 'CORRESPONDENCE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF (p_case_kind IS NULL) <> (p_case IS NULL) OR (p_case IS NOT NULL AND NOT of_case_in_office(p_tenant, c.office_id, p_case_kind, p_case)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.corr.link', false, 'CASE_LINK_NOT_FOUND', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE of_correspondence SET case_kind = p_case_kind, case_id = p_case WHERE id = p_corr AND tenant_id = p_tenant;
  PERFORM of_corr_event(p_tenant, p_corr, 'LINKED', p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'of.corr.link', true, 'ALLOWED', c.office_id, c.branch_id, p_case::text);
END $$;
