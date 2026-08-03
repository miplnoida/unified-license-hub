-- =====================================================================
-- NOT-ESC-001 — Shared escalation model (Phase 1: schema + rules)
-- =====================================================================

-- 1. Enums ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.escalation_type AS ENUM (
    'sla_warning','sla_breach','threshold_breach','fp_adverse_finding',
    'pattern_alert','overdue_condition','investigation_delay','workflow_blockage',
    'integration_failure','scheduler_failure','notification_delivery_failure',
    'system_health_alert'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.escalation_status AS ENUM (
    'open','acknowledged','in_progress','escalated','resolved','closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.escalation_severity AS ENUM ('critical','high','medium','low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Reference sequence ----------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.escalation_ref_seq;

-- 3. Rules table ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  source_module text NOT NULL,
  escalation_type public.escalation_type NOT NULL,
  default_severity public.escalation_severity NOT NULL DEFAULT 'medium',
  initial_recipient_role text NOT NULL,
  tier1_recipient_role text,
  tier1_ack_threshold_minutes integer,
  tier1_template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  tier1_channels text[] NOT NULL DEFAULT ARRAY['in_app','email'],
  tier2_recipient_role text,
  tier2_ack_threshold_minutes integer,
  tier2_template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  tier2_channels text[] NOT NULL DEFAULT ARRAY['in_app','email'],
  tier3_recipient_role text,
  tier3_ack_threshold_minutes integer,
  tier3_template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  tier3_channels text[] NOT NULL DEFAULT ARRAY['in_app','email'],
  resolution_threshold_minutes integer,
  pause_on_acknowledgement boolean NOT NULL DEFAULT true,
  business_hours_only boolean NOT NULL DEFAULT false,
  business_calendar_profile_id uuid REFERENCES public.business_calendar_profiles(id) ON DELETE SET NULL,
  create_task boolean NOT NULL DEFAULT false,
  create_case boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_module, escalation_type, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalation_rules TO authenticated;
GRANT ALL ON public.escalation_rules TO service_role;
ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escalation_rules_read" ON public.escalation_rules
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE POLICY "escalation_rules_write" ON public.escalation_rules
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'escalation_management', 'configure'))
  WITH CHECK (public.has_permission(auth.uid(), 'escalation_management', 'configure'));

-- Tier validation: every configured tier needs a recipient; thresholds positive;
-- tiers must be contiguous.
CREATE OR REPLACE FUNCTION public.tg_validate_escalation_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(btrim(NEW.initial_recipient_role), '') = '' THEN
    RAISE EXCEPTION 'escalation_rule_invalid: initial recipient role is required';
  END IF;

  -- thresholds must be positive when present
  IF NEW.tier1_ack_threshold_minutes IS NOT NULL AND NEW.tier1_ack_threshold_minutes <= 0
     OR NEW.tier2_ack_threshold_minutes IS NOT NULL AND NEW.tier2_ack_threshold_minutes <= 0
     OR NEW.tier3_ack_threshold_minutes IS NOT NULL AND NEW.tier3_ack_threshold_minutes <= 0
     OR NEW.resolution_threshold_minutes IS NOT NULL AND NEW.resolution_threshold_minutes <= 0 THEN
    RAISE EXCEPTION 'escalation_rule_invalid: thresholds must be positive';
  END IF;

  -- a configured tier (threshold OR recipient) must have both
  IF (NEW.tier1_recipient_role IS NOT NULL) <> (NEW.tier1_ack_threshold_minutes IS NOT NULL) THEN
    RAISE EXCEPTION 'escalation_rule_invalid: tier 1 requires both a recipient role and an acknowledgement threshold';
  END IF;
  IF (NEW.tier2_recipient_role IS NOT NULL) <> (NEW.tier2_ack_threshold_minutes IS NOT NULL) THEN
    RAISE EXCEPTION 'escalation_rule_invalid: tier 2 requires both a recipient role and an acknowledgement threshold';
  END IF;
  IF (NEW.tier3_recipient_role IS NOT NULL) <> (NEW.tier3_ack_threshold_minutes IS NOT NULL) THEN
    RAISE EXCEPTION 'escalation_rule_invalid: tier 3 requires both a recipient role and an acknowledgement threshold';
  END IF;

  -- contiguity: cannot configure tier N without tier N-1
  IF NEW.tier2_recipient_role IS NOT NULL AND NEW.tier1_recipient_role IS NULL THEN
    RAISE EXCEPTION 'escalation_rule_invalid: tier 2 configured without tier 1';
  END IF;
  IF NEW.tier3_recipient_role IS NOT NULL AND NEW.tier2_recipient_role IS NULL THEN
    RAISE EXCEPTION 'escalation_rule_invalid: tier 3 configured without tier 2';
  END IF;

  IF NEW.business_hours_only AND NEW.business_calendar_profile_id IS NULL THEN
    SELECT id INTO NEW.business_calendar_profile_id
    FROM public.business_calendar_profiles WHERE is_default LIMIT 1;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_escalation_rule ON public.escalation_rules;
CREATE TRIGGER trg_validate_escalation_rule
  BEFORE INSERT OR UPDATE ON public.escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_escalation_rule();

-- 4. Escalation spine -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_ref text NOT NULL UNIQUE,
  source_module text NOT NULL,
  source_event text NOT NULL,
  source_rule_id uuid,
  source_entity_type text,
  source_entity_id uuid,
  source_reference text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  escalation_type public.escalation_type NOT NULL,
  severity public.escalation_severity NOT NULL DEFAULT 'medium',
  current_tier integer NOT NULL DEFAULT 0,
  status public.escalation_status NOT NULL DEFAULT 'open',

  rule_id uuid REFERENCES public.escalation_rules(id) ON DELETE SET NULL,
  assigned_role text,
  assigned_user_id uuid,

  acknowledgement_deadline timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolution_deadline timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  auto_escalate_paused_at timestamptz,
  next_auto_escalation_at timestamptz,

  root_cause text,
  resolution_narrative text,

  regulator_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escalations_tier_range CHECK (current_tier BETWEEN 0 AND 3)
);

CREATE INDEX IF NOT EXISTS idx_escalations_status ON public.escalations (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalations_module ON public.escalations (source_module, escalation_type);
CREATE INDEX IF NOT EXISTS idx_escalations_assignee ON public.escalations (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_escalations_source ON public.escalations (source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_escalations_sweep ON public.escalations (next_auto_escalation_at)
  WHERE status IN ('open','acknowledged','in_progress','escalated');

-- Idempotency for automated raises: one open escalation per source signal + tier
CREATE UNIQUE INDEX IF NOT EXISTS uq_escalations_open_signal
  ON public.escalations (source_module, source_event, coalesce(source_entity_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(source_rule_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('open','acknowledged','in_progress','escalated');

-- module-access helper (permission-module isolation)
CREATE OR REPLACE FUNCTION public.has_module_access_for_escalation(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.permission_modules m
    JOIN public.permission_actions a ON a.module_id = m.id
    WHERE m.key = _module
      AND public.has_permission(_user_id, m.key, a.key)
    LIMIT 1
  );
$$;

REVOKE ALL ON FUNCTION public.has_module_access_for_escalation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_module_access_for_escalation(uuid, text) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON public.escalations TO authenticated;
GRANT ALL ON public.escalations TO service_role;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escalations_read" ON public.escalations
  FOR SELECT TO authenticated
  USING (
    public.is_internal_staff(auth.uid())
    AND (
      public.has_permission(auth.uid(), 'escalation_management', 'view')
      OR assigned_user_id = auth.uid()
      OR created_by = auth.uid()
      OR public.has_module_access_for_escalation(auth.uid(), source_module)
    )
  );

-- Writes flow exclusively through SECURITY DEFINER RPCs.
CREATE POLICY "escalations_no_direct_write" ON public.escalations
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

-- reference generator
CREATE OR REPLACE FUNCTION public.tg_escalation_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.escalation_ref IS NULL OR btrim(NEW.escalation_ref) = '' THEN
    NEW.escalation_ref := 'ESC-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.escalation_ref_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_escalation_ref ON public.escalations;
CREATE TRIGGER trg_escalation_ref BEFORE INSERT ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalation_ref();

-- resolution narrative + immutability-of-outcome guard
CREATE OR REPLACE FUNCTION public.tg_escalation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('resolved','closed') THEN
    IF coalesce(length(btrim(NEW.resolution_narrative)), 0) < 50 THEN
      RAISE EXCEPTION 'resolution_narrative_too_short: at least 50 characters are required';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- immutable identity / source linkage
    IF NEW.escalation_ref <> OLD.escalation_ref
       OR NEW.source_module <> OLD.source_module
       OR NEW.source_event <> OLD.source_event
       OR coalesce(NEW.source_entity_id, '00000000-0000-0000-0000-000000000000') <> coalesce(OLD.source_entity_id, '00000000-0000-0000-0000-000000000000')
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'escalation_identity_immutable';
    END IF;
    -- tier may never move backwards
    IF NEW.current_tier < OLD.current_tier THEN
      RAISE EXCEPTION 'escalation_tier_cannot_regress';
    END IF;
    -- resolved/closed records are terminal
    IF OLD.status IN ('resolved','closed') AND NEW.status NOT IN ('resolved','closed') THEN
      RAISE EXCEPTION 'escalation_is_terminal';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_escalation_guard ON public.escalations;
CREATE TRIGGER trg_escalation_guard BEFORE INSERT OR UPDATE ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalation_guard();

CREATE OR REPLACE FUNCTION public.tg_escalation_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'escalation_history_immutable: records cannot be deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_escalations_no_delete ON public.escalations;
CREATE TRIGGER trg_escalations_no_delete BEFORE DELETE ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalation_no_delete();

-- 5. Append-only history tables ---------------------------------------
CREATE TABLE IF NOT EXISTS public.escalation_tier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES public.escalations(id) ON DELETE RESTRICT,
  from_tier integer,
  to_tier integer NOT NULL,
  trigger_source text NOT NULL DEFAULT 'automatic',
  recipient_role text,
  reason text,
  acknowledgement_deadline timestamptz,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.escalation_ownership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES public.escalations(id) ON DELETE RESTRICT,
  from_user_id uuid,
  to_user_id uuid,
  from_role text,
  to_role text,
  event_type text NOT NULL,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.escalation_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES public.escalations(id) ON DELETE RESTRICT,
  tier integer,
  event_key text,
  recipient_role text,
  recipient_user_id uuid,
  channel text,
  outcome text NOT NULL DEFAULT 'queued',
  dispatch_log_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esc_tier_events ON public.escalation_tier_events (escalation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_esc_owner_events ON public.escalation_ownership_events (escalation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_esc_notif_events ON public.escalation_notification_events (escalation_id, created_at);

GRANT SELECT ON public.escalation_tier_events TO authenticated;
GRANT SELECT ON public.escalation_ownership_events TO authenticated;
GRANT SELECT ON public.escalation_notification_events TO authenticated;
GRANT ALL ON public.escalation_tier_events TO service_role;
GRANT ALL ON public.escalation_ownership_events TO service_role;
GRANT ALL ON public.escalation_notification_events TO service_role;

ALTER TABLE public.escalation_tier_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_ownership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "esc_tier_events_read" ON public.escalation_tier_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.escalations e WHERE e.id = escalation_id));

CREATE POLICY "esc_owner_events_read" ON public.escalation_ownership_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.escalations e WHERE e.id = escalation_id));

CREATE POLICY "esc_notif_events_read" ON public.escalation_notification_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.escalations e WHERE e.id = escalation_id));

-- Immutability guards on all three history tables
CREATE OR REPLACE FUNCTION public.tg_escalation_history_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'escalation_history_immutable: % rows cannot be modified or deleted', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_esc_tier_immutable ON public.escalation_tier_events;
CREATE TRIGGER trg_esc_tier_immutable BEFORE UPDATE OR DELETE ON public.escalation_tier_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalation_history_immutable();

DROP TRIGGER IF EXISTS trg_esc_owner_immutable ON public.escalation_ownership_events;
CREATE TRIGGER trg_esc_owner_immutable BEFORE UPDATE OR DELETE ON public.escalation_ownership_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalation_history_immutable();

DROP TRIGGER IF EXISTS trg_esc_notif_immutable ON public.escalation_notification_events;
CREATE TRIGGER trg_esc_notif_immutable BEFORE DELETE ON public.escalation_notification_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_escalation_history_immutable();

-- 6. Business-calendar deadline helper --------------------------------
CREATE OR REPLACE FUNCTION public.escalation_business_deadline(
  _profile_id uuid,
  _from timestamptz,
  _minutes integer
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prof public.business_calendar_profiles;
  v_cursor timestamptz := _from;
  v_remaining integer := greatest(coalesce(_minutes, 0), 0);
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_available integer;
  v_guard integer := 0;
BEGIN
  IF _minutes IS NULL OR _minutes <= 0 THEN RETURN _from; END IF;

  SELECT * INTO v_prof FROM public.business_calendar_profiles WHERE id = _profile_id;
  IF v_prof.id IS NULL THEN
    RETURN _from + make_interval(mins => _minutes);
  END IF;

  WHILE v_remaining > 0 AND v_guard < 400 LOOP
    v_guard := v_guard + 1;
    v_day_start := date_trunc('day', v_cursor) + v_prof.working_start_time;
    v_day_end   := date_trunc('day', v_cursor) + v_prof.working_end_time;

    IF NOT (to_char(v_cursor, 'FMDay') = ANY (v_prof.working_days))
       AND NOT (lower(to_char(v_cursor, 'FMDay')) = ANY (SELECT lower(unnest(v_prof.working_days))))
       OR EXISTS (
         SELECT 1 FROM public.business_calendar_holidays h
         WHERE h.profile_id = v_prof.id AND h.holiday_date = v_cursor::date
       ) THEN
      v_cursor := date_trunc('day', v_cursor) + interval '1 day';
      CONTINUE;
    END IF;

    IF v_cursor < v_day_start THEN v_cursor := v_day_start; END IF;
    IF v_cursor >= v_day_end THEN
      v_cursor := date_trunc('day', v_cursor) + interval '1 day';
      CONTINUE;
    END IF;

    v_available := floor(extract(epoch FROM (v_day_end - v_cursor)) / 60)::int;
    IF v_available >= v_remaining THEN
      RETURN v_cursor + make_interval(mins => v_remaining);
    END IF;
    v_remaining := v_remaining - v_available;
    v_cursor := date_trunc('day', v_cursor) + interval '1 day';
  END LOOP;

  RETURN v_cursor;
END;
$$;

REVOKE ALL ON FUNCTION public.escalation_business_deadline(uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escalation_business_deadline(uuid, timestamptz, integer) TO authenticated, service_role;

-- 7. Module satellite links -------------------------------------------
ALTER TABLE public.complaint_escalation_cases ADD COLUMN IF NOT EXISTS escalation_id uuid REFERENCES public.escalations(id) ON DELETE SET NULL;
ALTER TABLE public.prudential_escalations    ADD COLUMN IF NOT EXISTS escalation_id uuid REFERENCES public.escalations(id) ON DELETE SET NULL;
ALTER TABLE public.coordination_escalations  ADD COLUMN IF NOT EXISTS escalation_id uuid REFERENCES public.escalations(id) ON DELETE SET NULL;
ALTER TABLE public.conduct_alerts            ADD COLUMN IF NOT EXISTS escalation_id uuid REFERENCES public.escalations(id) ON DELETE SET NULL;

-- 8. Permission module -------------------------------------------------
INSERT INTO public.permission_modules (key, label, description, sort_order, is_system, audience)
VALUES ('escalation_management', 'Escalation & Alert Management',
        'Central escalation and alert manager across all supervisory modules', 95, true, 'internal')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system, audience)
SELECT m.id, x.key, x.label, x.description, x.ord, true, 'internal'
FROM public.permission_modules m
CROSS JOIN (VALUES
  ('view','View escalations','View the central escalation register',1),
  ('acknowledge','Acknowledge','Acknowledge an assigned escalation',2),
  ('own','Take ownership','Take ownership of an escalation',3),
  ('escalate','Escalate tier','Manually escalate to the next tier',4),
  ('resolve','Resolve','Resolve or close an escalation',5),
  ('configure','Configure rules','Manage escalation routing rules',6),
  ('view_system_health','System health','View the system health alert tab',7)
) AS x(key,label,description,ord)
WHERE m.key = 'escalation_management'
ON CONFLICT DO NOTHING;

-- 9. Seed default routing rules ---------------------------------------
INSERT INTO public.escalation_rules
  (name, description, source_module, escalation_type, default_severity, initial_recipient_role,
   tier1_recipient_role, tier1_ack_threshold_minutes,
   tier2_recipient_role, tier2_ack_threshold_minutes,
   tier3_recipient_role, tier3_ack_threshold_minutes,
   resolution_threshold_minutes, business_hours_only, is_active)
VALUES
  ('Complaint SLA breach','Complaint past its statutory response deadline','complaint_management','sla_breach','high',
   'licensing_officer','supervisor',480,'admin',1440,'super_admin',2880,4320,true,true),
  ('Complaint consumer-harm escalation','Consumer harm rule fired on a complaint','complaint_management','threshold_breach','critical',
   'supervisor','supervisor',240,'admin',720,'super_admin',1440,2880,false,true),
  ('Prudential threshold breach','Prudential ratio outside its configured threshold','prudential_supervision','threshold_breach','high',
   'analyst','supervisor',480,'admin',1440,'super_admin',2880,4320,true,true),
  ('Workflow SLA warning','Approval step approaching its SLA deadline','workflow_management','sla_warning','medium',
   'licensing_officer','supervisor',480,'admin',1440,NULL,NULL,2880,true,true),
  ('Workflow blockage','Approval step overdue with no action taken','workflow_management','workflow_blockage','high',
   'supervisor','supervisor',480,'admin',1440,'super_admin',2880,4320,true,true),
  ('Fit & proper adverse finding','Adverse screening finding requires senior review','fit_and_proper','fp_adverse_finding','high',
   'analyst','supervisor',480,'admin',1440,'super_admin',2880,4320,false,true),
  ('Market conduct pattern alert','Conduct monitoring detected an adverse pattern','market_conduct','pattern_alert','high',
   'analyst','supervisor',480,'admin',1440,NULL,NULL,4320,false,true),
  ('Overdue licence condition','A licence condition passed its due date','license_management','overdue_condition','medium',
   'licensing_officer','supervisor',720,'admin',2880,NULL,NULL,5760,true,true),
  ('Investigation delay','Investigation task overdue','market_conduct_investigation','investigation_delay','high',
   'supervisor','supervisor',480,'admin',1440,NULL,NULL,4320,true,true),
  ('Coordination escalation','Cross-regulator coordination case escalated','coordination','threshold_breach','high',
   'supervisor','supervisor',480,'admin',1440,'super_admin',2880,4320,false,true),
  ('Integration failure','External integration failing repeatedly','system_health','integration_failure','critical',
   'super_admin','super_admin',30,'super_admin',120,'super_admin',360,720,false,true),
  ('Scheduler failure','Scheduled job did not run as configured','system_health','scheduler_failure','critical',
   'super_admin','super_admin',30,'super_admin',120,'super_admin',360,720,false,true),
  ('Notification delivery failure','Notification queue or provider failing','system_health','notification_delivery_failure','critical',
   'super_admin','super_admin',30,'super_admin',120,'super_admin',360,720,false,true),
  ('System health alert','Background job or platform health degradation','system_health','system_health_alert','critical',
   'super_admin','super_admin',30,'super_admin',120,'super_admin',360,720,false,true)
ON CONFLICT (source_module, escalation_type, name) DO NOTHING;

-- 10. Backfill existing module escalations into the spine -------------
-- Prudential
WITH ins AS (
  INSERT INTO public.escalations
    (source_module, source_event, source_rule_id, source_entity_type, source_entity_id,
     source_reference, escalation_type, severity, current_tier, status, assigned_user_id,
     created_by, created_at, metadata, resolution_narrative, resolved_at, root_cause)
  SELECT 'prudential_supervision',
         'prudential_escalation.' || pe.escalation_type,
         NULL, 'licensee', pe.entity_id,
         l.name,
         'threshold_breach'::public.escalation_type,
         CASE lower(coalesce(pe.priority, 'medium'))
           WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
           WHEN 'low' THEN 'low' ELSE 'medium' END::public.escalation_severity,
         CASE WHEN pe.status = 'under_review' THEN 1 ELSE 0 END,
         CASE pe.status WHEN 'resolved' THEN 'resolved' WHEN 'under_review' THEN 'in_progress' ELSE 'open' END::public.escalation_status,
         NULL::uuid, pe.created_by, pe.created_at,
         jsonb_build_object('migrated_from','prudential_escalations','legacy_id',pe.id,'legacy_type',pe.escalation_type,'reason',pe.reason),
         CASE WHEN pe.status = 'resolved'
              THEN rpad(coalesce(nullif(btrim(concat_ws(' ', pe.decision, pe.outcome)), ''),
                        'Migrated from the legacy prudential escalation register; original decision text was not recorded.'), 50, '.')
              ELSE NULL END,
         CASE WHEN pe.status = 'resolved' THEN coalesce(pe.updated_at, now()) ELSE NULL END,
         nullif(btrim(pe.reason), '')
  FROM public.prudential_escalations pe
  LEFT JOIN public.licensees l ON l.id = pe.entity_id
  WHERE pe.escalation_id IS NULL
  RETURNING id, (metadata->>'legacy_id')::uuid AS legacy_id
)
UPDATE public.prudential_escalations pe
SET escalation_id = ins.id
FROM ins WHERE pe.id = ins.legacy_id;

-- Conduct alerts
WITH ins AS (
  INSERT INTO public.escalations
    (source_module, source_event, source_entity_type, source_entity_id, source_reference,
     escalation_type, severity, current_tier, status, created_at, metadata)
  SELECT 'market_conduct',
         'conduct_alert.' || coalesce(ca.kind, 'pattern') || '#' || left(ca.id::text, 8),
         'licensee', ca.licensee_id, ca.title,
         'pattern_alert'::public.escalation_type,
         CASE lower(coalesce(ca.severity,'medium'))
           WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
           WHEN 'low' THEN 'low' ELSE 'medium' END::public.escalation_severity,
         0,
         CASE WHEN ca.status IN ('closed','resolved','dismissed') THEN 'closed' ELSE 'open' END::public.escalation_status,
         ca.created_at,
         jsonb_build_object('migrated_from','conduct_alerts','legacy_id',ca.id,'legacy_status',ca.status)
  FROM public.conduct_alerts ca
  WHERE ca.escalation_id IS NULL
  RETURNING id, (metadata->>'legacy_id')::uuid AS legacy_id, status
)
UPDATE public.conduct_alerts ca
SET escalation_id = ins.id
FROM ins WHERE ca.id = ins.legacy_id;

-- Complaint escalation cases (compatibility path for future rows)
WITH ins AS (
  INSERT INTO public.escalations
    (source_module, source_event, source_rule_id, source_entity_type, source_entity_id,
     source_reference, escalation_type, severity, current_tier, status, assigned_user_id, created_at, metadata)
  SELECT 'complaint_management',
         'complaint_escalation.' || cec.rule_key,
         cec.rule_id, 'complaint', cec.complaint_id, c.complaint_number,
         'threshold_breach'::public.escalation_type,
         CASE lower(coalesce(cec.severity,'medium'))
           WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
           WHEN 'low' THEN 'low' ELSE 'medium' END::public.escalation_severity,
         0,
         CASE cec.status
           WHEN 'escalated' THEN 'escalated' WHEN 'acknowledged' THEN 'acknowledged'
           WHEN 'dismissed' THEN 'closed' ELSE 'open' END::public.escalation_status,
         cec.assigned_to, cec.triggered_at,
         jsonb_build_object('migrated_from','complaint_escalation_cases','legacy_id',cec.id,
                            'rule_key',cec.rule_key,'rule_label',cec.rule_label,'trigger_reason',cec.trigger_reason)
  FROM public.complaint_escalation_cases cec
  LEFT JOIN public.complaints c ON c.id = cec.complaint_id
  WHERE cec.escalation_id IS NULL
  RETURNING id, (metadata->>'legacy_id')::uuid AS legacy_id
)
UPDATE public.complaint_escalation_cases cec
SET escalation_id = ins.id
FROM ins WHERE cec.id = ins.legacy_id;

-- Seed tier history for backfilled rows
INSERT INTO public.escalation_tier_events (escalation_id, from_tier, to_tier, trigger_source, reason, created_at)
SELECT e.id, NULL, e.current_tier, 'migration',
       'Migrated from ' || (e.metadata->>'migrated_from'), e.created_at
FROM public.escalations e
WHERE e.metadata ? 'migrated_from'
  AND NOT EXISTS (SELECT 1 FROM public.escalation_tier_events t WHERE t.escalation_id = e.id);

-- 11. Compatibility view ----------------------------------------------
CREATE OR REPLACE VIEW public.v_module_escalations
WITH (security_invoker = true) AS
SELECT
  e.id AS escalation_id,
  e.escalation_ref,
  e.source_module,
  e.source_event,
  e.source_entity_type,
  e.source_entity_id,
  e.source_reference,
  e.escalation_type,
  e.severity,
  e.current_tier,
  e.status,
  e.assigned_role,
  e.assigned_user_id,
  e.acknowledgement_deadline,
  e.acknowledged_at,
  e.resolution_deadline,
  e.resolved_at,
  e.root_cause,
  e.resolution_narrative,
  e.correlation_id,
  e.metadata,
  e.created_at,
  e.updated_at
FROM public.escalations e;

GRANT SELECT ON public.v_module_escalations TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_touch_escalation_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
