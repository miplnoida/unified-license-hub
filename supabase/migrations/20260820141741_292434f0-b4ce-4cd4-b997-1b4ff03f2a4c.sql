-- 1) Pin search_path on the remaining mutable functions
ALTER FUNCTION public.mc_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_sel_block_mutation() SET search_path = public;
ALTER FUNCTION public.tg_return_edit_requests_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_prevent_rule_override_mutation() SET search_path = public;
ALTER FUNCTION public.prevent_audit_mutation() SET search_path = public;
ALTER FUNCTION public.tg_cal_block_mutation() SET search_path = public;
ALTER FUNCTION public.complaint_sla_status(timestamp with time zone, timestamp with time zone, integer, timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_prevent_fp_attestation_mutation() SET search_path = public;
ALTER FUNCTION public.classify_ratio_risk(numeric, numeric, numeric, text) SET search_path = public;
ALTER FUNCTION public.tg_cal_enforce_insert() SET search_path = public;
ALTER FUNCTION public.audit_logs_prevent_mutation() SET search_path = public;

-- 2) Revoke client EXECUTE on trigger functions (invoked by the database only)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
  END LOOP;
END $$;

-- 3) Revoke client EXECUTE on engineering / certification seed & reset routines
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND (p.proname LIKE 'cert\_%' OR p.proname LIKE '%\_reset\_%' OR p.proname LIKE 'seed\_%'
           OR p.proname LIKE '%\_seed\_%' OR p.proname LIKE 'reset\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 4) Governed: move an appeal into review
CREATE OR REPLACE FUNCTION public.fp_appeal_start_review(_appeal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _prev text; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','edit');
  SELECT status INTO _prev FROM public.fp_appeals WHERE id = _appeal_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'appeal not found' USING ERRCODE='22023'; END IF;
  IF _prev <> 'submitted' THEN
    RAISE EXCEPTION 'only submitted appeals can move to review' USING ERRCODE='22023';
  END IF;
  UPDATE public.fp_appeals SET status = 'under_review' WHERE id = _appeal_id RETURNING * INTO _row;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid,'fp.appeal.review_started','fp_appeal',_appeal_id,
          jsonb_build_object('before',jsonb_build_object('status',_prev),
                             'after',jsonb_build_object('status','under_review')));
  RETURN to_jsonb(_row);
END; $$;

REVOKE ALL ON FUNCTION public.fp_appeal_start_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_appeal_start_review(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fp_appeal_start_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_appeal_start_review(uuid) TO service_role;