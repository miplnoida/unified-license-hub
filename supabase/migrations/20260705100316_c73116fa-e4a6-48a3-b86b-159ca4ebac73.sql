
-- 1) Signal snapshot column for assessments (idempotent)
ALTER TABLE public.prudential_assessments
  ADD COLUMN IF NOT EXISTS signal_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Replace evaluate_stress_indicators_for_return with sector-aware version
--    returning JSON so callers can react to newly-triggered vs updated events.
DROP FUNCTION IF EXISTS public.evaluate_stress_indicators_for_return(uuid);
CREATE OR REPLACE FUNCTION public.evaluate_stress_indicators_for_return(_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ent_id uuid;
  ent_sector uuid;
  ent_sub uuid;
  new_events jsonb := '[]'::jsonb;
  updated_events jsonb := '[]'::jsonb;
  ind RECORD;
  ratio RECORD;
  match boolean;
  ins_id uuid;
  was_new boolean;
BEGIN
  SELECT rf.entity_id INTO ent_id FROM public.returns_filed rf WHERE rf.id = _return_id;
  IF ent_id IS NULL THEN
    RETURN jsonb_build_object('new_events','[]'::jsonb,'updated_events','[]'::jsonb);
  END IF;
  SELECT l.sector_id, l.sub_sector_id INTO ent_sector, ent_sub FROM public.licensees l WHERE l.id = ent_id;

  FOR ind IN
    SELECT * FROM public.prudential_stress_indicators
    WHERE is_active = true
      AND (sector_id IS NULL OR sector_id = ent_sector)
      AND (sub_sector_id IS NULL OR sub_sector_id = ent_sub)
  LOOP
    FOR ratio IN
      SELECT * FROM public.return_calculated_ratios
      WHERE return_id = _return_id AND ratio_key = ind.metric_key
    LOOP
      match := CASE ind.direction
        WHEN 'gt'  THEN ratio.value >  ind.threshold_value
        WHEN 'gte' THEN ratio.value >= ind.threshold_value
        WHEN 'lt'  THEN ratio.value <  ind.threshold_value
        WHEN 'lte' THEN ratio.value <= ind.threshold_value
        WHEN 'eq'  THEN ratio.value =  ind.threshold_value
        ELSE false END;
      IF match THEN
        -- Detect newness via xmax=0 trick on the RETURNING row
        WITH up AS (
          INSERT INTO public.prudential_stress_events (indicator_id, entity_id, return_id, observed_value)
          VALUES (ind.id, ent_id, _return_id, ratio.value)
          ON CONFLICT (indicator_id, return_id)
          DO UPDATE SET observed_value = EXCLUDED.observed_value
          RETURNING id, (xmax = 0) AS inserted
        )
        SELECT id, inserted INTO ins_id, was_new FROM up;
        IF was_new THEN
          new_events := new_events || jsonb_build_object(
            'event_id', ins_id, 'indicator_id', ind.id, 'metric_key', ind.metric_key,
            'label', ind.label, 'severity', ind.severity, 'observed_value', ratio.value,
            'threshold_value', ind.threshold_value, 'direction', ind.direction,
            'escalate', ind.escalate, 'entity_id', ent_id, 'return_id', _return_id
          );
        ELSE
          updated_events := updated_events || jsonb_build_object(
            'event_id', ins_id, 'indicator_id', ind.id, 'observed_value', ratio.value
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('new_events', new_events, 'updated_events', updated_events);
END $$;
GRANT EXECUTE ON FUNCTION public.evaluate_stress_indicators_for_return(uuid) TO authenticated, service_role;

-- 3) Entity audit history RPC (unions all prudential objects for one entity)
CREATE OR REPLACE FUNCTION public.prudential_entity_audit_history(_entity_id uuid)
RETURNS TABLE(
  entry_id uuid, "timestamp" timestamptz, user_id uuid, user_role text,
  action_type compliance_audit_action, object_type text, object_id text,
  before_value jsonb, after_value jsonb, justification text, metadata jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cal.entry_id, cal."timestamp", cal.user_id, cal.user_role,
         cal.action_type, cal.object_type, cal.object_id,
         cal.before_value, cal.after_value, cal.justification, cal.metadata
    FROM public.compliance_audit_logs cal
   WHERE (cal.object_type = 'licensee' AND cal.object_id = _entity_id::text)
      OR (cal.object_type = 'prudential_assessment'
          AND cal.object_id IN (SELECT id::text FROM public.prudential_assessments WHERE entity_id = _entity_id))
      OR (cal.object_type = 'prudential_action'
          AND cal.object_id IN (SELECT id::text FROM public.prudential_actions WHERE entity_id = _entity_id))
      OR (cal.object_type = 'prudential_escalation'
          AND cal.object_id IN (SELECT id::text FROM public.prudential_escalations WHERE entity_id = _entity_id))
      OR (cal.object_type = 'prudential_stress_event'
          AND cal.object_id IN (SELECT id::text FROM public.prudential_stress_events WHERE entity_id = _entity_id))
   ORDER BY cal."timestamp" DESC
   LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION public.prudential_entity_audit_history(uuid) TO authenticated, service_role;

-- 4) Seed notification event configs for prudential events (idempotent upsert).
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template,
   channels, recipient_rules, notification_type, dedupe_window_seconds, is_active)
VALUES
  ('prudential_return_validation_failed',
    'Return validation failed during prudential evaluation.',
    'Return validation failed: {{entity_name}}',
    'Return {{return_id}} failed validation ({{error_count}} errors).',
    '[Prudential] Return validation failed for {{entity_name}}',
    'Return {{return_id}} for {{entity_name}} failed prudential validation with {{error_count}} error(s) and {{warning_count}} warning(s).',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"},{"type":"sector_regulators"}]'::jsonb,
    'error', 300, true),
  ('prudential_breach_detected',
    'Prudential threshold breach detected.',
    'Threshold breach: {{entity_name}} · {{metric_key}}',
    '{{severity}} breach on {{metric_key}} (value {{value}} vs {{threshold_value}}).',
    '[Prudential] {{severity}} threshold breach for {{entity_name}}',
    'A {{severity}} prudential breach on metric {{metric_key}} was detected for {{entity_name}} (value {{value}} vs threshold {{threshold_value}}).',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"super_admin"},{"type":"role","role":"supervisor"},{"type":"sector_regulators"}]'::jsonb,
    'warning', 300, true),
  ('prudential_assessment_submitted',
    'Prudential assessment submitted for review.',
    'Assessment submitted: {{entity_name}}',
    'A prudential assessment for {{entity_name}} has been submitted for review.',
    '[Prudential] Assessment submitted for {{entity_name}}',
    'Prudential assessment for {{entity_name}} was submitted for review. Rationale: {{rationale}}',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"supervisor"},{"type":"role","role":"admin"}]'::jsonb,
    'info', 60, true),
  ('prudential_assessment_reviewed',
    'Prudential assessment reviewed.',
    'Assessment reviewed: {{entity_name}}',
    'Assessment for {{entity_name}} has been reviewed. Notes: {{review_notes}}',
    '[Prudential] Assessment reviewed for {{entity_name}}',
    'Assessment for {{entity_name}} has been reviewed. Notes: {{review_notes}}',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"admin"},{"type":"role","role":"super_admin"}]'::jsonb,
    'info', 60, true),
  ('prudential_assessment_approved',
    'Prudential assessment approved.',
    'Assessment approved: {{entity_name}} · {{overall_rating}}',
    'Assessment for {{entity_name}} approved with rating {{overall_rating}}.',
    '[Prudential] Assessment approved for {{entity_name}}',
    'Prudential assessment for {{entity_name}} was approved with overall rating {{overall_rating}}.',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"supervisor"},{"type":"role","role":"admin"}]'::jsonb,
    'success', 60, true),
  ('prudential_action_assigned',
    'A prudential remediation action has been assigned.',
    'Action assigned: {{action_title}}',
    'You have been assigned prudential action "{{action_title}}" for {{entity_name}}.',
    '[Prudential] Action assigned: {{action_title}}',
    'You have been assigned prudential action "{{action_title}}" for {{entity_name}}. Severity: {{severity}}.',
    ARRAY['in_app','email'],
    '[{"type":"payload_user","key":"assigned_to"}]'::jsonb,
    'info', 60, true),
  ('prudential_action_overdue',
    'A prudential remediation action is overdue.',
    'Action overdue: {{action_title}}',
    'Prudential action "{{action_title}}" for {{entity_name}} is overdue.',
    '[Prudential] Overdue action: {{action_title}}',
    'Prudential action "{{action_title}}" for {{entity_name}} is overdue.',
    ARRAY['in_app','email'],
    '[{"type":"payload_user","key":"assigned_to"},{"type":"role","role":"supervisor"}]'::jsonb,
    'warning', 3600, true),
  ('prudential_action_completed',
    'Prudential action completed.',
    'Action completed: {{action_title}}',
    'Prudential action "{{action_title}}" for {{entity_name}} has been completed.',
    '[Prudential] Action completed: {{action_title}}',
    'Prudential action "{{action_title}}" for {{entity_name}} has been completed.',
    ARRAY['in_app'],
    '[{"type":"role","role":"supervisor"}]'::jsonb,
    'success', 60, true),
  ('prudential_escalation_created',
    'Prudential escalation created.',
    'Escalation raised: {{entity_name}}',
    'A prudential escalation has been raised for {{entity_name}}. Reason: {{reason}}',
    '[Prudential] Escalation raised for {{entity_name}}',
    'A prudential escalation has been raised for {{entity_name}}. Reason: {{reason}}',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"},{"type":"role","role":"supervisor"}]'::jsonb,
    'warning', 60, true),
  ('prudential_escalation_resolved',
    'Prudential escalation resolved.',
    'Escalation resolved: {{entity_name}}',
    'Prudential escalation for {{entity_name}} resolved. Decision: {{decision}}',
    '[Prudential] Escalation resolved for {{entity_name}}',
    'Prudential escalation for {{entity_name}} resolved. Decision: {{decision}}',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"},{"type":"role","role":"supervisor"}]'::jsonb,
    'success', 60, true),
  ('prudential_stress_indicator_triggered',
    'A prudential stress indicator has been triggered.',
    'Stress indicator triggered: {{label}}',
    'Stress indicator "{{label}}" ({{severity}}) triggered for {{entity_name}} at value {{observed_value}} (threshold {{threshold_value}}).',
    '[Prudential] Stress indicator {{label}} triggered for {{entity_name}}',
    'Stress indicator "{{label}}" ({{severity}}) was triggered for {{entity_name}}. Observed value {{observed_value}} vs threshold {{threshold_value}} on metric {{metric_key}}.',
    ARRAY['in_app','email'],
    '[{"type":"role","role":"super_admin"},{"type":"role","role":"supervisor"},{"type":"sector_regulators"}]'::jsonb,
    'warning', 300, true)
ON CONFLICT (event_key) DO UPDATE SET
  description = EXCLUDED.description,
  title_template = EXCLUDED.title_template,
  message_template = EXCLUDED.message_template,
  email_subject_template = EXCLUDED.email_subject_template,
  email_body_template = EXCLUDED.email_body_template,
  channels = EXCLUDED.channels,
  recipient_rules = EXCLUDED.recipient_rules,
  notification_type = EXCLUDED.notification_type,
  dedupe_window_seconds = EXCLUDED.dedupe_window_seconds,
  is_active = true,
  updated_at = now();
