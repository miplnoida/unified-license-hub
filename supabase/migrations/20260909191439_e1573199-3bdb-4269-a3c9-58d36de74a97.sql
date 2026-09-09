-- =====================================================================
-- AML-07 — ASSESSMENT REVIEW, APPROVAL & RISK-OF-RECORD PUBLICATION
-- Extends the existing supervisory assessment lifecycle. No new
-- assessment workflow and no parallel risk register: the canonical
-- risk-of-record remains public.entity_risk_state / _movement.
-- =====================================================================

ALTER TABLE public.supervisory_assessment
  ADD COLUMN IF NOT EXISTS review_round_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_run_id uuid,
  ADD COLUMN IF NOT EXISTS reviewer_id uuid,
  ADD COLUMN IF NOT EXISTS approved_rating text,
  ADD COLUMN IF NOT EXISTS approved_rating_source text,
  ADD COLUMN IF NOT EXISTS approval_decision_id uuid,
  ADD COLUMN IF NOT EXISTS risk_publication_id uuid,
  ADD COLUMN IF NOT EXISTS risk_published_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sa_submitted_run_fk') THEN
    ALTER TABLE public.supervisory_assessment
      ADD CONSTRAINT sa_submitted_run_fk FOREIGN KEY (submitted_run_id)
      REFERENCES public.supervisory_assessment_calculation_run(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ------------------------------------------------------------ rounds ----
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_review_round (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  round_seq integer NOT NULL,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submission_rationale text,
  change_summary text,
  calculation_basis text NOT NULL DEFAULT 'CALCULATED',
  calculation_run_id uuid REFERENCES public.supervisory_assessment_calculation_run(id) ON DELETE RESTRICT,
  calculation_run_seq integer,
  calculation_inputs_hash text,
  calculation_result_hash text,
  computed_rating text,
  readiness_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id uuid,
  reviewer_assigned_by uuid,
  reviewer_assigned_at timestamptz,
  outcome text NOT NULL DEFAULT 'PENDING',
  outcome_by uuid,
  outcome_at timestamptz,
  outcome_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sarr_seq_unique UNIQUE (assessment_id, round_seq),
  CONSTRAINT sarr_outcome CHECK (outcome = ANY (ARRAY['PENDING','RETURNED','APPROVED','REJECTED'])),
  CONSTRAINT sarr_basis CHECK (calculation_basis = ANY (ARRAY['CALCULATED','LEGACY_NO_POLICY']))
);

-- -------------------------------------------------------- challenges ----
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_review_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  review_round_id uuid NOT NULL REFERENCES public.supervisory_assessment_review_round(id) ON DELETE CASCADE,
  round_seq integer NOT NULL,
  challenge_code text NOT NULL,
  category text NOT NULL,
  narrative text NOT NULL,
  question_code text,
  dimension_code text,
  fact_code text,
  evidence_id uuid,
  calculation_run_id uuid,
  status text NOT NULL DEFAULT 'OPEN',
  raised_by uuid,
  raised_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sarc_status CHECK (status = ANY (ARRAY['OPEN','RESOLVED','WITHDRAWN'])),
  CONSTRAINT sarc_narrative CHECK (length(btrim(narrative)) >= 10),
  CONSTRAINT sarc_category CHECK (category = ANY (ARRAY['SCOPE','RESPONSE','EVIDENCE','FACT','CALCULATION','RATING','PROCEDURE']))
);

-- --------------------------------------------------- approval record ----
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_approval_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  review_round_id uuid REFERENCES public.supervisory_assessment_review_round(id) ON DELETE RESTRICT,
  round_seq integer,
  decision text NOT NULL,
  methodology_id uuid,
  methodology_version text,
  programme_id uuid,
  programme_version text,
  question_plan_version text,
  question_plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_fact_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculation_basis text NOT NULL DEFAULT 'CALCULATED',
  calculation_run_id uuid REFERENCES public.supervisory_assessment_calculation_run(id) ON DELETE RESTRICT,
  calculation_run_seq integer,
  calculation_inputs_hash text,
  calculation_result_hash text,
  computed_rating text,
  override_id uuid REFERENCES public.supervisory_assessment_calculation_override(id) ON DELETE RESTRICT,
  override_rating text,
  final_rating text,
  final_rating_source text NOT NULL,
  rationale text NOT NULL,
  effective_date date NOT NULL DEFAULT current_date,
  review_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saad_decision CHECK (decision = ANY (ARRAY['APPROVED','REJECTED'])),
  CONSTRAINT saad_source CHECK (final_rating_source = ANY (
    ARRAY['COMPUTED','APPROVED_OVERRIDE','LEGACY_OFFICER_RATING','NOT_APPLICABLE'])),
  CONSTRAINT saad_rationale CHECK (length(btrim(rationale)) >= 10)
);

-- ------------------------------------------------- publication ledger ----
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_risk_publication (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_decision_id uuid NOT NULL UNIQUE
    REFERENCES public.supervisory_assessment_approval_decision(id) ON DELETE RESTRICT,
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL,
  domain_code text NOT NULL,
  previous_assessment_id uuid,
  previous_rating text,
  published_rating text,
  effective_from date NOT NULL DEFAULT current_date,
  movement_id uuid,
  reason text NOT NULL,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sarp_reason CHECK (length(btrim(reason)) >= 5)
);

CREATE INDEX IF NOT EXISTS sarr_assessment_idx ON public.supervisory_assessment_review_round(assessment_id, round_seq DESC);
CREATE INDEX IF NOT EXISTS sarc_round_idx ON public.supervisory_assessment_review_challenge(review_round_id, status);
CREATE INDEX IF NOT EXISTS saad_assessment_idx ON public.supervisory_assessment_approval_decision(assessment_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS sarp_entity_idx ON public.supervisory_assessment_risk_publication(entity_id, domain_code, published_at DESC);

GRANT SELECT ON public.supervisory_assessment_review_round TO authenticated;
GRANT SELECT ON public.supervisory_assessment_review_challenge TO authenticated;
GRANT SELECT ON public.supervisory_assessment_approval_decision TO authenticated;
GRANT SELECT ON public.supervisory_assessment_risk_publication TO authenticated;
GRANT ALL ON public.supervisory_assessment_review_round TO service_role;
GRANT ALL ON public.supervisory_assessment_review_challenge TO service_role;
GRANT ALL ON public.supervisory_assessment_approval_decision TO service_role;
GRANT ALL ON public.supervisory_assessment_risk_publication TO service_role;

ALTER TABLE public.supervisory_assessment_review_round ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_review_challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_approval_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_risk_publication ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sarr_read ON public.supervisory_assessment_review_round;
CREATE POLICY sarr_read ON public.supervisory_assessment_review_round FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
  ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']));

DROP POLICY IF EXISTS sarc_read ON public.supervisory_assessment_review_challenge;
CREATE POLICY sarc_read ON public.supervisory_assessment_review_challenge FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
  ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']));

DROP POLICY IF EXISTS saad_read ON public.supervisory_assessment_approval_decision;
CREATE POLICY saad_read ON public.supervisory_assessment_approval_decision FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
  ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']));

DROP POLICY IF EXISTS sarp_read ON public.supervisory_assessment_risk_publication;
CREATE POLICY sarp_read ON public.supervisory_assessment_risk_publication FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
  ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']));

-- ------------------------------------------------------------ guards ----
CREATE OR REPLACE FUNCTION public.supervisory_review_writer_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF current_setting('app.supervisory_review_writer', true) IS DISTINCT FROM 'governed' THEN
    RAISE EXCEPTION '% is written only by a governed supervisory review operation', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_review_record_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'immutable: a recorded % cannot be % — record a new decision instead',
    TG_TABLE_NAME, lower(TG_OP) USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS sarr_writer_guard ON public.supervisory_assessment_review_round;
CREATE TRIGGER sarr_writer_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.supervisory_assessment_review_round
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_review_writer_guard();

DROP TRIGGER IF EXISTS sarc_writer_guard ON public.supervisory_assessment_review_challenge;
CREATE TRIGGER sarc_writer_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.supervisory_assessment_review_challenge
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_review_writer_guard();

DROP TRIGGER IF EXISTS saad_writer_guard ON public.supervisory_assessment_approval_decision;
CREATE TRIGGER saad_writer_guard BEFORE INSERT
  ON public.supervisory_assessment_approval_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_review_writer_guard();

DROP TRIGGER IF EXISTS saad_immutable ON public.supervisory_assessment_approval_decision;
CREATE TRIGGER saad_immutable BEFORE UPDATE OR DELETE
  ON public.supervisory_assessment_approval_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_review_record_immutable();

DROP TRIGGER IF EXISTS sarp_writer_guard ON public.supervisory_assessment_risk_publication;
CREATE TRIGGER sarp_writer_guard BEFORE INSERT
  ON public.supervisory_assessment_risk_publication
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_review_writer_guard();

DROP TRIGGER IF EXISTS sarp_immutable ON public.supervisory_assessment_risk_publication;
CREATE TRIGGER sarp_immutable BEFORE UPDATE OR DELETE
  ON public.supervisory_assessment_risk_publication
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_review_record_immutable();

-- historical risk movements are never rewritten
DROP TRIGGER IF EXISTS ersm_immutable ON public.entity_risk_state_movement;
CREATE TRIGGER ersm_immutable BEFORE UPDATE OR DELETE
  ON public.entity_risk_state_movement
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_review_record_immutable();

-- =============================================== internal computations ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_review_config_internal(_assessment_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id
    FROM public.supervisory_calculation_config c
    JOIN public.supervisory_assessment a ON a.id = _assessment_id
   WHERE c.methodology_id = a.methodology_id
     AND c.status = 'ACTIVE'
   ORDER BY c.config_version DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_review_blockers_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a public.supervisory_assessment; _out jsonb := '[]'::jsonb; _ready jsonb;
        _cfg uuid; _run public.supervisory_assessment_calculation_run; _open int; _pend int;
        _live_hash text;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  _ready := public.supervisory_assessment_readiness_internal(_assessment_id);
  IF NOT COALESCE((_ready->>'can_submit')::boolean, false) THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'code','READINESS_INCOMPLETE','label','Assessment work is not complete',
      'detail','The server readiness contract still reports blocking checks.',
      'blocking', true, 'stage','SUBMIT'));
  END IF;

  _cfg := public.supervisory_assessment_review_config_internal(_assessment_id);

  SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = _assessment_id ORDER BY run_seq DESC LIMIT 1;

  IF _cfg IS NOT NULL THEN
    IF _run.id IS NULL OR _run.status <> 'CALCULATED' THEN
      _out := _out || jsonb_build_array(jsonb_build_object(
        'code','CALCULATION_RUN_MISSING','label','No successful calculation run',
        'detail','An approved calculation policy applies, so a successful immutable calculation run must be recorded before review.',
        'blocking', true, 'stage','SUBMIT'));
    ELSE
      _live_hash := md5(public.supervisory_calc_inputs_snapshot(_assessment_id)::text);
      IF _run.inputs_hash IS DISTINCT FROM _live_hash THEN
        _out := _out || jsonb_build_array(jsonb_build_object(
          'code','CALCULATION_RUN_STALE','label','Calculation run no longer matches the assessment',
          'detail','Responses, facts or policy changed after the latest calculation run. Recalculate before submitting.',
          'blocking', true, 'stage','SUBMIT'));
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO _pend FROM public.supervisory_assessment_calculation_override
   WHERE assessment_id = _assessment_id AND status = 'PENDING_APPROVAL';
  IF _pend > 0 THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'code','OVERRIDE_UNRESOLVED','label','A rating override is still undecided',
      'detail','Decide or withdraw the proposed rating override before submission or approval.',
      'blocking', true, 'stage','BOTH'));
  END IF;

  SELECT count(*) INTO _open FROM public.supervisory_assessment_review_challenge
   WHERE assessment_id = _assessment_id AND status = 'OPEN';
  IF _open > 0 THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'code','CHALLENGE_OPEN','label','Reviewer challenges are unresolved',
      'detail', format('%s reviewer challenge(s) remain open.', _open),
      'blocking', true, 'stage','APPROVE'));
  END IF;

  RETURN _out;
END $$;

-- ------------------------------------------------- lifecycle contract ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_lifecycle_state(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment; _r public.supervisory_assessment_review_round;
        _blk jsonb; _actions jsonb := '[]'::jsonb; _pub public.supervisory_assessment_risk_publication;
        _can_submit boolean; _can_review boolean; _can_approve boolean;
        _submit_blocked boolean; _approve_blocked boolean; _maker boolean;
        _editable boolean; _state text; _decision public.supervisory_assessment_approval_decision;
BEGIN
  IF _uid IS NULL OR NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id ORDER BY round_seq DESC LIMIT 1;
  SELECT * INTO _decision FROM public.supervisory_assessment_approval_decision
   WHERE assessment_id = _assessment_id ORDER BY decided_at DESC LIMIT 1;
  SELECT * INTO _pub FROM public.supervisory_assessment_risk_publication
   WHERE assessment_id = _assessment_id ORDER BY published_at DESC LIMIT 1;

  _blk := public.supervisory_assessment_review_blockers_internal(_assessment_id);
  _submit_blocked := EXISTS (SELECT 1 FROM jsonb_array_elements(_blk) b
                              WHERE (b->>'blocking')::boolean AND b->>'stage' IN ('SUBMIT','BOTH'));
  _approve_blocked := EXISTS (SELECT 1 FROM jsonb_array_elements(_blk) b
                              WHERE (b->>'blocking')::boolean AND b->>'stage' IN ('APPROVE','BOTH'));

  _can_submit := public.has_any_permission(_uid, ARRAY['aml_supervision.submit','supervisory_spine.submit']);
  _can_review := public.has_any_permission(_uid, ARRAY['aml_supervision.review','supervisory_spine.review','aml_supervision.approve','supervisory_spine.approve']);
  -- regulatory approval authority is never inferred from technical administration
  _can_approve := public.has_any_permission(_uid, ARRAY['aml_supervision.approve','supervisory_spine.approve']);
  _maker := (_a.created_by = _uid OR _a.submitted_by = _uid OR COALESCE(_r.submitted_by, '00000000-0000-0000-0000-000000000000'::uuid) = _uid);

  _state := CASE
    WHEN _a.status = 'draft' AND COALESCE(_a.review_round_seq,0) = 0 THEN 'DRAFT'
    WHEN _a.status = 'draft' THEN 'DRAFT'
    WHEN _a.status = 'submitted' AND COALESCE(_a.review_round_seq,0) > 1 THEN 'RESUBMITTED'
    WHEN _a.status = 'submitted' THEN 'SUBMITTED_FOR_REVIEW'
    WHEN _a.status = 'reviewed' THEN 'UNDER_REVIEW'
    WHEN _a.status = 'returned_for_revision' THEN 'RETURNED_FOR_CHANGES'
    WHEN _a.status = 'approved' AND _pub.id IS NULL THEN 'APPROVED_NOT_PUBLISHED'
    WHEN _a.status = 'approved' THEN 'APPROVED'
    WHEN _a.status = 'closed' AND _decision.decision = 'REJECTED' THEN 'CLOSED_WITHOUT_APPROVAL'
    WHEN _a.status = 'closed' THEN 'CLOSED'
    WHEN _a.status = 'superseded' THEN 'SUPERSEDED'
    ELSE upper(_a.status) END;

  _editable := _a.status IN ('draft','returned_for_revision');

  _actions := jsonb_build_array(
    jsonb_build_object('action','SUBMIT_FOR_REVIEW',
      'label', CASE WHEN _a.status='returned_for_revision' THEN 'Resubmit for review' ELSE 'Submit for review' END,
      'required_permission','aml_supervision.submit',
      'permitted', (_a.status IN ('draft','returned_for_revision') AND _can_submit AND NOT _submit_blocked),
      'reason_code', CASE WHEN _a.status NOT IN ('draft','returned_for_revision') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_submit THEN 'PERMISSION_MISSING'
                          WHEN _submit_blocked THEN 'BLOCKED' ELSE 'OK' END,
      'maker_checker_required', false),
    jsonb_build_object('action','RAISE_CHALLENGE','label','Raise a review challenge',
      'required_permission','aml_supervision.review',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_review),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_review THEN 'PERMISSION_MISSING' ELSE 'OK' END,
      'maker_checker_required', false),
    jsonb_build_object('action','RETURN_FOR_CHANGES','label','Return for correction',
      'required_permission','aml_supervision.review',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_review),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_review THEN 'PERMISSION_MISSING' ELSE 'OK' END,
      'maker_checker_required', false),
    jsonb_build_object('action','APPROVE','label','Approve the assessment',
      'required_permission','aml_supervision.approve',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_approve AND NOT _maker AND NOT _approve_blocked),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_approve THEN 'PERMISSION_MISSING'
                          WHEN _maker THEN 'MAKER_CHECKER'
                          WHEN _approve_blocked THEN 'BLOCKED' ELSE 'OK' END,
      'maker_checker_required', true),
    jsonb_build_object('action','REJECT','label','Close without approval',
      'required_permission','aml_supervision.approve',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_approve AND NOT _maker),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_approve THEN 'PERMISSION_MISSING'
                          WHEN _maker THEN 'MAKER_CHECKER' ELSE 'OK' END,
      'maker_checker_required', true),
    jsonb_build_object('action','PUBLISH_RISK_OF_RECORD','label','Publish risk-of-record',
      'required_permission','aml_supervision.approve',
      'permitted', (_a.status = 'approved' AND _pub.id IS NULL AND _decision.id IS NOT NULL AND _can_approve),
      'reason_code', CASE WHEN _a.status <> 'approved' THEN 'STATE_NOT_ELIGIBLE'
                          WHEN _decision.id IS NULL THEN 'NO_APPROVAL_DECISION'
                          WHEN _pub.id IS NOT NULL THEN 'ALREADY_PUBLISHED'
                          WHEN NOT _can_approve THEN 'PERMISSION_MISSING' ELSE 'OK' END,
      'maker_checker_required', true));

  RETURN jsonb_build_object(
    'assessment_id', _a.id, 'reference', _a.reference,
    'raw_status', _a.status, 'canonical_state', _state,
    'editing_allowed', _editable,
    'calculation_allowed', _a.status IN ('draft','returned_for_revision'),
    'publication_allowed', (_a.status = 'approved' AND _pub.id IS NULL AND _decision.id IS NOT NULL),
    'maker_checker_required', true,
    'viewer_is_preparer', _maker,
    'assigned_owner_id', _a.owner_id, 'assigned_team_id', _a.team_id,
    'assigned_reviewer_id', COALESCE(_r.reviewer_id, _a.reviewer_id),
    'current_round_seq', COALESCE(_a.review_round_seq, 0),
    'current_round_id', _r.id,
    'submitted_run_id', _a.submitted_run_id,
    'approval_decision_id', _decision.id,
    'approved_rating', _a.approved_rating,
    'approved_rating_source', _a.approved_rating_source,
    'risk_publication_id', _pub.id,
    'risk_published_at', _a.risk_published_at,
    'blockers', _blk,
    'actions', _actions);
END $$;

-- ------------------------------------------------------------ submit ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_submit_for_review(
  _assessment_id uuid, _rationale text, _run_id uuid DEFAULT NULL,
  _expected_result_hash text DEFAULT NULL, _change_summary text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _blk jsonb; _cfg uuid;
        _run public.supervisory_assessment_calculation_run; _seq int; _round uuid;
        _basis text := 'LEGACY_NO_POLICY'; _ready jsonb; _bad text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.submit','supervisory_spine.submit']);

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'transition_not_permitted: % cannot be submitted for review', _a.status USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a submission rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  -- committed-state recheck inside the submitting transaction
  _blk := public.supervisory_assessment_review_blockers_internal(_assessment_id);
  SELECT string_agg(b->>'code', ', ') INTO _bad FROM jsonb_array_elements(_blk) b
   WHERE (b->>'blocking')::boolean AND b->>'stage' IN ('SUBMIT','BOTH');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'not_ready: submission refused (%)', _bad USING ERRCODE = '22023';
  END IF;

  _ready := public.supervisory_assessment_readiness_internal(_assessment_id);
  _cfg := public.supervisory_assessment_review_config_internal(_assessment_id);

  IF _cfg IS NOT NULL THEN
    IF _run_id IS NOT NULL THEN
      SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
       WHERE id = _run_id AND assessment_id = _assessment_id;
      IF _run.id IS NULL THEN
        RAISE EXCEPTION 'not_found: calculation run for this assessment' USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
       WHERE assessment_id = _assessment_id ORDER BY run_seq DESC LIMIT 1;
    END IF;
    IF _run.status <> 'CALCULATED' THEN
      RAISE EXCEPTION 'not_ready: the bound calculation run is %', _run.status USING ERRCODE = '22023';
    END IF;
    IF _run.run_seq <> (SELECT max(run_seq) FROM public.supervisory_assessment_calculation_run
                         WHERE assessment_id = _assessment_id) THEN
      RAISE EXCEPTION 'stale_calculation: a newer calculation run exists — review the current run before submitting'
        USING ERRCODE = '22023';
    END IF;
    IF _expected_result_hash IS NOT NULL AND _expected_result_hash <> _run.result_hash THEN
      RAISE EXCEPTION 'stale_readiness: the screen is showing an obsolete calculation result — reload and submit again'
        USING ERRCODE = '22023';
    END IF;
    _basis := 'CALCULATED';
  ELSIF _expected_result_hash IS NOT NULL THEN
    RAISE EXCEPTION 'stale_readiness: no approved calculation policy applies to this assessment' USING ERRCODE = '22023';
  END IF;

  _seq := COALESCE(_a.review_round_seq, 0) + 1;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  INSERT INTO public.supervisory_assessment_review_round(
    assessment_id, round_seq, submitted_by, submission_rationale, change_summary,
    calculation_basis, calculation_run_id, calculation_run_seq,
    calculation_inputs_hash, calculation_result_hash, computed_rating,
    readiness_snapshot, submission_snapshot, reviewer_id)
  VALUES (_assessment_id, _seq, _uid, btrim(_rationale), NULLIF(btrim(COALESCE(_change_summary,'')),''),
    _basis, _run.id, _run.run_seq, _run.inputs_hash, _run.result_hash,
    COALESCE(_run.residual_rating, _run.recommended_rating),
    _ready,
    jsonb_build_object(
      'methodology_id', _a.methodology_id, 'methodology_version', _a.methodology_version,
      'programme_id', _a.assessment_programme_id, 'programme_version', _a.assessment_programme_version,
      'question_plan_rows', (SELECT count(*) FROM public.supervisory_assessment_question_plan
                              WHERE assessment_id = _assessment_id),
      'responses', (SELECT count(*) FROM public.supervisory_assessment_question_response
                     WHERE assessment_id = _assessment_id),
      'evidence', (SELECT count(*) FROM public.supervisory_assessment_evidence_basis
                    WHERE assessment_id = _assessment_id),
      'facts', (SELECT count(*) FROM public.supervisory_assessment_fact
                 WHERE assessment_id = _assessment_id),
      'calculation_config_id', _cfg),
    _a.reviewer_id)
  RETURNING id INTO _round;

  UPDATE public.supervisory_assessment
     SET status = 'submitted', review_round_seq = _seq, submitted_run_id = _run.id,
         submitted_by = _uid, submitted_at = now(), updated_at = now()
   WHERE id = _assessment_id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id, CASE WHEN _seq > 1 THEN 'RESUBMISSION' ELSE 'SUBMISSION' END,
          _a.status, 'submitted', btrim(_rationale),
          jsonb_build_object('round_seq', _seq, 'calculation_run_id', _run.id,
                             'calculation_basis', _basis), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','supervisory_assessment', _assessment_id,
    jsonb_build_object('status',_a.status), jsonb_build_object('status','submitted','round',_seq),
    'Assessment ' || _a.reference || ' submitted for review (round ' || _seq || ')');

  RETURN jsonb_build_object('assessment_id', _assessment_id, 'round_id', _round, 'round_seq', _seq,
    'calculation_basis', _basis, 'calculation_run_id', _run.id, 'to_status','submitted');
END $$;

-- -------------------------------------------------- reviewer assignment ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_review_assign(
  _assessment_id uuid, _reviewer_id uuid, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _r public.supervisory_assessment_review_round;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.review','supervisory_spine.review',
                                                 'aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'an assignment reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_any_permission(_reviewer_id, ARRAY['aml_supervision.review','supervisory_spine.review',
        'aml_supervision.approve','supervisory_spine.approve']) THEN
    RAISE EXCEPTION 'not_authorized: the nominated reviewer holds no supervisory review authority' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id ORDER BY round_seq DESC LIMIT 1;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  UPDATE public.supervisory_assessment SET reviewer_id = _reviewer_id, updated_at = now()
   WHERE id = _assessment_id;
  IF _r.id IS NOT NULL AND _r.outcome = 'PENDING' THEN
    UPDATE public.supervisory_assessment_review_round
       SET reviewer_id = _reviewer_id, reviewer_assigned_by = _uid, reviewer_assigned_at = now()
     WHERE id = _r.id;
  END IF;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'REVIEW_ASSIGNMENT', _a.status, _a.status, btrim(_rationale),
          jsonb_build_object('reviewer_id', _reviewer_id, 'round_id', _r.id), _uid);
  PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment', _assessment_id,
    jsonb_build_object('reviewer_id', _a.reviewer_id), jsonb_build_object('reviewer_id', _reviewer_id),
    'Reviewer assigned for assessment ' || _a.reference);

  RETURN jsonb_build_object('assessment_id', _assessment_id, 'reviewer_id', _reviewer_id, 'round_id', _r.id);
END $$;

-- --------------------------------------------------------- challenges ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_challenge_raise(
  _assessment_id uuid, _challenge_code text, _category text, _narrative text,
  _refs jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _r public.supervisory_assessment_review_round; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.review','supervisory_spine.review',
                                                 'aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _a.status NOT IN ('submitted','reviewed') THEN
    RAISE EXCEPTION 'transition_not_permitted: a challenge can only be raised on an assessment under review'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id AND outcome = 'PENDING' ORDER BY round_seq DESC LIMIT 1;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: open review round' USING ERRCODE = '22023'; END IF;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  INSERT INTO public.supervisory_assessment_review_challenge(
    assessment_id, review_round_id, round_seq, challenge_code, category, narrative,
    question_code, dimension_code, fact_code, evidence_id, calculation_run_id, raised_by)
  VALUES (_assessment_id, _r.id, _r.round_seq,
    upper(btrim(COALESCE(NULLIF(_challenge_code,''),'GENERAL'))), upper(btrim(_category)), btrim(_narrative),
    NULLIF(_refs->>'question_code',''), NULLIF(_refs->>'dimension_code',''), NULLIF(_refs->>'fact_code',''),
    NULLIF(_refs->>'evidence_id','')::uuid, COALESCE(NULLIF(_refs->>'calculation_run_id','')::uuid, _r.calculation_run_id),
    _uid)
  RETURNING id INTO _id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'REVIEW_CHALLENGE', _a.status, _a.status, btrim(_narrative),
          jsonb_build_object('challenge_id', _id, 'round_seq', _r.round_seq), _uid);
  RETURN jsonb_build_object('challenge_id', _id, 'round_id', _r.id, 'round_seq', _r.round_seq, 'status','OPEN');
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_challenge_resolve(
  _challenge_id uuid, _resolution_note text, _outcome text DEFAULT 'RESOLVED')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _c public.supervisory_assessment_review_challenge; _a public.supervisory_assessment;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.review','supervisory_spine.review',
            'aml_supervision.submit','supervisory_spine.submit','aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _c FROM public.supervisory_assessment_review_challenge WHERE id = _challenge_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: challenge' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _c.assessment_id;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _c.status <> 'OPEN' THEN
    RAISE EXCEPTION 'transition_not_permitted: the challenge is already %', _c.status USING ERRCODE = '22023';
  END IF;
  IF upper(COALESCE(_outcome,'RESOLVED')) NOT IN ('RESOLVED','WITHDRAWN') THEN
    RAISE EXCEPTION 'unsupported_outcome: %', _outcome USING ERRCODE = '22023';
  END IF;
  IF upper(_outcome) = 'WITHDRAWN' AND _c.raised_by IS DISTINCT FROM _uid
     AND NOT public.has_any_permission(_uid, ARRAY['aml_supervision.approve','supervisory_spine.approve']) THEN
    RAISE EXCEPTION 'not_authorized: only the reviewer who raised the challenge may withdraw it' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(_resolution_note,''))) < 10 THEN
    RAISE EXCEPTION 'a resolution note of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  UPDATE public.supervisory_assessment_review_challenge
     SET status = upper(_outcome), resolved_by = _uid, resolved_at = now(),
         resolution_note = btrim(_resolution_note)
   WHERE id = _challenge_id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_c.assessment_id,'REVIEW_CHALLENGE_RESOLVED', _a.status, _a.status, btrim(_resolution_note),
          jsonb_build_object('challenge_id', _challenge_id, 'outcome', upper(_outcome)), _uid);
  RETURN jsonb_build_object('challenge_id', _challenge_id, 'status', upper(_outcome));
END $$;

-- --------------------------------------------------- return / rejection ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_review_return(
  _assessment_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _r public.supervisory_assessment_review_round;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.review','supervisory_spine.review',
                                                 'aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _a.status NOT IN ('submitted','reviewed') THEN
    RAISE EXCEPTION 'transition_not_permitted: % cannot be returned', _a.status USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason,''))) < 10 THEN
    RAISE EXCEPTION 'a written return reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id AND outcome = 'PENDING' ORDER BY round_seq DESC LIMIT 1;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  IF _r.id IS NOT NULL THEN
    UPDATE public.supervisory_assessment_review_round
       SET outcome = 'RETURNED', outcome_by = _uid, outcome_at = now(), outcome_reason = btrim(_reason)
     WHERE id = _r.id;
  END IF;
  -- the submitted snapshot and its bound run are preserved on the round
  UPDATE public.supervisory_assessment
     SET status = 'returned_for_revision', reviewed_by = _uid, reviewed_at = now(), updated_at = now()
   WHERE id = _assessment_id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'REVIEW_RETURN', _a.status,'returned_for_revision', btrim(_reason),
          jsonb_build_object('round_id', _r.id, 'round_seq', _r.round_seq), _uid);
  PERFORM public.log_compliance_audit('REJECT','supervisory_assessment', _assessment_id,
    jsonb_build_object('status',_a.status), jsonb_build_object('status','returned_for_revision'),
    'Assessment ' || _a.reference || ' returned for correction');

  RETURN jsonb_build_object('assessment_id', _assessment_id, 'to_status','returned_for_revision', 'round_id', _r.id);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_review_reject(
  _assessment_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _r public.supervisory_assessment_review_round; _d uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _a.status NOT IN ('submitted','reviewed') THEN
    RAISE EXCEPTION 'transition_not_permitted: % cannot be closed without approval', _a.status USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason,''))) < 10 THEN
    RAISE EXCEPTION 'a decision rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id AND outcome = 'PENDING' ORDER BY round_seq DESC LIMIT 1;
  IF _a.created_by = _uid OR _a.submitted_by = _uid OR COALESCE(_r.submitted_by,'00000000-0000-0000-0000-000000000000'::uuid) = _uid THEN
    RAISE EXCEPTION 'not_authorized: the officer who prepared or submitted the assessment cannot decide it'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  INSERT INTO public.supervisory_assessment_approval_decision(
    assessment_id, review_round_id, round_seq, decision, methodology_id, methodology_version,
    programme_id, programme_version, question_plan_version, calculation_basis,
    calculation_run_id, calculation_run_seq, calculation_inputs_hash, calculation_result_hash,
    computed_rating, final_rating, final_rating_source, rationale, decided_by,
    review_history)
  VALUES (_assessment_id, _r.id, _r.round_seq, 'REJECTED', _a.methodology_id, _a.methodology_version,
    _a.assessment_programme_id, _a.assessment_programme_version, _r.submission_snapshot->>'question_plan_rows',
    COALESCE(_r.calculation_basis,'LEGACY_NO_POLICY'),
    _r.calculation_run_id, _r.calculation_run_seq, _r.calculation_inputs_hash, _r.calculation_result_hash,
    _r.computed_rating, NULL, 'NOT_APPLICABLE', btrim(_reason), _uid,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('round_seq', x.round_seq,'outcome', x.outcome) ORDER BY x.round_seq)
                FROM public.supervisory_assessment_review_round x WHERE x.assessment_id = _assessment_id),'[]'::jsonb))
  RETURNING id INTO _d;
  IF _r.id IS NOT NULL THEN
    UPDATE public.supervisory_assessment_review_round
       SET outcome='REJECTED', outcome_by=_uid, outcome_at=now(), outcome_reason=btrim(_reason)
     WHERE id = _r.id;
  END IF;
  UPDATE public.supervisory_assessment
     SET status='closed', closed_at=now(), reviewed_by=_uid, reviewed_at=now(),
         approval_decision_id=_d, updated_at=now()
   WHERE id = _assessment_id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'REVIEW_REJECTION', _a.status,'closed', btrim(_reason),
          jsonb_build_object('decision_id', _d), _uid);
  PERFORM public.log_compliance_audit('REJECT','supervisory_assessment', _assessment_id,
    jsonb_build_object('status',_a.status), jsonb_build_object('status','closed'),
    'Assessment ' || _a.reference || ' closed without approval');
  RETURN jsonb_build_object('assessment_id', _assessment_id, 'decision_id', _d, 'to_status','closed');
END $$;

-- ---------------------------------------------------------- publication ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_publish_internal(
  _assessment_id uuid, _decision_id uuid, _uid uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a public.supervisory_assessment; _d public.supervisory_assessment_approval_decision;
        _prev public.entity_risk_state; _pub uuid; _mv uuid; _existing uuid;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  SELECT * INTO _d FROM public.supervisory_assessment_approval_decision WHERE id = _decision_id;
  IF _d.id IS NULL OR _d.decision <> 'APPROVED' THEN
    RAISE EXCEPTION 'not_permitted: only an approved assessment decision can publish a risk-of-record'
      USING ERRCODE = '42501';
  END IF;

  -- one valid outcome under concurrency, and idempotent for a given decision
  PERFORM pg_advisory_xact_lock(hashtext(_a.entity_id::text || ':' || _a.domain_code));
  SELECT id INTO _existing FROM public.supervisory_assessment_risk_publication
   WHERE approval_decision_id = _decision_id;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('publication_id', _existing, 'already_published', true);
  END IF;

  SELECT * INTO _prev FROM public.entity_risk_state
   WHERE entity_id = _a.entity_id AND domain_code = _a.domain_code;

  PERFORM set_config('app.supervisory_risk_state_writer','assessment_transition', true);
  INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating, inherent_rating,
    control_rating, driving_assessment_id, effective_from, last_review_date, next_review_date, updated_by)
  VALUES (_a.entity_id, _a.domain_code, _d.final_rating, _a.inherent_rating, _a.control_rating,
    _assessment_id, now(), current_date, _a.next_review_date, _uid)
  ON CONFLICT (entity_id, domain_code) DO UPDATE
    SET residual_rating = EXCLUDED.residual_rating,
        inherent_rating = EXCLUDED.inherent_rating,
        control_rating = EXCLUDED.control_rating,
        driving_assessment_id = EXCLUDED.driving_assessment_id,
        effective_from = EXCLUDED.effective_from,
        last_review_date = EXCLUDED.last_review_date,
        next_review_date = EXCLUDED.next_review_date,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
  PERFORM set_config('app.supervisory_risk_state_writer','', true);

  INSERT INTO public.entity_risk_state_movement(entity_id, domain_code, previous_assessment_id,
    new_assessment_id, previous_rating, new_rating, previous_inherent, new_inherent,
    previous_control, new_control, trend, reason, trigger_kind, approved_by, approved_at)
  VALUES (_a.entity_id, _a.domain_code, _prev.driving_assessment_id, _assessment_id,
    _prev.residual_rating, _d.final_rating, _prev.inherent_rating, _a.inherent_rating,
    _prev.control_rating, _a.control_rating,
    CASE WHEN _prev.residual_rating IS NULL THEN 'NEW'
         WHEN _prev.residual_rating = _d.final_rating THEN 'STABLE' ELSE 'CHANGED' END,
    btrim(_reason), 'ASSESSMENT_APPROVAL', _uid, now())
  RETURNING id INTO _mv;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  INSERT INTO public.supervisory_assessment_risk_publication(
    approval_decision_id, assessment_id, entity_id, domain_code, previous_assessment_id,
    previous_rating, published_rating, effective_from, movement_id, reason, published_by)
  VALUES (_decision_id, _assessment_id, _a.entity_id, _a.domain_code, _prev.driving_assessment_id,
    _prev.residual_rating, _d.final_rating, _d.effective_date, _mv, btrim(_reason), _uid)
  RETURNING id INTO _pub;

  UPDATE public.supervisory_assessment
     SET risk_publication_id = _pub, risk_published_at = now(), updated_at = now()
   WHERE id = _assessment_id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'RISK_PUBLICATION', _a.status, _a.status, btrim(_reason),
          jsonb_build_object('publication_id', _pub, 'movement_id', _mv,
                             'previous_rating', _prev.residual_rating, 'new_rating', _d.final_rating), _uid);
  PERFORM public.log_compliance_audit('APPROVE','entity_risk_state', _a.entity_id,
    jsonb_build_object('residual_rating', _prev.residual_rating),
    jsonb_build_object('residual_rating', _d.final_rating),
    'AML/CFT risk-of-record published from assessment ' || _a.reference);

  RETURN jsonb_build_object('publication_id', _pub, 'movement_id', _mv,
    'previous_rating', _prev.residual_rating, 'published_rating', _d.final_rating,
    'already_published', false);
END $$;

-- ------------------------------------------------------------- approve ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_approve(
  _assessment_id uuid, _rationale text, _effective_date date DEFAULT NULL,
  _next_review_date date DEFAULT NULL, _publish boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _r public.supervisory_assessment_review_round;
        _run public.supervisory_assessment_calculation_run; _ovr public.supervisory_assessment_calculation_override;
        _blk jsonb; _bad text; _d uuid; _final text; _src text; _computed text; _pubres jsonb := NULL;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _a.status NOT IN ('submitted','reviewed') THEN
    RAISE EXCEPTION 'transition_not_permitted: % cannot be approved', _a.status USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a decision rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id AND outcome = 'PENDING' ORDER BY round_seq DESC LIMIT 1;
  IF _r.id IS NULL THEN
    RAISE EXCEPTION 'not_found: no open review round — the assessment must be submitted for review'
      USING ERRCODE = '22023';
  END IF;

  -- maker/checker: no technical administrator bypass
  IF _a.created_by = _uid OR _a.submitted_by = _uid OR _r.submitted_by = _uid THEN
    RAISE EXCEPTION 'not_authorized: the officer who prepared or submitted the assessment cannot approve it'
      USING ERRCODE = '42501';
  END IF;

  _blk := public.supervisory_assessment_review_blockers_internal(_assessment_id);
  SELECT string_agg(b->>'code', ', ') INTO _bad FROM jsonb_array_elements(_blk) b
   WHERE (b->>'blocking')::boolean AND b->>'stage' IN ('APPROVE','BOTH');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'not_ready: approval refused (%)', _bad USING ERRCODE = '22023';
  END IF;

  -- the bound run is read, never recalculated
  IF _r.calculation_run_id IS NOT NULL THEN
    SELECT * INTO _run FROM public.supervisory_assessment_calculation_run WHERE id = _r.calculation_run_id;
    IF _run.id IS NULL THEN RAISE EXCEPTION 'not_found: submitted calculation run' USING ERRCODE = '22023'; END IF;
    IF _run.result_hash IS DISTINCT FROM _r.calculation_result_hash THEN
      RAISE EXCEPTION 'integrity: the submitted calculation run no longer matches the review record'
        USING ERRCODE = '22023';
    END IF;
    _computed := COALESCE(_run.residual_rating, _run.recommended_rating);
    _src := 'COMPUTED';
  ELSE
    _computed := _a.residual_rating;
    _src := 'LEGACY_OFFICER_RATING';
  END IF;
  _final := _computed;

  SELECT * INTO _ovr FROM public.supervisory_assessment_calculation_override
   WHERE assessment_id = _assessment_id AND status = 'APPROVED'
   ORDER BY decided_at DESC NULLS LAST LIMIT 1;
  IF _ovr.id IS NOT NULL THEN
    IF _ovr.decided_by IS NULL OR _ovr.decided_by = _ovr.proposed_by THEN
      RAISE EXCEPTION 'not_authorized: a self-approved rating override cannot become the approved result'
        USING ERRCODE = '42501';
    END IF;
    IF _r.calculation_run_id IS NOT NULL AND _ovr.run_id IS DISTINCT FROM _r.calculation_run_id THEN
      RAISE EXCEPTION 'integrity: the approved override does not refer to the submitted calculation run'
        USING ERRCODE = '22023';
    END IF;
    _final := _ovr.proposed_rating;
    _src := 'APPROVED_OVERRIDE';
  END IF;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  INSERT INTO public.supervisory_assessment_approval_decision(
    assessment_id, review_round_id, round_seq, decision, methodology_id, methodology_version,
    programme_id, programme_version, question_plan_version, question_plan_snapshot,
    evidence_fact_state, calculation_basis, calculation_run_id, calculation_run_seq,
    calculation_inputs_hash, calculation_result_hash, computed_rating, override_id, override_rating,
    final_rating, final_rating_source, rationale, effective_date, decided_by, review_history)
  VALUES (_assessment_id, _r.id, _r.round_seq, 'APPROVED', _a.methodology_id, _a.methodology_version,
    _a.assessment_programme_id, _a.assessment_programme_version,
    COALESCE(_run.question_plan_version, _a.assessment_programme_version),
    jsonb_build_object(
      'plan_rows', (SELECT count(*) FROM public.supervisory_assessment_question_plan WHERE assessment_id=_assessment_id),
      'included', (SELECT count(*) FROM public.supervisory_assessment_question_plan
                    WHERE assessment_id=_assessment_id AND plan_state IN ('INCLUDED','REQUIRED'))),
    jsonb_build_object(
      'evidence', (SELECT count(*) FROM public.supervisory_assessment_evidence_basis WHERE assessment_id=_assessment_id),
      'facts', (SELECT count(*) FROM public.supervisory_assessment_fact WHERE assessment_id=_assessment_id),
      'responses', (SELECT count(*) FROM public.supervisory_assessment_question_response WHERE assessment_id=_assessment_id)),
    COALESCE(_r.calculation_basis,'LEGACY_NO_POLICY'), _r.calculation_run_id, _r.calculation_run_seq,
    _r.calculation_inputs_hash, _r.calculation_result_hash, _computed, _ovr.id, _ovr.proposed_rating,
    _final, _src, btrim(_rationale), COALESCE(_effective_date, current_date), _uid,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('round_seq', x.round_seq, 'outcome', x.outcome,
                 'submitted_by', x.submitted_by, 'outcome_reason', x.outcome_reason) ORDER BY x.round_seq)
                FROM public.supervisory_assessment_review_round x WHERE x.assessment_id=_assessment_id),'[]'::jsonb))
  RETURNING id INTO _d;

  UPDATE public.supervisory_assessment_review_round
     SET outcome='APPROVED', outcome_by=_uid, outcome_at=now(), outcome_reason=btrim(_rationale)
   WHERE id = _r.id;

  UPDATE public.supervisory_assessment
     SET status='approved', approved_by=_uid, approved_at=now(),
         reviewed_by=COALESCE(reviewed_by,_uid), reviewed_at=COALESCE(reviewed_at, now()),
         residual_rating=_final, approved_rating=_final, approved_rating_source=_src,
         approval_decision_id=_d,
         assessment_date=COALESCE(assessment_date, COALESCE(_effective_date, current_date)),
         next_review_date=COALESCE(_next_review_date, next_review_date), updated_at=now()
   WHERE id = _assessment_id;

  -- the prior current assessment for this entity+domain is superseded, never deleted
  UPDATE public.supervisory_assessment
     SET is_current=false,
         status=CASE WHEN status IN ('approved','closed') THEN 'superseded' ELSE status END,
         updated_at=now()
   WHERE entity_id=_a.entity_id AND domain_code=_a.domain_code AND id<>_assessment_id AND is_current;
  UPDATE public.supervisory_assessment SET is_current=true WHERE id=_assessment_id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'APPROVAL', _a.status,'approved', btrim(_rationale),
          jsonb_build_object('decision_id',_d,'final_rating',_final,'final_rating_source',_src,
                             'calculation_run_id',_r.calculation_run_id), _uid);
  PERFORM public.log_compliance_audit('APPROVE','supervisory_assessment', _assessment_id,
    jsonb_build_object('status',_a.status), jsonb_build_object('status','approved','rating',_final),
    'Assessment ' || _a.reference || ' approved');

  IF COALESCE(_publish, true) THEN
    _pubres := public.supervisory_assessment_publish_internal(_assessment_id, _d, _uid,
      'Risk-of-record published on approval of ' || _a.reference);
  END IF;

  RETURN jsonb_build_object('assessment_id',_assessment_id,'decision_id',_d,'to_status','approved',
    'computed_rating',_computed,'override_rating',_ovr.proposed_rating,
    'final_rating',_final,'final_rating_source',_src,'publication',_pubres);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_publish_risk_of_record(
  _assessment_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _d public.supervisory_assessment_approval_decision;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _a.status <> 'approved' THEN
    RAISE EXCEPTION 'not_permitted: only an approved assessment can publish a risk-of-record (status %)', _a.status
      USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(_reason,''))) < 5 THEN
    RAISE EXCEPTION 'a publication reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _d FROM public.supervisory_assessment_approval_decision
   WHERE assessment_id = _assessment_id AND decision='APPROVED' ORDER BY decided_at DESC LIMIT 1;
  IF _d.id IS NULL THEN
    RAISE EXCEPTION 'not_found: no governed approval decision to publish' USING ERRCODE = '22023';
  END IF;
  RETURN public.supervisory_assessment_publish_internal(_assessment_id, _d.id, _uid, _reason);
END $$;

-- ------------------------------------------------------- read models ----
CREATE OR REPLACE FUNCTION public.supervisory_assessment_review_register(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment; _out jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  _out := jsonb_build_object(
    'lifecycle', public.supervisory_assessment_lifecycle_state(_assessment_id),
    'rounds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'round_seq', r.round_seq, 'submitted_by', r.submitted_by, 'submitted_at', r.submitted_at,
        'submission_rationale', r.submission_rationale, 'change_summary', r.change_summary,
        'calculation_basis', r.calculation_basis, 'calculation_run_id', r.calculation_run_id,
        'calculation_run_seq', r.calculation_run_seq, 'calculation_result_hash', r.calculation_result_hash,
        'computed_rating', r.computed_rating, 'reviewer_id', r.reviewer_id,
        'outcome', r.outcome, 'outcome_by', r.outcome_by, 'outcome_at', r.outcome_at,
        'outcome_reason', r.outcome_reason, 'readiness_snapshot', r.readiness_snapshot,
        'submission_snapshot', r.submission_snapshot,
        'challenges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'id', c.id, 'challenge_code', c.challenge_code, 'category', c.category,
             'narrative', c.narrative, 'question_code', c.question_code,
             'dimension_code', c.dimension_code, 'fact_code', c.fact_code,
             'calculation_run_id', c.calculation_run_id, 'status', c.status,
             'raised_by', c.raised_by, 'raised_at', c.raised_at,
             'resolved_by', c.resolved_by, 'resolved_at', c.resolved_at,
             'resolution_note', c.resolution_note) ORDER BY c.raised_at)
           FROM public.supervisory_assessment_review_challenge c WHERE c.review_round_id = r.id),'[]'::jsonb))
      ORDER BY r.round_seq DESC)
      FROM public.supervisory_assessment_review_round r WHERE r.assessment_id = _assessment_id),'[]'::jsonb),
    'decisions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'decision', d.decision, 'round_seq', d.round_seq,
        'computed_rating', d.computed_rating, 'override_rating', d.override_rating,
        'final_rating', d.final_rating, 'final_rating_source', d.final_rating_source,
        'calculation_basis', d.calculation_basis, 'calculation_run_id', d.calculation_run_id,
        'calculation_run_seq', d.calculation_run_seq, 'calculation_result_hash', d.calculation_result_hash,
        'methodology_id', d.methodology_id, 'methodology_version', d.methodology_version,
        'programme_id', d.programme_id, 'programme_version', d.programme_version,
        'rationale', d.rationale, 'effective_date', d.effective_date,
        'decided_by', d.decided_by, 'decided_at', d.decided_at,
        'review_history', d.review_history) ORDER BY d.decided_at DESC)
      FROM public.supervisory_assessment_approval_decision d WHERE d.assessment_id = _assessment_id),'[]'::jsonb),
    'publications', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'approval_decision_id', p.approval_decision_id, 'previous_rating', p.previous_rating,
        'published_rating', p.published_rating, 'effective_from', p.effective_from,
        'movement_id', p.movement_id, 'reason', p.reason, 'published_by', p.published_by,
        'published_at', p.published_at) ORDER BY p.published_at DESC)
      FROM public.supervisory_assessment_risk_publication p WHERE p.assessment_id = _assessment_id),'[]'::jsonb),
    'risk_history', public.supervisory_entity_risk_history(_a.entity_id, _a.domain_code),
    'lineage', public.supervisory_assessment_risk_lineage(_assessment_id));
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_entity_risk_history(_entity_id uuid, _domain_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory risk history' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  RETURN jsonb_build_object(
    'current', (SELECT jsonb_build_object(
        'residual_rating', s.residual_rating, 'inherent_rating', s.inherent_rating,
        'control_rating', s.control_rating, 'driving_assessment_id', s.driving_assessment_id,
        'effective_from', s.effective_from, 'last_review_date', s.last_review_date,
        'next_review_date', s.next_review_date, 'updated_by', s.updated_by, 'updated_at', s.updated_at,
        'publication', (SELECT jsonb_build_object('id', p.id, 'published_at', p.published_at,
            'published_by', p.published_by, 'reason', p.reason, 'approval_decision_id', p.approval_decision_id)
          FROM public.supervisory_assessment_risk_publication p
         WHERE p.assessment_id = s.driving_assessment_id ORDER BY p.published_at DESC LIMIT 1))
      FROM public.entity_risk_state s
     WHERE s.entity_id = _entity_id AND s.domain_code = _domain_code),
    'movements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'previous_rating', m.previous_rating, 'new_rating', m.new_rating,
        'previous_assessment_id', m.previous_assessment_id, 'new_assessment_id', m.new_assessment_id,
        'trend', m.trend, 'reason', m.reason, 'trigger_kind', m.trigger_kind,
        'approved_by', m.approved_by, 'approved_at', m.approved_at, 'created_at', m.created_at,
        'publication', (SELECT jsonb_build_object('id', p.id, 'effective_from', p.effective_from,
             'published_by', p.published_by, 'published_at', p.published_at,
             'approval_decision_id', p.approval_decision_id)
           FROM public.supervisory_assessment_risk_publication p WHERE p.movement_id = m.id),
        'decision', (SELECT jsonb_build_object('id', d.id, 'final_rating', d.final_rating,
             'final_rating_source', d.final_rating_source, 'calculation_run_seq', d.calculation_run_seq,
             'methodology_version', d.methodology_version, 'programme_version', d.programme_version,
             'override_rating', d.override_rating, 'rationale', d.rationale, 'decided_by', d.decided_by)
           FROM public.supervisory_assessment_approval_decision d
            JOIN public.supervisory_assessment_risk_publication p2 ON p2.approval_decision_id = d.id
          WHERE p2.movement_id = m.id))
      ORDER BY m.created_at DESC)
      FROM public.entity_risk_state_movement m
     WHERE m.entity_id = _entity_id AND m.domain_code = _domain_code),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_risk_lineage(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment;
        _d public.supervisory_assessment_approval_decision; _p public.supervisory_assessment_risk_publication;
        _run public.supervisory_assessment_calculation_run; _ev jsonb; _acc int := 0;
BEGIN
  IF _uid IS NULL OR NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  SELECT * INTO _d FROM public.supervisory_assessment_approval_decision
   WHERE assessment_id=_assessment_id AND decision='APPROVED' ORDER BY decided_at DESC LIMIT 1;
  SELECT * INTO _p FROM public.supervisory_assessment_risk_publication
   WHERE assessment_id=_assessment_id ORDER BY published_at DESC LIMIT 1;
  IF _d.calculation_run_id IS NOT NULL THEN
    SELECT * INTO _run FROM public.supervisory_assessment_calculation_run WHERE id=_d.calculation_run_id;
  END IF;

  -- SEC: only evidence whose source the reader may see is ever described
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title,
           'evidence_type', b.evidence_type, 'source_reference', b.source_reference)), '[]'::jsonb),
         count(*)
    INTO _ev, _acc
    FROM public.supervisory_assessment_evidence_basis b
   WHERE b.assessment_id = _assessment_id
     AND COALESCE((public.supervisory_evidence_source_resolve(
           _uid, b.evidence_type, b.source_object_id, _a.entity_id)->>'readable')::boolean, false);

  RETURN jsonb_build_object(
    'complete', (_d.id IS NOT NULL AND _p.id IS NOT NULL),
    'legacy_state', CASE
      WHEN _d.id IS NULL AND _a.status IN ('approved','superseded','closed') THEN 'LEGACY_APPROVAL_WITHOUT_GOVERNED_DECISION'
      WHEN _d.id IS NOT NULL AND _d.calculation_run_id IS NULL THEN 'APPROVED_WITHOUT_CALCULATION_RUN'
      ELSE NULL END,
    'risk_of_record', CASE WHEN _p.id IS NULL THEN NULL ELSE jsonb_build_object(
      'publication_id', _p.id, 'published_rating', _p.published_rating,
      'effective_from', _p.effective_from, 'published_by', _p.published_by,
      'published_at', _p.published_at, 'movement_id', _p.movement_id) END,
    'approval_decision', CASE WHEN _d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _d.id, 'final_rating', _d.final_rating, 'final_rating_source', _d.final_rating_source,
      'decided_by', _d.decided_by, 'decided_at', _d.decided_at, 'effective_date', _d.effective_date,
      'round_seq', _d.round_seq) END,
    'review_round', CASE WHEN _d.review_round_id IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object('id', r.id, 'round_seq', r.round_seq, 'submitted_by', r.submitted_by,
        'submitted_at', r.submitted_at, 'outcome', r.outcome,
        'challenges', (SELECT count(*) FROM public.supervisory_assessment_review_challenge c
                        WHERE c.review_round_id = r.id))
        FROM public.supervisory_assessment_review_round r WHERE r.id = _d.review_round_id) END,
    'calculation_run', CASE WHEN _run.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _run.id, 'run_seq', _run.run_seq, 'status', _run.status, 'engine_version', _run.engine_version,
      'residual_rating', _run.residual_rating, 'recommended_rating', _run.recommended_rating,
      'result_hash', _run.result_hash, 'inputs_hash', _run.inputs_hash, 'calculated_at', _run.calculated_at) END,
    'calculation_policy', CASE WHEN _run.config_id IS NULL THEN NULL ELSE jsonb_build_object(
      'config_id', _run.config_id, 'config_version', _run.config_version) END,
    'methodology', jsonb_build_object('id', _a.methodology_id, 'version', _a.methodology_version),
    'programme', jsonb_build_object('id', _a.assessment_programme_id,
      'code', _a.assessment_programme_code, 'version', _a.assessment_programme_version),
    'question_plan', jsonb_build_object(
      'rows', (SELECT count(*) FROM public.supervisory_assessment_question_plan WHERE assessment_id=_assessment_id)),
    'responses', jsonb_build_object(
      'count', (SELECT count(*) FROM public.supervisory_assessment_question_response WHERE assessment_id=_assessment_id)),
    'facts', jsonb_build_object(
      'count', (SELECT count(*) FROM public.supervisory_assessment_fact WHERE assessment_id=_assessment_id)),
    'evidence', jsonb_build_object('accessible_count', _acc, 'items', _ev));
END $$;

-- ------------------------------------------------------------- grants ----
REVOKE ALL ON FUNCTION public.supervisory_assessment_review_config_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_review_blockers_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_publish_internal(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_review_writer_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_review_record_immutable() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.supervisory_assessment_lifecycle_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_submit_for_review(uuid, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_review_assign(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_challenge_raise(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_challenge_resolve(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_review_return(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_review_reject(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_approve(uuid, text, date, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_publish_risk_of_record(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_review_register(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_risk_lineage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_entity_risk_history(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.supervisory_assessment_lifecycle_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_submit_for_review(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_review_assign(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_challenge_raise(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_challenge_resolve(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_review_return(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_review_reject(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_approve(uuid, text, date, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_publish_risk_of_record(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_review_register(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_risk_lineage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_entity_risk_history(uuid, text) TO authenticated;