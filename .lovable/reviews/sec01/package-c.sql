BEGIN;
SET LOCAL lock_timeout = '5s';
-- Future tables created by postgres in public
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;
-- Future tables created by supabase_admin in public (may require platform privilege; see notes)
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;
COMMIT;
