ALTER TABLE public.supervisory_assessment_calculation_override DROP CONSTRAINT IF EXISTS saco_status;
ALTER TABLE public.supervisory_assessment_calculation_override ADD CONSTRAINT saco_status
  CHECK (status = ANY (ARRAY['PENDING_APPROVAL','APPROVED','REJECTED','WITHDRAWN','STALE']));

CREATE OR REPLACE FUNCTION pg_temp.patch(_sig regprocedure, _old text, _new text) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE d text;
BEGIN
  d := pg_get_functiondef(_sig);
  IF position(_old IN d) = 0 THEN RAISE EXCEPTION 'patch anchor not found in %: %', _sig, left(_old, 80); END IF;
  EXECUTE replace(d, _old, _new);
END $p$;

SELECT pg_temp.patch('public.supervisory_calculation_override_guard()'::regprocedure,
$o$    IF OLD.status <> 'PENDING_APPROVAL' THEN$o$,
$n$    IF OLD.status = 'APPROVED' AND NEW.status = 'STALE'
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_approval_decision ad WHERE ad.override_id = OLD.id) THEN
      NULL; -- AML-CLOSE-05: an approved override never used by an approval may only be marked stale
    ELSIF OLD.status <> 'PENDING_APPROVAL' THEN$n$);

SELECT pg_temp.patch('public.supervisory_calculation_override_propose(uuid,text,text)'::regprocedure,
$o$  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  _target$o$,
$n$  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.status NOT IN ('draft','returned_for_revision','submitted','reviewed') THEN
    RAISE EXCEPTION 'assessment_closed: an override cannot be proposed on a % assessment; approved history is changed only by a new assessment', _a.status
      USING ERRCODE = '55000';
  END IF;
  _target$n$);
SELECT pg_temp.patch('public.supervisory_calculation_override_propose(uuid,text,text)'::regprocedure,
$o$IF _target = COALESCE(_run.recommended_rating,'') THEN$o$,
$n$IF _target = COALESCE(_run.residual_rating, _run.recommended_rating, '') THEN$n$);

SELECT pg_temp.patch('public.supervisory_calculation_override_decide(uuid,text,text)'::regprocedure,
$o$  IF _o.proposed_by IS NOT NULL AND _o.proposed_by = _uid THEN$o$,
$n$  IF EXISTS (SELECT 1 FROM public.supervisory_assessment WHERE id = _o.assessment_id
              AND status NOT IN ('draft','returned_for_revision','submitted','reviewed')) THEN
    RAISE EXCEPTION 'assessment_closed: overrides on an approved, closed or superseded assessment cannot be decided'
      USING ERRCODE = '55000';
  END IF;
  IF _o.run_id IS DISTINCT FROM (SELECT r.id FROM public.supervisory_assessment_calculation_run r
                                  WHERE r.assessment_id = _o.assessment_id ORDER BY r.run_seq DESC LIMIT 1) THEN
    RAISE EXCEPTION 'stale_override: this override challenges an earlier calculation run; the assessment has been recalculated, so a new override must be proposed'
      USING ERRCODE = '55000';
  END IF;
  IF _o.proposed_by IS NOT NULL AND _o.proposed_by = _uid THEN$n$);

SELECT pg_temp.patch('public.supervisory_assessment_calculation_run_record(uuid,text)'::regprocedure,
$o$  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  _res$o$,
$n$  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment_locked: a % assessment cannot be recalculated; only a draft or an assessment returned for revision can', _a.status
      USING ERRCODE = '55000';
  END IF;

  _res$n$);
SELECT pg_temp.patch('public.supervisory_assessment_calculation_run_record(uuid,text)'::regprocedure,
$o$  RETURNING id INTO _run_id;
$o$,
$n$  RETURNING id INTO _run_id;

  -- AML-CLOSE-05: an override challenges one specific run; recalculation makes older undecided
  -- overrides, and approved overrides not yet used by an approval, stale.
  PERFORM set_config('app.supervisory_override_ctx', 'governed', true);
  UPDATE public.supervisory_assessment_calculation_override o
     SET status = 'STALE',
         decision_note = 'Superseded by calculation run #' || _seq || ' — the challenged result no longer exists; propose again if still needed.'
   WHERE o.assessment_id = _assessment_id AND o.run_id <> _run_id
     AND (o.status = 'PENDING_APPROVAL'
          OR (o.status = 'APPROVED' AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_approval_decision ad
                                                     WHERE ad.override_id = o.id)));
  PERFORM set_config('app.supervisory_override_ctx', '', true);
$n$);

SELECT pg_temp.patch('public.supervisory_assessment_approve(uuid,text,date,date,boolean)'::regprocedure,
$o$   WHERE assessment_id = _assessment_id AND status = 'APPROVED'
$o$,
$n$   WHERE assessment_id = _assessment_id AND status = 'APPROVED'
     AND (_r.calculation_run_id IS NULL OR run_id = _r.calculation_run_id)
$n$);

SELECT pg_temp.patch('public.supervisory_assessment_judgement_policy_internal(uuid)'::regprocedure,
$o$_calc := CASE WHEN _run.status = 'CALCULATED' THEN _run.recommended_rating ELSE NULL END;$o$,
$n$_calc := CASE WHEN _run.status = 'CALCULATED' THEN COALESCE(_run.residual_rating, _run.recommended_rating) ELSE NULL END;$n$);