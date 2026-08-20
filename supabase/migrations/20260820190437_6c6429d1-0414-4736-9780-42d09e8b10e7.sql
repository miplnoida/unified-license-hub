CREATE TABLE IF NOT EXISTS public.return_threshold_breach_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  breach_id uuid NOT NULL REFERENCES public.return_threshold_breaches(id) ON DELETE CASCADE,
  entity_id uuid,
  detection_run_id uuid,
  return_filing_id uuid,
  return_filing_version_id uuid,
  reporting_period_id uuid,
  regulatory_metric_id uuid,
  metric_key text,
  level text,
  note text NOT NULL,
  acknowledged_by uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rtb_ack_breach
  ON public.return_threshold_breach_acknowledgements (breach_id);

GRANT SELECT ON public.return_threshold_breach_acknowledgements TO authenticated;
GRANT ALL ON public.return_threshold_breach_acknowledgements TO service_role;

ALTER TABLE public.return_threshold_breach_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prudential readers can view breach acknowledgements"
  ON public.return_threshold_breach_acknowledgements;
CREATE POLICY "Prudential readers can view breach acknowledgements"
  ON public.return_threshold_breach_acknowledgements
  FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));

DROP FUNCTION IF EXISTS public.prudential_breach_acknowledge(uuid, text);

CREATE FUNCTION public.prudential_breach_acknowledge(_breach_id uuid, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  b public.return_threshold_breaches;
  v_ack public.return_threshold_breach_acknowledgements;
BEGIN
  SELECT * INTO b FROM public.return_threshold_breaches WHERE id = _breach_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'breach % not found', _breach_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.prudential_enforce('review_returns', b.entity_id);
  PERFORM public.prudential_require_rationale(_note, 10, 'acknowledgement note');

  IF EXISTS (SELECT 1 FROM public.return_threshold_breach_acknowledgements
              WHERE breach_id = _breach_id) THEN
    RAISE EXCEPTION 'breach % is already acknowledged', _breach_id USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.return_threshold_breach_acknowledgements
    (breach_id, entity_id, detection_run_id, return_filing_id, return_filing_version_id,
     reporting_period_id, regulatory_metric_id, metric_key, level, note, acknowledged_by)
  VALUES (b.id, b.entity_id, b.detection_run_id, b.return_filing_id, b.return_filing_version_id,
          b.reporting_period_id, b.regulatory_metric_id, b.metric_key, b.level, _note, auth.uid())
  RETURNING * INTO v_ack;

  PERFORM public.prudential_audit_event(
    'return_breach_acknowledged', 'return_threshold_breach', _breach_id,
    NULL, to_jsonb(v_ack),
    jsonb_build_object('entity_id', b.entity_id,
                       'return_filing_id', b.return_filing_id,
                       'return_filing_version_id', b.return_filing_version_id,
                       'reporting_period_id', b.reporting_period_id,
                       'detection_run_id', b.detection_run_id,
                       'metric_key', b.metric_key,
                       'level', b.level,
                       'observed_value', b.value,
                       'threshold_value', b.threshold_value,
                       'threshold_version', b.threshold_version),
    _note, 'WORKFLOW_TRANSITION');

  RETURN jsonb_build_object(
    'success', true,
    'breach_id', b.id,
    'acknowledgement_id', v_ack.id,
    'acknowledged_by', v_ack.acknowledged_by,
    'acknowledged_at', v_ack.acknowledged_at,
    'note', v_ack.note,
    'detection_run_id', b.detection_run_id,
    'entity_id', b.entity_id,
    'metric_key', b.metric_key,
    'level', b.level);
END $fn$;

REVOKE ALL ON FUNCTION public.prudential_breach_acknowledge(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prudential_breach_acknowledge(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.prudential_breach_acknowledge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prudential_breach_acknowledge(uuid, text) TO service_role;

CREATE OR REPLACE VIEW public.v_prudential_current_breaches
WITH (security_invoker = true) AS
SELECT b.*,
       rp.period_label,
       rp.period_end,
       f.filing_reference,
       f.status AS filing_status,
       ack.id AS acknowledgement_id,
       ack.acknowledged_by AS acknowledged_by_user,
       ack.acknowledged_at AS acknowledged_at_ts,
       ack.note AS acknowledgement_note_text
  FROM public.return_threshold_breaches b
  JOIN public.return_filings f ON f.id = b.return_filing_id
  LEFT JOIN public.reporting_periods rp ON rp.id = b.reporting_period_id
  LEFT JOIN public.return_threshold_breach_acknowledgements ack ON ack.breach_id = b.id
 WHERE b.detection_source = 'CANONICAL_ENGINE'
   AND COALESCE(f.status, '') <> 'WITHDRAWN'
   AND b.detection_run_id = (
     SELECT r.id FROM public.prudential_detection_runs r
      WHERE r.return_filing_version_id = b.return_filing_version_id
      ORDER BY r.started_at DESC NULLS LAST LIMIT 1);

GRANT SELECT ON public.v_prudential_current_breaches TO authenticated;
GRANT SELECT ON public.v_prudential_current_breaches TO service_role;

UPDATE public.entity_supervision_assignments a
   SET supervisor_id = '563ad6fb-8b54-443f-8b5d-cd1c8200eb6e'
 WHERE a.status = 'active'
   AND a.supervisor_id IS NULL
   AND a.entity_id IN (
     SELECT id FROM public.licensees
      WHERE name IN ('Atlantic Commercial Bank Ltd',
                     'Nevis Investment Management Ltd',
                     'Federation Credit Finance Ltd'));