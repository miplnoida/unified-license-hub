DO $mig$
DECLARE src text; out text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_portfolio_internal';
  IF src IS NULL THEN RAISE EXCEPTION 'supervisory_portfolio_internal not found'; END IF;

  out := replace(src,
    '_risk := _src->>''current_rating'';',
    '_risk := upper(NULLIF(_src->>''current_rating'','''')); -- canonical rating label; stored history untouched');
  IF out = src THEN RAISE EXCEPTION 'current_rating normalisation anchor not found'; END IF;

  src := out;
  out := replace(src,
    '''inherent_rating'', _src->''risk_state''->>''inherent_rating'',
        ''control_rating'', _src->''risk_state''->>''control_rating'',',
    '''inherent_rating'', upper(NULLIF(_src->''risk_state''->>''inherent_rating'','''')),
        ''control_rating'', upper(NULLIF(_src->''risk_state''->>''control_rating'','''')),');
  IF out = src THEN RAISE EXCEPTION 'inherent/control normalisation anchor not found'; END IF;

  EXECUTE out;
END $mig$;