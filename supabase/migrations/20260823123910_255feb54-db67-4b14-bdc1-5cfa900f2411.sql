-- Correct the actor-identity guard: the canonical product path invokes these
-- transitions from an edge function running as service_role, which authenticates
-- the caller itself and passes the verified actor. Direct end-user calls must
-- never be able to act as somebody else.
create or replace function public.workflow_resolve_actor(_claimed uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_user
  ) = 'service_role';
BEGIN
  IF v_service THEN
    IF _claimed IS NULL THEN
      RAISE EXCEPTION 'ACTOR_REQUIRED' USING ERRCODE = '42501';
    END IF;
    RETURN _claimed;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _claimed IS NOT NULL AND _claimed <> v_uid THEN
    RAISE EXCEPTION 'ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$fn$;

revoke all on function public.workflow_resolve_actor(uuid) from public, anon;
grant execute on function public.workflow_resolve_actor(uuid) to authenticated, service_role;

do $outer$
declare
  v_src text; v_new text; v_args text;
begin
  select p.prosrc, pg_get_function_arguments(p.oid) into v_src, v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'perform_workflow_transition';

  v_new := replace(v_src,
    $old$  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _actor_id IS NOT NULL AND _actor_id <> auth.uid() THEN
    RETURN jsonb_build_object('error','Actor mismatch','code','ACTOR_MISMATCH','http',403);
  END IF;
  _actor_id := auth.uid();$old$,
    $new$  BEGIN
    _actor_id := public.workflow_resolve_actor(_actor_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('error', SQLERRM, 'code', SQLERRM,
                              'http', CASE WHEN SQLERRM = 'UNAUTHORIZED' THEN 401 ELSE 403 END);
  END;$new$);

  if v_new = v_src then
    raise exception 'transition actor guard anchor not found';
  end if;

  execute format('create or replace function public.perform_workflow_transition(%s) returns jsonb language plpgsql security definer set search_path = public as %s',
                 v_args, quote_literal(v_new));
end;
$outer$;