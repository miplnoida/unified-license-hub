-- ============================================================
-- Phase 3 gap closure: screening provider states + evidence scoping
-- ============================================================

-- 1. Canonical provider state vocabulary -----------------------------------
CREATE OR REPLACE FUNCTION public.fp_normalise_provider_state(
  _outcome text,
  _environment text DEFAULT NULL,
  _execution_mode text DEFAULT NULL,
  _error_category text DEFAULT NULL
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    -- already canonical
    WHEN upper(coalesce(_outcome,'')) IN (
      'SUCCESS_HIT','SUCCESS_NO_MATCH','NOT_CONFIGURED','SANDBOX',
      'PROVIDER_FAILURE','TRANSPORT_FAILURE','RATE_LIMITED','MANUAL')
      THEN upper(_outcome)
    -- explicit non-completion beats everything else
    WHEN lower(coalesce(_outcome,'')) IN ('not_configured','unconfigured')
      OR lower(coalesce(_error_category,'')) = 'not_configured'
      THEN 'NOT_CONFIGURED'
    WHEN lower(coalesce(_error_category,'')) IN ('rate_limited','throttled')
      THEN 'RATE_LIMITED'
    WHEN lower(coalesce(_error_category,'')) IN ('timeout','network','network_error','transport','transport_error','connection')
      THEN 'TRANSPORT_FAILURE'
    WHEN lower(coalesce(_outcome,'')) IN ('failed','failure','error','provider_error')
      THEN 'PROVIDER_FAILURE'
    WHEN lower(coalesce(_outcome,'')) = 'manual'
      THEN 'MANUAL'
    -- a simulated execution is NEVER a conclusive result
    WHEN lower(coalesce(_execution_mode,'')) IN ('mock','simulated','sandbox')
      OR lower(coalesce(_environment,'')) IN ('sandbox','test','staging')
      THEN 'SANDBOX'
    WHEN lower(coalesce(_outcome,'')) IN ('screened_hits','hit','hits','match','success_match')
      THEN 'SUCCESS_HIT'
    WHEN lower(coalesce(_outcome,'')) IN ('screened_clean','clean','no_match','no_hit')
      THEN 'SUCCESS_NO_MATCH'
    ELSE 'PROVIDER_FAILURE'
  END;
$$;

CREATE OR REPLACE FUNCTION public.fp_provider_state_conclusive(_state text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(coalesce(_state,'')) IN ('SUCCESS_HIT','SUCCESS_NO_MATCH','MANUAL');
$$;

-- 2. Stamp the canonical state on every persisted provider outcome ---------
CREATE OR REPLACE FUNCTION public.fp_stamp_provider_states()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_state text;
BEGIN
  IF NEW.provider_outcomes IS NULL
     OR jsonb_typeof(NEW.provider_outcomes) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(NEW.provider_outcomes) LOOP
    v_state := public.fp_normalise_provider_state(
      coalesce(v_elem->>'state', v_elem->>'outcome'),
      v_elem->>'environment',
      v_elem->>'execution_mode',
      v_elem->>'error_category'
    );
    v_out := v_out || jsonb_build_object(
      'state', v_state,
      'conclusive', public.fp_provider_state_conclusive(v_state)
    ) || '[]'::jsonb;
    -- merge onto the original element (preserve every existing key)
    v_out := (v_out - (jsonb_array_length(v_out) - 1));
    v_out := v_out || jsonb_build_array(
      v_elem || jsonb_build_object(
        'state', v_state,
        'conclusive', public.fp_provider_state_conclusive(v_state)
      )
    );
  END LOOP;

  NEW.provider_outcomes := v_out;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fp_stamp_provider_states ON public.fp_screening_runs;
CREATE TRIGGER tg_fp_stamp_provider_states
  BEFORE INSERT OR UPDATE OF provider_outcomes ON public.fp_screening_runs
  FOR EACH ROW EXECUTE FUNCTION public.fp_stamp_provider_states();

-- 3. Backfill historical runs (sandbox mocks must not read as clean) -------
UPDATE public.fp_screening_runs r
SET provider_outcomes = (
  SELECT coalesce(jsonb_agg(
    e || jsonb_build_object(
      'state', public.fp_normalise_provider_state(
        coalesce(e->>'state', e->>'outcome'), e->>'environment',
        e->>'execution_mode', e->>'error_category'),
      'conclusive', public.fp_provider_state_conclusive(
        public.fp_normalise_provider_state(
          coalesce(e->>'state', e->>'outcome'), e->>'environment',
          e->>'execution_mode', e->>'error_category'))
    )), '[]'::jsonb)
  FROM jsonb_array_elements(r.provider_outcomes) e
)
WHERE jsonb_typeof(r.provider_outcomes) = 'array'
  AND jsonb_array_length(r.provider_outcomes) > 0;

-- Run-level view of conclusiveness for the UI / tests
CREATE OR REPLACE FUNCTION public.fp_run_is_conclusive(_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.fp_screening_runs r
      WHERE r.id = _run_id AND jsonb_array_length(coalesce(r.provider_outcomes,'[]'::jsonb)) > 0
    ) THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.fp_screening_runs r,
           jsonb_array_elements(r.provider_outcomes) e
      WHERE r.id = _run_id
        AND NOT public.fp_provider_state_conclusive(e->>'state')
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.fp_run_is_conclusive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_normalise_provider_state(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fp_provider_state_conclusive(text) TO authenticated;

-- 4. Condition evidence: scope to the owning individual -------------------
DROP POLICY IF EXISTS "fp_condition_evidence_read" ON public.fp_condition_evidence;
CREATE POLICY "fp_condition_evidence_read" ON public.fp_condition_evidence
  FOR SELECT TO authenticated
  USING (
    public.fp_regulator_visible(regulator_id)
    AND (
      individual_id IS NULL
        AND public.has_permission(auth.uid(),'fit_and_proper','view')
      OR public.can_read_fp_individual(auth.uid(), individual_id)
    )
  );

DROP POLICY IF EXISTS "fp_condition_evidence_write" ON public.fp_condition_evidence;
CREATE POLICY "fp_condition_evidence_write" ON public.fp_condition_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(),'fit_and_proper','edit')
    AND public.fp_regulator_visible(regulator_id)
    AND (individual_id IS NULL OR public.can_read_fp_individual(auth.uid(), individual_id))
  );

DROP POLICY IF EXISTS "fp_condition_evidence_review" ON public.fp_condition_evidence;
CREATE POLICY "fp_condition_evidence_review" ON public.fp_condition_evidence
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(),'fit_and_proper','edit')
    AND public.fp_regulator_visible(regulator_id)
    AND (individual_id IS NULL OR public.can_read_fp_individual(auth.uid(), individual_id))
  )
  WITH CHECK (
    public.has_permission(auth.uid(),'fit_and_proper','edit')
    AND public.fp_regulator_visible(regulator_id)
    AND (individual_id IS NULL OR public.can_read_fp_individual(auth.uid(), individual_id))
  );

-- 5. Storage: scope condition-evidence objects the same way ---------------
CREATE OR REPLACE FUNCTION public.fp_can_read_evidence_object(_user uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_individual uuid;
  v_registered boolean;
BEGIN
  SELECT individual_id, true INTO v_individual, v_registered
  FROM public.fp_condition_evidence
  WHERE file_path = _name
  LIMIT 1;

  IF coalesce(v_registered,false) THEN
    -- condition evidence: individual-scoped, never "any F&P viewer"
    RETURN v_individual IS NULL
             AND public.has_permission(_user,'fit_and_proper','view')
           OR public.can_read_fp_individual(_user, v_individual);
  END IF;

  -- every other object in the bucket keeps the previous module-level rule
  RETURN public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','view');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fp_can_read_evidence_object(uuid,text) TO authenticated;

DROP POLICY IF EXISTS "fp_evidence_read" ON storage.objects;
CREATE POLICY "fp_evidence_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fp-evidence'
    AND (public.is_super_admin(auth.uid()) OR public.fp_can_read_evidence_object(auth.uid(), name))
  );
