CREATE OR REPLACE FUNCTION public.supervisory_assurance_policy_governance_chk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _svc boolean := public.request_role() = 'service_role';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.effective_from <= CURRENT_DATE AND NOT _svc THEN
      RAISE EXCEPTION 'Effective assurance policy history cannot be deleted; supersede it with a new version'
        USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.config_change_log (table_name, record_id, action, old_data, changed_by)
    VALUES ('supervisory_assurance_policy', OLD.id, 'DELETE', to_jsonb(OLD), _uid);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, _uid);
    NEW.updated_by := COALESCE(NEW.updated_by, _uid);
    INSERT INTO public.config_change_log (table_name, record_id, action, new_data, changed_by)
    VALUES ('supervisory_assurance_policy', NEW.id, 'CREATE', to_jsonb(NEW), _uid);
    RETURN NEW;
  END IF;

  -- UPDATE: an effective version's material terms are immutable.
  IF OLD.effective_from <= CURRENT_DATE AND NOT _svc THEN
    IF (NEW.code, NEW.version, NEW.domain_code, NEW.effective_from,
        NEW.awaiting_review_tolerance_days, NEW.stale_activity_tolerance_days,
        NEW.repeat_occurrence_threshold, NEW.repeat_distinct_day_threshold,
        NEW.material_severities)
       IS DISTINCT FROM
       (OLD.code, OLD.version, OLD.domain_code, OLD.effective_from,
        OLD.awaiting_review_tolerance_days, OLD.stale_activity_tolerance_days,
        OLD.repeat_occurrence_threshold, OLD.repeat_distinct_day_threshold,
        OLD.material_severities) THEN
      RAISE EXCEPTION 'An effective assurance policy version cannot be rewritten; issue a new version instead'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.created_by := OLD.created_by;
  NEW.updated_by := COALESCE(_uid, OLD.updated_by);
  INSERT INTO public.config_change_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('supervisory_assurance_policy', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), _uid);
  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_policy_governance_chk() FROM PUBLIC, anon, authenticated;