-- PQ state: stamp 'submitted' whenever a declaration lands ------------------
CREATE OR REPLACE FUNCTION public.fp_pq_state_on_declaration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.declaration_data IS NOT NULL
     AND NEW.declaration_data ? 'submitted_at'
     AND (
       TG_OP = 'INSERT'
       OR coalesce(OLD.declaration_data->>'submitted_at','') IS DISTINCT FROM (NEW.declaration_data->>'submitted_at')
     )
     AND coalesce(NEW.pq_state,'draft') <> 'submitted' THEN
    NEW.pq_state := 'submitted';
    NEW.pq_amendment_reason := NULL;
    NEW.pq_state_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fp_pq_state_on_declaration ON public.fp_assessments;
CREATE TRIGGER tg_fp_pq_state_on_declaration
  BEFORE INSERT OR UPDATE OF declaration_data ON public.fp_assessments
  FOR EACH ROW EXECUTE FUNCTION public.fp_pq_state_on_declaration();

-- Supervisor amendment request ---------------------------------------------
CREATE OR REPLACE FUNCTION public.fp_request_pq_amendment(
  _assessment_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'fit_and_proper', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to request a PQ amendment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Amendment reason (min 10 chars) is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pq_state INTO v_prev FROM public.fp_assessments WHERE id = _assessment_id;
  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'Assessment % not found', _assessment_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Prior submitted response and its pinned form version are deliberately
  -- left untouched: an amendment request never destroys the original answers.
  UPDATE public.fp_assessments
  SET pq_state = 'amendment_required',
      pq_amendment_reason = trim(_reason),
      pq_state_changed_at = now(),
      updated_at = now()
  WHERE id = _assessment_id;

  INSERT INTO public.compliance_audit_logs (
    user_id, action, entity_type, entity_id, details
  ) VALUES (
    auth.uid(), 'UPDATE', 'fp_assessment', _assessment_id,
    jsonb_build_object('event','fp.pq.amendment_requested',
                       'from_state', v_prev,
                       'to_state','amendment_required',
                       'reason', trim(_reason))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fp_request_pq_amendment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_request_pq_amendment(uuid, text) TO authenticated;
