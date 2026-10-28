CREATE OR REPLACE FUNCTION public.conduct_action_overdue_alert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE is_overdue boolean; dkey text;
BEGIN
  is_overdue := NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE
    AND NEW.status NOT IN ('completed','waived','closed','cancelled');
  IF is_overdue THEN
    IF NEW.status <> 'overdue' THEN NEW.status := 'overdue'; END IF;
    dkey := encode(extensions.digest(('action_overdue:'||NEW.id::text)::bytea, 'sha1'),'hex');
    BEGIN
      INSERT INTO public.conduct_alerts(licensee_id, kind, severity, title, detail, dedupe_key, status, source, generated_by)
      VALUES (NEW.entity_id, 'action_overdue', 'high', 'Conduct action overdue: '||NEW.title,
        jsonb_build_object('conduct_action_id', NEW.id, 'source_module', NEW.source_module, 'due_date', NEW.due_date),
        dkey, 'open', 'system', 'overdue_trigger');
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
  RETURN NEW;
END; $function$;