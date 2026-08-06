
-- =====================================================================
-- Thematic Reviews: closure & follow-up (report artefact, follow-up
-- register, closure approval gate, supervisory letters)
-- =====================================================================

-- 1. Review-level closure columns -------------------------------------
ALTER TABLE public.thematic_reviews
  ADD COLUMN IF NOT EXISTS closure_state text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS closure_approver_id uuid,
  ADD COLUMN IF NOT EXISTS closure_requested_by uuid,
  ADD COLUMN IF NOT EXISTS closure_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS closure_approved_by uuid,
  ADD COLUMN IF NOT EXISTS closure_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closure_rejection_reason text,
  ADD COLUMN IF NOT EXISTS closure_override_id uuid,
  ADD COLUMN IF NOT EXISTS regulatory_learning jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.thematic_reviews
    ADD CONSTRAINT thematic_reviews_closure_state_chk
    CHECK (closure_state IN ('not_requested','pending_approval','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Follow-up register columns ---------------------------------------
ALTER TABLE public.thematic_review_actions
  ADD COLUMN IF NOT EXISTS follow_up_due_date date,
  ADD COLUMN IF NOT EXISTS original_due_date date,
  ADD COLUMN IF NOT EXISTS extension_reason text,
  ADD COLUMN IF NOT EXISTS extension_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entity_contact text,
  ADD COLUMN IF NOT EXISTS responsible_officer_id uuid,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.thematic_review_actions
    ADD CONSTRAINT thematic_review_actions_verification_chk
    CHECK (verification_status IN ('pending','evidence_received','verified','not_satisfied'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Report artefact ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.thematic_review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  version integer NOT NULL,
  report_type text NOT NULL DEFAULT 'final',
  title text NOT NULL,
  executive_summary text,
  background text,
  scope_methodology text,
  key_findings text,
  required_actions text,
  regulatory_learning text,
  status text NOT NULL DEFAULT 'draft',
  prepared_by uuid,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approver_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  published_by uuid,
  published_at timestamptz,
  file_upload_id uuid,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT thematic_review_reports_status_chk
    CHECK (status IN ('draft','in_review','approved','rejected','published')),
  CONSTRAINT thematic_review_reports_version_uq UNIQUE (review_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_review_reports TO authenticated;
GRANT ALL ON public.thematic_review_reports TO service_role;
ALTER TABLE public.thematic_review_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal read trr" ON public.thematic_review_reports
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'analyst'::app_role)
    OR has_role(auth.uid(),'legal_compliance'::app_role));
CREATE POLICY "Internal write trr" ON public.thematic_review_reports
  FOR ALL TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'supervisor'::app_role))
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'supervisor'::app_role));

CREATE INDEX IF NOT EXISTS idx_trr_review ON public.thematic_review_reports(review_id);

-- 4. Supervisory letters ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.thematic_review_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.thematic_review_reports(id) ON DELETE SET NULL,
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  recipient_name text,
  recipient_email text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  dispatch_id uuid,
  error_message text,
  dispatched_at timestamptz,
  dispatched_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT thematic_review_letters_status_chk
    CHECK (status IN ('pending','dispatched','failed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_review_letters TO authenticated;
GRANT ALL ON public.thematic_review_letters TO service_role;
ALTER TABLE public.thematic_review_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal read trl" ON public.thematic_review_letters
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'analyst'::app_role)
    OR has_role(auth.uid(),'legal_compliance'::app_role));
CREATE POLICY "Internal write trl" ON public.thematic_review_letters
  FOR ALL TO authenticated USING (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'supervisor'::app_role))
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'supervisor'::app_role));

CREATE INDEX IF NOT EXISTS idx_trl_review ON public.thematic_review_letters(review_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_trr_updated_at ON public.thematic_review_reports;
CREATE TRIGGER trg_trr_updated_at BEFORE UPDATE ON public.thematic_review_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_trl_updated_at ON public.thematic_review_letters;
CREATE TRIGGER trg_trl_updated_at BEFORE UPDATE ON public.thematic_review_letters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Authorisation helpers --------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_thematic_review(_review_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
      OR has_role(auth.uid(),'super_admin'::app_role)
      OR has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'supervisor'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_approve_thematic_closure(_review_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thematic_reviews tr
    WHERE tr.id = _review_id
      AND (
        (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
        OR has_role(auth.uid(),'super_admin'::app_role)
        OR has_role(auth.uid(),'admin'::app_role)
        OR tr.closure_approver_id = auth.uid()
        OR (tr.closure_approver_id IS NULL AND has_role(auth.uid(),'supervisor'::app_role))
      )
  )
$$;

-- 6. Report lifecycle RPCs --------------------------------------------
CREATE OR REPLACE FUNCTION public.thematic_report_upsert_draft(
  _review_id uuid,
  _report_id uuid DEFAULT NULL,
  _title text DEFAULT NULL,
  _executive_summary text DEFAULT NULL,
  _background text DEFAULT NULL,
  _scope_methodology text DEFAULT NULL,
  _key_findings text DEFAULT NULL,
  _required_actions text DEFAULT NULL,
  _regulatory_learning text DEFAULT NULL,
  _report_type text DEFAULT 'final'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_ver integer; v_before jsonb;
BEGIN
  IF NOT public.can_manage_thematic_review(_review_id) THEN
    RAISE EXCEPTION 'Not authorised to edit thematic review reports' USING ERRCODE='42501';
  END IF;

  IF _report_id IS NULL THEN
    SELECT COALESCE(MAX(version),0)+1 INTO v_ver FROM public.thematic_review_reports WHERE review_id=_review_id;
    INSERT INTO public.thematic_review_reports(
      review_id, version, report_type, title, executive_summary, background,
      scope_methodology, key_findings, required_actions, regulatory_learning,
      status, prepared_by)
    VALUES (_review_id, v_ver, COALESCE(_report_type,'final'),
      COALESCE(NULLIF(btrim(_title),''), 'Thematic review report v'||v_ver),
      _executive_summary, _background, _scope_methodology, _key_findings,
      _required_actions, _regulatory_learning, 'draft', auth.uid())
    RETURNING id INTO v_id;

    PERFORM public.log_compliance_audit('CREATE','thematic_review_report', v_id::text, NULL,
      jsonb_build_object('review_id',_review_id,'version',v_ver), NULL, NULL, NULL,
      jsonb_build_object('module','market_conduct'));
  ELSE
    SELECT to_jsonb(r) INTO v_before FROM public.thematic_review_reports r WHERE r.id=_report_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
    IF v_before->>'status' NOT IN ('draft','rejected') THEN
      RAISE EXCEPTION 'Only draft or rejected reports can be edited' USING ERRCODE='22023';
    END IF;
    UPDATE public.thematic_review_reports SET
      title = COALESCE(NULLIF(btrim(_title),''), title),
      executive_summary=_executive_summary, background=_background,
      scope_methodology=_scope_methodology, key_findings=_key_findings,
      required_actions=_required_actions, regulatory_learning=_regulatory_learning,
      report_type=COALESCE(_report_type, report_type), status='draft'
    WHERE id=_report_id RETURNING id INTO v_id;

    PERFORM public.log_compliance_audit('UPDATE','thematic_review_report', v_id::text, v_before,
      (SELECT to_jsonb(r) FROM public.thematic_review_reports r WHERE r.id=v_id), NULL, NULL, NULL,
      jsonb_build_object('module','market_conduct'));
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.thematic_report_submit_for_approval(
  _report_id uuid, _approver_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev uuid; v_status text;
BEGIN
  SELECT review_id, status INTO v_rev, v_status FROM public.thematic_review_reports WHERE id=_report_id;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_thematic_review(v_rev) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'Only draft reports can be submitted for approval' USING ERRCODE='22023'; END IF;

  UPDATE public.thematic_review_reports
     SET status='in_review', submitted_at=now(), approver_id=_approver_id, rejection_reason=NULL
   WHERE id=_report_id;

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','thematic_review_report', _report_id::text,
    jsonb_build_object('status',v_status), jsonb_build_object('status','in_review'),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct','approver_id',_approver_id));
END $$;

CREATE OR REPLACE FUNCTION public.thematic_report_approve(_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev uuid; v_status text;
BEGIN
  SELECT review_id, status INTO v_rev, v_status FROM public.thematic_review_reports WHERE id=_report_id;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_approve_thematic_closure(v_rev) THEN
    RAISE EXCEPTION 'Not authorised to approve this report' USING ERRCODE='42501'; END IF;
  IF v_status <> 'in_review' THEN
    RAISE EXCEPTION 'Report is not awaiting approval' USING ERRCODE='22023'; END IF;

  UPDATE public.thematic_review_reports
     SET status='approved', approved_by=auth.uid(), approved_at=now()
   WHERE id=_report_id;

  PERFORM public.log_compliance_audit('APPROVE','thematic_review_report', _report_id::text,
    jsonb_build_object('status',v_status), jsonb_build_object('status','approved'),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct'));
END $$;

CREATE OR REPLACE FUNCTION public.thematic_report_reject(_report_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev uuid; v_status text;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'A rejection reason of at least 10 characters is required' USING ERRCODE='22023'; END IF;
  SELECT review_id, status INTO v_rev, v_status FROM public.thematic_review_reports WHERE id=_report_id;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_approve_thematic_closure(v_rev) THEN
    RAISE EXCEPTION 'Not authorised to reject this report' USING ERRCODE='42501'; END IF;
  IF v_status <> 'in_review' THEN
    RAISE EXCEPTION 'Report is not awaiting approval' USING ERRCODE='22023'; END IF;

  UPDATE public.thematic_review_reports
     SET status='rejected', rejection_reason=btrim(_reason)
   WHERE id=_report_id;

  PERFORM public.log_compliance_audit('REJECT','thematic_review_report', _report_id::text,
    jsonb_build_object('status',v_status), jsonb_build_object('status','rejected'),
    btrim(_reason), NULL, NULL, jsonb_build_object('module','market_conduct'));
END $$;

-- Publish: locks the report and stages one supervisory letter per in-scope entity
CREATE OR REPLACE FUNCTION public.thematic_report_publish(_report_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev uuid; v_status text; v_review record; v_rep record; v_count integer := 0; r record;
BEGIN
  SELECT * INTO v_rep FROM public.thematic_review_reports WHERE id=_report_id;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE='P0002'; END IF;
  v_rev := v_rep.review_id; v_status := v_rep.status;
  IF NOT public.can_approve_thematic_closure(v_rev) THEN
    RAISE EXCEPTION 'Not authorised to publish this report' USING ERRCODE='42501'; END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved report can be published' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_review FROM public.thematic_reviews WHERE id=v_rev;

  UPDATE public.thematic_review_reports
     SET status='published', published_by=auth.uid(), published_at=now()
   WHERE id=_report_id;

  FOR r IN
    SELECT l.id AS licensee_id, l.name
    FROM public.thematic_review_entities e
    JOIN public.licensees l ON l.id = e.licensee_id
    WHERE e.review_id = v_rev
  LOOP
    INSERT INTO public.thematic_review_letters(
      review_id, report_id, licensee_id, recipient_name, subject, body, status, created_by)
    VALUES (
      v_rev, _report_id, r.licensee_id, r.name,
      concat('Supervisory letter — ', COALESCE(v_review.code,''), ' ', v_review.title),
      concat_ws(E'\n\n',
        'Dear '||r.name||',',
        'Following the conclusion of the thematic review "'||v_review.title||'"'||
          COALESCE(' ('||v_review.code||')','')||', we set out below the findings relevant to your institution and the actions required.',
        'Executive summary:'||E'\n'||COALESCE(v_rep.executive_summary,'See attached report.'),
        'Findings:'||E'\n'||COALESCE((
          SELECT string_agg('- ['||f.severity||'] '||f.title||COALESCE(': '||f.detail,''), E'\n' ORDER BY f.created_at)
          FROM public.thematic_review_findings f
          WHERE f.review_id=v_rev AND (f.licensee_id = r.licensee_id OR f.licensee_id IS NULL)
        ),'No entity-specific findings recorded.'),
        'Required actions:'||E'\n'||COALESCE((
          SELECT string_agg('- '||a.title||COALESCE(' (due '||a.due_date::text||')',''), E'\n' ORDER BY a.due_date NULLS LAST)
          FROM public.thematic_review_actions a
          WHERE a.review_id=v_rev AND (a.licensee_id = r.licensee_id OR a.licensee_id IS NULL)
            AND a.status <> 'cancelled'
        ),'No required actions.'),
        'Please respond with evidence of completion by the dates indicated.',
        'Yours faithfully,'||E'\n'||'Market Conduct Supervision'),
      'pending', auth.uid());
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','thematic_review_report', _report_id::text,
    jsonb_build_object('status',v_status), jsonb_build_object('status','published'),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct','letters_staged',v_count));

  PERFORM public.notification_enqueue_event('thematic_review.report_published','thematic_review', v_rev,
    jsonb_build_object('review_title', v_review.title, 'review_code', COALESCE(v_review.code,''),
                       'report_version', v_rep.version, 'letters', v_count),
    _report_id::text, NULL, NULL);

  RETURN v_count;
END $$;

-- 7. Follow-up register RPCs ------------------------------------------
CREATE OR REPLACE FUNCTION public.thematic_action_record_verification(
  _action_id uuid, _verification_status text, _notes text DEFAULT NULL, _evidence text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_rev uuid;
BEGIN
  SELECT to_jsonb(a), a.review_id INTO v_before, v_rev
  FROM public.thematic_review_actions a WHERE a.id=_action_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_thematic_review(v_rev) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF _verification_status NOT IN ('pending','evidence_received','verified','not_satisfied') THEN
    RAISE EXCEPTION 'Invalid verification status' USING ERRCODE='22023'; END IF;
  IF _verification_status IN ('verified','not_satisfied')
     AND (_notes IS NULL OR length(btrim(_notes)) < 10) THEN
    RAISE EXCEPTION 'Verification notes of at least 10 characters are required' USING ERRCODE='22023'; END IF;
  IF _verification_status IN ('evidence_received','verified')
     AND COALESCE(NULLIF(btrim(COALESCE(_evidence,'')),''),
                  v_before->>'evidence_of_completion') IS NULL THEN
    RAISE EXCEPTION 'Evidence of completion is required' USING ERRCODE='22023'; END IF;

  UPDATE public.thematic_review_actions SET
    verification_status = _verification_status,
    verification_notes  = COALESCE(NULLIF(btrim(COALESCE(_notes,'')),''), verification_notes),
    evidence_of_completion = COALESCE(NULLIF(btrim(COALESCE(_evidence,'')),''), evidence_of_completion),
    verified_by = CASE WHEN _verification_status IN ('verified','not_satisfied') THEN auth.uid() ELSE verified_by END,
    verified_at = CASE WHEN _verification_status IN ('verified','not_satisfied') THEN now() ELSE verified_at END,
    status = CASE WHEN _verification_status='verified' THEN 'completed' ELSE status END,
    completed_at = CASE WHEN _verification_status='verified' THEN now() ELSE completed_at END
  WHERE id=_action_id;

  PERFORM public.log_compliance_audit('UPDATE','thematic_review_action', _action_id::text, v_before,
    (SELECT to_jsonb(a) FROM public.thematic_review_actions a WHERE a.id=_action_id),
    _notes, NULL, NULL, jsonb_build_object('module','market_conduct','event','verification'));
END $$;

CREATE OR REPLACE FUNCTION public.thematic_action_extend_due_date(
  _action_id uuid, _new_due_date date, _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_rev uuid;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'An extension justification of at least 10 characters is required' USING ERRCODE='22023'; END IF;
  IF _new_due_date IS NULL THEN
    RAISE EXCEPTION 'A new due date is required' USING ERRCODE='22023'; END IF;
  SELECT to_jsonb(a), a.review_id INTO v_before, v_rev
  FROM public.thematic_review_actions a WHERE a.id=_action_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_thematic_review(v_rev) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;

  UPDATE public.thematic_review_actions SET
    original_due_date = COALESCE(original_due_date, due_date),
    due_date = _new_due_date,
    extension_reason = btrim(_reason),
    extension_count = extension_count + 1,
    status = CASE WHEN status='overdue' AND _new_due_date >= current_date THEN 'open' ELSE status END
  WHERE id=_action_id;

  PERFORM public.log_compliance_audit('OVERRIDE','thematic_review_action', _action_id::text, v_before,
    (SELECT to_jsonb(a) FROM public.thematic_review_actions a WHERE a.id=_action_id),
    btrim(_reason), NULL, NULL, jsonb_build_object('module','market_conduct','event','due_date_extension'));
END $$;

CREATE OR REPLACE FUNCTION public.thematic_action_set_follow_up(
  _action_id uuid, _follow_up_due_date date DEFAULT NULL,
  _responsible_officer_id uuid DEFAULT NULL, _entity_contact text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_rev uuid;
BEGIN
  SELECT to_jsonb(a), a.review_id INTO v_before, v_rev
  FROM public.thematic_review_actions a WHERE a.id=_action_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_thematic_review(v_rev) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;

  UPDATE public.thematic_review_actions SET
    follow_up_due_date = _follow_up_due_date,
    responsible_officer_id = _responsible_officer_id,
    entity_contact = NULLIF(btrim(COALESCE(_entity_contact,'')),'')
  WHERE id=_action_id;

  PERFORM public.log_compliance_audit('UPDATE','thematic_review_action', _action_id::text, v_before,
    (SELECT to_jsonb(a) FROM public.thematic_review_actions a WHERE a.id=_action_id),
    NULL, NULL, NULL, jsonb_build_object('module','market_conduct','event','follow_up_schedule'));
END $$;

-- 8. Closure approval gate --------------------------------------------
CREATE OR REPLACE FUNCTION public.thematic_review_closure_readiness(_review_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'published_report_id', (SELECT r.id FROM public.thematic_review_reports r
       WHERE r.review_id=_review_id AND r.status='published' ORDER BY r.version DESC LIMIT 1),
    'unverified_actions', (SELECT count(*) FROM public.thematic_review_actions a
       WHERE a.review_id=_review_id AND a.status NOT IN ('waived','cancelled')
         AND a.verification_status <> 'verified'),
    'open_findings', (SELECT count(*) FROM public.thematic_review_findings f
       WHERE f.review_id=_review_id AND f.status='draft'),
    'pending_letters', (SELECT count(*) FROM public.thematic_review_letters l
       WHERE l.review_id=_review_id AND l.status <> 'dispatched')
  )
$$;

CREATE OR REPLACE FUNCTION public.thematic_review_request_closure(
  _review_id uuid,
  _closure_summary text,
  _regulatory_learning jsonb DEFAULT '{}'::jsonb,
  _approver_id uuid DEFAULT NULL,
  _override_id uuid DEFAULT NULL,
  _override_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ready jsonb; v_review record;
BEGIN
  SELECT * INTO v_review FROM public.thematic_reviews WHERE id=_review_id;
  IF v_review IS NULL THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_thematic_review(_review_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  IF v_review.status = 'closed' THEN
    RAISE EXCEPTION 'Review is already closed' USING ERRCODE='22023'; END IF;
  IF v_review.closure_state = 'pending_approval' THEN
    RAISE EXCEPTION 'Closure approval is already pending' USING ERRCODE='22023'; END IF;
  IF _closure_summary IS NULL OR length(btrim(_closure_summary)) < 20 THEN
    RAISE EXCEPTION 'A closure summary of at least 20 characters is required' USING ERRCODE='22023'; END IF;

  v_ready := public.thematic_review_closure_readiness(_review_id);

  IF (v_ready->>'published_report_id') IS NULL THEN
    RAISE EXCEPTION 'A published report is required before closure can be requested' USING ERRCODE='22023';
  END IF;

  IF (v_ready->>'unverified_actions')::int > 0 THEN
    IF _override_id IS NULL OR _override_reason IS NULL OR length(btrim(_override_reason)) < 10 THEN
      RAISE EXCEPTION 'Closure blocked: % required action(s) are not verified. A documented override is needed.',
        (v_ready->>'unverified_actions') USING ERRCODE='22023';
    END IF;
  END IF;

  UPDATE public.thematic_reviews SET
    closure_state='pending_approval',
    closure_summary=btrim(_closure_summary),
    regulatory_learning=COALESCE(_regulatory_learning,'{}'::jsonb),
    closure_approver_id=_approver_id,
    closure_requested_by=auth.uid(),
    closure_requested_at=now(),
    closure_rejection_reason=NULL,
    closure_override_id=_override_id
  WHERE id=_review_id;

  INSERT INTO public.thematic_review_status_history(review_id, from_status, to_status, changed_by, reason, override_id, metadata)
  VALUES (_review_id, v_review.status, v_review.status, auth.uid(),
          COALESCE(_override_reason,'Closure requested'), _override_id,
          jsonb_build_object('event','closure_requested','readiness',v_ready));

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','thematic_review', _review_id::text,
    jsonb_build_object('closure_state', v_review.closure_state),
    jsonb_build_object('closure_state','pending_approval'),
    COALESCE(_override_reason, btrim(_closure_summary)), NULL, NULL,
    jsonb_build_object('module','market_conduct','readiness',v_ready,'approver_id',_approver_id));

  PERFORM public.notification_enqueue_event('thematic_review.closure_requested','thematic_review', _review_id,
    jsonb_build_object('review_title', v_review.title, 'review_code', COALESCE(v_review.code,''),
                       'approver_id', _approver_id, 'closure_summary', btrim(_closure_summary)),
    'closure', NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.thematic_review_approve_closure(_review_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_review record;
BEGIN
  SELECT * INTO v_review FROM public.thematic_reviews WHERE id=_review_id;
  IF v_review IS NULL THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  IF v_review.closure_state <> 'pending_approval' THEN
    RAISE EXCEPTION 'This review is not awaiting closure approval' USING ERRCODE='22023'; END IF;
  IF NOT public.can_approve_thematic_closure(_review_id) THEN
    RAISE EXCEPTION 'Not authorised to approve closure' USING ERRCODE='42501'; END IF;
  IF v_review.closure_requested_by = auth.uid() AND NOT has_role(auth.uid(),'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Closure must be approved by someone other than the requester' USING ERRCODE='42501'; END IF;

  UPDATE public.thematic_reviews SET
    closure_state='approved', closure_approved_by=auth.uid(), closure_approved_at=now(),
    status='closed', closed_at=now()
  WHERE id=_review_id;

  PERFORM public.log_compliance_audit('APPROVE','thematic_review', _review_id::text,
    jsonb_build_object('status', v_review.status, 'closure_state','pending_approval'),
    jsonb_build_object('status','closed','closure_state','approved'),
    _note, NULL, NULL, jsonb_build_object('module','market_conduct'));

  PERFORM public.notification_enqueue_event('thematic_review.closure_approved','thematic_review', _review_id,
    jsonb_build_object('review_title', v_review.title, 'review_code', COALESCE(v_review.code,''),
                       'requested_by', v_review.closure_requested_by),
    'closure', NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.thematic_review_reject_closure(_review_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_review record;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'A rejection reason of at least 10 characters is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_review FROM public.thematic_reviews WHERE id=_review_id;
  IF v_review IS NULL THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  IF v_review.closure_state <> 'pending_approval' THEN
    RAISE EXCEPTION 'This review is not awaiting closure approval' USING ERRCODE='22023'; END IF;
  IF NOT public.can_approve_thematic_closure(_review_id) THEN
    RAISE EXCEPTION 'Not authorised to reject closure' USING ERRCODE='42501'; END IF;

  UPDATE public.thematic_reviews SET
    closure_state='rejected', closure_rejection_reason=btrim(_reason)
  WHERE id=_review_id;

  INSERT INTO public.thematic_review_status_history(review_id, from_status, to_status, changed_by, reason, metadata)
  VALUES (_review_id, v_review.status, v_review.status, auth.uid(), btrim(_reason),
          jsonb_build_object('event','closure_rejected'));

  PERFORM public.log_compliance_audit('REJECT','thematic_review', _review_id::text,
    jsonb_build_object('closure_state','pending_approval'),
    jsonb_build_object('closure_state','rejected'),
    btrim(_reason), NULL, NULL, jsonb_build_object('module','market_conduct'));

  PERFORM public.notification_enqueue_event('thematic_review.closure_rejected','thematic_review', _review_id,
    jsonb_build_object('review_title', v_review.title, 'review_code', COALESCE(v_review.code,''),
                       'reason', btrim(_reason), 'requested_by', v_review.closure_requested_by),
    'closure', NULL, NULL);
END $$;

-- 9. Function grants ---------------------------------------------------
REVOKE ALL ON FUNCTION public.thematic_report_upsert_draft(uuid,uuid,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.thematic_report_upsert_draft(uuid,uuid,text,text,text,text,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_report_submit_for_approval(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_report_approve(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_report_reject(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_report_publish(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_action_record_verification(uuid,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_action_extend_due_date(uuid,date,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_action_set_follow_up(uuid,date,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_review_closure_readiness(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_review_request_closure(uuid,text,jsonb,uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_review_approve_closure(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thematic_review_reject_closure(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_thematic_review(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_approve_thematic_closure(uuid) TO authenticated, service_role;
