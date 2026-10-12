-- Applied to BOTH disposable databases after migrations. Neither ORM models RLS in
-- a way we rely on; row-level tenant isolation is hand-written SQL either way.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN;
  END IF;
END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON obligations
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
