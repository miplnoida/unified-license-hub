-- ============================================================
-- PRU-EXM-001 Onsite Examination Lifecycle Management
-- ============================================================

-- ---------- permission helpers ----------
CREATE OR REPLACE FUNCTION public.can_read_examination(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'inspection_management', 'view_all_entities')
    OR public.has_permission(_user_id, 'prudential_supervision', 'view_all_entities')
    OR (
      (public.has_permission(_user_id, 'inspection_management', 'view')
        OR public.has_permission(_user_id, 'prudential_supervision', 'view'))
      AND (_entity_id IS NULL OR public.user_has_entity_assignment(_user_id, _entity_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_examination(_user_id uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_permission(_user_id, 'inspection_management', _action)
      OR public.has_permission(_user_id, 'prudential_supervision', _action)
      OR public.has_permission(_user_id, 'prudential_supervision', 'conduct_onsite_examination');
$$;

REVOKE ALL ON FUNCTION public.can_read_examination(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_act_on_examination(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_examination(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_examination(uuid,text) TO authenticated, service_role;

-- ---------- core table ----------
CREATE TABLE public.examinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  entity_id uuid NOT NULL,
  regulator_id uuid,
  sector_id uuid,
  title text NOT NULL,
  examination_type text NOT NULL DEFAULT 'full_scope',
  stage text NOT NULL DEFAULT 'planned',
  risk_rating text,
  period_under_review_start date,
  period_under_review_end date,
  fieldwork_start date,
  fieldwork_end date,
  lead_examiner_id uuid,
  overall_conclusion text,
  closed_at timestamptz,
  closed_by uuid,
  cancellation_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_examinations_entity ON public.examinations(entity_id);
CREATE INDEX idx_examinations_stage ON public.examinations(stage);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.examinations TO authenticated;
GRANT ALL ON public.examinations TO service_role;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY examinations_read ON public.examinations FOR SELECT TO authenticated
USING (public.can_read_examination(auth.uid(), entity_id)
       OR public.can_current_user_access_licensee(entity_id));
CREATE POLICY examinations_insert ON public.examinations FOR INSERT TO authenticated
WITH CHECK (public.can_act_on_examination(auth.uid(), 'create'));
CREATE POLICY examinations_update ON public.examinations FOR UPDATE TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));
CREATE POLICY examinations_delete ON public.examinations FOR DELETE TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'delete'));

-- ---------- scoping memo ----------
CREATE TABLE public.examination_scoping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  objectives text,
  risk_focus_areas text[] NOT NULL DEFAULT '{}',
  legal_basis text,
  scope_exclusions text,
  budget_days numeric,
  methodology text,
  prepared_by uuid,
  prepared_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  approval_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (examination_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examination_scoping TO authenticated;
GRANT ALL ON public.examination_scoping TO service_role;
ALTER TABLE public.examination_scoping ENABLE ROW LEVEL SECURITY;
CREATE POLICY examination_scoping_read ON public.examination_scoping FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND public.can_read_examination(auth.uid(), e.entity_id)));
CREATE POLICY examination_scoping_write ON public.examination_scoping FOR ALL TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));

-- ---------- team ----------
CREATE TABLE public.examination_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  user_id uuid,
  member_name text NOT NULL,
  team_role text NOT NULL DEFAULT 'examiner',
  allocated_days numeric,
  specialisation text,
  conflict_declared boolean NOT NULL DEFAULT false,
  conflict_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_team_exam ON public.examination_team_members(examination_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examination_team_members TO authenticated;
GRANT ALL ON public.examination_team_members TO service_role;
ALTER TABLE public.examination_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_team_read ON public.examination_team_members FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND public.can_read_examination(auth.uid(), e.entity_id)));
CREATE POLICY exam_team_write ON public.examination_team_members FOR ALL TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));

-- ---------- pre-examination data requests ----------
CREATE TABLE public.examination_data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  item_no integer,
  title text NOT NULL,
  description text,
  data_format text,
  due_date date,
  status text NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  received_at timestamptz,
  entity_response text,
  file_upload_id uuid,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_dr_exam ON public.examination_data_requests(examination_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examination_data_requests TO authenticated;
GRANT ALL ON public.examination_data_requests TO service_role;
ALTER TABLE public.examination_data_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_dr_read ON public.examination_data_requests FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND (public.can_read_examination(auth.uid(), e.entity_id)
       OR (status <> 'draft' AND public.can_current_user_access_licensee(e.entity_id)))));
CREATE POLICY exam_dr_write ON public.examination_data_requests FOR ALL TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));

-- ---------- workpapers ----------
CREATE TABLE public.examination_workpapers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  reference text,
  area text NOT NULL,
  procedure_performed text,
  evidence_reference text,
  conclusion text,
  status text NOT NULL DEFAULT 'draft',
  prepared_by uuid,
  prepared_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  file_upload_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_wp_exam ON public.examination_workpapers(examination_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examination_workpapers TO authenticated;
GRANT ALL ON public.examination_workpapers TO service_role;
ALTER TABLE public.examination_workpapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_wp_read ON public.examination_workpapers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND public.can_read_examination(auth.uid(), e.entity_id)));
CREATE POLICY exam_wp_write ON public.examination_workpapers FOR ALL TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));

-- reviewer must differ from preparer
CREATE OR REPLACE FUNCTION public.examination_workpaper_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reviewed_by IS NOT NULL AND NEW.prepared_by IS NOT NULL
     AND NEW.reviewed_by = NEW.prepared_by THEN
    RAISE EXCEPTION 'workpaper_reviewer_must_differ_from_preparer';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_exam_wp_guard BEFORE INSERT OR UPDATE ON public.examination_workpapers
FOR EACH ROW EXECUTE FUNCTION public.examination_workpaper_guard();

-- ---------- exit meeting ----------
CREATE TABLE public.examination_exit_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  meeting_date timestamptz,
  location text,
  regulator_attendees text[] NOT NULL DEFAULT '{}',
  entity_attendees text[] NOT NULL DEFAULT '{}',
  matters_discussed text,
  entity_initial_response text,
  agreed_timelines text,
  minutes_file_upload_id uuid,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (examination_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examination_exit_meetings TO authenticated;
GRANT ALL ON public.examination_exit_meetings TO service_role;
ALTER TABLE public.examination_exit_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_exit_read ON public.examination_exit_meetings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND public.can_read_examination(auth.uid(), e.entity_id)));
CREATE POLICY exam_exit_write ON public.examination_exit_meetings FOR ALL TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));

-- ---------- reports ----------
CREATE TABLE public.examination_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  title text,
  executive_summary text,
  content text,
  status text NOT NULL DEFAULT 'draft',
  prepared_by uuid,
  prepared_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  issued_at timestamptz,
  response_due_date date,
  management_response text,
  management_response_at timestamptz,
  management_response_by uuid,
  file_upload_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_reports_exam ON public.examination_reports(examination_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examination_reports TO authenticated;
GRANT ALL ON public.examination_reports TO service_role;
ALTER TABLE public.examination_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_reports_read ON public.examination_reports FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND (public.can_read_examination(auth.uid(), e.entity_id)
       OR (issued_at IS NOT NULL AND public.can_current_user_access_licensee(e.entity_id)))));
CREATE POLICY exam_reports_write ON public.examination_reports FOR ALL TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));

CREATE OR REPLACE FUNCTION public.examination_report_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.prepared_by IS NOT NULL
     AND NEW.approved_by = NEW.prepared_by THEN
    RAISE EXCEPTION 'report_approver_must_differ_from_preparer';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_exam_report_guard BEFORE INSERT OR UPDATE ON public.examination_reports
FOR EACH ROW EXECUTE FUNCTION public.examination_report_guard();

-- ---------- findings ----------
CREATE TABLE public.examination_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  workpaper_id uuid REFERENCES public.examination_workpapers(id) ON DELETE SET NULL,
  reference text,
  title text NOT NULL,
  category text,
  severity text NOT NULL DEFAULT 'medium',
  criteria_breached text,
  observation text,
  root_cause text,
  recommendation text,
  entity_response text,
  status text NOT NULL DEFAULT 'open',
  remediation_action_id uuid REFERENCES public.prudential_actions(id) ON DELETE SET NULL,
  target_date date,
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_findings_exam ON public.examination_findings(examination_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examination_findings TO authenticated;
GRANT ALL ON public.examination_findings TO service_role;
ALTER TABLE public.examination_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_findings_read ON public.examination_findings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND public.can_read_examination(auth.uid(), e.entity_id)));
CREATE POLICY exam_findings_write ON public.examination_findings FOR ALL TO authenticated
USING (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'))
WITH CHECK (public.can_act_on_examination(auth.uid(), 'edit') OR public.can_act_on_examination(auth.uid(), 'workflow_action'));

-- ---------- audit events ----------
CREATE TABLE public.examination_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_stage text,
  to_stage text,
  actor_id uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_events_exam ON public.examination_events(examination_id);
GRANT SELECT ON public.examination_events TO authenticated;
GRANT ALL ON public.examination_events TO service_role;
ALTER TABLE public.examination_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_events_read ON public.examination_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = examination_id
  AND public.can_read_examination(auth.uid(), e.entity_id)));

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_examinations_updated BEFORE UPDATE ON public.examinations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exam_scoping_updated BEFORE UPDATE ON public.examination_scoping
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exam_team_updated BEFORE UPDATE ON public.examination_team_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exam_dr_updated BEFORE UPDATE ON public.examination_data_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exam_wp_updated BEFORE UPDATE ON public.examination_workpapers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exam_exit_updated BEFORE UPDATE ON public.examination_exit_meetings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exam_reports_updated BEFORE UPDATE ON public.examination_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_exam_findings_updated BEFORE UPDATE ON public.examination_findings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- reference generator ----------
CREATE OR REPLACE FUNCTION public.examination_set_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seq int;
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    SELECT COALESCE(MAX((regexp_replace(reference, '^EXM-\d{4}-', ''))::int), 0) + 1
      INTO seq
      FROM public.examinations
     WHERE reference LIKE 'EXM-' || to_char(now(), 'YYYY') || '-%';
    NEW.reference := 'EXM-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_exam_reference BEFORE INSERT ON public.examinations
FOR EACH ROW EXECUTE FUNCTION public.examination_set_reference();

-- ---------- stage machine ----------
CREATE OR REPLACE FUNCTION public.examination_transition_stage(
  _examination_id uuid, _to_stage text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exam public.examinations;
  v_allowed text[];
  v_unreviewed int;
  v_open_findings int;
  v_open_actions int;
  v_scope_approved boolean;
  v_lead int;
BEGIN
  IF NOT (public.can_act_on_examination(auth.uid(), 'workflow_action')
          OR public.can_act_on_examination(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_for_examination_workflow';
  END IF;

  SELECT * INTO v_exam FROM public.examinations WHERE id = _examination_id;
  IF v_exam.id IS NULL THEN RAISE EXCEPTION 'examination_not_found'; END IF;

  v_allowed := CASE v_exam.stage
    WHEN 'planned'             THEN ARRAY['scoping','cancelled']
    WHEN 'scoping'             THEN ARRAY['pre_exam_request','cancelled']
    WHEN 'pre_exam_request'    THEN ARRAY['fieldwork','cancelled']
    WHEN 'fieldwork'           THEN ARRAY['exit_meeting','cancelled']
    WHEN 'exit_meeting'        THEN ARRAY['draft_report','cancelled']
    WHEN 'draft_report'        THEN ARRAY['management_response','cancelled']
    WHEN 'management_response'  THEN ARRAY['final_report','draft_report','cancelled']
    WHEN 'final_report'        THEN ARRAY['remediation','closed']
    WHEN 'remediation'         THEN ARRAY['closed']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (_to_stage = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'invalid_stage_transition: % -> %', v_exam.stage, _to_stage;
  END IF;

  IF _to_stage = 'fieldwork' THEN
    SELECT approved_at IS NOT NULL INTO v_scope_approved
      FROM public.examination_scoping WHERE examination_id = _examination_id;
    IF COALESCE(v_scope_approved, false) = false THEN
      RAISE EXCEPTION 'scoping_memo_not_approved';
    END IF;
    SELECT count(*) INTO v_lead FROM public.examination_team_members
     WHERE examination_id = _examination_id AND team_role = 'lead_examiner';
    IF v_lead = 0 THEN RAISE EXCEPTION 'lead_examiner_not_assigned'; END IF;
  END IF;

  IF _to_stage = 'final_report' THEN
    SELECT count(*) INTO v_unreviewed FROM public.examination_workpapers
     WHERE examination_id = _examination_id AND reviewed_at IS NULL;
    IF v_unreviewed > 0 THEN RAISE EXCEPTION 'workpapers_pending_review'; END IF;
    SELECT count(*) INTO v_open_findings FROM public.examination_findings
     WHERE examination_id = _examination_id
       AND status = 'open' AND remediation_action_id IS NULL;
    IF v_open_findings > 0 THEN RAISE EXCEPTION 'findings_without_remediation'; END IF;
  END IF;

  IF _to_stage = 'closed' THEN
    SELECT count(*) INTO v_open_actions
      FROM public.examination_findings f
      JOIN public.prudential_actions a ON a.id = f.remediation_action_id
     WHERE f.examination_id = _examination_id
       AND a.status NOT IN ('completed','closed','waived','cancelled');
    IF v_open_actions > 0 THEN RAISE EXCEPTION 'open_remediation_actions'; END IF;
  END IF;

  UPDATE public.examinations
     SET stage = _to_stage,
         closed_at = CASE WHEN _to_stage = 'closed' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN _to_stage = 'closed' THEN auth.uid() ELSE closed_by END,
         cancellation_reason = CASE WHEN _to_stage = 'cancelled' THEN _notes ELSE cancellation_reason END,
         updated_at = now()
   WHERE id = _examination_id;

  INSERT INTO public.examination_events (examination_id, event_type, from_stage, to_stage, actor_id, notes)
  VALUES (_examination_id, 'stage_change', v_exam.stage, _to_stage, auth.uid(), _notes);

  RETURN jsonb_build_object('ok', true, 'from_stage', v_exam.stage, 'to_stage', _to_stage);
END;
$$;
REVOKE ALL ON FUNCTION public.examination_transition_stage(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_transition_stage(uuid,text,text) TO authenticated, service_role;

-- ---------- workpaper sign-off ----------
CREATE OR REPLACE FUNCTION public.examination_signoff_workpaper(
  _workpaper_id uuid, _role text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wp public.examination_workpapers;
BEGIN
  IF NOT (public.can_act_on_examination(auth.uid(), 'workflow_action')
          OR public.can_act_on_examination(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_for_examination_workflow';
  END IF;
  SELECT * INTO v_wp FROM public.examination_workpapers WHERE id = _workpaper_id;
  IF v_wp.id IS NULL THEN RAISE EXCEPTION 'workpaper_not_found'; END IF;

  IF _role = 'preparer' THEN
    UPDATE public.examination_workpapers
       SET prepared_by = auth.uid(), prepared_at = now(), status = 'prepared', updated_at = now()
     WHERE id = _workpaper_id;
  ELSIF _role = 'reviewer' THEN
    IF v_wp.prepared_at IS NULL THEN RAISE EXCEPTION 'workpaper_not_prepared'; END IF;
    IF v_wp.prepared_by = auth.uid() THEN
      RAISE EXCEPTION 'workpaper_reviewer_must_differ_from_preparer';
    END IF;
    UPDATE public.examination_workpapers
       SET reviewed_by = auth.uid(), reviewed_at = now(), review_notes = _notes,
           status = 'reviewed', updated_at = now()
     WHERE id = _workpaper_id;
  ELSE
    RAISE EXCEPTION 'invalid_signoff_role';
  END IF;

  INSERT INTO public.examination_events (examination_id, event_type, actor_id, notes, metadata)
  VALUES (v_wp.examination_id, 'workpaper_' || _role || '_signoff', auth.uid(), _notes,
          jsonb_build_object('workpaper_id', _workpaper_id, 'area', v_wp.area));

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.examination_signoff_workpaper(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_signoff_workpaper(uuid,text,text) TO authenticated, service_role;

-- ---------- finding -> remediation action ----------
CREATE OR REPLACE FUNCTION public.examination_create_remediation_action(
  _finding_id uuid, _due_date date, _assigned_to uuid DEFAULT NULL,
  _entity_contact text DEFAULT NULL, _description text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_f public.examination_findings;
  v_entity uuid;
  v_action_id uuid;
BEGIN
  IF NOT (public.can_act_on_examination(auth.uid(), 'manage_remediation')
          OR public.can_act_on_examination(auth.uid(), 'workflow_action')
          OR public.can_act_on_examination(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_for_remediation';
  END IF;

  SELECT * INTO v_f FROM public.examination_findings WHERE id = _finding_id;
  IF v_f.id IS NULL THEN RAISE EXCEPTION 'finding_not_found'; END IF;
  IF v_f.remediation_action_id IS NOT NULL THEN RAISE EXCEPTION 'remediation_already_linked'; END IF;

  SELECT entity_id INTO v_entity FROM public.examinations WHERE id = v_f.examination_id;

  INSERT INTO public.prudential_actions (
    entity_id, source_type, source_id, action_type, title, description,
    severity, due_date, assigned_to, entity_contact, status, created_by)
  VALUES (
    v_entity, 'examination_finding', _finding_id, 'remediation_plan',
    v_f.title, COALESCE(_description, v_f.recommendation, v_f.observation),
    v_f.severity, _due_date, _assigned_to, _entity_contact, 'pending', auth.uid())
  RETURNING id INTO v_action_id;

  UPDATE public.examination_findings
     SET remediation_action_id = v_action_id, status = 'remediation_pending',
         target_date = COALESCE(_due_date, target_date), updated_at = now()
   WHERE id = _finding_id;

  INSERT INTO public.examination_events (examination_id, event_type, actor_id, metadata)
  VALUES (v_f.examination_id, 'remediation_action_created', auth.uid(),
          jsonb_build_object('finding_id', _finding_id, 'action_id', v_action_id));

  RETURN jsonb_build_object('ok', true, 'action_id', v_action_id);
END;
$$;
REVOKE ALL ON FUNCTION public.examination_create_remediation_action(uuid,date,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.examination_create_remediation_action(uuid,date,uuid,text,text) TO authenticated, service_role;

-- ---------- permissions registry ----------
INSERT INTO public.permissions (module, name, description)
SELECT 'prudential_supervision', v.name, v.descr
FROM (VALUES
  ('manage_examination', 'Create and edit onsite examinations'),
  ('signoff_workpaper', 'Sign off examination workpapers as reviewer')
) AS v(name, descr)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p
   WHERE p.module = 'prudential_supervision' AND p.name = v.name);