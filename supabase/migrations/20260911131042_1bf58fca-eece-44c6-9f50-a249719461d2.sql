DO $do$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_assessment_evidence_policy_internal';
  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_assessment_evidence_policy_internal is missing';
  END IF;
  IF position('''independent_sources_required'', _r->' in _def) > 0 THEN
    RETURN;
  END IF;
  _new := replace(_def,
    '''exception_allowed'', COALESCE((_r->>''exception_allowed'')::boolean,false),',
    '''independent_sources_required'', _r->''independent_sources_required'','
    || E'\n        ''rationale_required'', COALESCE((_r->>''rationale_required'')::boolean,false),'
    || E'\n        ''evidence_requirement'', _r->>''evidence_requirement'','
    || E'\n        ''exception_allowed'', COALESCE((_r->>''exception_allowed'')::boolean,false),');
  IF position('''independent_sources_required'', _r->' in _new) = 0 THEN
    RAISE EXCEPTION 'could not extend the evidence policy decision payload';
  END IF;
  EXECUTE _new;
END $do$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_policy_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_policy_internal(uuid) TO service_role;