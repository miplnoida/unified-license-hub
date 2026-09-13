-- 1. Canonical reference values per reference source (no auth gate: read-only code lists,
--    used by the STABLE content validator which also runs in verifier contexts).
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_reference_values(
  _source_key text, _domain_code text DEFAULT NULL, _regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _k text; _dom text;
BEGIN
  _k   := upper(btrim(COALESCE(_source_key,'')));
  _dom := NULLIF(upper(btrim(COALESCE(_domain_code,''))),'');

  IF _k = 'SECTOR' THEN
    RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', s.code, 'label', s.name)
                            ORDER BY s.name), '[]'::jsonb)
              FROM public.sectors s
             WHERE NULLIF(btrim(COALESCE(s.code,'')),'') IS NOT NULL
               AND (_regulator_id IS NULL OR s.regulator_id IS NULL OR s.regulator_id = _regulator_id));
  ELSIF _k = 'FACT' THEN
    RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', x.fact_code, 'label', x.label)
                            ORDER BY x.fact_code), '[]'::jsonb)
              FROM (SELECT f.fact_code, max(COALESCE(f.label, f.fact_code)) AS label
                      FROM public.supervisory_methodology_fact_requirement f
                      JOIN public.supervisory_methodology m ON m.id = f.methodology_id
                     WHERE _dom IS NULL OR m.domain_code = _dom
                     GROUP BY f.fact_code) x);
  ELSIF _k = 'MEASURE' THEN
    RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', x.code, 'label', x.label)
                            ORDER BY x.code), '[]'::jsonb)
              FROM (SELECT f.fact_code AS code, max(COALESCE(f.label, f.fact_code)) AS label
                      FROM public.supervisory_methodology_fact_requirement f
                      JOIN public.supervisory_methodology m ON m.id = f.methodology_id
                     WHERE _dom IS NULL OR m.domain_code = _dom
                     GROUP BY f.fact_code
                    UNION
                    SELECT DISTINCT r.parameter_code, r.parameter_code
                      FROM public.supervisory_calculation_materiality_rule r
                     WHERE NULLIF(btrim(COALESCE(r.parameter_code,'')),'') IS NOT NULL) x);
  ELSIF _k = 'METRIC' THEN
    RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', m.code, 'label', m.name)
                            ORDER BY m.name), '[]'::jsonb)
              FROM public.regulatory_metrics m
             WHERE COALESCE(m.is_active, true));
  ELSIF _k = 'NOTIFICATION_EVENT' THEN
    RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', e.event_key,
                              'label', COALESCE(NULLIF(btrim(e.description),''), e.event_key))
                            ORDER BY e.event_key), '[]'::jsonb)
              FROM public.notification_event_configs e
             WHERE COALESCE(e.is_active, true));
  ELSIF _k = 'NOTIFICATION_RECIPIENT' THEN
    RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('value', upper(v::text), 'label', upper(v::text))
                            ORDER BY v::text), '[]'::jsonb)
              FROM unnest(enum_range(NULL::public.workflow_notification_recipient)) v);
  END IF;

  RETURN NULL::jsonb;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_policy_component_reference_values(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_reference_values(text, text, uuid)
  TO authenticated, service_role;

-- 2. Which component fields are bound to which canonical reference source.
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_reference_map(_component_type text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE upper(btrim(COALESCE(_component_type,'')))
    WHEN 'SECTOR_OVERLAY' THEN jsonb_build_object(
      'sector_code', jsonb_build_object('source','SECTOR','label','Sector','multiple',false))
    WHEN 'FACT_CONFIG' THEN jsonb_build_object(
      'fact_code', jsonb_build_object('source','FACT','label','Supervisory fact','multiple',false))
    WHEN 'SOURCE_BINDING' THEN jsonb_build_object(
      'fact_code', jsonb_build_object('source','FACT','label','Supervisory fact','multiple',false))
    WHEN 'MATERIALITY_POLICY' THEN jsonb_build_object(
      'measure', jsonb_build_object('source','MEASURE','label','Measure','multiple',false))
    WHEN 'DASHBOARD_POLICY' THEN jsonb_build_object(
      'metric', jsonb_build_object('source','METRIC','label','Metric','multiple',false))
    WHEN 'NOTIFICATION_POLICY' THEN jsonb_build_object(
      'event', jsonb_build_object('source','NOTIFICATION_EVENT','label','Notification event','multiple',false),
      'recipients', jsonb_build_object('source','NOTIFICATION_RECIPIENT','label','Recipients','multiple',true))
    ELSE NULL::jsonb END
$function$;

REVOKE ALL ON FUNCTION public.supervisory_policy_component_reference_map(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_reference_map(text)
  TO authenticated, service_role;

-- 3. UI-facing option lists for one component type (authenticated).
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_reference_options(
  _component_type text, _domain_code text DEFAULT NULL, _regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _map jsonb; _f text; _out jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  _map := public.supervisory_policy_component_reference_map(_component_type);
  IF _map IS NULL THEN RETURN '{}'::jsonb; END IF;

  FOR _f IN SELECT jsonb_object_keys(_map) LOOP
    _out := _out || jsonb_build_object(_f, jsonb_build_object(
      'source',   _map->_f->>'source',
      'label',    _map->_f->>'label',
      'multiple', COALESCE((_map->_f->>'multiple')::boolean, false),
      'options',  COALESCE(public.supervisory_policy_component_reference_values(
                    _map->_f->>'source', _domain_code, _regulator_id), '[]'::jsonb)));
  END LOOP;

  RETURN _out;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_policy_component_reference_options(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_reference_options(text, text, uuid)
  TO authenticated, service_role;
