-- Create non-superuser application runtime role if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'zemifix_app_user') THEN
    CREATE ROLE zemifix_app_user WITH LOGIN PASSWORD 'AppUserSecurePassword2026!';
  END IF;
END $$;

-- Revoke administrative privileges
ALTER ROLE zemifix_app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO zemifix_app_user;

-- Grant DML table privileges on all current public tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zemifix_app_user;

-- Grant usage on all current sequences in public schema
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zemifix_app_user;

-- Ensure future tables & sequences created in public schema grant DML to zemifix_app_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zemifix_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO zemifix_app_user;
