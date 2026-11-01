-- Vai ứng dụng KHÔNG phải superuser để RLS có hiệu lực khi đo. Chỉ dùng trên DB cách ly.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bench_app') THEN CREATE ROLE bench_app LOGIN PASSWORD 'bench'; END IF; END $$;
GRANT USAGE ON SCHEMA public TO bench_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO bench_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO bench_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bench_app;
REVOKE ALL ON bench_ctx, bench_cases, bench_docs, bench_files FROM bench_app;
