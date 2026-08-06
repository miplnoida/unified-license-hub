-- ============================================================
-- Market Conduct: Formal Investigation Closure & Discontinuation
-- ============================================================

-- 1. Investigation-level closure columns -----------------------
ALTER TABLE public.conduct_investigations
  ADD COLUMN IF NOT EXISTS discontinuation_ground text,
  ADD COLUMN IF NOT EXISTS discontinued_at timestamptz,
  ADD COLUMN IF NOT EXISTS discontinued_by uuid,
  ADD COLUMN IF NOT EXISTS active_closure_id uuid;

-- 2. Closure determination record ------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_investigation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.conduct_investigations(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  determination_type text NOT NULL DEFAULT 'closure_no_further_action',
  status text NOT NULL DEFAULT 'draft',
  findings_summary text,
  evidence_relied_upon text,
  rationale text,
  next_steps text,
  regulatory_learning text,
  discontinuation_ground text,
  discontinuation_detail text,
  enforcement_action_id uuid REFERENCES public.enforcement_actions(id) ON DELETE SET NULL,
  entity_letter_required boolean NOT NULL DEFAULT false,
  readiness_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  override_reason text,
  prepared_by uuid,
  submitted_by uuid,
  submitted_at timestamptz,
  approver_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_closure_determination_chk CHECK (determination_type IN
    ('closure_with_enforcement','closure_no_further_action','discontinuation')),
  CONSTRAINT conduct_closure_status_chk CHECK (status IN
    ('draft','pending_approval','approved','rejected'))
);
CREATE UNIQUE INDEX IF NOT EXISTS conduct_closures_inv_version_uidx
  ON public.conduct_investigation_closures(investigation_id, version);
CREATE INDEX IF NOT EXISTS conduct_closures_status_idx
  ON public.conduct_investigation_closures(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_investigation_closures TO authenticated;
GRANT ALL ON public.conduct_investigation_closures TO service_role;
ALTER TABLE public.conduct_investigation_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conduct closures readable" ON public.conduct_investigation_closures;
CREATE POLICY "conduct closures readable" ON public.conduct_investigation_closures
  FOR SELECT TO authenticated
  USING (public.can_view_conduct_investigation(investigation_id));

DROP POLICY IF EXISTS "conduct closures manageable" ON public.conduct_investigation_closures;
CREATE POLICY "conduct closures manageable" ON public.conduct_investigation_closures
  FOR ALL TO authenticated
  USING (public.can_manage_conduct_investigation(investigation_id))
  WITH CHECK (public.can_manage_conduct_investigation(investigation_id));

-- 3. Substantiated breaches -------------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_closure_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES public.conduct_investigation_closures(id) ON DELETE CASCADE,
  provision text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',
  substantiated boolean NOT NULL DEFAULT true,
  evidence_reference text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_closure_breach_severity_chk CHECK (severity IN ('low','medium','high','critical'))
);
CREATE INDEX IF NOT EXISTS conduct_closure_breaches_closure_idx
  ON public.conduct_closure_breaches(closure_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_closure_breaches TO authenticated;
GRANT ALL ON public.conduct_closure_breaches TO service_role;
ALTER TABLE public.conduct_closure_breaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conduct closure breaches readable" ON public.conduct_closure_breaches;
CREATE POLICY "conduct closure breaches readable" ON public.conduct_closure_breaches
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conduct_investigation_closures c
                 WHERE c.id = closure_id AND public.can_view_conduct_investigation(c.investigation_id)));

DROP POLICY IF EXISTS "conduct closure breaches manageable" ON public.conduct_closure_breaches;
CREATE POLICY "conduct closure breaches manageable" ON public.conduct_closure_breaches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conduct_investigation_closures c
                 WHERE c.id = closure_id AND public.can_manage_conduct_investigation(c.investigation_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conduct_investigation_closures c
                 WHERE c.id = closure_id AND public.can_manage_conduct_investigation(c.investigation_id)));

-- 4. Post-closure monitoring directive ---------------------------
CREATE TABLE IF NOT EXISTS public.conduct_post_closure_monitoring (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.conduct_investigations(id) ON DELETE CASCADE,
  closure_id uuid REFERENCES public.conduct_investigation_closures(id) ON DELETE SET NULL,
  licensee_id uuid,
  focus_areas text NOT NULL,
  indicators text,
  entity_reporting_requirement text,
  frequency text NOT NULL DEFAULT 'quarterly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  next_review_date date,
  owner_id uuid,
  status text NOT NULL DEFAULT 'pending',
  activated_at timestamptz,
  closed_at timestamptz,
  closure_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_pcm_frequency_chk CHECK (frequency IN ('monthly','quarterly','semi_annual','annual')),
  CONSTRAINT conduct_pcm_status_chk CHECK (status IN ('pending','active','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS conduct_pcm_investigation_idx ON public.conduct_post_closure_monitoring(investigation_id);
CREATE INDEX IF NOT EXISTS conduct_pcm_licensee_idx ON public.conduct_post_closure_monitoring(licensee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_post_closure_monitoring TO authenticated;
GRANT ALL ON public.conduct_post_closure_monitoring TO service_role;
ALTER TABLE public.conduct_post_closure_monitoring ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conduct pcm readable" ON public.conduct_post_closure_monitoring;
CREATE POLICY "conduct pcm readable" ON public.conduct_post_closure_monitoring
  FOR SELECT TO authenticated
  USING (public.can_view_conduct_investigation(investigation_id));

DROP POLICY IF EXISTS "conduct pcm manageable" ON public.conduct_post_closure_monitoring;
CREATE POLICY "conduct pcm manageable" ON public.conduct_post_closure_monitoring
  FOR ALL TO authenticated
  USING (public.can_manage_conduct_investigation(investigation_id))
  WITH CHECK (public.can_manage_conduct_investigation(investigation_id));

-- 5. Monitoring review register ----------------------------------
CREATE TABLE IF NOT EXISTS public.conduct_monitoring_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoring_id uuid NOT NULL REFERENCES public.conduct_post_closure_monitoring(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  observations text,
  outcome text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  escalated boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_mr_status_chk CHECK (status IN ('scheduled','completed','missed'))
);
CREATE INDEX IF NOT EXISTS conduct_mr_monitoring_idx ON public.conduct_monitoring_reviews(monitoring_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_monitoring_reviews TO authenticated;
GRANT ALL ON public.conduct_monitoring_reviews TO service_role;
ALTER TABLE public.conduct_monitoring_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conduct monitoring reviews readable" ON public.conduct_monitoring_reviews;
CREATE POLICY "conduct monitoring reviews readable" ON public.conduct_monitoring_reviews
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conduct_post_closure_monitoring m
                 WHERE m.id = monitoring_id AND public.can_view_conduct_investigation(m.investigation_id)));

DROP POLICY IF EXISTS "conduct monitoring reviews manageable" ON public.conduct_monitoring_reviews;
CREATE POLICY "conduct monitoring reviews manageable" ON public.conduct_monitoring_reviews
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conduct_post_closure_monitoring m
                 WHERE m.id = monitoring_id AND public.can_manage_conduct_investigation(m.investigation_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conduct_post_closure_monitoring m
                 WHERE m.id = monitoring_id AND public.can_manage_conduct_investigation(m.investigation_id)));

-- 6. updated_at triggers ------------------------------------------
DROP TRIGGER IF EXISTS trg_touch_conduct_closures ON public.conduct_investigation_closures;
CREATE TRIGGER trg_touch_conduct_closures BEFORE UPDATE ON public.conduct_investigation_closures
  FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
DROP TRIGGER IF EXISTS trg_touch_conduct_closure_breaches ON public.conduct_closure_breaches;
CREATE TRIGGER trg_touch_conduct_closure_breaches BEFORE UPDATE ON public.conduct_closure_breaches
  FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
DROP TRIGGER IF EXISTS trg_touch_conduct_pcm ON public.conduct_post_closure_monitoring;
CREATE TRIGGER trg_touch_conduct_pcm BEFORE UPDATE ON public.conduct_post_closure_monitoring
  FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();
DROP TRIGGER IF EXISTS trg_touch_conduct_mr ON public.conduct_monitoring_reviews;
CREATE TRIGGER trg_touch_conduct_mr BEFORE UPDATE ON public.conduct_monitoring_reviews
  FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();

-- 7. Immutability guard: approved closures cannot be edited directly
CREATE OR REPLACE FUNCTION public._guard_conduct_closure_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'approved'
     AND current_setting('conduct.closure_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'An approved closure record is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status = 'pending_approval'
     AND current_setting('conduct.closure_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'A closure awaiting approval can only be changed through the approval actions'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_conduct_closure ON public.conduct_investigation_closures;
CREATE TRIGGER trg_guard_conduct_closure BEFORE UPDATE ON public.conduct_investigation_closures
  FOR EACH ROW EXECUTE FUNCTION public._guard_conduct_closure_update();

-- 8. Approver authorisation helper ----------------------------------
CREATE OR REPLACE FUNCTION public.can_approve_conduct_closure(_closure_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conduct_investigation_closures c
    WHERE c.id = _closure_id
      AND (
        (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
        OR has_role(auth.uid(),'super_admin'::app_role)
        OR has_role(auth.uid(),'admin'::app_role)
        OR c.approver_id = auth.uid()
        OR (c.approver_id IS NULL AND has_role(auth.uid(),'supervisor'::app_role))
      )
  )
$$;

-- 9. Readiness ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_closure_readiness(_investigation_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'unfinalised_interviews', (
      SELECT count(*) FROM public.conduct_interviews i
      WHERE i.investigation_id = _investigation_id
        AND coalesce(i.status,'') NOT IN ('recorded','cancelled')),
    'evidence_count', (
      SELECT count(*) FROM public.conduct_evidence e
      WHERE e.investigation_id = _investigation_id),
    'open_actions', (
      SELECT count(*) FROM public.conduct_actions a
      WHERE a.source_module = 'investigation' AND a.source_id = _investigation_id
        AND a.status IN ('open','in_progress')),
    'has_enforcement_link', (
      SELECT EXISTS (SELECT 1 FROM public.conduct_investigation_closures c
                     WHERE c.investigation_id = _investigation_id
                       AND c.status IN ('draft','pending_approval')
                       AND c.enforcement_action_id IS NOT NULL))
  )
$$;

-- 10. Draft upsert ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_closure_upsert_draft(
  _investigation_id uuid,
  _closure_id uuid DEFAULT NULL,
  _determination_type text DEFAULT 'closure_no_further_action',
  _findings_summary text DEFAULT NULL,
  _evidence_relied_upon text DEFAULT NULL,
  _rationale text DEFAULT NULL,
  _next_steps text DEFAULT NULL,
  _regulatory_learning text DEFAULT NULL,
  _discontinuation_ground text DEFAULT NULL,
  _discontinuation_detail text DEFAULT NULL,
  _entity_letter_required boolean DEFAULT false,
  _approver_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_status text; v_ver int;
BEGIN
  IF NOT public.can_manage_conduct_investigation(_investigation_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF _determination_type NOT IN ('closure_with_enforcement','closure_no_further_action','discontinuation') THEN
    RAISE EXCEPTION 'Invalid determination type' USING ERRCODE='22023'; END IF;

  PERFORM set_config('conduct.closure_rpc','on', true);

  IF _closure_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.conduct_investigation_closures WHERE id=_closure_id;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Closure record not found' USING ERRCODE='P0002'; END IF;
    IF v_status NOT IN ('draft','rejected') THEN
      RAISE EXCEPTION 'Only a draft or rejected closure record can be edited' USING ERRCODE='22023'; END IF;
    UPDATE public.conduct_investigation_closures SET
      determination_type=_determination_type,
      findings_summary=_findings_summary,
      evidence_relied_upon=_evidence_relied_upon,
      rationale=_rationale,
      next_steps=_next_steps,
      regulatory_learning=_regulatory_learning,
      discontinuation_ground=_discontinuation_ground,
      discontinuation_detail=_discontinuation_detail,
      entity_letter_required=coalesce(_entity_letter_required,false),
      approver_id=_approver_id,
      status='draft'
    WHERE id=_closure_id
    RETURNING id INTO v_id;
  ELSE
    SELECT coalesce(max(version),0)+1 INTO v_ver
      FROM public.conduct_investigation_closures WHERE investigation_id=_investigation_id;
    INSERT INTO public.conduct_investigation_closures(
      investigation_id, version, determination_type, findings_summary, evidence_relied_upon,
      rationale, next_steps, regulatory_learning, discontinuation_ground, discontinuation_detail,
      entity_letter_required, approver_id, prepared_by)
    VALUES (_investigation_id, v_ver, _determination_type, _findings_summary, _evidence_relied_upon,
      _rationale, _next_steps, _regulatory_learning, _discontinuation_ground, _discontinuation_detail,
      coalesce(_entity_letter_required,false), _approver_id, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.log_compliance_audit('UPDATE','conduct_investigation_closure', v_id::text,
    NULL, jsonb_build_object('determination_type',_determination_type,'status','draft'),
    _rationale, NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',_investigation_id));

  PERFORM set_config('conduct.closure_rpc','off', true);
  RETURN v_id;
END $$;

-- 11. Enforcement referral -------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_closure_link_enforcement(
  _closure_id uuid,
  _enforcement_action_id uuid DEFAULT NULL,
  _create_new boolean DEFAULT false,
  _enforcement_type text DEFAULT 'warning'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_inv record; v_id uuid; v_case text;
BEGIN
  SELECT * INTO v_c FROM public.conduct_investigation_closures WHERE id=_closure_id;
  IF v_c IS NULL THEN RAISE EXCEPTION 'Closure record not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_conduct_investigation(v_c.investigation_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_c.status = 'approved' THEN
    RAISE EXCEPTION 'An approved closure record is immutable' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_inv FROM public.conduct_investigations WHERE id=v_c.investigation_id;

  IF _create_new THEN
    IF v_inv.licensee_id IS NULL THEN
      RAISE EXCEPTION 'An entity is required to open an enforcement case' USING ERRCODE='22023'; END IF;
    v_case := 'ENF-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    INSERT INTO public.enforcement_actions(
      entity_id, case_number, enforcement_type, status, description, findings,
      opened_by, source_type, source_reference_id)
    VALUES (v_inv.licensee_id, v_case, coalesce(_enforcement_type,'warning'), 'open',
      left(coalesce(v_inv.allegation,''), 2000), v_c.findings_summary,
      auth.uid(), 'conduct_investigation', v_inv.id)
    RETURNING id INTO v_id;

    INSERT INTO public.enforcement_case_events(enforcement_action_id, event_type, notes, created_by)
    VALUES (v_id, 'opened', 'Referred from market conduct investigation closure', auth.uid());
  ELSE
    IF _enforcement_action_id IS NULL THEN
      RAISE EXCEPTION 'An enforcement case must be selected' USING ERRCODE='22023'; END IF;
    v_id := _enforcement_action_id;
    INSERT INTO public.enforcement_case_events(enforcement_action_id, event_type, notes, created_by)
    VALUES (v_id, 'linked', 'Linked to market conduct investigation closure', auth.uid());
  END IF;

  PERFORM set_config('conduct.closure_rpc','on', true);
  UPDATE public.conduct_investigation_closures SET enforcement_action_id=v_id WHERE id=_closure_id;
  PERFORM set_config('conduct.closure_rpc','off', true);

  PERFORM public.log_compliance_audit('UPDATE','conduct_investigation_closure', _closure_id::text,
    jsonb_build_object('enforcement_action_id', v_c.enforcement_action_id),
    jsonb_build_object('enforcement_action_id', v_id),
    'Enforcement referral recorded', NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',v_c.investigation_id));

  RETURN v_id;
END $$;

-- 12. Monitoring directive upsert -------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_monitoring_directive_upsert(
  _investigation_id uuid,
  _monitoring_id uuid DEFAULT NULL,
  _closure_id uuid DEFAULT NULL,
  _focus_areas text DEFAULT NULL,
  _indicators text DEFAULT NULL,
  _entity_reporting_requirement text DEFAULT NULL,
  _frequency text DEFAULT 'quarterly',
  _start_date date DEFAULT NULL,
  _end_date date DEFAULT NULL,
  _owner_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_lic uuid;
BEGIN
  IF NOT public.can_manage_conduct_investigation(_investigation_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF _focus_areas IS NULL OR length(btrim(_focus_areas)) < 10 THEN
    RAISE EXCEPTION 'Monitoring focus areas of at least 10 characters are required' USING ERRCODE='22023'; END IF;
  IF coalesce(_frequency,'quarterly') NOT IN ('monthly','quarterly','semi_annual','annual') THEN
    RAISE EXCEPTION 'Invalid monitoring frequency' USING ERRCODE='22023'; END IF;

  SELECT licensee_id INTO v_lic FROM public.conduct_investigations WHERE id=_investigation_id;

  IF _monitoring_id IS NOT NULL THEN
    UPDATE public.conduct_post_closure_monitoring SET
      closure_id=coalesce(_closure_id, closure_id),
      focus_areas=btrim(_focus_areas), indicators=_indicators,
      entity_reporting_requirement=_entity_reporting_requirement,
      frequency=coalesce(_frequency,'quarterly'),
      start_date=coalesce(_start_date, start_date),
      end_date=_end_date, owner_id=_owner_id
    WHERE id=_monitoring_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Monitoring directive not found' USING ERRCODE='P0002'; END IF;
  ELSE
    INSERT INTO public.conduct_post_closure_monitoring(
      investigation_id, closure_id, licensee_id, focus_areas, indicators,
      entity_reporting_requirement, frequency, start_date, end_date, owner_id, created_by)
    VALUES (_investigation_id, _closure_id, v_lic, btrim(_focus_areas), _indicators,
      _entity_reporting_requirement, coalesce(_frequency,'quarterly'),
      coalesce(_start_date, CURRENT_DATE), _end_date, _owner_id, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.log_compliance_audit('UPDATE','conduct_post_closure_monitoring', v_id::text,
    NULL, jsonb_build_object('focus_areas', btrim(_focus_areas), 'frequency', _frequency),
    'Post-closure monitoring directive saved', NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',_investigation_id));
  RETURN v_id;
END $$;

-- 13. Submit for approval -----------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_closure_submit(
  _closure_id uuid,
  _approver_id uuid DEFAULT NULL,
  _override_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_inv record; v_ready jsonb;
BEGIN
  SELECT * INTO v_c FROM public.conduct_investigation_closures WHERE id=_closure_id;
  IF v_c IS NULL THEN RAISE EXCEPTION 'Closure record not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_conduct_investigation(v_c.investigation_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_c.status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'This closure record is not in draft' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_inv FROM public.conduct_investigations WHERE id=v_c.investigation_id;
  IF v_inv.status IN ('closed','discontinued') THEN
    RAISE EXCEPTION 'The investigation is already concluded' USING ERRCODE='22023'; END IF;

  IF v_c.findings_summary IS NULL OR length(btrim(v_c.findings_summary)) < 20 THEN
    RAISE EXCEPTION 'A findings summary of at least 20 characters is required' USING ERRCODE='23514'; END IF;
  IF v_c.rationale IS NULL OR length(btrim(v_c.rationale)) < 20 THEN
    RAISE EXCEPTION 'A determination rationale of at least 20 characters is required' USING ERRCODE='23514'; END IF;

  IF v_c.determination_type = 'discontinuation' THEN
    IF v_c.discontinuation_ground IS NULL OR btrim(v_c.discontinuation_ground) = '' THEN
      RAISE EXCEPTION 'A discontinuation ground is required' USING ERRCODE='23514'; END IF;
    IF v_c.discontinuation_ground = 'other'
       AND (v_c.discontinuation_detail IS NULL OR length(btrim(v_c.discontinuation_detail)) < 10) THEN
      RAISE EXCEPTION 'Describe the discontinuation ground (min 10 characters)' USING ERRCODE='23514'; END IF;
  END IF;

  IF v_c.determination_type = 'closure_with_enforcement' AND v_c.enforcement_action_id IS NULL THEN
    RAISE EXCEPTION 'An enforcement referral is required for an enforcement-track closure' USING ERRCODE='23514';
  END IF;

  v_ready := public.conduct_closure_readiness(v_c.investigation_id);

  IF (v_ready->>'unfinalised_interviews')::int > 0 OR (v_ready->>'open_actions')::int > 0 THEN
    IF _override_reason IS NULL OR length(btrim(_override_reason)) < 10 THEN
      RAISE EXCEPTION 'Closure blocked: % unfinalised interview(s) and % open action(s). A documented override reason (min 10 characters) is required.',
        (v_ready->>'unfinalised_interviews'), (v_ready->>'open_actions') USING ERRCODE='23514';
    END IF;
  END IF;

  PERFORM set_config('conduct.closure_rpc','on', true);
  UPDATE public.conduct_investigation_closures SET
    status='pending_approval', submitted_by=auth.uid(), submitted_at=now(),
    approver_id=coalesce(_approver_id, approver_id),
    override_reason=_override_reason, readiness_snapshot=v_ready,
    rejection_reason=NULL, rejected_by=NULL, rejected_at=NULL
  WHERE id=_closure_id;
  PERFORM set_config('conduct.closure_rpc','off', true);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','conduct_investigation_closure', _closure_id::text,
    jsonb_build_object('status', v_c.status), jsonb_build_object('status','pending_approval'),
    coalesce(_override_reason, btrim(v_c.rationale)), NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',v_c.investigation_id,'readiness',v_ready));

  PERFORM public.notification_enqueue_event('conduct_investigation.closure_requested','conduct_investigation',
    v_c.investigation_id,
    jsonb_build_object('investigation_code', coalesce(v_inv.code,''), 'allegation', v_inv.allegation,
      'determination_type', v_c.determination_type, 'approver_id', coalesce(_approver_id, v_c.approver_id)),
    _closure_id::text, NULL, NULL);
END $$;

-- 14. Approve -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_closure_approve(
  _closure_id uuid,
  _decision_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_inv record; v_new_status text; v_mon record;
BEGIN
  SELECT * INTO v_c FROM public.conduct_investigation_closures WHERE id=_closure_id;
  IF v_c IS NULL THEN RAISE EXCEPTION 'Closure record not found' USING ERRCODE='P0002'; END IF;
  IF v_c.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This closure record is not awaiting approval' USING ERRCODE='22023'; END IF;
  IF NOT public.can_approve_conduct_closure(_closure_id) THEN
    RAISE EXCEPTION 'Not authorised to approve this closure' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_inv FROM public.conduct_investigations WHERE id=v_c.investigation_id;
  v_new_status := CASE WHEN v_c.determination_type='discontinuation' THEN 'discontinued' ELSE 'closed' END;

  PERFORM set_config('conduct.closure_rpc','on', true);
  UPDATE public.conduct_investigation_closures SET
    status='approved', approved_by=auth.uid(), approved_at=now(),
    metadata = metadata || jsonb_build_object('decision_note', _decision_note)
  WHERE id=_closure_id;
  PERFORM set_config('conduct.closure_rpc','off', true);

  UPDATE public.conduct_investigations SET
    status=v_new_status,
    outcome=coalesce(v_c.findings_summary, outcome),
    closure_reason=coalesce(v_c.rationale, closure_reason),
    closed_by=auth.uid(), closed_at=now(),
    discontinuation_ground=CASE WHEN v_new_status='discontinued' THEN v_c.discontinuation_ground ELSE discontinuation_ground END,
    discontinued_at=CASE WHEN v_new_status='discontinued' THEN now() ELSE discontinued_at END,
    discontinued_by=CASE WHEN v_new_status='discontinued' THEN auth.uid() ELSE discontinued_by END,
    active_closure_id=_closure_id
  WHERE id=v_c.investigation_id;

  -- Activate any monitoring directive attached to this closure / investigation
  FOR v_mon IN
    SELECT * FROM public.conduct_post_closure_monitoring
    WHERE investigation_id=v_c.investigation_id AND status='pending'
  LOOP
    UPDATE public.conduct_post_closure_monitoring SET
      status='active', closure_id=coalesce(closure_id,_closure_id), activated_at=now(),
      next_review_date = coalesce(v_mon.start_date, CURRENT_DATE) + (
        CASE v_mon.frequency WHEN 'monthly' THEN interval '1 month'
                             WHEN 'quarterly' THEN interval '3 months'
                             WHEN 'semi_annual' THEN interval '6 months'
                             ELSE interval '12 months' END)
    WHERE id=v_mon.id;

    INSERT INTO public.conduct_monitoring_reviews(monitoring_id, due_date)
    VALUES (v_mon.id, (coalesce(v_mon.start_date, CURRENT_DATE) + (
      CASE v_mon.frequency WHEN 'monthly' THEN interval '1 month'
                           WHEN 'quarterly' THEN interval '3 months'
                           WHEN 'semi_annual' THEN interval '6 months'
                           ELSE interval '12 months' END))::date);

    PERFORM public.notification_enqueue_event('conduct_investigation.monitoring_activated','conduct_investigation',
      v_c.investigation_id,
      jsonb_build_object('investigation_code', coalesce(v_inv.code,''), 'focus_areas', v_mon.focus_areas,
        'frequency', v_mon.frequency, 'owner_id', v_mon.owner_id),
      v_mon.id::text, NULL, NULL);
  END LOOP;

  PERFORM public.log_compliance_audit('APPROVE','conduct_investigation_closure', _closure_id::text,
    jsonb_build_object('status','pending_approval'),
    jsonb_build_object('status','approved','investigation_status',v_new_status),
    coalesce(_decision_note,'Closure approved'), NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',v_c.investigation_id));

  PERFORM public.notification_enqueue_event('conduct_investigation.closure_approved','conduct_investigation',
    v_c.investigation_id,
    jsonb_build_object('investigation_code', coalesce(v_inv.code,''), 'allegation', v_inv.allegation,
      'determination_type', v_c.determination_type, 'decision_note', coalesce(_decision_note,'')),
    _closure_id::text, NULL, NULL);

  IF v_new_status='discontinued' THEN
    PERFORM public.notification_enqueue_event('conduct_investigation.discontinued','conduct_investigation',
      v_c.investigation_id,
      jsonb_build_object('investigation_code', coalesce(v_inv.code,''),
        'ground', coalesce(v_c.discontinuation_ground,''), 'detail', coalesce(v_c.discontinuation_detail,'')),
      _closure_id::text, NULL, NULL);
  END IF;
END $$;

-- 15. Reject ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_closure_reject(
  _closure_id uuid,
  _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_inv record;
BEGIN
  SELECT * INTO v_c FROM public.conduct_investigation_closures WHERE id=_closure_id;
  IF v_c IS NULL THEN RAISE EXCEPTION 'Closure record not found' USING ERRCODE='P0002'; END IF;
  IF v_c.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This closure record is not awaiting approval' USING ERRCODE='22023'; END IF;
  IF NOT public.can_approve_conduct_closure(_closure_id) THEN
    RAISE EXCEPTION 'Not authorised to review this closure' USING ERRCODE='42501'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'A rejection reason of at least 10 characters is required' USING ERRCODE='23514'; END IF;

  SELECT * INTO v_inv FROM public.conduct_investigations WHERE id=v_c.investigation_id;

  PERFORM set_config('conduct.closure_rpc','on', true);
  UPDATE public.conduct_investigation_closures SET
    status='rejected', rejected_by=auth.uid(), rejected_at=now(), rejection_reason=btrim(_reason)
  WHERE id=_closure_id;
  PERFORM set_config('conduct.closure_rpc','off', true);

  PERFORM public.log_compliance_audit('REJECT','conduct_investigation_closure', _closure_id::text,
    jsonb_build_object('status','pending_approval'), jsonb_build_object('status','rejected'),
    btrim(_reason), NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',v_c.investigation_id));

  PERFORM public.notification_enqueue_event('conduct_investigation.closure_rejected','conduct_investigation',
    v_c.investigation_id,
    jsonb_build_object('investigation_code', coalesce(v_inv.code,''), 'reason', btrim(_reason),
      'submitted_by', v_c.submitted_by),
    _closure_id::text, NULL, NULL);
END $$;

-- 16. Monitoring review recording ------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_monitoring_review_record(
  _review_id uuid,
  _observations text,
  _outcome text DEFAULT 'satisfactory',
  _escalate boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r record; v_m record; v_next date;
BEGIN
  SELECT * INTO v_r FROM public.conduct_monitoring_reviews WHERE id=_review_id;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Monitoring review not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_m FROM public.conduct_post_closure_monitoring WHERE id=v_r.monitoring_id;
  IF NOT public.can_manage_conduct_investigation(v_m.investigation_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF _observations IS NULL OR length(btrim(_observations)) < 10 THEN
    RAISE EXCEPTION 'Review observations of at least 10 characters are required' USING ERRCODE='23514'; END IF;

  UPDATE public.conduct_monitoring_reviews SET
    status='completed', observations=btrim(_observations), outcome=_outcome,
    reviewed_by=auth.uid(), reviewed_at=now(), escalated=coalesce(_escalate,false)
  WHERE id=_review_id;

  v_next := (v_r.due_date + (CASE v_m.frequency WHEN 'monthly' THEN interval '1 month'
                                                WHEN 'quarterly' THEN interval '3 months'
                                                WHEN 'semi_annual' THEN interval '6 months'
                                                ELSE interval '12 months' END))::date;

  IF v_m.end_date IS NULL OR v_next <= v_m.end_date THEN
    INSERT INTO public.conduct_monitoring_reviews(monitoring_id, due_date) VALUES (v_m.id, v_next);
    UPDATE public.conduct_post_closure_monitoring SET next_review_date=v_next WHERE id=v_m.id;
  ELSE
    UPDATE public.conduct_post_closure_monitoring
       SET status='completed', closed_at=now(), next_review_date=NULL WHERE id=v_m.id;
  END IF;

  PERFORM public.log_compliance_audit('UPDATE','conduct_monitoring_review', _review_id::text,
    jsonb_build_object('status', v_r.status),
    jsonb_build_object('status','completed','outcome',_outcome),
    btrim(_observations), NULL, NULL,
    jsonb_build_object('module','market_conduct','investigation_id',v_m.investigation_id));
END $$;

-- 17. Grants on functions ----------------------------------------------------
GRANT EXECUTE ON FUNCTION public.can_approve_conduct_closure(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_closure_readiness(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_closure_upsert_draft(uuid,uuid,text,text,text,text,text,text,text,text,boolean,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_closure_link_enforcement(uuid,uuid,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_monitoring_directive_upsert(uuid,uuid,uuid,text,text,text,text,date,date,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_closure_submit(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_closure_approve(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_closure_reject(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_monitoring_review_record(uuid,text,text,boolean) TO authenticated, service_role;

-- 18. Notification event configs (idempotent) ---------------------------------
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, recipient_rules, notification_type)
VALUES
  ('conduct_investigation.closure_requested','Investigation closure submitted for supervisory approval',
   'Closure approval required: {{investigation_code}}',
   'A {{determination_type}} determination was submitted for investigation {{investigation_code}} and awaits your approval.',
   'Closure approval required: {{investigation_code}}',
   'A closure determination ({{determination_type}}) was submitted for investigation {{investigation_code}}. Allegation: {{allegation}}',
   ARRAY['in_app','email'],'[{"type":"payload_user","key":"approver_id"},{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"}]'::jsonb,'action_required'),
  ('conduct_investigation.closure_approved','Investigation closure approved',
   'Closure approved: {{investigation_code}}',
   'The {{determination_type}} determination for investigation {{investigation_code}} was approved. {{decision_note}}',
   'Closure approved: {{investigation_code}}',
   'The closure determination ({{determination_type}}) for investigation {{investigation_code}} has been approved. {{decision_note}}',
   ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"}]'::jsonb,'success'),
  ('conduct_investigation.closure_rejected','Investigation closure returned to the investigator',
   'Closure returned: {{investigation_code}}',
   'The closure determination for investigation {{investigation_code}} was returned. Reason: {{reason}}',
   'Closure returned: {{investigation_code}}',
   'The closure determination for investigation {{investigation_code}} was returned for revision. Reason: {{reason}}',
   ARRAY['in_app','email'],'[{"type":"payload_user","key":"submitted_by"},{"type":"role","role":"super_admin"}]'::jsonb,'warning'),
  ('conduct_investigation.discontinued','Investigation discontinued',
   'Investigation discontinued: {{investigation_code}}',
   'Investigation {{investigation_code}} was discontinued. Ground: {{ground}}. {{detail}}',
   'Investigation discontinued: {{investigation_code}}',
   'Investigation {{investigation_code}} has been discontinued. Ground: {{ground}}. {{detail}}',
   ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"}]'::jsonb,'info'),
  ('conduct_investigation.monitoring_activated','Post-closure monitoring activated',
   'Monitoring activated: {{investigation_code}}',
   'Post-closure monitoring is active for investigation {{investigation_code}} ({{frequency}}). Focus: {{focus_areas}}',
   'Monitoring activated: {{investigation_code}}',
   'Post-closure monitoring has been activated for investigation {{investigation_code}} at {{frequency}} frequency. Focus areas: {{focus_areas}}',
   ARRAY['in_app','email'],'[{"type":"payload_user","key":"owner_id"},{"type":"role","role":"supervisor"}]'::jsonb,'info'),
  ('conduct_investigation.monitoring_review_due','Post-closure monitoring review due',
   'Monitoring review due: {{investigation_code}}',
   'A post-closure monitoring review for investigation {{investigation_code}} is due on {{due_date}}.',
   'Monitoring review due: {{investigation_code}}',
   'A post-closure monitoring review for investigation {{investigation_code}} is due on {{due_date}}. Focus areas: {{focus_areas}}',
   ARRAY['in_app','email'],'[{"type":"payload_user","key":"owner_id"},{"type":"role","role":"supervisor"}]'::jsonb,'action_required')
ON CONFLICT (event_key) DO NOTHING;