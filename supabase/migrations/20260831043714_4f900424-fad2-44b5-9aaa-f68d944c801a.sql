-- F8-W1E2B: converge 13 governed Prudential mutations onto prudential_audit_event

CREATE OR REPLACE FUNCTION public.archive_prudential_ratio(_ratio_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Ratio not found'; END IF;
  UPDATE public.prudential_ratios SET is_active=false, updated_at=now() WHERE id=_ratio_id;
  PERFORM public.prudential_audit_event('RATIO_ARCHIVED','prudential_ratios',_ratio_id,
    to_jsonb(_row), NULL, jsonb_build_object('event','RATIO_ARCHIVED'), 'Ratio archived',
    'UPDATE'::public.compliance_audit_action);
END $function$;

CREATE OR REPLACE FUNCTION public.archive_prudential_threshold(_threshold_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Threshold not found'; END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.prudential_thresholds SET is_active=false, effective_to=current_date, updated_at=now() WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to=current_date WHERE threshold_id=_threshold_id AND effective_to IS NULL;
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.prudential_audit_event('THRESHOLD_ARCHIVED','prudential_thresholds',_threshold_id,
    to_jsonb(_row), NULL, jsonb_build_object('event','THRESHOLD_ARCHIVED'), 'Threshold archived',
    'UPDATE'::public.compliance_audit_action);
END $function$;

CREATE OR REPLACE FUNCTION public.publish_prudential_ratio(_ratio_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _next integer; _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_ratio_versions WHERE ratio_id = _ratio_id;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id = _ratio_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Ratio not found'; END IF;
  INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
    VALUES (_ratio_id, _next, _row.formula, _row.display_format, auth.uid());
  UPDATE public.prudential_ratios SET current_version = _next, updated_at = now() WHERE id = _ratio_id;
  PERFORM public.prudential_audit_event('RATIO_PUBLISHED','prudential_ratios',_ratio_id,
    NULL, to_jsonb(_row), jsonb_build_object('event','RATIO_PUBLISHED','version',_next), 'Ratio published',
    'UPDATE'::public.compliance_audit_action);
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.publish_prudential_threshold(_threshold_id uuid, _effective_from date DEFAULT CURRENT_DATE)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.prudential_threshold_versions SET effective_to = _effective_from - 1
    WHERE threshold_id = _threshold_id AND effective_to IS NULL;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_threshold_versions WHERE threshold_id = _threshold_id;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id = _threshold_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Threshold not found'; END IF;
  INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
    VALUES (_threshold_id, _next, _row.warn_value, _row.breach_value, _row.upper_value, _row.comparator, _row.unit, _effective_from, auth.uid());
  UPDATE public.prudential_thresholds SET current_version = _next, effective_from = _effective_from, updated_at = now() WHERE id = _threshold_id;
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.prudential_audit_event('THRESHOLD_PUBLISHED','prudential_thresholds',_threshold_id,
    NULL, to_jsonb(_row), jsonb_build_object('event','THRESHOLD_PUBLISHED','version',_next), 'Threshold published',
    'UPDATE'::public.compliance_audit_action);
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.restore_prudential_ratio(_ratio_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Ratio not found'; END IF;
  UPDATE public.prudential_ratios SET is_active=true, updated_at=now() WHERE id=_ratio_id;
  PERFORM public.prudential_audit_event('RATIO_RESTORED','prudential_ratios',_ratio_id,
    to_jsonb(_row), NULL, jsonb_build_object('event','RATIO_RESTORED'), 'Ratio restored',
    'UPDATE'::public.compliance_audit_action);
END $function$;

CREATE OR REPLACE FUNCTION public.restore_prudential_threshold(_threshold_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Threshold not found'; END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.prudential_thresholds SET is_active=true, effective_to=NULL, updated_at=now() WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to=NULL
    WHERE threshold_id=_threshold_id
      AND version = (SELECT MAX(version) FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id);
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.prudential_audit_event('THRESHOLD_RESTORED','prudential_thresholds',_threshold_id,
    to_jsonb(_row), NULL, jsonb_build_object('event','THRESHOLD_RESTORED'), 'Threshold restored',
    'UPDATE'::public.compliance_audit_action);
END $function$;

CREATE OR REPLACE FUNCTION public.rollback_prudential_ratio(_ratio_id uuid, _to_version integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _snap public.prudential_ratio_versions; _next integer; _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  SELECT * INTO _snap FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id AND version=_to_version;
  IF _snap IS NULL THEN RAISE EXCEPTION 'Version % not found', _to_version; END IF;
  UPDATE public.prudential_ratios SET formula=_snap.formula, display_format=_snap.display_format, updated_at=now() WHERE id=_ratio_id;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id AND version=_next) THEN
    INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
      VALUES (_ratio_id, _next, _row.formula, _row.display_format, auth.uid());
  END IF;
  SELECT COALESCE(MAX(version),1) INTO _next FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id;
  UPDATE public.prudential_ratios SET current_version=_next WHERE id=_ratio_id;
  PERFORM public.prudential_audit_event('RATIO_ROLLBACK','prudential_ratios',_ratio_id,
    NULL, to_jsonb(_row), jsonb_build_object('event','RATIO_ROLLBACK','from_version',_to_version,'new_version',_next),
    'Ratio rolled back', 'UPDATE'::public.compliance_audit_action);
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.rollback_prudential_threshold(_threshold_id uuid, _to_version integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _snap public.prudential_threshold_versions; _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  SELECT * INTO _snap FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id AND version=_to_version;
  IF _snap IS NULL THEN RAISE EXCEPTION 'Version % not found', _to_version; END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.prudential_thresholds
    SET warn_value=_snap.warn_value, breach_value=_snap.breach_value, upper_value=_snap.upper_value,
        comparator=_snap.comparator, unit=_snap.unit, updated_at=now()
    WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to = current_date - 1
    WHERE threshold_id=_threshold_id AND effective_to IS NULL;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id AND version=_next) THEN
    INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
      VALUES (_threshold_id, _next, _row.warn_value, _row.breach_value, _row.upper_value, _row.comparator, _row.unit, current_date, auth.uid());
  END IF;
  SELECT COALESCE(MAX(version),1) INTO _next FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id;
  UPDATE public.prudential_thresholds SET current_version=_next, effective_from=current_date WHERE id=_threshold_id;
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.prudential_audit_event('THRESHOLD_ROLLBACK','prudential_thresholds',_threshold_id,
    NULL, to_jsonb(_row), jsonb_build_object('event','THRESHOLD_ROLLBACK','from_version',_to_version,'new_version',_next),
    'Threshold rolled back', 'UPDATE'::public.compliance_audit_action);
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.set_prudential_min_peers(_value integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _old integer;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  IF _value IS NULL OR _value < 3 OR _value > 50 THEN
    RAISE EXCEPTION 'Minimum peer count must be between 3 and 50';
  END IF;

  _old := public.prudential_min_peers();

  INSERT INTO public.site_settings(key, value)
  VALUES ('prudential_peer_settings', jsonb_build_object('min_peers', _value))
  ON CONFLICT (key) DO UPDATE
    SET value = COALESCE(public.site_settings.value, '{}'::jsonb) || jsonb_build_object('min_peers', _value);

  PERFORM public.prudential_audit_event('PEER_MIN_PEERS_UPDATED','site_settings',
    md5('prudential_peer_settings')::uuid,
    jsonb_build_object('min_peers', _old), jsonb_build_object('min_peers', _value),
    jsonb_build_object('event','PEER_MIN_PEERS_UPDATED','settings_key','prudential_peer_settings'),
    'Minimum peer count for peer comparison updated', 'UPDATE'::public.compliance_audit_action);

  RETURN _value;
END $function$;

CREATE OR REPLACE FUNCTION public.prudential_ewi_acknowledge(_alert_id uuid, _notes text DEFAULT NULL::text, _status text DEFAULT 'acknowledged'::text)
 RETURNS prudential_ewi_alerts LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  a public.prudential_ewi_alerts;
BEGIN
  SELECT * INTO a FROM public.prudential_ewi_alerts WHERE id = _alert_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'alert not found'; END IF;
  IF NOT (public.can_act_on_prudential(auth.uid())
          AND public.can_read_prudential_entity(auth.uid(), a.entity_id)) THEN
    RAISE EXCEPTION 'not authorised to acknowledge this alert';
  END IF;
  IF _status NOT IN ('acknowledged','dismissed','resolved') THEN
    RAISE EXCEPTION 'invalid status %', _status;
  END IF;

  UPDATE public.prudential_ewi_alerts
     SET status = _status, notes = COALESCE(_notes, notes),
         acknowledged_by = auth.uid(), acknowledged_at = now(), updated_at = now()
   WHERE id = _alert_id
  RETURNING * INTO a;

  BEGIN
    PERFORM public.prudential_audit_event('PRUDENTIAL_EWI_ACKNOWLEDGED','prudential_ewi_alert',_alert_id,
      NULL, jsonb_build_object('status', _status, 'notes', _notes),
      jsonb_build_object('source','prudential_ewi_acknowledge','entity_id',a.entity_id),
      _notes, 'UPDATE'::public.compliance_audit_action);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN a;
END $function$;

CREATE OR REPLACE FUNCTION public.examination_create(_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('prudential_supervision','manage_examination');
  IF nullif(_payload->>'entity_id','') IS NULL THEN
    RAISE EXCEPTION 'entity_id is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.examinations (entity_id, regulator_id, sector_id, title, examination_type, stage, risk_rating,
        period_under_review_start, period_under_review_end, fieldwork_start, fieldwork_end, lead_examiner_id, created_by)
  VALUES ((_payload->>'entity_id')::uuid, nullif(_payload->>'regulator_id','')::uuid, nullif(_payload->>'sector_id','')::uuid,
          nullif(_payload->>'title',''), nullif(_payload->>'examination_type',''),
          coalesce(nullif(_payload->>'stage',''),'planned'), nullif(_payload->>'risk_rating',''),
          nullif(_payload->>'period_under_review_start','')::date, nullif(_payload->>'period_under_review_end','')::date,
          nullif(_payload->>'fieldwork_start','')::date, nullif(_payload->>'fieldwork_end','')::date,
          coalesce(nullif(_payload->>'lead_examiner_id','')::uuid, _uid), _uid)
  RETURNING id INTO _id;
  SELECT to_jsonb(e) INTO _after FROM public.examinations e WHERE e.id=_id;
  PERFORM public.prudential_audit_event('examination_created','examination',_id,
    NULL, _after, jsonb_build_object('examination_id',_id,'entity_id',(_payload->>'entity_id')::uuid),
    NULL, 'CREATE'::public.compliance_audit_action);
  RETURN _after;
END; $function$;

CREATE OR REPLACE FUNCTION public.examination_update(_examination_id uuid, _patch jsonb, _rationale text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('prudential_supervision','manage_examination');
  SELECT to_jsonb(e) INTO _before FROM public.examinations e WHERE e.id=_examination_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Examination not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.examinations SET
    title = CASE WHEN _patch ? 'title' THEN nullif(_patch->>'title','') ELSE title END,
    examination_type = CASE WHEN _patch ? 'examination_type' THEN nullif(_patch->>'examination_type','') ELSE examination_type END,
    risk_rating = CASE WHEN _patch ? 'risk_rating' THEN nullif(_patch->>'risk_rating','') ELSE risk_rating END,
    period_under_review_start = CASE WHEN _patch ? 'period_under_review_start' THEN nullif(_patch->>'period_under_review_start','')::date ELSE period_under_review_start END,
    period_under_review_end = CASE WHEN _patch ? 'period_under_review_end' THEN nullif(_patch->>'period_under_review_end','')::date ELSE period_under_review_end END,
    fieldwork_start = CASE WHEN _patch ? 'fieldwork_start' THEN nullif(_patch->>'fieldwork_start','')::date ELSE fieldwork_start END,
    fieldwork_end = CASE WHEN _patch ? 'fieldwork_end' THEN nullif(_patch->>'fieldwork_end','')::date ELSE fieldwork_end END,
    lead_examiner_id = CASE WHEN _patch ? 'lead_examiner_id' THEN nullif(_patch->>'lead_examiner_id','')::uuid ELSE lead_examiner_id END,
    overall_conclusion = CASE WHEN _patch ? 'overall_conclusion' THEN nullif(_patch->>'overall_conclusion','') ELSE overall_conclusion END,
    updated_at = now()
  WHERE id=_examination_id RETURNING to_jsonb(examinations) INTO _after;
  PERFORM public.prudential_audit_event('examination_updated','examination',_examination_id,
    _before, _after, jsonb_build_object('examination_id',_examination_id),
    _rationale, 'UPDATE'::public.compliance_audit_action);
  RETURN _after;
END; $function$;
