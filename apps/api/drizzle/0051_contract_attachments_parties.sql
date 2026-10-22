-- Hợp đồng: tệp đính kèm (bản scan hợp đồng/phụ lục) và liên kết người tham gia. Dữ liệu giả lập; không số tiền (MISA là sổ duy nhất).

CREATE TABLE contract_attachments (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  added_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_attachments_fk FOREIGN KEY (contract_id, tenant_id) REFERENCES contracts (id, tenant_id)
);
CREATE INDEX contract_attachments_contract_idx ON contract_attachments (tenant_id, contract_id);

CREATE TABLE contract_parties (
  tenant_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('REPRESENTATIVE', 'BENEFICIARY', 'WITNESS', 'OTHER')),
  added_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contract_id, customer_id),
  CONSTRAINT contract_parties_contract_fk FOREIGN KEY (contract_id, tenant_id) REFERENCES contracts (id, tenant_id),
  CONSTRAINT contract_parties_customer_fk FOREIGN KEY (customer_id, tenant_id) REFERENCES customers (id, tenant_id)
);

ALTER TABLE contract_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contract_attachments
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
ALTER TABLE contract_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_parties FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contract_parties
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Chỉ vai tiếp nhận (vb_is_intake_staff) ghi và đọc, giống danh bạ khách/hợp đồng.
CREATE FUNCTION vb_add_contract_attachment(p_tenant uuid, p_actor uuid, p_contract uuid, p_name text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.attach', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contracts WHERE id = p_contract AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.attach', false, 'CONTRACT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.attach', false, 'INVALID_EVIDENCE', NULL, NULL, p_contract::text);
  END IF;
  INSERT INTO contract_attachments (tenant_id, contract_id, name, evidence_key, evidence_sha256, added_by)
  VALUES (p_tenant, p_contract, coalesce(nullif(btrim(p_name), ''), 'tệp'), p_key, p_sha, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.attach', true, 'ALLOWED', NULL, NULL, p_contract::text);
END $$;

CREATE FUNCTION vb_list_contract_attachments(p_tenant uuid, p_actor uuid, p_contract uuid)
RETURNS TABLE (id bigint, name text, key text, added_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'vb.contract.attachments', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.name, a.evidence_key, a.at FROM contract_attachments a
    WHERE a.tenant_id = p_tenant AND a.contract_id = p_contract ORDER BY a.id;
END $$;

CREATE FUNCTION vb_set_contract_party(p_tenant uuid, p_actor uuid, p_contract uuid, p_customer uuid, p_role text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contracts WHERE id = p_contract AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party', false, 'CONTRACT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party', false, 'CUSTOMER_NOT_FOUND', NULL, NULL, p_contract::text);
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('REPRESENTATIVE', 'BENEFICIARY', 'WITNESS', 'OTHER') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party', false, 'INVALID_ROLE', NULL, NULL, p_contract::text);
  END IF;
  INSERT INTO contract_parties (tenant_id, contract_id, customer_id, role, added_by)
  VALUES (p_tenant, p_contract, p_customer, p_role, p_actor)
  ON CONFLICT (tenant_id, contract_id, customer_id) DO UPDATE SET role = EXCLUDED.role, added_by = p_actor, at = now();
  RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party', true, 'ALLOWED', NULL, NULL, p_contract::text);
END $$;

CREATE FUNCTION vb_remove_contract_party(p_tenant uuid, p_actor uuid, p_contract uuid, p_customer uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party.remove', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  DELETE FROM contract_parties WHERE tenant_id = p_tenant AND contract_id = p_contract AND customer_id = p_customer;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party.remove', false, 'PARTY_NOT_FOUND', NULL, NULL, p_contract::text);
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.party.remove', true, 'ALLOWED', NULL, NULL, p_contract::text);
END $$;

CREATE FUNCTION vb_list_contract_parties(p_tenant uuid, p_actor uuid, p_contract uuid)
RETURNS TABLE (customer_id uuid, role text, display_name text, external_ref text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'vb.contract.parties', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.customer_id, p.role, c.display_name, c.external_ref
    FROM contract_parties p JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant AND p.contract_id = p_contract ORDER BY c.external_ref;
END $$;
