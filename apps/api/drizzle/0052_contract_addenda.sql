-- Phụ lục hợp đồng dịch vụ: loại thay đổi, nội dung, ngày hiệu lực và BẢN SCAN ĐÃ KÝ (bắt buộc).
-- GIẢ ĐỊNH (chủ dự án ủy quyền tự quyết nghiệp vụ còn mở 23/10/2026; nghiệp vụ.md chưa định nghĩa phụ lục; sửa ở docs/architecture/contract-addenda.md):
--   * 4 loại thay đổi: EXTEND (gia hạn/điều chỉnh thời hạn), SCOPE (bổ sung phạm vi dịch vụ), PARTIES (thay đổi bên tham gia), OTHER.
--   * Số phụ lục tự tăng theo từng hợp đồng (seq = 1, 2, …); không sửa, không xoá (chỉ ghi thêm), cùng chuẩn audit của hợp đồng.
--   * Không số tiền kế toán (MISA là sổ duy nhất). Bản scan lưu qua contract_attachments, nên dùng chung đường tải về.
-- Chỉ vai tiếp nhận (vb_is_intake_staff) ghi và đọc, giống tệp đính kèm và người tham gia hợp đồng.

CREATE TABLE contract_addenda (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq > 0),
  kind text NOT NULL CHECK (kind IN ('EXTEND', 'SCOPE', 'PARTIES', 'OTHER')),
  summary text NOT NULL CHECK (btrim(summary) <> '' AND length(summary) <= 2000),
  effective_from date NOT NULL,
  attachment_id bigint NOT NULL REFERENCES contract_attachments (id),
  added_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_addenda_contract_fk FOREIGN KEY (contract_id, tenant_id) REFERENCES contracts (id, tenant_id),
  CONSTRAINT contract_addenda_seq_uq UNIQUE (tenant_id, contract_id, seq)
);
CREATE INDEX contract_addenda_contract_idx ON contract_addenda (tenant_id, contract_id, seq);

ALTER TABLE contract_addenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_addenda FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contract_addenda
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Thêm phụ lục = lưu bản scan + ghi phụ lục trong cùng một giao dịch (hàm là một câu lệnh).
CREATE FUNCTION vb_add_contract_addendum(
  p_tenant uuid, p_actor uuid, p_contract uuid, p_kind text, p_summary text,
  p_effective date, p_name text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE
  v_att bigint;
  v_seq integer;
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.addendum', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contracts WHERE id = p_contract AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.addendum', false, 'CONTRACT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('EXTEND', 'SCOPE', 'PARTIES', 'OTHER') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.addendum', false, 'INVALID_KIND', NULL, NULL, p_contract::text);
  END IF;
  IF p_summary IS NULL OR btrim(p_summary) = '' OR length(p_summary) > 2000 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.addendum', false, 'INVALID_SUMMARY', NULL, NULL, p_contract::text);
  END IF;
  IF p_effective IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.addendum', false, 'INVALID_DATE', NULL, NULL, p_contract::text);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.addendum', false, 'INVALID_EVIDENCE', NULL, NULL, p_contract::text);
  END IF;
  -- Khoá hợp đồng để hai người thêm cùng lúc không trùng số phụ lục.
  PERFORM 1 FROM contracts WHERE id = p_contract AND tenant_id = p_tenant FOR UPDATE;
  SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM contract_addenda WHERE tenant_id = p_tenant AND contract_id = p_contract;
  INSERT INTO contract_attachments (tenant_id, contract_id, name, evidence_key, evidence_sha256, added_by)
  VALUES (p_tenant, p_contract, coalesce(nullif(btrim(p_name), ''), 'Phụ lục ' || v_seq), p_key, p_sha, p_actor)
  RETURNING id INTO v_att;
  INSERT INTO contract_addenda (tenant_id, contract_id, seq, kind, summary, effective_from, attachment_id, added_by)
  VALUES (p_tenant, p_contract, v_seq, p_kind, btrim(p_summary), p_effective, v_att, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.addendum', true, 'ALLOWED', NULL, NULL, p_contract::text);
END $$;

CREATE FUNCTION vb_list_contract_addenda(p_tenant uuid, p_actor uuid, p_contract uuid)
RETURNS TABLE (id bigint, seq integer, kind text, summary text, effective_from text, attachment_id bigint, added_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'vb.contract.addenda', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.seq, a.kind, a.summary, to_char(a.effective_from, 'YYYY-MM-DD'), a.attachment_id, a.at
    FROM contract_addenda a
    WHERE a.tenant_id = p_tenant AND a.contract_id = p_contract ORDER BY a.seq;
END $$;
