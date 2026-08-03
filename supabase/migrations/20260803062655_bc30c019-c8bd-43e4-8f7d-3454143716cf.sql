-- Complaints -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_complaint_case_to_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_ref text; v_sev public.escalation_severity;
BEGIN
  IF NEW.escalation_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT complaint_number INTO v_ref FROM public.complaints WHERE id = NEW.complaint_id;
  v_sev := CASE lower(coalesce(NEW.severity::text,'medium'))
             WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
             WHEN 'low' THEN 'low' ELSE 'medium' END::public.escalation_severity;

  v_id := public.escalation_raise(
    'complaint_management',
    'complaint_escalation.' || coalesce(NEW.rule_key, 'manual'),
    'complaint_escalation'::public.escalation_type,
    'complaint', NEW.complaint_id, v_ref, v_sev, NEW.rule_id,
    jsonb_build_object('rule_label', NEW.rule_label, 'trigger_reason', NEW.trigger_reason,
                       'target_tier', NEW.target_tier, 'case_id', NEW.id),
    NULL);

  NEW.escalation_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaint_case_to_escalation ON public.complaint_escalation_cases;
CREATE TRIGGER trg_complaint_case_to_escalation
BEFORE INSERT ON public.complaint_escalation_cases
FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_case_to_escalation();

-- Prudential -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_prudential_escalation_to_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_ref text;
BEGIN
  IF NEW.escalation_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT name INTO v_ref FROM public.licensees WHERE id = NEW.entity_id;

  v_id := public.escalation_raise(
    'prudential_supervision',
    'prudential_escalation.' || coalesce(NEW.escalation_type, 'review'),
    'prudential_breach'::public.escalation_type,
    'licensee', NEW.entity_id, v_ref,
    CASE lower(coalesce(NEW.priority,'medium'))
      WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
      WHEN 'low' THEN 'low' ELSE 'medium' END::public.escalation_severity,
    NULL,
    jsonb_build_object('reason', NEW.reason, 'related_type', NEW.related_type,
                       'related_id', NEW.related_id, 'legacy_id', NEW.id),
    NULL);

  NEW.escalation_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prudential_escalation_to_escalation ON public.prudential_escalations;
CREATE TRIGGER trg_prudential_escalation_to_escalation
BEFORE INSERT ON public.prudential_escalations
FOR EACH ROW EXECUTE FUNCTION public.trg_prudential_escalation_to_escalation();

-- Conduct alerts -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_conduct_alert_to_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_ref text;
BEGIN
  IF NEW.escalation_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT name INTO v_ref FROM public.licensees WHERE id = NEW.licensee_id;

  v_id := public.escalation_raise(
    'market_conduct',
    'conduct_alert.' || coalesce(NEW.kind, 'pattern') || '#' || left(NEW.id::text, 8),
    'conduct_alert'::public.escalation_type,
    'licensee', NEW.licensee_id, coalesce(v_ref, NEW.title),
    CASE lower(coalesce(NEW.severity::text,'medium'))
      WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
      WHEN 'low' THEN 'low' ELSE 'medium' END::public.escalation_severity,
    NEW.triage_rule_id,
    jsonb_build_object('title', NEW.title, 'detail', NEW.detail, 'kind', NEW.kind,
                       'source', NEW.source, 'legacy_id', NEW.id),
    NULL);

  NEW.escalation_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conduct_alert_to_escalation ON public.conduct_alerts;
CREATE TRIGGER trg_conduct_alert_to_escalation
BEFORE INSERT ON public.conduct_alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_conduct_alert_to_escalation();

-- Coordination ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_coordination_escalation_to_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NEW.escalation_id IS NOT NULL THEN RETURN NEW; END IF;

  v_id := public.escalation_raise(
    'coordination',
    'coordination_escalation.tier' || coalesce(NEW.tier::text, '1') || '#' || left(NEW.id::text, 8),
    'coordination_escalation'::public.escalation_type,
    'coordination_case', NEW.case_id, NULL, NULL, NULL,
    jsonb_build_object('reason', NEW.reason, 'tier', NEW.tier, 'legacy_id', NEW.id),
    NULL);

  NEW.escalation_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coordination_escalation_to_escalation ON public.coordination_escalations;
CREATE TRIGGER trg_coordination_escalation_to_escalation
BEFORE INSERT ON public.coordination_escalations
FOR EACH ROW EXECUTE FUNCTION public.trg_coordination_escalation_to_escalation();

-- Keep the shared entry in step when the source record closes ----------
CREATE OR REPLACE FUNCTION public.trg_source_close_syncs_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_closed boolean;
BEGIN
  IF NEW.escalation_id IS NULL THEN RETURN NEW; END IF;

  v_closed := CASE TG_TABLE_NAME
    WHEN 'complaint_escalation_cases' THEN NEW.status::text IN ('dismissed','escalated','resolved','closed')
    WHEN 'prudential_escalations' THEN NEW.status::text IN ('resolved','closed')
    WHEN 'conduct_alerts' THEN NEW.status::text IN ('closed','dismissed','resolved')
    WHEN 'coordination_escalations' THEN NEW.status::text IN ('resolved','closed')
    ELSE false END;

  IF v_closed THEN
    UPDATE public.escalations
    SET status = 'resolved',
        resolved_at = coalesce(resolved_at, now()),
        resolution_narrative = coalesce(resolution_narrative,
          'Closed in the source module (' || TG_TABLE_NAME || '). See the source record for the full outcome and rationale.'),
        next_auto_escalation_at = NULL
    WHERE id = NEW.escalation_id
      AND status NOT IN ('resolved','closed');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_esc_complaint ON public.complaint_escalation_cases;
CREATE TRIGGER trg_sync_esc_complaint AFTER UPDATE OF status ON public.complaint_escalation_cases
FOR EACH ROW EXECUTE FUNCTION public.trg_source_close_syncs_escalation();

DROP TRIGGER IF EXISTS trg_sync_esc_prudential ON public.prudential_escalations;
CREATE TRIGGER trg_sync_esc_prudential AFTER UPDATE OF status ON public.prudential_escalations
FOR EACH ROW EXECUTE FUNCTION public.trg_source_close_syncs_escalation();

DROP TRIGGER IF EXISTS trg_sync_esc_conduct ON public.conduct_alerts;
CREATE TRIGGER trg_sync_esc_conduct AFTER UPDATE OF status ON public.conduct_alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_source_close_syncs_escalation();

DROP TRIGGER IF EXISTS trg_sync_esc_coordination ON public.coordination_escalations;
CREATE TRIGGER trg_sync_esc_coordination AFTER UPDATE OF status ON public.coordination_escalations
FOR EACH ROW EXECUTE FUNCTION public.trg_source_close_syncs_escalation();
