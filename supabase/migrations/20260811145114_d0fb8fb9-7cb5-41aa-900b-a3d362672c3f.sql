CREATE OR REPLACE FUNCTION public.trg_escalation_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF NEW.status::text IN ('resolved','closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notification_enqueue_event('escalation.resolved', 'escalation', NEW.id, v_payload,
      NEW.status::text, NEW.correlation_id);
  END IF;

  RETURN NEW;
END;
$$;