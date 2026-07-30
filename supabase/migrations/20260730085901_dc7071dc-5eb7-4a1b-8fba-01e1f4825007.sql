DO $mig$
DECLARE
  d text;
  src text := 'IF v_has_cfg AND _action_type <> ''save_comment'' THEN';
  dst text := 'IF v_has_cfg AND _action_type NOT IN (''save_comment'', ''reject'') THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p
   WHERE p.proname = 'perform_workflow_transition'
     AND p.pronamespace = 'public'::regnamespace
   LIMIT 1;

  IF d IS NULL THEN
    RAISE EXCEPTION 'perform_workflow_transition not found';
  END IF;

  IF position(src in d) = 0 THEN
    RAISE EXCEPTION 'expected step-config branch not found; aborting';
  END IF;

  d := replace(d, src, dst);
  EXECUTE d;
END
$mig$;