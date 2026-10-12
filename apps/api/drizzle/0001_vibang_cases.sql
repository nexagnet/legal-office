-- Lát #6: hồ sơ Vi bằng, khách hàng, hợp đồng, Change Request. Dữ liệu giả lập; không số tiền (MISA là sổ duy nhất).
-- Không đánh số Vi bằng ở đây (#7) và không lưu scan (#8). Khoá ngoại kép (id, tenant_id) như 0000.

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  kind text NOT NULL CHECK (kind IN ('PERSON', 'ORGANIZATION')),
  external_ref text NOT NULL,
  CONSTRAINT customers_id_tenant_uq UNIQUE (id, tenant_id)
);

CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  customer_id uuid NOT NULL,
  external_ref text NOT NULL,
  CONSTRAINT contracts_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT contracts_customer_tenant_fk FOREIGN KEY (customer_id, tenant_id) REFERENCES customers (id, tenant_id)
);

CREATE TABLE vibang_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  contract_id uuid,
  status text NOT NULL DEFAULT 'INTAKE'
    CHECK (status IN ('INTAKE', 'ASSIGNED', 'SIGNED', 'STAMPED', 'RETURNED', 'CANCELLED')),
  responsible_thv_membership_id uuid,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  contact_note text NOT NULL DEFAULT '',
  proofs text[] NOT NULL DEFAULT '{}',
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT vibang_cases_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT vibang_cases_branch_tenant_fk FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id),
  CONSTRAINT vibang_cases_office_tenant_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT vibang_cases_customer_tenant_fk FOREIGN KEY (customer_id, tenant_id) REFERENCES customers (id, tenant_id),
  CONSTRAINT vibang_cases_contract_tenant_fk FOREIGN KEY (contract_id, tenant_id) REFERENCES contracts (id, tenant_id),
  CONSTRAINT vibang_cases_thv_tenant_fk FOREIGN KEY (responsible_thv_membership_id, tenant_id) REFERENCES memberships (id, tenant_id),
  -- Đã gán THV thì mới được qua các bước pháp lý; huỷ phải có lý do.
  CONSTRAINT vibang_cases_assigned_chk CHECK (status IN ('INTAKE', 'CANCELLED') OR responsible_thv_membership_id IS NOT NULL),
  CONSTRAINT vibang_cases_cancel_reason_chk CHECK ((status = 'CANCELLED') = (cancel_reason IS NOT NULL))
);
CREATE INDEX vibang_cases_tenant_status_idx ON vibang_cases (tenant_id, status);
CREATE INDEX vibang_cases_contract_idx ON vibang_cases (contract_id) WHERE contract_id IS NOT NULL;

CREATE TABLE vibang_case_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  requested_by text NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by text,
  decided_at timestamptz,
  CONSTRAINT vibang_cr_case_tenant_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vibang_cases (id, tenant_id),
  CONSTRAINT vibang_cr_decided_chk CHECK ((status = 'PENDING') = (decided_by IS NULL AND decided_at IS NULL))
);

-- Hồ sơ đã trả hoặc huỷ là bất biến: chặn mọi UPDATE/DELETE, và chặn xoá cứng hồ sơ nói chung.
-- Người chịu trách nhiệm phải là membership vai THV trong cùng văn phòng.
CREATE FUNCTION vibang_cases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vibang_cases rows are never hard-deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('RETURNED', 'CANCELLED') THEN
      RAISE EXCEPTION 'vibang case is final (%)', OLD.status USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.tenant_id <> OLD.tenant_id OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'tenant_id and created_at are immutable' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.responsible_thv_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = NEW.responsible_thv_membership_id AND m.tenant_id = NEW.tenant_id
      AND m.role = 'THV' AND m.office_id = NEW.office_id
  ) THEN
    RAISE EXCEPTION 'responsible THV must be a THV membership of the same office' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vibang_cases_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON vibang_cases
  FOR EACH ROW EXECUTE FUNCTION vibang_cases_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'contracts', 'vibang_cases', 'vibang_case_change_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;
