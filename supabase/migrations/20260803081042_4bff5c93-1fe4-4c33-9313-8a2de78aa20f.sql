CREATE OR REPLACE FUNCTION public.notification_event_config_validate()
RETURNS TABLE (
  event_key text,
  module text,
  severity text,
  category text,
  channels text[],
  recipient_rule_count integer,
  unsupported_rule_types text[],
  has_in_app_or_email boolean,
  templates_bound integer,
  templates_required integer,
  has_trigger_history boolean,
  dedupe_window_seconds integer,
  failure_escalation_configured boolean,
  fallback_allowed boolean,
  issues text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH supported AS (
    SELECT ARRAY[
      'role','user','payload_user','named_user','direct_email','custom_email','admin',
      'applicant','assigned_officer','current_approver','previous_actor','supervisor',
      'next_step_role','regulator_team','sector_regulators','actor_excluded',
      'entity_primary_users','entity_secondary_users',
      'licensee_primary_users','licensee_secondary_users',
      'return_admins','return_regulator_admins','return_entity_users','return_licensee_users',
      'return_sector_regulators','return_submitter',
      'return_workflow_current_step_approvers','return_workflow_next_step_approvers',
      'workflow_step_approvers','previous_workflow_actors','sla_process_team_leads',
      'thread_participants','thread_assigned_officer','record_assignee'
    ]::text[] AS types
  ), base AS (
    SELECT c.*,
      (SELECT count(*) FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(c.recipient_rules) = 'array' THEN c.recipient_rules ELSE '[]'::jsonb END))::int AS rule_count,
      (SELECT coalesce(array_agg(DISTINCT r->>'type'), '{}')
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(c.recipient_rules) = 'array' THEN c.recipient_rules ELSE '[]'::jsonb END) r
        WHERE (r->>'type') IS NOT NULL
          AND NOT ((r->>'type') IN (SELECT unnest(types) FROM supported))) AS bad_types,
      (SELECT count(*) FROM public.notification_event_channel_templates b
         JOIN public.notification_templates t ON t.id = b.template_id
        WHERE b.event_config_id = c.id AND t.status = 'active')::int AS bound,
      (SELECT count(*) FROM unnest(c.channels) x WHERE x IN ('in_app','email'))::int AS required,
      EXISTS (SELECT 1 FROM public.notification_dispatch_log l WHERE l.event_key = c.event_key) AS dispatched
    FROM public.notification_event_configs c
    WHERE c.is_active
  )
  SELECT
    b.event_key, b.module, b.severity::text, b.category::text, b.channels,
    b.rule_count, b.bad_types,
    EXISTS (SELECT 1 FROM unnest(b.channels) x WHERE x IN ('in_app','email')),
    b.bound, b.required, b.dispatched, b.dedupe_window_seconds,
    (b.failure_escalation IS NOT NULL AND b.failure_escalation <> '{}'::jsonb),
    b.fallback_allowed,
    (
      CASE WHEN b.rule_count = 0 THEN ARRAY['no_recipient_rules'] ELSE '{}'::text[] END
      || CASE WHEN array_length(b.bad_types, 1) IS NOT NULL THEN ARRAY['unsupported_rule_type'] ELSE '{}'::text[] END
      || CASE WHEN NOT EXISTS (SELECT 1 FROM unnest(b.channels) x WHERE x IN ('in_app','email')) THEN ARRAY['no_supported_channel'] ELSE '{}'::text[] END
      || CASE WHEN b.bound < b.required AND NOT b.fallback_allowed THEN ARRAY['template_not_bound'] ELSE '{}'::text[] END
      || CASE WHEN b.severity IS NULL THEN ARRAY['severity_missing'] ELSE '{}'::text[] END
      || CASE WHEN b.category IS NULL THEN ARRAY['category_missing'] ELSE '{}'::text[] END
      || CASE WHEN b.system_required AND b.allow_mute THEN ARRAY['mandatory_but_mutable'] ELSE '{}'::text[] END
      || CASE WHEN b.severity IN ('critical','high') AND b.delivery_frequency <> 'immediate' THEN ARRAY['high_severity_digested'] ELSE '{}'::text[] END
      || CASE WHEN b.dedupe_window_seconds < 0 THEN ARRAY['dedupe_window_invalid'] ELSE '{}'::text[] END
      || CASE WHEN NOT b.dispatched THEN ARRAY['no_trigger_history'] ELSE '{}'::text[] END
    )
  FROM base b
  ORDER BY b.event_key;
$$;

REVOKE ALL ON FUNCTION public.notification_event_config_validate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_event_config_validate() TO authenticated, service_role;