DO $mig$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_portfolio_internal';
  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_portfolio_internal does not exist';
  END IF;

  _new := _def;
  _new := replace(_new,
    '''previous_rating'', m.previous_rating, ''new_rating'', m.new_rating,',
    '''previous_rating'', upper(NULLIF(m.previous_rating,'''')), ''new_rating'', upper(NULLIF(m.new_rating,'''')),');
  _new := replace(_new,
    '(SELECT m.previous_rating FROM public.entity_risk_state_movement m',
    '(SELECT upper(NULLIF(m.previous_rating,'''')) FROM public.entity_risk_state_movement m');
  _new := replace(_new,
    '(SELECT m.new_rating FROM public.entity_risk_state_movement m',
    '(SELECT upper(NULLIF(m.new_rating,'''')) FROM public.entity_risk_state_movement m');
  _new := replace(_new,
    'r->>''current_risk'') AS k',
    'upper(NULLIF(r->>''current_risk'','''')))  AS k');

  IF _new = _def THEN
    RAISE NOTICE 'portfolio rating case normalisation already applied';
    RETURN;
  END IF;

  EXECUTE _new;
END
$mig$;