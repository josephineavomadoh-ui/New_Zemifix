CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$
DECLARE
  v_crypto_schema TEXT;
BEGIN
  SELECT n.nspname
    INTO v_crypto_schema
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';

  IF v_crypto_schema IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'pgcrypto must be installed in the public schema for the security-context validator.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_roles
     WHERE rolname = 'zemifix_context_verifier'
  ) THEN
    CREATE ROLE zemifix_context_verifier
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END;
$$;

ALTER ROLE zemifix_context_verifier
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
REVOKE zemifix_context_verifier FROM zemifix_app_user;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_roles AS candidate_role
     WHERE (candidate_role.rolsuper OR candidate_role.rolbypassrls)
       AND pg_catalog.pg_has_role(
         'zemifix_app_user',
         candidate_role.oid,
         'MEMBER'
       )
  ) THEN
    RAISE EXCEPTION
      'zemifix_app_user must not be able to assume a superuser or BYPASSRLS role.';
  END IF;
END;
$$;

CREATE TABLE public.security_context_hmac_keys (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  key_bytes BYTEA NOT NULL CHECK (pg_catalog.octet_length(key_bytes) = 32)
);

DO $$
DECLARE
  v_owner pg_catalog.name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)
    INTO v_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'security_context_hmac_keys';

  IF v_owner = 'zemifix_app_user'
     OR pg_catalog.pg_has_role('zemifix_app_user', v_owner, 'MEMBER') THEN
    RAISE EXCEPTION
      'zemifix_app_user must not own or inherit ownership privileges for security_context_hmac_keys.';
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.security_context_hmac_keys FROM PUBLIC;
REVOKE ALL ON TABLE public.security_context_hmac_keys FROM zemifix_app_user;
GRANT USAGE ON SCHEMA public TO zemifix_context_verifier;
GRANT SELECT ON TABLE public.security_context_hmac_keys TO zemifix_context_verifier;

COMMENT ON TABLE public.security_context_hmac_keys IS
  'Holds the active 32-byte HMAC key. Provision and rotate using a privileged deployment process; never grant access to the application role.';

CREATE OR REPLACE FUNCTION public.fn_context_constant_time_compare(
  p_expected TEXT,
  p_actual TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_expected BYTEA;
  v_actual BYTEA;
  v_difference INTEGER := 0;
  i INTEGER;
BEGIN
  IF p_expected IS NULL
     OR p_actual IS NULL
     OR p_expected !~ '^[0-9a-f]{64}$'
     OR p_actual !~ '^[0-9a-f]{64}$' THEN
    RETURN FALSE;
  END IF;

  v_expected := pg_catalog.decode(p_expected, 'hex');
  v_actual := pg_catalog.decode(p_actual, 'hex');

  FOR i IN 0..31 LOOP
    v_difference := v_difference
      | (pg_catalog.get_byte(v_expected, i) # pg_catalog.get_byte(v_actual, i));
  END LOOP;

  RETURN v_difference = 0;
END;
$$;

ALTER FUNCTION public.fn_context_constant_time_compare(TEXT, TEXT)
  OWNER TO zemifix_context_verifier;
REVOKE ALL ON FUNCTION public.fn_context_constant_time_compare(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_context_constant_time_compare(TEXT, TEXT)
  TO zemifix_context_verifier;

CREATE OR REPLACE FUNCTION public.app_security_context_valid()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key BYTEA;
  v_signature TEXT;
  v_payload TEXT;
  v_expected_signature TEXT;
  v_user_id TEXT := COALESCE(pg_catalog.current_setting('app.current_user_id', TRUE), '');
  v_branch_id TEXT := COALESCE(pg_catalog.current_setting('app.current_branch_id', TRUE), '');
  v_branch_path TEXT := COALESCE(pg_catalog.current_setting('app.current_branch_path', TRUE), '');
  v_department_id TEXT := COALESCE(pg_catalog.current_setting('app.current_department_id', TRUE), '');
  v_access_scope TEXT := COALESCE(pg_catalog.current_setting('app.current_access_scope', TRUE), '');
  v_realm TEXT := COALESCE(pg_catalog.current_setting('app.current_realm', TRUE), '');
  v_customer_id TEXT := COALESCE(pg_catalog.current_setting('app.current_customer_id', TRUE), '');
  v_task_id TEXT := COALESCE(pg_catalog.current_setting('app.current_task_id', TRUE), '');
  v_task_type TEXT := COALESCE(pg_catalog.current_setting('app.current_task_type', TRUE), '');
  v_company_id TEXT := COALESCE(pg_catalog.current_setting('app.current_company_id', TRUE), '');
BEGIN
  v_signature := NULLIF(
    pg_catalog.current_setting('app.context_signature', TRUE),
    ''
  );
  IF v_signature IS NULL OR v_signature !~ '^[0-9a-f]{64}$' THEN
    RETURN FALSE;
  END IF;

  SELECT key_bytes
    INTO v_key
    FROM public.security_context_hmac_keys
   WHERE id = 1;
  IF v_key IS NULL THEN
    RETURN FALSE;
  END IF;

  v_payload := 'ZEMIFIX_CONTEXT_V1'
    || pg_catalog.octet_length(session_user::TEXT)::TEXT || ':' || session_user::TEXT
    || pg_catalog.octet_length(pg_catalog.current_database())::TEXT || ':' || pg_catalog.current_database()
    || pg_catalog.octet_length(pg_catalog.pg_backend_pid()::TEXT)::TEXT || ':' || pg_catalog.pg_backend_pid()::TEXT
    || pg_catalog.octet_length(pg_catalog.pg_current_xact_id()::TEXT)::TEXT || ':' || pg_catalog.pg_current_xact_id()::TEXT
    || pg_catalog.octet_length(v_user_id)::TEXT || ':' || v_user_id
    || pg_catalog.octet_length(v_branch_id)::TEXT || ':' || v_branch_id
    || pg_catalog.octet_length(v_branch_path)::TEXT || ':' || v_branch_path
    || pg_catalog.octet_length(v_department_id)::TEXT || ':' || v_department_id
    || pg_catalog.octet_length(v_access_scope)::TEXT || ':' || v_access_scope
    || pg_catalog.octet_length(v_realm)::TEXT || ':' || v_realm
    || pg_catalog.octet_length(v_customer_id)::TEXT || ':' || v_customer_id
    || pg_catalog.octet_length(v_task_id)::TEXT || ':' || v_task_id
    || pg_catalog.octet_length(v_task_type)::TEXT || ':' || v_task_type
    || pg_catalog.octet_length(v_company_id)::TEXT || ':' || v_company_id;

  v_expected_signature := pg_catalog.encode(
    public.hmac(
      pg_catalog.convert_to(v_payload, 'UTF8'),
      v_key,
      'sha256'
    ),
    'hex'
  );

  RETURN public.fn_context_constant_time_compare(
    v_expected_signature,
    v_signature
  );
END;
$$;

ALTER FUNCTION public.app_security_context_valid()
  OWNER TO zemifix_context_verifier;
REVOKE ALL ON FUNCTION public.app_security_context_valid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_security_context_valid()
  TO zemifix_app_user, zemifix_context_verifier;

CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_user_id', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_branch_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_branch_id', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_branch_path() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_branch_path', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_department_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_department_id', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_access_scope() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_access_scope', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_realm() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_realm', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_customer_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_customer_id', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_task_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_task_id', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_task_type() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_task_type', TRUE), '')
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.app_company_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN public.app_security_context_valid()
    THEN NULLIF(pg_catalog.current_setting('app.current_company_id', TRUE), '')
    ELSE NULL END;
$$;

REVOKE ALL ON FUNCTION public.app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_branch_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_branch_path() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_department_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_access_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_realm() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_customer_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_task_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_task_type() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_company_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.app_user_id() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_branch_id() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_branch_path() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_department_id() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_access_scope() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_realm() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_customer_id() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_task_id() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_task_type() TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.app_company_id() TO zemifix_app_user;
