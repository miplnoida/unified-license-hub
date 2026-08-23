-- RC1 §1/§2 migration-certification harness: platform shim.
--
-- Reproduces the parts of a hosted Supabase project that the migration history
-- assumes already exist (roles, auth/storage schemas, JWT helpers) plus local
-- stand-ins for extensions that are not installable in the sandbox
-- (pg_cron, pg_net). Business logic is NEVER shimmed — only platform surface.

-- ---------------------------------------------------------------- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN SUPERUSER;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO CURRENT_USER;

-- ------------------------------------------------------------- schemas
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS graphql_public AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS realtime AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS cron AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS net AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS vault AUTHORIZATION CURRENT_USER;

GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;

-- ---------------------------------------------------------- extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- gen_random_uuid()/digest()/crypt() are referenced unqualified by migrations.
CREATE OR REPLACE FUNCTION public.gen_random_uuid() RETURNS uuid
  LANGUAGE sql VOLATILE AS $$ SELECT extensions.gen_random_uuid() $$;
CREATE OR REPLACE FUNCTION public.crypt(text, text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT extensions.crypt($1, $2) $$;
CREATE OR REPLACE FUNCTION public.gen_salt(text) RETURNS text
  LANGUAGE sql VOLATILE AS $$ SELECT extensions.gen_salt($1) $$;
CREATE OR REPLACE FUNCTION public.digest(text, text) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS $$ SELECT extensions.digest($1, $2) $$;

-- pg_cron stand-in: schedule bookkeeping only, no background execution.
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial PRIMARY KEY,
  schedule text,
  command text,
  nodename text DEFAULT 'localhost',
  nodeport integer DEFAULT 5432,
  database text DEFAULT current_database(),
  username text DEFAULT CURRENT_USER,
  active boolean DEFAULT true,
  jobname text UNIQUE
);
CREATE TABLE IF NOT EXISTS cron.job_run_details (
  jobid bigint, runid bigserial PRIMARY KEY, job_pid integer, database text,
  username text, command text, status text, return_message text,
  start_time timestamptz, end_time timestamptz
);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_id;
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text)
RETURNS bigint LANGUAGE sql AS $$ SELECT cron.schedule(md5($1 || $2), $1, $2) $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN DELETE FROM cron.job WHERE jobname = job_name; RETURN true; END $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN DELETE FROM cron.job WHERE jobid = job_id; RETURN true; END $$;
CREATE OR REPLACE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL,
  command text DEFAULT NULL, database text DEFAULT NULL, username text DEFAULT NULL,
  active boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cron.job j SET schedule = COALESCE(alter_job.schedule, j.schedule),
    command = COALESCE(alter_job.command, j.command),
    active = COALESCE(alter_job.active, j.active)
  WHERE j.jobid = job_id;
END $$;

-- pg_net stand-in: records intent, performs no network I/O.
CREATE TABLE IF NOT EXISTS net.http_request_queue (
  id bigserial PRIMARY KEY, method text, url text, headers jsonb, body jsonb,
  timeout_milliseconds integer, created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  VALUES ('POST', url, headers, body, timeout_milliseconds) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO net.http_request_queue (method, url, headers, timeout_milliseconds)
  VALUES ('GET', url, headers, timeout_milliseconds) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ----------------------------------------------------------- auth surface
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  aud varchar(255) DEFAULT 'authenticated',
  role varchar(255) DEFAULT 'authenticated',
  email varchar(255) UNIQUE,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  phone text UNIQUE,
  phone_confirmed_at timestamptz,
  confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id text, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb NOT NULL, provider text NOT NULL,
  last_sign_in_at timestamptz, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), email text,
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid()
);
CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  factor_type text, status text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.audit_log_entries (
  instance_id uuid, id uuid PRIMARY KEY, payload json, created_at timestamptz DEFAULT now(),
  ip_address varchar(64) DEFAULT ''
);

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim', true), '')::jsonb,
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (auth.jwt() ->> 'sub')
  )::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (auth.jwt() ->> 'role')
  )::text
$$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.email', true), ''),
    (auth.jwt() ->> 'email')
  )::text
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt()
  TO anon, authenticated, service_role;

-- -------------------------------------------------------- storage surface
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, owner uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false, avif_autodetection boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb, path_tokens text[], version text, owner_id text
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name,'/'),1)] $$;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT split_part(storage.filename(name), '.', 2) $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects, storage.buckets
  TO anon, authenticated, service_role;

-- ------------------------------------------------- realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
