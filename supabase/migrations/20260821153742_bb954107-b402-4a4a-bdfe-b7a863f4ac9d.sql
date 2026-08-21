CREATE OR REPLACE FUNCTION public.license_lifecycle_step(
  _license_id uuid, _action_key text, _payload jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_avail jsonb; v_offer jsonb; req jsonb; f jsonb; fv text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  -- The action must be currently offered by the server for this licence.
  v_avail := public.license_lifecycle_available_actions(_license_id);
  SELECT a INTO v_offer FROM jsonb_array_elements(v_avail) a
   WHERE a->>'key' = _action_key
     AND (_payload->>'matter_id' IS NULL OR a->>'matter_id' IS NULL OR a->>'matter_id' = _payload->>'matter_id')
   LIMIT 1;

  IF v_offer IS NULL AND _action_key NOT IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL = 'Action ' || _action_key || ' is not available for this licence in its current state.';
  END IF;

  -- Every field the server asked the browser to collect is validated here.
  IF v_offer IS NOT NULL THEN
    req := public.license_action_input_requirements(_license_id, _action_key, v_offer->>'matter_kind');
    FOR f IN SELECT value FROM jsonb_array_elements(req) LOOP
      IF COALESCE((f->>'required')::boolean, false) THEN
        fv := NULLIF(btrim(COALESCE(_payload->>(f->>'key'), '')), '');
        IF fv IS NULL THEN
          RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023',
            DETAIL = (f->>'label') || ' is required for ' || _action_key || '.';
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN public.license_lifecycle_action(_license_id, _action_key, COALESCE(_payload,'{}'::jsonb), _reason);
END $$;

REVOKE ALL ON FUNCTION public.license_lifecycle_step(uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_lifecycle_step(uuid, text, jsonb, text) TO authenticated, service_role;

-- The unvalidated executor is no longer a browser-reachable path.
REVOKE EXECUTE ON FUNCTION public.license_lifecycle_action(uuid, text, jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.license_lifecycle_action(uuid, text, jsonb, text) TO service_role;