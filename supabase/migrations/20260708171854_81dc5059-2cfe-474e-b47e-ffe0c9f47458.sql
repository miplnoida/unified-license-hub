
DROP FUNCTION IF EXISTS public.record_return_breach(uuid, text, text, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.record_return_breach(
  _return_id uuid,
  _metric_key text,
  _level text,
  _value numeric,
  _threshold_value numeric,
  _comparator text,
  _risk_level text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_cfg uuid;
BEGIN
  SELECT return_configuration_id INTO v_cfg FROM public.returns_filed WHERE id = _return_id;
  INSERT INTO public.return_threshold_breaches(
    return_id, return_config_id, metric_key, level, value, threshold_value, comparator, risk_level
  )
  VALUES (
    _return_id, v_cfg, _metric_key, _level, _value, _threshold_value, _comparator,
    COALESCE(_risk_level, CASE WHEN _level = 'breach' THEN 'red' WHEN _level = 'warn' THEN 'amber' END)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Temporarily disable the no-update trigger to backfill risk_level, then re-enable.
ALTER TABLE public.return_threshold_breaches DISABLE TRIGGER tg_rtb_no_update;

UPDATE public.return_threshold_breaches
   SET risk_level = CASE WHEN level = 'breach' THEN 'red' WHEN level = 'warn' THEN 'amber' END
 WHERE risk_level IS NULL;

ALTER TABLE public.return_threshold_breaches ENABLE TRIGGER tg_rtb_no_update;
