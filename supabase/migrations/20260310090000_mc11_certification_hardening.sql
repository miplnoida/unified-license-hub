-- MC-11 CERTIFICATION HARDENING
-- 1) remove an unintended anonymous EXECUTE grant on the narrative adoption operation
-- 2) label permitted grounding figures using the published measure name

REVOKE ALL ON FUNCTION public.conduct_reporting_narrative_adopt(uuid,text,text,uuid,integer) FROM anon;

CREATE OR REPLACE FUNCTION public.conduct_reporting_ai_context(_use_case_code text, _period_start date DEFAULT (CURRENT_DATE - 90), _period_end date DEFAULT CURRENT_DATE, _sector_id uuid DEFAULT NULL::uuid, _regulator_id uuid DEFAULT NULL::uuid, _pack_id uuid DEFAULT NULL::uuid, _pack_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _sectors uuid[]; _dash jsonb; _cmp jsonb; _risks jsonb; _cov jsonb;
        _sect jsonb; _pack jsonb; _snapshot jsonb; _figures jsonb; _refs jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  IF NOT EXISTS (SELECT 1 FROM public.conduct_ai_use_cases u
                  WHERE u.code = _use_case_code AND u.allowed_source = 'conduct_reporting_snapshot') THEN
    RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023';
  END IF;

  _dash := public.conduct_mi_dashboard(_period_start, _period_end, _sector_id, _regulator_id);

  IF _use_case_code = 'EVIDENCE_PACK_SUMMARY' THEN
    IF _pack_id IS NULL THEN
      RAISE EXCEPTION 'pack_required' USING ERRCODE = '22023';
    END IF;
    _pack := public.conduct_evidence_pack_read(_pack_id, _pack_version);
    _snapshot := jsonb_build_object(
      'kind', 'evidence_pack',
      'scope', _dash -> 'scope',
      'pack', _pack -> 'pack',
      'pack_version', (_pack -> 'version') - 'ai_assistance',
      'point_in_time', true);
  ELSE
    IF _use_case_code IN ('MANAGEMENT_SUMMARY_DRAFT','MATERIAL_MOVEMENT_EXPLANATION') THEN
      _cmp := public.conduct_mi_period_compare(_period_start, _period_end, _sector_id, _regulator_id);
    END IF;
    IF _use_case_code IN ('MANAGEMENT_SUMMARY_DRAFT','RISK_REPORTING_NARRATIVE') THEN
      _risks := public.conduct_mi_risk_reporting(_period_start, _period_end, _sector_id, _regulator_id);
    END IF;
    IF _use_case_code IN ('MANAGEMENT_SUMMARY_DRAFT','COVERAGE_COMMENTARY') THEN
      _cov := public.conduct_planning_coverage(_sector_id, _regulator_id);
      _sect := public.conduct_mi_sector_coverage(_period_start, _period_end, _sector_id, _regulator_id);
    END IF;
    _snapshot := jsonb_strip_nulls(jsonb_build_object(
      'kind', 'management_information',
      'scope', _dash -> 'scope',
      'metrics', _dash -> 'metrics',
      'metric_groups', _dash -> 'metric_groups',
      'definitions', _dash -> 'definitions',
      'period_comparison', _cmp,
      'emerging_risk_reporting', _risks,
      'response_coverage', _cov,
      'sector_coverage', _sect,
      'point_in_time', false));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', d.x ->> 'code',
           'label', COALESCE(d.x ->> 'name', d.x ->> 'label'),
           'value', _dash -> 'metrics' -> (d.x ->> 'code'))), '[]'::jsonb)
    INTO _figures
    FROM jsonb_array_elements(COALESCE(_dash -> 'definitions', '[]'::jsonb)) AS d(x)
   WHERE (_dash -> 'metrics') ? (d.x ->> 'code');

  _refs := (
    SELECT COALESCE(jsonb_agg(DISTINCT r), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('section','measure','reference', d ->> 'code','label', COALESCE(d ->> 'name', d ->> 'label')) r
        FROM jsonb_array_elements(COALESCE(_dash -> 'definitions','[]'::jsonb)) d
      UNION ALL
      SELECT jsonb_build_object('section','emerging_risk','reference', x ->> 'reference','label', x ->> 'title')
        FROM jsonb_array_elements(COALESCE(_risks -> 'risks','[]'::jsonb)) x
       WHERE COALESCE(x ->> 'reference','') <> ''
      UNION ALL
      SELECT jsonb_build_object('section','evidence_pack','reference', (_pack -> 'pack') ->> 'reference',
                                'label', (_pack -> 'pack') ->> 'subject_label')
       WHERE _pack IS NOT NULL AND COALESCE((_pack -> 'pack') ->> 'reference','') <> ''
    ) q);

  RETURN jsonb_build_object(
    'use_case_code', _use_case_code,
    'snapshot', _snapshot,
    'permitted_figures', COALESCE(_figures, '[]'::jsonb),
    'permitted_references', _refs,
    'facts_signature', COALESCE(_dash ->> 'facts_signature',
                                md5(COALESCE(_snapshot,'{}'::jsonb)::text)),
    'period', jsonb_build_object('start', _period_start, 'end', _period_end),
    'generated_at', now()
  );
END $function$;


REVOKE ALL ON FUNCTION public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_reporting_ai_context(text,date,date,uuid,uuid,uuid,integer) TO authenticated, service_role;
