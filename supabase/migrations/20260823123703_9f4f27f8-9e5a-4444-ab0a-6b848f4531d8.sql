-- Harden perform_workflow_transition: the actor is always the authenticated
-- caller. A caller-supplied _actor_id may not differ from auth.uid().
do $outer$
declare
  v_src text;
  v_new text;
  v_args text;
begin
  select p.prosrc, pg_get_function_arguments(p.oid)
    into v_src, v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'perform_workflow_transition';

  if v_src is null then
    raise exception 'perform_workflow_transition not found';
  end if;

  v_new := replace(
    v_src,
    $old$  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;$old$,
    $new$  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _actor_id IS NOT NULL AND _actor_id <> auth.uid() THEN
    RETURN jsonb_build_object('error','Actor mismatch','code','ACTOR_MISMATCH','http',403);
  END IF;
  _actor_id := auth.uid();$new$);

  if v_new = v_src then
    raise exception 'actor guard anchor not found - aborting';
  end if;

  execute format(
    'create or replace function public.perform_workflow_transition(%s) returns jsonb language plpgsql security definer set search_path = public as %s',
    v_args, quote_literal(v_new));
end;
$outer$;