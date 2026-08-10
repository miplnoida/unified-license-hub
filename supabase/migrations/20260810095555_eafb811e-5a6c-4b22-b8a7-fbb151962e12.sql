-- 1) Align permission checks with RLS write policy
CREATE OR REPLACE FUNCTION public.publish_prudential_threshold(_threshold_id uuid, _effective_from date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  UPDATE public.prudential_threshold_versions SET effective_to = _effective_from - 1
    WHERE threshold_id = _threshold_id AND effective_to IS NULL;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_threshold_versions WHERE threshold_id = _threshold_id;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id = _threshold_id;
  INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
    VALUES (_threshold_id, _next, _row.warn_value, _row.breach_value, _row.upper_value, _row.comparator, _row.unit, _effective_from, auth.uid());
  UPDATE public.prudential_thresholds SET current_version = _next, effective_from = _effective_from, updated_at = now() WHERE id = _threshold_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds', _threshold_id, NULL, to_jsonb(_row), 'Threshold published', NULL, NULL, jsonb_build_object('version',_next,'event','THRESHOLD_PUBLISHED'));
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.rollback_prudential_threshold(_threshold_id uuid, _to_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _snap public.prudential_threshold_versions; _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  SELECT * INTO _snap FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id AND version=_to_version;
  IF _snap IS NULL THEN RAISE EXCEPTION 'Version % not found', _to_version; END IF;
  UPDATE public.prudential_thresholds
    SET warn_value=_snap.warn_value, breach_value=_snap.breach_value, upper_value=_snap.upper_value,
        comparator=_snap.comparator, unit=_snap.unit, updated_at=now()
    WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to = current_date - 1
    WHERE threshold_id=_threshold_id AND effective_to IS NULL;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
    VALUES (_threshold_id, _next, _row.warn_value, _row.breach_value, _row.upper_value, _row.comparator, _row.unit, current_date, auth.uid());
  UPDATE public.prudential_thresholds SET current_version=_next, effective_from=current_date WHERE id=_threshold_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id,NULL,to_jsonb(_row),'Threshold rolled back',NULL,NULL,jsonb_build_object('event','THRESHOLD_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.archive_prudential_threshold(_threshold_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  UPDATE public.prudential_thresholds SET is_active=false, effective_to=current_date, updated_at=now() WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to=current_date WHERE threshold_id=_threshold_id AND effective_to IS NULL;
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id,to_jsonb(_row),NULL,'Threshold archived',NULL,NULL,jsonb_build_object('event','THRESHOLD_ARCHIVED'));
END $function$;

-- 2) Auto-version thresholds on create / value change
CREATE OR REPLACE FUNCTION public.trg_prudential_threshold_autoversion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _next integer;
BEGIN
  UPDATE public.prudential_threshold_versions
     SET effective_to = GREATEST(current_date - 1, effective_from)
   WHERE threshold_id = NEW.id AND effective_to IS NULL;

  SELECT COALESCE(MAX(version),0)+1 INTO _next
    FROM public.prudential_threshold_versions WHERE threshold_id = NEW.id;

  INSERT INTO public.prudential_threshold_versions(
    threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
  VALUES (NEW.id, _next, NEW.warn_value, NEW.breach_value, NEW.upper_value, NEW.comparator, NEW.unit,
          COALESCE(NEW.effective_from, current_date), auth.uid());

  UPDATE public.prudential_thresholds SET current_version = _next WHERE id = NEW.id;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS prudential_threshold_autoversion_ins ON public.prudential_thresholds;
CREATE TRIGGER prudential_threshold_autoversion_ins
AFTER INSERT ON public.prudential_thresholds
FOR EACH ROW EXECUTE FUNCTION public.trg_prudential_threshold_autoversion();

DROP TRIGGER IF EXISTS prudential_threshold_autoversion_upd ON public.prudential_thresholds;
CREATE TRIGGER prudential_threshold_autoversion_upd
AFTER UPDATE OF warn_value, breach_value, upper_value, comparator, unit ON public.prudential_thresholds
FOR EACH ROW
WHEN (
  NEW.warn_value IS DISTINCT FROM OLD.warn_value
  OR NEW.breach_value IS DISTINCT FROM OLD.breach_value
  OR NEW.upper_value IS DISTINCT FROM OLD.upper_value
  OR NEW.comparator IS DISTINCT FROM OLD.comparator
  OR NEW.unit IS DISTINCT FROM OLD.unit
)
EXECUTE FUNCTION public.trg_prudential_threshold_autoversion();

-- 3) Backfill initial version for existing thresholds
INSERT INTO public.prudential_threshold_versions(
  threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from)
SELECT t.id, 1, t.warn_value, t.breach_value, t.upper_value, t.comparator, t.unit,
       COALESCE(t.effective_from, current_date)
FROM public.prudential_thresholds t
WHERE NOT EXISTS (
  SELECT 1 FROM public.prudential_threshold_versions v WHERE v.threshold_id = t.id
);

UPDATE public.prudential_thresholds t
   SET current_version = v.version
  FROM public.prudential_threshold_versions v
 WHERE v.threshold_id = t.id AND v.effective_to IS NULL
   AND t.current_version IS DISTINCT FROM v.version;