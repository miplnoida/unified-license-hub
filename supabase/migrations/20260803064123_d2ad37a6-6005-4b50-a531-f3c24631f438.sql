-- Escalation spine ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_escalation_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'escalation_ref', NEW.escalation_ref,
    'escalation_type', NEW.escalation_type,
    'severity', NEW.severity,
    'current_tier', NEW.current_tier,
    'source_module', NEW.source_module,
    'source_reference', COALESCE(NEW.source_reference, NEW.source_entity_id::text),
    'source_entity_type', NEW.source_entity_type,
    'source_entity_id', NEW.source_entity_id,
    'assigned_user_id', NEW.assigned_user_id,
    'acknowledgement_deadline', NEW.acknowledgement_deadline,
    'resolution_deadline', NEW.resolution_deadline,
    'resolution_narrative', NEW.resolution_narrative
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notification_enqueue_event('escalation.created', 'escalation', NEW.id, v_payload,
      'tier' || COALESCE(NEW.current_tier, 0)::text, NEW.correlation_id);
    IF NEW.assigned_user_id IS NOT NULL THEN
      PERFORM public.notification_enqueue_event('escalation.ownership_assigned', 'escalation', NEW.id, v_payload,
        NEW.assigned_user_id::text, NEW.correlation_id);
    END IF;
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.current_tier, 0) > COALESCE(OLD.current_tier, 0) THEN
    PERFORM public.notification_enqueue_event('escalation.tier_advanced', 'escalation', NEW.id, v_payload,
      'tier' || COALESCE(NEW.current_tier, 0)::text, NEW.correlation_id);
  END IF;

  IF NEW.assigned_user_id IS NOT NULL AND NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    PERFORM public.notification_enqueue_event('escalation.ownership_assigned', 'escalation', NEW.id, v_payload,
      NEW.assigned_user_id::text, NEW.correlation_id);
  END IF;

  IF NEW.status IN ('resolved','closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notification_enqueue_event('escalation.resolved', 'escalation', NEW.id, v_payload,
      NEW.status, NEW.correlation_id);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_escalation_notifications_ins ON public.escalations;
CREATE TRIGGER trg_escalation_notifications_ins
  AFTER INSERT ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.trg_escalation_notifications();

DROP TRIGGER IF EXISTS trg_escalation_notifications_upd ON public.escalations;
CREATE TRIGGER trg_escalation_notifications_upd
  AFTER UPDATE ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.trg_escalation_notifications();

-- Complaints ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_complaint_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'complaint_number', NEW.complaint_number,
    'complainant_id', NEW.complainant_id,
    'complainant_email', NEW.email,
    'investigator_id', NEW.investigator_id,
    'entity_id', NEW.licensee_id,
    'priority', NEW.priority,
    'severity', NEW.severity,
    'status', NEW.status,
    'sla_due_at', NEW.sla_due_at,
    'subject', NEW.subject
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notification_enqueue_event('complaint.acknowledged', 'complaint', NEW.id, v_payload, 'intake');
    IF NEW.investigator_id IS NOT NULL THEN
      PERFORM public.notification_enqueue_event('complaint.assigned', 'complaint', NEW.id, v_payload, NEW.investigator_id::text);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.investigator_id IS NOT NULL AND NEW.investigator_id IS DISTINCT FROM OLD.investigator_id THEN
    PERFORM public.notification_enqueue_event('complaint.assigned', 'complaint', NEW.id, v_payload, NEW.investigator_id::text);
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority OR NEW.severity IS DISTINCT FROM OLD.severity THEN
    PERFORM public.notification_enqueue_event('complaint.priority_changed', 'complaint', NEW.id,
      v_payload || jsonb_build_object(
        'old_priority', COALESCE(OLD.priority, OLD.severity),
        'new_priority', COALESCE(NEW.priority, NEW.severity)),
      concat_ws('>', COALESCE(OLD.priority, OLD.severity), COALESCE(NEW.priority, NEW.severity)));
  END IF;

  IF NEW.status IN ('closed','resolved') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notification_enqueue_event('complaint.outcome_released', 'complaint', NEW.id,
      v_payload || jsonb_build_object('outcome', COALESCE(NEW.resolution, NEW.resolution_notes, NEW.closure_reason, NEW.status)),
      NEW.status);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_complaint_notifications_ins ON public.complaints;
CREATE TRIGGER trg_complaint_notifications_ins
  AFTER INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_notifications();

DROP TRIGGER IF EXISTS trg_complaint_notifications_upd ON public.complaints;
CREATE TRIGGER trg_complaint_notifications_upd
  AFTER UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_notifications();

-- Role changes -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_user_role_change_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  v_role text;
  v_change text;
  v_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id; v_role := OLD.role::text; v_change := 'removed';
  ELSE
    v_user := NEW.user_id; v_role := NEW.role::text; v_change := 'granted';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_user;

  PERFORM public.notification_enqueue_event('user.role_changed', 'profile', v_user,
    jsonb_build_object(
      'target_user_id', v_user,
      'target_user_name', COALESCE(v_name, 'user'),
      'change_summary', v_change || ' ' || v_role,
      'actor_name', COALESCE((SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = auth.uid()), 'system')
    ),
    v_change || ':' || v_role || ':' || to_char(now(), 'YYYYMMDDHH24MI'));

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_user_role_change_notification ON public.user_roles;
CREATE TRIGGER trg_user_role_change_notification
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_role_change_notification();

-- Escalation rule administration -------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_escalation_rule_change_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_change text; v_rec record;
BEGIN
  IF TG_OP = 'INSERT' THEN v_change := 'created'; v_rec := NEW;
  ELSIF TG_OP = 'DELETE' THEN v_change := 'deleted'; v_rec := OLD;
  ELSE
    v_rec := NEW;
    v_change := CASE
      WHEN NEW.is_active AND NOT OLD.is_active THEN 'activated'
      WHEN NOT NEW.is_active AND OLD.is_active THEN 'deactivated'
      ELSE 'updated' END;
  END IF;

  PERFORM public.notification_enqueue_event('escalation_rule.changed', 'escalation_rule', v_rec.id,
    jsonb_build_object(
      'rule_name', v_rec.name,
      'change_type', v_change,
      'source_module', v_rec.source_module,
      'actor_name', COALESCE((SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = auth.uid()), 'system')
    ),
    v_change || ':' || to_char(now(), 'YYYYMMDDHH24MI'));

  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_escalation_rule_change_notification ON public.escalation_rules;
CREATE TRIGGER trg_escalation_rule_change_notification
  AFTER INSERT OR UPDATE OR DELETE ON public.escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.trg_escalation_rule_change_notification();

-- Notification template publication ----------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notification_template_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM NEW.status
      OR COALESCE(NEW.published_version, 0) > COALESCE(OLD.published_version, 0)) THEN
    PERFORM public.notification_enqueue_event('notification_template.published', 'notification_template', NEW.id,
      jsonb_build_object(
        'template_name', NEW.name,
        'event_key', NEW.event_key,
        'version', COALESCE(NEW.published_version, NEW.version, 1),
        'actor_name', COALESCE((SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = auth.uid()), 'system')
      ),
      'v' || COALESCE(NEW.published_version, NEW.version, 1)::text);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notification_template_published ON public.notification_templates;
CREATE TRIGGER trg_notification_template_published
  AFTER UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_template_published();

-- Approval workflow publication --------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_workflow_published_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version integer;
BEGIN
  IF NEW.current_published_version_id IS NOT NULL
     AND NEW.current_published_version_id IS DISTINCT FROM OLD.current_published_version_id THEN
    SELECT version_number INTO v_version
      FROM public.approval_workflow_versions WHERE id = NEW.current_published_version_id;
    PERFORM public.notification_enqueue_event('workflow.published', 'approval_workflow', NEW.id,
      jsonb_build_object(
        'workflow_name', NEW.name,
        'entity_type', NEW.entity_type,
        'version', COALESCE(v_version, 1),
        'actor_name', COALESCE((SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = auth.uid()), 'system')
      ),
      NEW.current_published_version_id::text);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_workflow_published_notification ON public.approval_workflows;
CREATE TRIGGER trg_workflow_published_notification
  AFTER UPDATE ON public.approval_workflows
  FOR EACH ROW EXECUTE FUNCTION public.trg_workflow_published_notification();

-- Supervisory plan creation -------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_supervisory_plan_created_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity text;
BEGIN
  SELECT COALESCE(entity_name, legal_name, id::text) INTO v_entity FROM public.licensees WHERE id = NEW.entity_id;
  PERFORM public.notification_enqueue_event('supervisory_plan.created', 'supervisory_plan', NEW.id,
    jsonb_build_object(
      'entity_name', COALESCE(v_entity, 'entity'),
      'entity_id', NEW.entity_id,
      'cycle', to_char(COALESCE(NEW.created_at, now()), 'YYYY'),
      'created_from', NEW.created_from
    ), 'created');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_supervisory_plan_created_notification ON public.supervisory_plans;
CREATE TRIGGER trg_supervisory_plan_created_notification
  AFTER INSERT ON public.supervisory_plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_supervisory_plan_created_notification();

-- Examinations / inspections -----------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_examination_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity text; v_payload jsonb;
BEGIN
  SELECT COALESCE(entity_name, legal_name, id::text) INTO v_entity FROM public.licensees WHERE id = NEW.entity_id;
  v_payload := jsonb_build_object(
    'entity_name', COALESCE(v_entity, 'entity'),
    'entity_id', NEW.entity_id,
    'examination_type', NEW.inspection_type,
    'start_date', COALESCE(NEW.scheduled_date, NEW.date_conducted),
    'scope', NEW.scope
  );

  IF COALESCE(NEW.lead_inspector_id, NEW.inspector_id) IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR COALESCE(NEW.lead_inspector_id, NEW.inspector_id)
             IS DISTINCT FROM COALESCE(OLD.lead_inspector_id, OLD.inspector_id)) THEN
    PERFORM public.notification_enqueue_event('prudential.examination_assigned', 'inspection', NEW.id,
      v_payload || jsonb_build_object('assignee_id', COALESCE(NEW.lead_inspector_id, NEW.inspector_id)),
      COALESCE(NEW.lead_inspector_id, NEW.inspector_id)::text);
  END IF;

  IF NEW.status IN ('notified','scheduled','in_progress')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.notification_enqueue_event('prudential.examination_notice_issued', 'inspection', NEW.id,
      v_payload, NEW.status);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_examination_notifications_ins ON public.inspections;
CREATE TRIGGER trg_examination_notifications_ins
  AFTER INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.trg_examination_notifications();

DROP TRIGGER IF EXISTS trg_examination_notifications_upd ON public.inspections;
CREATE TRIGGER trg_examination_notifications_upd
  AFTER UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.trg_examination_notifications();

CREATE OR REPLACE FUNCTION public.trg_examination_finding_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity text; v_entity_id uuid;
BEGIN
  SELECT i.entity_id, COALESCE(l.entity_name, l.legal_name, l.id::text)
    INTO v_entity_id, v_entity
    FROM public.inspections i
    LEFT JOIN public.licensees l ON l.id = i.entity_id
   WHERE i.id = NEW.inspection_id;

  PERFORM public.notification_enqueue_event('prudential.examination_finding_recorded', 'inspection_finding', NEW.id,
    jsonb_build_object(
      'entity_name', COALESCE(v_entity, 'entity'),
      'entity_id', v_entity_id,
      'inspection_id', NEW.inspection_id,
      'finding_title', COALESCE(NEW.category, 'Finding'),
      'severity_label', COALESCE(NEW.severity, 'medium'),
      'description', NEW.description
    ), 'created');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_examination_finding_notification ON public.inspection_findings;
CREATE TRIGGER trg_examination_finding_notification
  AFTER INSERT ON public.inspection_findings
  FOR EACH ROW EXECUTE FUNCTION public.trg_examination_finding_notification();

-- Conduct pattern / systemic alerts ----------------------------------------
CREATE OR REPLACE FUNCTION public.trg_conduct_pattern_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity text; v_complaint text;
BEGIN
  SELECT COALESCE(entity_name, legal_name, id::text) INTO v_entity FROM public.licensees WHERE id = NEW.licensee_id;
  SELECT complaint_number INTO v_complaint FROM public.complaints WHERE id = NEW.complaint_id;

  IF NEW.kind ILIKE '%systemic%' THEN
    PERFORM public.notification_enqueue_event('conduct.systemic_flag_raised', 'conduct_alert', NEW.id,
      jsonb_build_object(
        'entity_name', COALESCE(v_entity, 'entity'),
        'complaint_number', COALESCE(v_complaint, '-'),
        'actor_name', COALESCE(NEW.generated_by, 'system'),
        'detail', NEW.detail
      ), NEW.kind);
  ELSIF NEW.kind ILIKE '%pattern%' OR NEW.kind ILIKE '%spike%' OR NEW.kind ILIKE '%trend%' THEN
    PERFORM public.notification_enqueue_event('conduct.pattern_alert', 'conduct_alert', NEW.id,
      jsonb_build_object(
        'pattern_label', COALESCE(NEW.title, NEW.kind),
        'complaint_count', COALESCE((NEW.detail->>'complaint_count')::text, '1'),
        'entity_name', COALESCE(v_entity, 'entity'),
        'detail', NEW.detail
      ), NEW.kind);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_conduct_pattern_notification ON public.conduct_alerts;
CREATE TRIGGER trg_conduct_pattern_notification
  AFTER INSERT ON public.conduct_alerts
  FOR EACH ROW EXECUTE FUNCTION public.trg_conduct_pattern_notification();