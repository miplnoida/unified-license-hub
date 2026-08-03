CREATE OR REPLACE FUNCTION public.trg_notify_sla_escalation_tier_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notif_enqueue(
    'sla.configuration_updated', 'sla_escalation_tier', NEW.id,
    NEW.process_type || ' / Tier ' || NEW.tier,
    '/admin/sla-configuration',
    jsonb_build_object(
      'process_type', NEW.process_type,
      'tier', NEW.tier,
      'delay_days', NEW.delay_days,
      'recipients', coalesce(NEW.recipients, ''),
      'change_summary', 'Escalation Tier ' || NEW.tier || ': delay ' || NEW.delay_days || 'd -> ' || coalesce(NEW.recipients, '')
    ),
    NEW.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI')
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_sla_escalation_tier_updated ON public.sla_escalation_tiers;
CREATE TRIGGER notify_sla_escalation_tier_updated
AFTER INSERT OR UPDATE ON public.sla_escalation_tiers
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_sla_escalation_tier_updated();