-- =====================================================================
-- MC-09 (part A) — cross-entity AI subjects + deterministic fact packs
-- =====================================================================

-- 1. approved-capability register accepts the MC-09 capabilities ------------
ALTER TABLE public.conduct_ai_use_cases DROP CONSTRAINT IF EXISTS conduct_ai_use_cases_code_chk;
ALTER TABLE public.conduct_ai_use_cases ADD CONSTRAINT conduct_ai_use_cases_code_chk
  CHECK (code = ANY (ARRAY[
    'SUPERVISORY_SUMMARY','MATERIAL_CHANGE_EXPLANATION','RECORDS_TO_REVIEW',
    'SUPERVISORY_QUESTIONS','RISK_HYPOTHESIS',
    'CROSS_ENTITY_INTERPRETATION','THEME_MATERIAL_CHANGE',
    'SECTOR_SUPERVISORY_QUESTIONS','EMERGING_RISK_NARRATIVE','EMERGING_RISK_HYPOTHESIS']));

ALTER TABLE public.conduct_ai_use_cases DROP CONSTRAINT IF EXISTS conduct_ai_use_cases_source_chk;
ALTER TABLE public.conduct_ai_use_cases ADD CONSTRAINT conduct_ai_use_cases_source_chk
  CHECK (allowed_source = ANY (ARRAY['conduct_360_snapshot','conduct_intelligence_snapshot']));

-- 2. advisory records may address a sector theme or an emerging risk --------
ALTER TABLE public.conduct_ai_insights ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE public.conduct_ai_insights
  ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'entity',
  ADD COLUMN IF NOT EXISTS subject_key text,
  ADD COLUMN IF NOT EXISTS emerging_risk_id uuid REFERENCES public.conduct_emerging_risks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_population jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.conduct_ai_insights DROP CONSTRAINT IF EXISTS conduct_ai_insights_subject_chk;
ALTER TABLE public.conduct_ai_insights ADD CONSTRAINT conduct_ai_insights_subject_chk CHECK (
  subject_type = ANY (ARRAY['entity','sector_theme','emerging_risk'])
  AND (subject_type <> 'entity' OR entity_id IS NOT NULL)
  AND (subject_type <> 'sector_theme' OR COALESCE(btrim(subject_key), '') <> '')
  AND (subject_type <> 'emerging_risk' OR emerging_risk_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_conduct_ai_insights_subject
  ON public.conduct_ai_insights (subject_type, subject_key, use_case_code);
CREATE INDEX IF NOT EXISTS idx_conduct_ai_insights_risk
  ON public.conduct_ai_insights (emerging_risk_id);

-- provenance of the new subject columns is immutable too
CREATE OR REPLACE FUNCTION public.tg_conduct_ai_insight_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'conduct_ai_insight_immutable: AI advisory records cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.ai_output IS DISTINCT FROM OLD.ai_output
     OR NEW.snapshot_fingerprint IS DISTINCT FROM OLD.snapshot_fingerprint
     OR NEW.use_case_code IS DISTINCT FROM OLD.use_case_code
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.subject_key IS DISTINCT FROM OLD.subject_key
     OR NEW.emerging_risk_id IS DISTINCT FROM OLD.emerging_risk_id
     OR NEW.subject_population IS DISTINCT FROM OLD.subject_population
     OR NEW.window_start IS DISTINCT FROM OLD.window_start
     OR NEW.window_end IS DISTINCT FROM OLD.window_end
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.model_version IS DISTINCT FROM OLD.model_version
     OR NEW.prompt_template_code IS DISTINCT FROM OLD.prompt_template_code
     OR NEW.prompt_template_version IS DISTINCT FROM OLD.prompt_template_version
     OR NEW.source_references IS DISTINCT FROM OLD.source_references
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
     OR NEW.insight_id IS DISTINCT FROM OLD.insight_id THEN
    RAISE EXCEPTION 'conduct_ai_insight_immutable: original AI output and provenance cannot be altered'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 3. deterministic theme fact pack -----------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_intel_theme_snapshot(
  _theme text,
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 180,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid; _to date; _from date; _pfrom date; _pto date; _out jsonb;
BEGIN
  _uid := public.conduct_emerging_risk_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  IF COALESCE(btrim(_theme), '') = '' THEN
    RAISE EXCEPTION 'theme_required: a conduct theme must be stated' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(_window_days, 0) <= 0 OR _window_days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
               _regulator_id, _sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  _to := current_date;
  _from := _to - _window_days;
  _pto := _from - 1;
  _pfrom := _pto - _window_days;

  WITH matched AS (
    SELECT c.id, c.complaint_number, c.subject, c.status, c.severity, c.created_at,
           c.licensee_id, l.name AS licensee_name, l.sector_id, c.regulator_id
      FROM public.complaints c
      LEFT JOIN public.licensees l ON l.id = c.licensee_id
      LEFT JOIN public.complaint_types t ON t.id = c.complaint_type_id
     WHERE COALESCE(t.name, 'Unclassified') = _theme
       AND (_sector_id IS NULL OR l.sector_id = _sector_id)
       AND (_regulator_id IS NULL OR c.regulator_id = _regulator_id)
  ),
  cur AS (SELECT * FROM matched WHERE created_at::date BETWEEN _from AND _to),
  prv AS (SELECT * FROM matched WHERE created_at::date BETWEEN _pfrom AND _pto),
  pop AS (
    SELECT licensee_id, licensee_name, count(*) AS complaint_count
      FROM cur WHERE licensee_id IS NOT NULL
     GROUP BY licensee_id, licensee_name
  ),
  sig AS (
    SELECT s.id, s.reference, s.title, s.severity, s.status, s.created_at, s.licensee_id
      FROM public.conduct_signals s
     WHERE s.created_at::date BETWEEN _from AND _to
       AND s.licensee_id IN (SELECT licensee_id FROM pop)
       AND (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
  ),
  pat AS (
    SELECT k.id, k.reference, k.title, k.severity, k.status, k.metric, k.metric_value,
           k.threshold_value, k.distinct_entity_count, k.created_at, k.licensee_id
      FROM public.conduct_clusters k
     WHERE k.created_at::date BETWEEN _from AND _to
       AND (k.licensee_id IN (SELECT licensee_id FROM pop) OR k.distinct_entity_count > 1)
       AND (_regulator_id IS NULL OR k.regulator_id = _regulator_id)
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'theme', _theme,
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'comparison_window', jsonb_build_object('from', _pfrom, 'to', _pto),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id),
    'totals', jsonb_build_object(
      'complaints', (SELECT count(*) FROM cur),
      'entities', (SELECT count(*) FROM pop),
      'signals', (SELECT count(*) FROM sig),
      'patterns', (SELECT count(*) FROM pat)),
    'movement', jsonb_build_object(
      'complaints_current', (SELECT count(*) FROM cur),
      'complaints_previous', (SELECT count(*) FROM prv),
      'complaints_change', (SELECT count(*) FROM cur) - (SELECT count(*) FROM prv),
      'entities_current', (SELECT count(*) FROM pop),
      'entities_previous', (SELECT count(DISTINCT licensee_id) FROM prv WHERE licensee_id IS NOT NULL),
      'direction', CASE
         WHEN (SELECT count(*) FROM cur) > (SELECT count(*) FROM prv) THEN 'increase'
         WHEN (SELECT count(*) FROM cur) < (SELECT count(*) FROM prv) THEN 'decrease'
         ELSE 'unchanged' END,
      'method', 'Recorded complaint volume in the stated window compared with the immediately preceding window of equal length. Movement is a count difference only and establishes no cause.'),
    'entities', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', COALESCE(licensee_name, 'Unnamed entity'),
         'licensee_id', licensee_id,
         'complaint_count', complaint_count,
         'href', '/conduct/360/' || licensee_id)
         ORDER BY complaint_count DESC, licensee_name) FROM pop), '[]'::jsonb)),
    'complaints', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', complaint_number, 'title', subject, 'status', status,
         'severity', severity, 'recorded_at', created_at,
         'licensee_name', licensee_name,
         'href', '/complaints/' || id)
         ORDER BY created_at DESC) FROM cur), '[]'::jsonb)),
    'signals', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', reference, 'title', title, 'severity', severity, 'status', status,
         'recorded_at', created_at, 'href', '/conduct/signals/' || id)
         ORDER BY created_at DESC) FROM sig), '[]'::jsonb)),
    'patterns', jsonb_build_object('items', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'reference', reference, 'title', title, 'severity', severity, 'status', status,
         'measure', metric, 'measured_value', metric_value, 'threshold', threshold_value,
         'entities_involved', distinct_entity_count,
         'recorded_at', created_at, 'href', '/conduct/patterns/' || id)
         ORDER BY created_at DESC) FROM pat), '[]'::jsonb)),
    'method', 'Deterministic aggregation of recorded complaints, conduct signals and detected patterns for the stated theme and window. No estimation, no scoring and no AI involvement.',
    'provenance', jsonb_build_object('source', 'conduct_intel_theme_snapshot',
                                     'content_class', 'fact', 'ai_content', false)
  ) INTO _out;

  RETURN _out;
END $$;

-- 4. deterministic cross-entity comparison ---------------------------------
CREATE OR REPLACE FUNCTION public.conduct_cross_entity_compare(
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 180,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _to date; _from date; _out jsonb;
BEGIN
  _uid := public.conduct_emerging_risk_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  IF COALESCE(_window_days, 0) <= 0 OR _window_days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
               _regulator_id, _sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  _to := current_date;
  _from := _to - _window_days;

  WITH ents AS (
    SELECT l.id, l.name, l.sector_id
      FROM public.licensees l
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
  ),
  comp AS (
    SELECT c.licensee_id, count(*) AS complaints
      FROM public.complaints c
     WHERE c.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR c.regulator_id = _regulator_id)
       AND c.licensee_id IN (SELECT id FROM ents)
     GROUP BY c.licensee_id
  ),
  sg AS (
    SELECT s.licensee_id, count(*) AS signals
      FROM public.conduct_signals s
     WHERE s.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
       AND s.licensee_id IN (SELECT id FROM ents)
     GROUP BY s.licensee_id
  ),
  pt AS (
    SELECT k.licensee_id, count(*) AS patterns
      FROM public.conduct_clusters k
     WHERE k.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR k.regulator_id = _regulator_id)
       AND k.licensee_id IN (SELECT id FROM ents)
     GROUP BY k.licensee_id
  ),
  joined AS (
    SELECT e.id, e.name,
           COALESCE(comp.complaints, 0) AS complaints,
           COALESCE(sg.signals, 0) AS signals,
           COALESCE(pt.patterns, 0) AS patterns
      FROM ents e
      LEFT JOIN comp ON comp.licensee_id = e.id
      LEFT JOIN sg ON sg.licensee_id = e.id
      LEFT JOIN pt ON pt.licensee_id = e.id
  ),
  active AS (SELECT * FROM joined WHERE complaints > 0 OR signals > 0 OR patterns > 0),
  stats AS (
    SELECT count(*)::int AS population,
           COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY complaints), 0) AS median_complaints,
           COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY complaints), 0) AS upper_quartile_complaints,
           COALESCE(max(complaints), 0) AS highest_complaints
      FROM active
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id),
    'sector_measures', (SELECT to_jsonb(s) FROM stats s),
    'entities', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'licensee_id', a.id, 'reference', a.name,
        'complaints', a.complaints, 'signals', a.signals, 'patterns', a.patterns,
        'above_sector_median', a.complaints > (SELECT median_complaints FROM stats),
        'above_upper_quartile', a.complaints > (SELECT upper_quartile_complaints FROM stats),
        'comparison_note', a.complaints || ' recorded complaints against a sector median of '
                           || round((SELECT median_complaints FROM stats), 1)
                           || ' and an upper quartile of '
                           || round((SELECT upper_quartile_complaints FROM stats), 1)
                           || ' for the same window.',
        'href', '/conduct/360/' || a.id)
        ORDER BY a.complaints DESC, a.signals DESC, a.name)
      FROM active a), '[]'::jsonb),
    'method', 'Counts of recorded complaints, conduct signals and detected patterns per entity for the stated window, compared with the median and upper quartile of entities in scope that have any recorded conduct activity. Positional comparison only: it is not a rating, score or finding.',
    'provenance', jsonb_build_object('source', 'conduct_cross_entity_compare',
                                     'content_class', 'fact', 'ai_content', false)
  ) INTO _out;

  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.conduct_intel_theme_snapshot(text, uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_cross_entity_compare(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_intel_theme_snapshot(text, uuid, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_cross_entity_compare(uuid, integer, uuid) TO authenticated, service_role;

DO $$
DECLARE _r text; _f text;
BEGIN
  FOREACH _r IN ARRAY ARRAY['sandbox_exec','sandbox_exec_sndfttzqmbkmkcnrvpfn'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = _r) THEN
      FOREACH _f IN ARRAY ARRAY[
        'public.conduct_intel_theme_snapshot(text,uuid,integer,uuid)',
        'public.conduct_cross_entity_compare(uuid,integer,uuid)'
      ] LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', _f, _r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.conduct_intel_theme_snapshot(text, uuid, integer, uuid) IS
 'MC-09 deterministic theme fact pack: recorded complaints, signals, patterns, affected entities and movement against the preceding window. Facts only.';
COMMENT ON FUNCTION public.conduct_cross_entity_compare(uuid, integer, uuid) IS
 'MC-09 deterministic cross-entity comparison against sector median and upper quartile. Positional comparison only, never a rating.';