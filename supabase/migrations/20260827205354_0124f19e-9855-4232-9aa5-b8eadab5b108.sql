-- F0-B7: replace vacuous current_user guards inside SECURITY DEFINER routines
-- with request-derived caller identity.

CREATE OR REPLACE FUNCTION public.request_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  ), '')
$$;

COMMENT ON FUNCTION public.request_role() IS
  'Role asserted by the incoming API request (JWT role claim). NULL for direct database sessions. Never derived from current_user, which is the owner inside SECURITY DEFINER routines.';

CREATE OR REPLACE FUNCTION public.is_trusted_service_request()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.request_role() IS NOT NULL
      THEN public.request_role() = 'service_role'
    ELSE session_user = 'postgres'
      OR session_user = 'supabase_admin'
      OR session_user = 'app_certification_runner'
      OR session_user LIKE 'sandbox_exec%'
  END
$$;

COMMENT ON FUNCTION public.is_trusted_service_request() IS
  'TRUE only for genuine service-role API calls or privileged direct database sessions (migration / certification runner). session_user and the JWT role claim are unaffected by SECURITY DEFINER, unlike current_user.';

REVOKE EXECUTE ON FUNCTION public.request_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_trusted_service_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_trusted_service_request() TO authenticated, service_role;

-- DEF-F0-C-01 -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.file_upload_record_scan(_file_upload_id uuid, _verdict text, _provider text DEFAULT NULL::text, _detail text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _from text; _uid uuid := auth.uid();
BEGIN
  IF NOT (public.is_trusted_service_request() OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'not_authorized: scan verdicts are recorded by the scanning worker only'
      USING ERRCODE = '42501';
  END IF;
  IF _verdict NOT IN ('scanning','clean','suspicious','infected','scan_error','quarantined') THEN
    RAISE EXCEPTION 'unsupported_verdict: %', _verdict USING ERRCODE = '22023';
  END IF;
  IF _verdict = 'clean' AND COALESCE(btrim(_provider),'') = '' THEN
    RAISE EXCEPTION 'provider_required: a file cannot be released clean without an inspecting provider'
      USING ERRCODE = '22023';
  END IF;

  SELECT scan_status INTO _from FROM public.file_uploads WHERE id = _file_upload_id FOR UPDATE;
  IF _from IS NULL THEN
    RAISE EXCEPTION 'file_upload_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.file_uploads
     SET scan_status = _verdict,
         scan_provider = _provider,
         scan_detail = _detail,
         scanned_at = now(),
         is_quarantined = (_verdict IN ('infected','suspicious','quarantined')),
         updated_at = now()
   WHERE id = _file_upload_id;

  INSERT INTO public.file_upload_scan_events (file_upload_id, from_status, to_status, provider, detail, actor_id)
  VALUES (_file_upload_id, _from, _verdict, _provider, _detail, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (_uid, 'file_scan_verdict', 'file_upload', _file_upload_id::text,
          jsonb_build_object('scan_status', _from),
          jsonb_build_object('scan_status', _verdict),
          jsonb_build_object('provider', _provider, 'detail', _detail));

  RETURN jsonb_build_object('file_upload_id', _file_upload_id, 'from', _from, 'to', _verdict);
END$function$;

-- DEF-F0-C-02 -----------------------------------------------------------------
DO $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.prudential_ewi_evaluate(uuid,date)'::regprocedure);
  v_def := replace(v_def,
    'IF NOT (current_user IN (''service_role'',''postgres'',''supabase_admin'') OR public.can_read_prudential_entity(auth.uid(), _entity_id)) THEN',
    'IF NOT (public.is_trusted_service_request() OR public.can_read_prudential_entity(auth.uid(), _entity_id)) THEN');
  IF v_def ILIKE '%current_user%' THEN
    RAISE EXCEPTION 'prudential_ewi_evaluate guard rewrite failed (current_user still present)';
  END IF;
  EXECUTE v_def;
END
$patch$;

-- Conduct authority helpers: only genuine service runs are trusted -----------
DO $patch$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) LIKE '%auth.uid() IS NULL AND current_user IN (''service_role'',''postgres'',''supabase_admin'')%'
  LOOP
    v_def := replace(pg_get_functiondef(r.oid),
      '(auth.uid() IS NULL AND current_user IN (''service_role'',''postgres'',''supabase_admin''))',
      'public.is_trusted_service_request()');
    IF v_def ILIKE '%current_user%' THEN
      RAISE EXCEPTION 'guard rewrite failed for %', r.oid::regprocedure;
    END IF;
    EXECUTE v_def;
  END LOOP;
END
$patch$;

-- Append-only integrity trigger must see the real invoking role --------------
CREATE OR REPLACE FUNCTION public.entity_identity_snapshot_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'entity_identity_snapshots is append-only: % is not permitted', TG_OP USING ERRCODE = '42501';
END $function$;

-- DEF-F0-C-03: trigger functions are never directly callable by API roles ----
DO $revoke$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END
$revoke$;