
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS intake_source text,
  ADD COLUMN IF NOT EXISTS internal_created_by uuid;
ALTER TABLE public.conduct_alerts
  ADD COLUMN IF NOT EXISTS closure_reason text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.conduct_actions
  ADD COLUMN IF NOT EXISTS waiver_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS completion_notes text,
  ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.conduct_risk_categories
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.mc_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.conduct_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  source_type text NOT NULL,
  source_id uuid,
  licensee_id uuid,
  product_id uuid,
  allegation text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  severity text NOT NULL DEFAULT 'medium',
  assigned_investigator uuid,
  status text NOT NULL DEFAULT 'opened',
  due_date date,
  outcome text,
  closure_reason text,
  opened_by uuid,
  closed_by uuid,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_investigations TO authenticated;
GRANT ALL ON public.conduct_investigations TO service_role;
ALTER TABLE public.conduct_investigations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ci_read" ON public.conduct_investigations;
CREATE POLICY "ci_read" ON public.conduct_investigations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
DROP POLICY IF EXISTS "ci_write" ON public.conduct_investigations;
CREATE POLICY "ci_write" ON public.conduct_investigations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
DROP TRIGGER IF EXISTS trg_ci_u ON public.conduct_investigations;
CREATE TRIGGER trg_ci_u BEFORE UPDATE ON public.conduct_investigations FOR EACH ROW EXECUTE FUNCTION public.mc_set_updated_at();

CREATE TABLE IF NOT EXISTS public.conduct_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  evidence_type text NOT NULL DEFAULT 'document',
  file_url text,
  file_id uuid,
  description text,
  source text,
  restricted boolean NOT NULL DEFAULT false,
  confidentiality_level text NOT NULL DEFAULT 'internal',
  complaint_id uuid,
  investigation_id uuid REFERENCES public.conduct_investigations(id) ON DELETE SET NULL,
  thematic_review_id uuid,
  alert_id uuid,
  action_id uuid,
  entity_id uuid,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_evidence TO authenticated;
GRANT ALL ON public.conduct_evidence TO service_role;
ALTER TABLE public.conduct_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ce_read" ON public.conduct_evidence;
CREATE POLICY "ce_read" ON public.conduct_evidence FOR SELECT TO authenticated
  USING (
    (restricted = false AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor')))
    OR (restricted = true AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')))
  );
DROP POLICY IF EXISTS "ce_write" ON public.conduct_evidence;
CREATE POLICY "ce_write" ON public.conduct_evidence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
DROP TRIGGER IF EXISTS trg_ce_u ON public.conduct_evidence;
CREATE TRIGGER trg_ce_u BEFORE UPDATE ON public.conduct_evidence FOR EACH ROW EXECUTE FUNCTION public.mc_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_ce_entity ON public.conduct_evidence(entity_id);
CREATE INDEX IF NOT EXISTS idx_ce_investigation ON public.conduct_evidence(investigation_id);
CREATE INDEX IF NOT EXISTS idx_ce_complaint ON public.conduct_evidence(complaint_id);

CREATE TABLE IF NOT EXISTS public.conduct_evidence_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid,
  actor_id uuid,
  action text NOT NULL,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.conduct_evidence_access_log TO authenticated;
GRANT ALL ON public.conduct_evidence_access_log TO service_role;
ALTER TABLE public.conduct_evidence_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ceal_read" ON public.conduct_evidence_access_log;
CREATE POLICY "ceal_read" ON public.conduct_evidence_access_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
DROP POLICY IF EXISTS "ceal_ins" ON public.conduct_evidence_access_log;
CREATE POLICY "ceal_ins" ON public.conduct_evidence_access_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.conduct_monitoring_rule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  executed_by uuid,
  status text NOT NULL DEFAULT 'started',
  matched_count integer NOT NULL DEFAULT 0,
  alerts_created integer NOT NULL DEFAULT 0,
  error text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE ON public.conduct_monitoring_rule_runs TO authenticated;
GRANT ALL ON public.conduct_monitoring_rule_runs TO service_role;
ALTER TABLE public.conduct_monitoring_rule_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cmrr_read" ON public.conduct_monitoring_rule_runs;
CREATE POLICY "cmrr_read" ON public.conduct_monitoring_rule_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'supervisor'));
DROP POLICY IF EXISTS "cmrr_write" ON public.conduct_monitoring_rule_runs;
CREATE POLICY "cmrr_write" ON public.conduct_monitoring_rule_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cmrr_rule ON public.conduct_monitoring_rule_runs(rule_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.log_conduct_evidence_access(
  _evidence_id uuid, _action text, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.conduct_evidence_access_log (evidence_id, actor_id, action, reason)
  VALUES (_evidence_id, auth.uid(), _action, _reason);
END; $$;
REVOKE ALL ON FUNCTION public.log_conduct_evidence_access(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_conduct_evidence_access(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.conduct_entity_profile_summary(_entity_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'complaints_total',   (SELECT count(*) FROM complaints WHERE licensee_id = _entity_id),
    'complaints_open',    (SELECT count(*) FROM complaints WHERE licensee_id = _entity_id AND status NOT IN ('resolved','closed','rejected')),
    'complaints_high',    (SELECT count(*) FROM complaints WHERE licensee_id = _entity_id AND severity IN ('high','critical')),
    'complaints_repeat',  (SELECT count(*) FROM complaints WHERE licensee_id = _entity_id AND coalesce(repeat_complaint_count,0) > 1),
    'alerts_open',        (SELECT count(*) FROM conduct_alerts WHERE licensee_id = _entity_id AND status = 'open'),
    'actions_open',       (SELECT count(*) FROM conduct_actions WHERE entity_id = _entity_id AND status NOT IN ('completed','waived','cancelled')),
    'investigations_open',(SELECT count(*) FROM conduct_investigations WHERE licensee_id = _entity_id AND status <> 'closed'),
    'thematic_reviews',   (SELECT count(*) FROM thematic_review_entities WHERE licensee_id = _entity_id)
  );
$$;
REVOKE ALL ON FUNCTION public.conduct_entity_profile_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_entity_profile_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.conduct_entity_audit_history(_entity_id uuid)
RETURNS TABLE (
  logged_at timestamptz, actor_id uuid, action_type text, object_type text,
  object_id text, justification text, before_value jsonb, after_value jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cal.timestamp AS logged_at, cal.user_id AS actor_id, cal.action_type::text,
         cal.object_type, cal.object_id::text, cal.justification, cal.before_value, cal.after_value
  FROM public.compliance_audit_logs cal
  WHERE cal.object_type IN ('complaint','conduct_alert','conduct_action','conduct_investigation','conduct_evidence','thematic_review','conduct_monitoring_rule','licensee')
    AND (
      cal.object_id = _entity_id::text
      OR cal.object_id IN (SELECT id::text FROM public.complaints WHERE licensee_id = _entity_id)
      OR cal.object_id IN (SELECT id::text FROM public.conduct_alerts WHERE licensee_id = _entity_id)
      OR cal.object_id IN (SELECT id::text FROM public.conduct_actions WHERE entity_id = _entity_id)
      OR cal.object_id IN (SELECT id::text FROM public.conduct_investigations WHERE licensee_id = _entity_id)
    )
  ORDER BY cal.timestamp DESC
  LIMIT 500;
$$;
REVOKE ALL ON FUNCTION public.conduct_entity_audit_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_entity_audit_history(uuid) TO authenticated;

INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, channels, notification_type, is_active)
VALUES
  ('conduct_complaint_created','A new complaint was created','New complaint: {{subject}}','Complaint {{complaint_number}} created for {{entity_name}}.',ARRAY['in_app','email'],'info',true),
  ('conduct_complaint_triaged','A complaint completed triage','Complaint triaged: {{complaint_number}}','Complaint {{complaint_number}} triaged with severity {{severity}}.',ARRAY['in_app'],'info',true),
  ('conduct_high_severity_complaint','A high or critical severity complaint was recorded','High-severity complaint: {{complaint_number}}','Complaint {{complaint_number}} was classified as {{severity}}.',ARRAY['in_app','email'],'warning',true),
  ('conduct_alert_created','A conduct alert was raised','New conduct alert: {{title}}','Conduct alert raised for {{entity_name}}: {{title}}.',ARRAY['in_app','email'],'warning',true),
  ('conduct_alert_acknowledged','A conduct alert was acknowledged','Alert acknowledged: {{title}}','Alert {{alert_id}} acknowledged.',ARRAY['in_app'],'info',true),
  ('conduct_alert_closed','A conduct alert was closed','Alert closed: {{title}}','Alert {{alert_id}} closed. Reason: {{closure_reason}}.',ARRAY['in_app'],'info',true),
  ('conduct_action_assigned','A conduct action was assigned','Action assigned: {{title}}','Conduct action assigned to you: {{title}} — due {{due_date}}.',ARRAY['in_app','email'],'info',true),
  ('conduct_action_overdue','A conduct action is overdue','Action overdue: {{title}}','Action {{title}} is overdue since {{due_date}}.',ARRAY['in_app','email'],'warning',true),
  ('conduct_action_completed','A conduct action was completed','Action completed: {{title}}','Action {{title}} was completed. Outcome: {{outcome}}.',ARRAY['in_app'],'info',true),
  ('conduct_investigation_opened','A conduct investigation was opened','Investigation opened: {{allegation}}','Investigation opened for {{entity_name}}.',ARRAY['in_app','email'],'warning',true),
  ('conduct_investigation_assigned','A conduct investigation was assigned','Investigation assigned to you','You have been assigned to investigation {{investigation_id}}.',ARRAY['in_app','email'],'info',true),
  ('conduct_investigation_closed','A conduct investigation was closed','Investigation closed','Investigation {{investigation_id}} closed. Outcome: {{outcome}}.',ARRAY['in_app'],'info',true),
  ('conduct_thematic_review_created','A thematic review was created','Thematic review created: {{title}}','Thematic review {{title}} created.',ARRAY['in_app'],'info',true),
  ('conduct_thematic_review_assigned','A thematic review was assigned','Thematic review assigned to you','You are the lead officer on thematic review {{title}}.',ARRAY['in_app','email'],'info',true),
  ('conduct_thematic_review_closed','A thematic review was closed','Thematic review closed: {{title}}','Thematic review {{title}} closed.',ARRAY['in_app'],'info',true),
  ('conduct_monitoring_rule_triggered','A monitoring rule fired','Monitoring rule triggered: {{rule_name}}','Monitoring rule {{rule_name}} triggered for {{entity_name}}.',ARRAY['in_app','email'],'warning',true),
  ('conduct_evidence_uploaded','Evidence was uploaded','Evidence uploaded: {{title}}','Evidence uploaded to {{context}}.',ARRAY['in_app'],'info',true),
  ('conduct_evidence_access_denied','Restricted evidence access was denied','Access denied to restricted evidence','Access to restricted evidence {{evidence_id}} was denied.',ARRAY['in_app'],'warning',true)
ON CONFLICT (event_key) DO UPDATE
SET description = EXCLUDED.description,
    title_template = EXCLUDED.title_template,
    message_template = EXCLUDED.message_template,
    channels = EXCLUDED.channels,
    notification_type = EXCLUDED.notification_type,
    is_active = true,
    updated_at = now();
