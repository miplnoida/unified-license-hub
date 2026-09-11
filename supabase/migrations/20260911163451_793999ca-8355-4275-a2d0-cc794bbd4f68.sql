-- PCOMP-R2D (5): content fingerprint comes from the canonical hash function,
-- not from a non-existent column. Also corrects the same latent expression in
-- the R2C response policy evaluator; no semantics change.
DO $mig$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'supervisory_sla_policy_internal';
  _new := replace(_def,
    $q$'content_hash', _comp.content_hash) END,$q$,
    $q$'content_hash', public.supervisory_policy_component_content_hash(_comp.component_type, _comp.id)) END,$q$);
  IF _new = _def THEN RAISE EXCEPTION 'R2D: SLA evaluator hash expression not found'; END IF;
  EXECUTE _new;
END $mig$;

DO $mig$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'supervisory_response_policy_internal';
  _new := replace(_def,
    $q$'content_hash', _comp.content_hash)$q$,
    $q$'content_hash', public.supervisory_policy_component_content_hash(_comp.component_type, _comp.id))$q$);
  IF _new <> _def THEN EXECUTE _new; END IF;
END $mig$;

REVOKE ALL ON FUNCTION public.supervisory_sla_policy_internal(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_sla_policy_internal(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.supervisory_response_policy_internal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_response_policy_internal(uuid, text) TO service_role;