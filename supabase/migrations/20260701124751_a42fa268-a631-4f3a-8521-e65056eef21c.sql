
-- Rollback / archive lifecycle for prudential ratios
CREATE OR REPLACE FUNCTION public.rollback_prudential_ratio(_ratio_id uuid, _to_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _snap public.prudential_ratio_versions; _next integer; _row public.prudential_ratios;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO _snap FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id AND version=_to_version;
  IF _snap IS NULL THEN RAISE EXCEPTION 'Version % not found', _to_version; END IF;
  UPDATE public.prudential_ratios SET formula=_snap.formula, display_format=_snap.display_format, updated_at=now() WHERE id=_ratio_id;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
    VALUES (_ratio_id, _next, _row.formula, _row.display_format, auth.uid());
  UPDATE public.prudential_ratios SET current_version=_next WHERE id=_ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios',_ratio_id,NULL,to_jsonb(_row),'Ratio rolled back',NULL,NULL,jsonb_build_object('event','RATIO_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $$;
GRANT EXECUTE ON FUNCTION public.rollback_prudential_ratio(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_prudential_ratio(_ratio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.prudential_ratios;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  UPDATE public.prudential_ratios SET is_active=false, updated_at=now() WHERE id=_ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios',_ratio_id,to_jsonb(_row),NULL,'Ratio archived',NULL,NULL,jsonb_build_object('event','RATIO_ARCHIVED'));
END $$;
GRANT EXECUTE ON FUNCTION public.archive_prudential_ratio(uuid) TO authenticated;

-- Rollback / archive lifecycle for prudential thresholds
CREATE OR REPLACE FUNCTION public.rollback_prudential_threshold(_threshold_id uuid, _to_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _snap public.prudential_threshold_versions; _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
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
END $$;
GRANT EXECUTE ON FUNCTION public.rollback_prudential_threshold(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_prudential_threshold(_threshold_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.prudential_thresholds;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  UPDATE public.prudential_thresholds SET is_active=false, effective_to=current_date, updated_at=now() WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to=current_date WHERE threshold_id=_threshold_id AND effective_to IS NULL;
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id,to_jsonb(_row),NULL,'Threshold archived',NULL,NULL,jsonb_build_object('event','THRESHOLD_ARCHIVED'));
END $$;
GRANT EXECUTE ON FUNCTION public.archive_prudential_threshold(uuid) TO authenticated;

-- Seed notification event configs for analysis events
INSERT INTO public.notification_event_configs (event_key, description, notification_type, channels, is_active,
  title_template, message_template, email_subject_template, email_body_template, recipient_rules)
SELECT * FROM (VALUES
  ('return.analysis_complete',
   'Consolidated prudential analysis has been generated for a return',
   'info', ARRAY['in_app','email']::text[], true,
   'Analysis ready for {{return_name}} ({{period}})',
   'Consolidated analysis for {{return_name}} for period {{period}} is now available. Health score: {{health_score}}.',
   'Consolidated analysis ready — {{return_name}} ({{period}})',
   '<p>Dear {{user_name}},</p><p>The consolidated prudential analysis for <b>{{return_name}}</b> (period {{period}}) has been generated.</p><p>Health score: <b>{{health_score}}</b><br/>Risk classification: <b>{{risk_level}}</b></p><p>Review it in the supervisor console.</p>',
   '[{"type":"role","role":"supervisor"}]'::jsonb),
  ('return.supervisor_escalation',
   'Critical prudential risks detected — supervisor attention required',
   'critical', ARRAY['in_app','email']::text[], true,
   'ESCALATION: {{return_name}} — {{risk_level}}',
   '{{return_name}} for {{entity_name}} has triggered a supervisor escalation. Reason: {{escalation_reason}}.',
   '[ESCALATION] {{return_name}} — {{risk_level}} risk',
   '<p>Dear {{user_name}},</p><p>An escalation has been raised for <b>{{return_name}}</b> filed by <b>{{entity_name}}</b>.</p><p><b>Health score:</b> {{health_score}}<br/><b>Risk level:</b> {{risk_level}}<br/><b>Reason:</b> {{escalation_reason}}</p><p>Please review immediately in the supervisor console.</p>',
   '[{"type":"role","role":"supervisor"},{"type":"role","role":"admin"}]'::jsonb)
) AS v(event_key, description, notification_type, channels, is_active,
       title_template, message_template, email_subject_template, email_body_template, recipient_rules)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_event_configs c WHERE c.event_key = v.event_key);
