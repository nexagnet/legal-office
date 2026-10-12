-- Lát 1 của #5: nền tảng tenant/văn phòng/chi nhánh/phân quyền/audit. Dữ liệu giả lập; viết tay (ADR-0002).
-- Mọi khoá ngoại là khoá kép (id, tenant_id) để một dòng không thể trỏ sang tenant khác.

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  name text NOT NULL,
  CONSTRAINT offices_id_tenant_uq UNIQUE (id, tenant_id)
);

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  name text NOT NULL,
  CONSTRAINT branches_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT branches_office_tenant_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  external_ref text NOT NULL,
  CONSTRAINT users_id_tenant_uq UNIQUE (id, tenant_id)
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  office_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'TRUONG_VP', 'THV', 'THU_KY', 'VAN_THU', 'KE_TOAN')),
  legal_signer boolean NOT NULL DEFAULT false,
  CONSTRAINT memberships_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT memberships_user_tenant_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT memberships_office_tenant_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE TABLE branch_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  CONSTRAINT branch_grants_membership_branch_uq UNIQUE (membership_id, branch_id),
  CONSTRAINT branch_grants_membership_tenant_fk FOREIGN KEY (membership_id, tenant_id) REFERENCES memberships (id, tenant_id),
  CONSTRAINT branch_grants_branch_tenant_fk FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id)
);

-- Chỉ ghi thêm. Không PII, không nội dung hồ sơ.
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('allow', 'deny')),
  reason text NOT NULL,
  office_id uuid,
  branch_id uuid
);

CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- Cô lập tenant theo hàng. Ứng dụng đặt `SELECT set_config('app.tenant_id', <uuid>, true)` trong mỗi
-- transaction; thiếu ngữ cảnh thì không thấy dòng nào và không ghi được.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['offices', 'branches', 'users', 'memberships', 'branch_grants', 'audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id::text = current_setting('app.tenant_id', true))
  WITH CHECK (id::text = current_setting('app.tenant_id', true));
