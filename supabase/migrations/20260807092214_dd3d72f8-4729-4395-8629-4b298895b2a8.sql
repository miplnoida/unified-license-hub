-- ============ PHASE 4: BULK COMPLAINT INTAKE ============
CREATE TABLE IF NOT EXISTS public.complaint_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid,
  source text NOT NULL DEFAULT 'csv',
  file_name text,
  status text NOT NULL DEFAULT 'processing',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.complaint_import_batches TO authenticated;
GRANT ALL ON public.complaint_import_batches TO service_role;
ALTER TABLE public.complaint_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY cib_read ON public.complaint_import_batches FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'view'));
CREATE POLICY cib_write ON public.complaint_import_batches FOR INSERT TO authenticated
  WITH CHECK (public.has_complaint_perm(auth.uid(),'edit'));
CREATE POLICY cib_update ON public.complaint_import_batches FOR UPDATE TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'edit'));

CREATE TABLE IF NOT EXISTS public.complaint_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.complaint_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL DEFAULT 'pending',
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of_complaint_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL,
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL,
  complaint_number text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cir_batch ON public.complaint_import_rows(batch_id, row_number);
GRANT SELECT, INSERT ON public.complaint_import_rows TO authenticated;
GRANT ALL ON public.complaint_import_rows TO service_role;
ALTER TABLE public.complaint_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY cir_read ON public.complaint_import_rows FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'view'));
CREATE POLICY cir_write ON public.complaint_import_rows FOR INSERT TO authenticated
  WITH CHECK (public.has_complaint_perm(auth.uid(),'edit'));

CREATE OR REPLACE FUNCTION public.complaint_bulk_import(
  _source text,
  _file_name text,
  _rows jsonb,
  _regulator_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch uuid;
  v_row jsonb;
  v_idx integer := 0;
  v_errors jsonb;
  v_subject text;
  v_desc text;
  v_email text;
  v_dup uuid;
  v_new jsonb;
  v_total integer := 0; v_valid integer := 0; v_invalid integer := 0;
  v_dupes integer := 0; v_imported integer := 0;
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(),'edit') THEN
    RAISE EXCEPTION 'not authorised to import complaints' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.complaint_import_batches(regulator_id, source, file_name, status, created_by)
  VALUES (_regulator_id, COALESCE(_source,'csv'), _file_name, 'processing', auth.uid())
  RETURNING id INTO v_batch;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_errors := '[]'::jsonb;
    v_subject := NULLIF(btrim(COALESCE(v_row->>'subject','')),'');
    v_desc := NULLIF(btrim(COALESCE(v_row->>'description','')),'');
    v_email := NULLIF(btrim(COALESCE(v_row->>'email','')),'');
    v_dup := NULL;

    IF v_subject IS NULL THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','subject','message','Subject is required'));
    END IF;
    IF v_desc IS NULL OR length(v_desc) < 10 THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','description','message','Description must be at least 10 characters'));
    END IF;
    IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','email','message','Email is not valid'));
    END IF;
    IF (v_row ? 'licensee_id') AND NULLIF(v_row->>'licensee_id','') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = (v_row->>'licensee_id')::uuid) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','licensee_id','message','Unknown regulated entity'));
    END IF;

    IF jsonb_array_length(v_errors) > 0 THEN
      v_invalid := v_invalid + 1;
      INSERT INTO public.complaint_import_rows(batch_id,row_number,raw_data,outcome,validation_errors,rejection_reason)
      VALUES (v_batch, v_idx, v_row, 'invalid', v_errors, 'Validation failed');
      CONTINUE;
    END IF;

    SELECT c.id INTO v_dup
    FROM public.complaints c
    WHERE lower(btrim(c.subject)) = lower(v_subject)
      AND (
        (v_email IS NOT NULL AND lower(COALESCE(c.email,'')) = lower(v_email))
        OR (NULLIF(v_row->>'licensee_id','') IS NOT NULL AND c.licensee_id = (v_row->>'licensee_id')::uuid)
      )
      AND c.created_at > now() - interval '90 days'
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF v_dup IS NOT NULL THEN
      v_dupes := v_dupes + 1;
      INSERT INTO public.complaint_import_rows(batch_id,row_number,raw_data,outcome,duplicate_of_complaint_id,rejection_reason)
      VALUES (v_batch, v_idx, v_row, 'duplicate', v_dup, 'Matches an existing complaint within 90 days');
      CONTINUE;
    END IF;

    v_valid := v_valid + 1;
    BEGIN
      v_new := public.create_complaint('internal', v_row || jsonb_build_object('intake_source','bulk_import'));
      v_imported := v_imported + 1;
      INSERT INTO public.complaint_import_rows(batch_id,row_number,raw_data,outcome,complaint_id,complaint_number)
      VALUES (v_batch, v_idx, v_row, 'imported', (v_new->>'id')::uuid, v_new->>'complaint_number');
    EXCEPTION WHEN OTHERS THEN
      v_valid := v_valid - 1;
      v_invalid := v_invalid + 1;
      INSERT INTO public.complaint_import_rows(batch_id,row_number,raw_data,outcome,validation_errors,rejection_reason)
      VALUES (v_batch, v_idx, v_row, 'failed',
              jsonb_build_array(jsonb_build_object('field','_row','message',SQLERRM)), SQLERRM);
    END;
  END LOOP;

  UPDATE public.complaint_import_batches
     SET status = CASE WHEN v_imported = 0 THEN 'failed'
                       WHEN v_invalid + v_dupes > 0 THEN 'partial'
                       ELSE 'completed' END,
         total_rows = v_total, valid_rows = v_valid, invalid_rows = v_invalid,
         duplicate_rows = v_dupes, imported_rows = v_imported, updated_at = now()
   WHERE id = v_batch;

  RETURN jsonb_build_object('batch_id', v_batch, 'total', v_total, 'valid', v_valid,
    'invalid', v_invalid, 'duplicates', v_dupes, 'imported', v_imported);
END $$;
REVOKE ALL ON FUNCTION public.complaint_bulk_import(text,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_bulk_import(text,text,jsonb,uuid) TO authenticated, service_role;

-- ============ PHASE 4: CLOSURE + QA ============
CREATE TABLE IF NOT EXISTS public.complaint_closure_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'closure',
  decision text NOT NULL,
  resolution_summary text,
  rationale text,
  outcome_category text,
  final_communication_ref text,
  evidence_complete boolean NOT NULL DEFAULT false,
  qa_required boolean NOT NULL DEFAULT false,
  reviewer_id uuid,
  decided_by uuid NOT NULL DEFAULT auth.uid(),
  decided_at timestamptz NOT NULL DEFAULT now(),
  superseded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ccr_complaint ON public.complaint_closure_reviews(complaint_id, decided_at DESC);
GRANT SELECT, INSERT ON public.complaint_closure_reviews TO authenticated;
GRANT ALL ON public.complaint_closure_reviews TO service_role;
ALTER TABLE public.complaint_closure_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccr_read ON public.complaint_closure_reviews FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'view'));
CREATE POLICY ccr_insert ON public.complaint_closure_reviews FOR INSERT TO authenticated
  WITH CHECK (public.has_complaint_perm(auth.uid(),'edit'));

CREATE OR REPLACE FUNCTION public.tg_ccr_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'complaint closure reviews are append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS trg_ccr_append_only ON public.complaint_closure_reviews;
CREATE TRIGGER trg_ccr_append_only BEFORE UPDATE OR DELETE ON public.complaint_closure_reviews
FOR EACH ROW EXECUTE FUNCTION public.tg_ccr_append_only();

CREATE OR REPLACE FUNCTION public.complaint_record_closure_review(
  _complaint_id uuid,
  _decision text,
  _resolution_summary text DEFAULT NULL,
  _rationale text DEFAULT NULL,
  _outcome_category text DEFAULT NULL,
  _final_communication_ref text DEFAULT NULL,
  _evidence_complete boolean DEFAULT false,
  _qa_required boolean DEFAULT false,
  _reviewer_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(),'edit') THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('closure_proposed','qa_approved','qa_returned','closed') THEN
    RAISE EXCEPTION 'invalid decision %', _decision USING ERRCODE = '22023';
  END IF;
  IF _decision IN ('closure_proposed','closed') THEN
    IF COALESCE(btrim(_resolution_summary),'') = '' THEN
      RAISE EXCEPTION 'resolution summary is required' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(length(btrim(_rationale)),0) < 10 THEN
      RAISE EXCEPTION 'rationale of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(_outcome_category),'') = '' THEN
      RAISE EXCEPTION 'outcome category is required' USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE(_evidence_complete,false) THEN
      RAISE EXCEPTION 'evidence completeness must be confirmed' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _decision = 'qa_returned' AND COALESCE(length(btrim(_rationale)),0) < 10 THEN
    RAISE EXCEPTION 'return reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.complaint_closure_reviews(
    complaint_id, stage, decision, resolution_summary, rationale, outcome_category,
    final_communication_ref, evidence_complete, qa_required, reviewer_id)
  VALUES (_complaint_id,
          CASE WHEN _decision LIKE 'qa_%' THEN 'qa' ELSE 'closure' END,
          _decision, _resolution_summary, _rationale, _outcome_category,
          _final_communication_ref, COALESCE(_evidence_complete,false),
          COALESCE(_qa_required,false), _reviewer_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.complaint_record_closure_review(uuid,text,text,text,text,text,boolean,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_record_closure_review(uuid,text,text,text,text,text,boolean,boolean,uuid) TO authenticated, service_role;

-- ============ PHASE 4: PATTERN ALERT TRANSPARENCY ============
ALTER TABLE public.conduct_alerts
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS rule_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS source_record_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- ============ PHASE 4: INVESTIGATION CASE FILE ============
ALTER TABLE public.conduct_investigations
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS investigation_plan text,
  ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS restricted_notes text;

-- ============ PHASE 4: ENFORCEMENT LIFECYCLE ============
ALTER TABLE public.enforcement_actions
  ADD COLUMN IF NOT EXISTS proposed_action text,
  ADD COLUMN IF NOT EXISTS proposal_rationale text,
  ADD COLUMN IF NOT EXISTS proposed_by uuid,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS monitoring_state text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS non_compliance_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS non_compliance_note text,
  ADD COLUMN IF NOT EXISTS source_investigation_id uuid;

CREATE TABLE IF NOT EXISTS public.enforcement_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.enforcement_actions(id) ON DELETE CASCADE,
  obligation text NOT NULL,
  detail text,
  deadline date,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  completed_by uuid,
  breach_note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eo_case ON public.enforcement_obligations(case_id);
GRANT SELECT, INSERT, UPDATE ON public.enforcement_obligations TO authenticated;
GRANT ALL ON public.enforcement_obligations TO service_role;
ALTER TABLE public.enforcement_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY eo_read ON public.enforcement_obligations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enforcement_actions ea WHERE ea.id = case_id
                 AND public.can_read_enforcement(auth.uid(), ea.entity_id)));
CREATE POLICY eo_insert ON public.enforcement_obligations FOR INSERT TO authenticated
  WITH CHECK (public.can_act_on_enforcement(auth.uid(),'edit'));
CREATE POLICY eo_update ON public.enforcement_obligations FOR UPDATE TO authenticated
  USING (public.can_act_on_enforcement(auth.uid(),'edit'));

CREATE TABLE IF NOT EXISTS public.enforcement_compliance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.enforcement_actions(id) ON DELETE CASCADE,
  obligation_id uuid REFERENCES public.enforcement_obligations(id) ON DELETE SET NULL,
  description text NOT NULL,
  evidence_type text,
  file_upload_id uuid,
  storage_path text,
  submitted_by uuid NOT NULL DEFAULT auth.uid(),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  accepted boolean,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ece_case ON public.enforcement_compliance_evidence(case_id);
GRANT SELECT, INSERT, UPDATE ON public.enforcement_compliance_evidence TO authenticated;
GRANT ALL ON public.enforcement_compliance_evidence TO service_role;
ALTER TABLE public.enforcement_compliance_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY ece_read ON public.enforcement_compliance_evidence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enforcement_actions ea WHERE ea.id = case_id
                 AND public.can_read_enforcement(auth.uid(), ea.entity_id)));
CREATE POLICY ece_insert ON public.enforcement_compliance_evidence FOR INSERT TO authenticated
  WITH CHECK (public.can_act_on_enforcement(auth.uid(),'edit'));
CREATE POLICY ece_update ON public.enforcement_compliance_evidence FOR UPDATE TO authenticated
  USING (public.can_act_on_enforcement(auth.uid(),'edit'));

DROP TRIGGER IF EXISTS trg_eo_touch ON public.enforcement_obligations;
CREATE TRIGGER trg_eo_touch BEFORE UPDATE ON public.enforcement_obligations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforcement_lifecycle_action(
  _case_id uuid,
  _action text,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_case public.enforcement_actions;
  v_note text := NULLIF(btrim(COALESCE(_payload->>'note','')),'');
BEGIN
  SELECT * INTO v_case FROM public.enforcement_actions WHERE id = _case_id;
  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'enforcement case not found' USING ERRCODE = 'P0002';
  END IF;

  IF _action IN ('approve','reject') THEN
    IF NOT public.can_act_on_enforcement(auth.uid(),'approve') THEN
      RAISE EXCEPTION 'enforcement approval permission required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.can_act_on_enforcement(auth.uid(),'edit') THEN
      RAISE EXCEPTION 'enforcement edit permission required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _action = 'propose' THEN
    IF COALESCE(btrim(_payload->>'proposed_action'),'') = ''
       OR COALESCE(length(btrim(_payload->>'proposal_rationale')),0) < 10 THEN
      RAISE EXCEPTION 'proposed action and a rationale of at least 10 characters are required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.enforcement_actions
       SET proposed_action = _payload->>'proposed_action',
           proposal_rationale = _payload->>'proposal_rationale',
           proposed_by = auth.uid(), proposed_at = now(),
           review_state = 'pending_review', updated_at = now()
     WHERE id = _case_id;
  ELSIF _action = 'review' THEN
    UPDATE public.enforcement_actions
       SET review_state = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
           review_notes = v_note, updated_at = now()
     WHERE id = _case_id AND review_state = 'pending_review';
  ELSIF _action = 'approve' THEN
    IF v_case.review_state NOT IN ('reviewed','pending_review') THEN
      RAISE EXCEPTION 'case must be proposed and reviewed before approval' USING ERRCODE = '22023';
    END IF;
    UPDATE public.enforcement_actions
       SET review_state = 'approved', approved_by = auth.uid(), approved_at = now(),
           approval_notes = v_note, updated_at = now()
     WHERE id = _case_id;
  ELSIF _action = 'reject' THEN
    IF COALESCE(length(v_note),0) < 10 THEN
      RAISE EXCEPTION 'rejection reason of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.enforcement_actions
       SET review_state = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           review_notes = v_note, updated_at = now()
     WHERE id = _case_id;
  ELSIF _action = 'issue' THEN
    IF v_case.review_state <> 'approved' THEN
      RAISE EXCEPTION 'case must be approved before issuance' USING ERRCODE = '22023';
    END IF;
    UPDATE public.enforcement_actions
       SET review_state = 'issued', status = 'active',
           effective_date = COALESCE((_payload->>'effective_date')::date, CURRENT_DATE),
           notice_issued_at = now(), monitoring_state = 'monitoring', updated_at = now()
     WHERE id = _case_id;
  ELSIF _action = 'monitor' THEN
    UPDATE public.enforcement_actions
       SET monitoring_state = COALESCE(NULLIF(_payload->>'monitoring_state',''),'monitoring'),
           updated_at = now()
     WHERE id = _case_id;
  ELSIF _action = 'flag_non_compliance' THEN
    IF COALESCE(length(v_note),0) < 10 THEN
      RAISE EXCEPTION 'non-compliance note of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.enforcement_actions
       SET non_compliance_flag = true, non_compliance_note = v_note,
           monitoring_state = 'non_compliant', updated_at = now()
     WHERE id = _case_id;
  ELSIF _action = 'close' THEN
    IF COALESCE(btrim(_payload->>'outcome'),'') = ''
       OR COALESCE(length(btrim(_payload->>'rationale')),0) < 10 THEN
      RAISE EXCEPTION 'outcome and a rationale of at least 10 characters are required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.enforcement_actions
       SET status = 'closed', review_state = 'closed',
           decision_outcome = _payload->>'outcome',
           decision_rationale = _payload->>'rationale',
           decision_at = now(), closed_at = now(), closed_by = auth.uid(),
           monitoring_state = 'closed', updated_at = now()
     WHERE id = _case_id;
  ELSE
    RAISE EXCEPTION 'unknown enforcement action %', _action USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.enforcement_case_events(case_id, event_type, actor_id, note, detail)
  VALUES (_case_id, 'lifecycle_' || _action, auth.uid(), v_note, _payload);

  SELECT * INTO v_case FROM public.enforcement_actions WHERE id = _case_id;
  RETURN jsonb_build_object('id', v_case.id, 'review_state', v_case.review_state,
    'status', v_case.status, 'monitoring_state', v_case.monitoring_state);
END $$;
REVOKE ALL ON FUNCTION public.enforcement_lifecycle_action(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforcement_lifecycle_action(uuid,text,jsonb) TO authenticated, service_role;

-- ============ PHASE 5: AI INSIGHTS HUB ============
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  module text NOT NULL,
  entity_id uuid,
  object_type text,
  object_id uuid,
  source_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text,
  model text,
  provider_state text NOT NULL DEFAULT 'NOT_CONFIGURED',
  confidence numeric,
  explanation text,
  recommendation text,
  insight_kind text NOT NULL DEFAULT 'module',
  review_status text NOT NULL DEFAULT 'pending',
  reviewer_id uuid,
  reviewed_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  regulator_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_insights_provider_state_chk CHECK (provider_state IN
    ('SUCCESS','NOT_CONFIGURED','SANDBOX','PROVIDER_FAILURE','TRANSPORT_FAILURE','RATE_LIMITED','INSUFFICIENT_DATA')),
  CONSTRAINT ai_insights_review_status_chk CHECK (review_status IN
    ('pending','accepted','dismissed','escalated','overridden'))
);
CREATE INDEX IF NOT EXISTS idx_ai_insights_module ON public.ai_insights(module, generated_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_insights_read ON public.ai_insights FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'report_management','view')
         OR public.has_permission(auth.uid(),'executive_oversight','receive_ils'));
CREATE POLICY ai_insights_insert ON public.ai_insights FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'report_management','create'));

CREATE OR REPLACE FUNCTION public.tg_ai_insights_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.title <> OLD.title OR NEW.explanation IS DISTINCT FROM OLD.explanation
     OR NEW.recommendation IS DISTINCT FROM OLD.recommendation
     OR NEW.source_records::text <> OLD.source_records::text
     OR NEW.citations::text <> OLD.citations::text
     OR NEW.provider_state <> OLD.provider_state
     OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.confidence IS DISTINCT FROM OLD.confidence THEN
    RAISE EXCEPTION 'AI insight output is immutable; only review status may change' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ai_insights_immutable ON public.ai_insights;
CREATE TRIGGER trg_ai_insights_immutable BEFORE UPDATE ON public.ai_insights
FOR EACH ROW EXECUTE FUNCTION public.tg_ai_insights_immutable();

CREATE TABLE IF NOT EXISTS public.ai_insight_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id uuid NOT NULL REFERENCES public.ai_insights(id) ON DELETE CASCADE,
  action text NOT NULL,
  justification text,
  follow_up_type text,
  follow_up_id uuid,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_insight_actions_action_chk CHECK (action IN
    ('reviewed','accepted','dismissed','escalated','follow_up_created','overridden'))
);
CREATE INDEX IF NOT EXISTS idx_aia_insight ON public.ai_insight_actions(insight_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_insight_actions TO authenticated;
GRANT ALL ON public.ai_insight_actions TO service_role;
ALTER TABLE public.ai_insight_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY aia_read ON public.ai_insight_actions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'report_management','view')
         OR public.has_permission(auth.uid(),'executive_oversight','receive_ils'));
CREATE POLICY aia_insert ON public.ai_insight_actions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(),'report_management','create'));

CREATE OR REPLACE FUNCTION public.tg_aia_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'AI insight actions are append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS trg_aia_append_only ON public.ai_insight_actions;
CREATE TRIGGER trg_aia_append_only BEFORE UPDATE OR DELETE ON public.ai_insight_actions
FOR EACH ROW EXECUTE FUNCTION public.tg_aia_append_only();

CREATE OR REPLACE FUNCTION public.ai_insight_review(
  _insight_id uuid,
  _action text,
  _justification text DEFAULT NULL,
  _follow_up_type text DEFAULT NULL,
  _follow_up_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ai_insights;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'report_management','create')) THEN
    RAISE EXCEPTION 'not authorised to review AI insights' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.ai_insights WHERE id = _insight_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'insight not found' USING ERRCODE = 'P0002';
  END IF;
  IF _action NOT IN ('reviewed','accepted','dismissed','escalated','follow_up_created','overridden') THEN
    RAISE EXCEPTION 'invalid action %', _action USING ERRCODE = '22023';
  END IF;
  IF _action IN ('overridden','dismissed') AND COALESCE(length(btrim(_justification)),0) < 10 THEN
    RAISE EXCEPTION 'justification of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ai_insight_actions(insight_id, action, justification, follow_up_type, follow_up_id)
  VALUES (_insight_id, _action, _justification, _follow_up_type, _follow_up_id);

  IF _action = 'overridden' THEN
    PERFORM public.log_rule_override('ai_insights','ai_insight', _insight_id::text, 'ai_insight_review',
      to_jsonb(v_row.review_status), to_jsonb('overridden'::text), _justification,
      jsonb_build_object('provider_state', v_row.provider_state, 'module', v_row.module));
  END IF;

  IF _action IN ('accepted','dismissed','escalated','overridden') THEN
    UPDATE public.ai_insights
       SET review_status = CASE _action WHEN 'accepted' THEN 'accepted'
                                        WHEN 'dismissed' THEN 'dismissed'
                                        WHEN 'escalated' THEN 'escalated'
                                        ELSE 'overridden' END,
           reviewer_id = auth.uid(), reviewed_at = now()
     WHERE id = _insight_id;
  END IF;

  SELECT * INTO v_row FROM public.ai_insights WHERE id = _insight_id;
  RETURN jsonb_build_object('id', v_row.id, 'review_status', v_row.review_status);
END $$;
REVOKE ALL ON FUNCTION public.ai_insight_review(uuid,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_insight_review(uuid,text,text,text,uuid) TO authenticated, service_role;

-- ============ PHASE 5: EXECUTIVE CROSS-MODULE AGGREGATES ============
CREATE OR REPLACE FUNCTION public.executive_conduct_summary(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'complaints_total', (SELECT count(*) FROM public.complaints c
       WHERE (_from IS NULL OR c.created_at >= _from) AND (_to IS NULL OR c.created_at < (_to + 1))),
    'complaints_severe', (SELECT count(*) FROM public.complaints c
       WHERE c.severity IN ('critical','high')
         AND (_from IS NULL OR c.created_at >= _from) AND (_to IS NULL OR c.created_at < (_to + 1))),
    'complaints_open', (SELECT count(*) FROM public.complaints c WHERE c.closed_at IS NULL),
    'sla_breaches', (SELECT count(*) FROM public.complaints c
       WHERE c.sla_due_at IS NOT NULL AND c.resolved_at IS NULL AND c.sla_due_at < now()),
    'investigations_open', (SELECT count(*) FROM public.conduct_investigations i
       WHERE i.status NOT IN ('closed','discontinued')),
    'pattern_alerts_open', (SELECT count(*) FROM public.conduct_alerts a WHERE a.closed_at IS NULL),
    'enforcement_open', (SELECT count(*) FROM public.enforcement_actions e WHERE e.status <> 'closed')
  );
$$;
GRANT EXECUTE ON FUNCTION public.executive_conduct_summary(date,date) TO authenticated, service_role;