-- PCOMP-R2C (3): hardening + compatibility delegation.
REVOKE ALL ON FUNCTION public.supervisory_consequence_response_policy_view(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_consequence_response_policy_view(uuid, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.supervisory_response_policy_action_map() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_operational_action(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_rules(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_content_errors(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_compatibility(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_action_map() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_operational_action(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_rules(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_content_errors(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_compatibility(uuid, uuid, uuid) TO authenticated, service_role;

-- Profile compatibility delegates RESPONSE_POLICY to its own checker, exactly as
-- EVIDENCE_POLICY and JUDGEMENT_POLICY already do. Patched in place so no other
-- component semantics change.
DO $mig$
DECLARE _def text; _new text; _start int; _stop int; _block text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'supervisory_policy_profile_compatibility' AND pronargs = 1;
  IF _def IS NULL THEN RAISE EXCEPTION 'supervisory_policy_profile_compatibility not found'; END IF;

  _start := position('    IF _row.component_type = ''RESPONSE_POLICY'' THEN' in _def);
  _stop  := position('    ELSIF _row.component_type = ''SLA_POLICY'' THEN' in _def);
  IF _start = 0 OR _stop = 0 OR _stop <= _start THEN
    RAISE EXCEPTION 'R2C: RESPONSE_POLICY compatibility branch not found';
  END IF;

  _block := '    IF _row.component_type = ''RESPONSE_POLICY'' THEN' || E'\n'
         || '      _f := _f || public.supervisory_response_policy_compatibility(_profile_id, _row.id, _meth_id);' || E'\n' || E'\n';

  _new := substr(_def, 1, _start - 1) || _block || substr(_def, _stop);
  EXECUTE _new;
END $mig$;