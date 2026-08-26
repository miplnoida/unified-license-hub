-- MC-09 BACKEND — Cross-Entity Supervisory Intelligence & Emerging Risk
-- Deterministic, server-authoritative. No LLM involvement: AI may later narrate
-- these facts through the MC-08 control plane, but nothing here is AI-derived.

-- 1. Emerging risk register -------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.conduct_emerging_risk_ref_seq;

CREATE TABLE IF NOT EXISTS public.conduct_emerging_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  regulator_id uuid,
  sector_id uuid,
  title text NOT NULL,
  summary text,
  thematic_scope text NOT NULL DEFAULT 'cross_entity',
  status text NOT NULL DEFAULT 'IDENTIFIED',
  severity text NOT NULL DEFAULT 'medium',
  systemic_potential text NOT NULL DEFAULT 'unassessed',
  confidence text NOT NULL DEFAULT 'indicative',
  entity_count integer NOT NULL DEFAULT 0,
  driver_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  fact_basis jsonb NOT NULL DEFAULT '{}'::jsonb,
  window_start date,
  window_end date,
  basis text NOT NULL,
  owner_id uuid,
  raised_alert_id uuid,
  closed_at timestamptz,
  closure_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_emerging_risks_status_chk
    CHECK (status IN ('IDENTIFIED','ASSESSING','CONFIRMED','MONITORING','DISMISSED','CLOSED')),
  CONSTRAINT conduct_emerging_risks_severity_chk
    CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT conduct_emerging_risks_systemic_chk
    CHECK (systemic_potential IN ('unassessed','low','moderate','high')),
  CONSTRAINT conduct_emerging_risks_confidence_chk
    CHECK (confidence IN ('indicative','probable','established'))
);

CREATE TABLE IF NOT EXISTS public.conduct_emerging_risk_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.conduct_emerging_risks(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  record_reference text,
  licensee_id uuid,
  note text,
  linked_by uuid,
  linked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_emerging_risk_records_type_chk
    CHECK (record_type IN ('signal','complaint','cluster','conduct_alert','complaint_outcome')),
  CONSTRAINT conduct_emerging_risk_records_uniq UNIQUE (risk_id, record_type, record_id)
);

CREATE TABLE IF NOT EXISTS public.conduct_emerging_risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.conduct_emerging_risks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conduct_emerging_risks_sector_idx ON public.conduct_emerging_risks (sector_id, status);
CREATE INDEX IF NOT EXISTS conduct_emerging_risk_records_risk_idx ON public.conduct_emerging_risk_records (risk_id);
CREATE INDEX IF NOT EXISTS conduct_emerging_risk_events_risk_idx ON public.conduct_emerging_risk_events (risk_id, created_at DESC);

-- reads only from a browser session; every change goes through a governed operation
GRANT SELECT ON public.conduct_emerging_risks TO authenticated;
GRANT SELECT ON public.conduct_emerging_risk_records TO authenticated;
GRANT SELECT ON public.conduct_emerging_risk_events TO authenticated;
GRANT ALL ON public.conduct_emerging_risks TO service_role;
GRANT ALL ON public.conduct_emerging_risk_records TO service_role;
GRANT ALL ON public.conduct_emerging_risk_events TO service_role;

ALTER TABLE public.conduct_emerging_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_emerging_risk_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_emerging_risk_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conduct_emerging_risks_read ON public.conduct_emerging_risks;
CREATE POLICY conduct_emerging_risks_read ON public.conduct_emerging_risks
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_permission(auth.uid(), 'market_conduct', 'view')
    AND public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
          regulator_id, sector_id, NULL, NULL, auth.uid())
  )
);

DROP POLICY IF EXISTS conduct_emerging_risk_records_read ON public.conduct_emerging_risk_records;
CREATE POLICY conduct_emerging_risk_records_read ON public.conduct_emerging_risk_records
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_emerging_risks r WHERE r.id = risk_id));

DROP POLICY IF EXISTS conduct_emerging_risk_events_read ON public.conduct_emerging_risk_events;
CREATE POLICY conduct_emerging_risk_events_read ON public.conduct_emerging_risk_events
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_emerging_risks r WHERE r.id = risk_id));

-- 2. reference and guard helpers -------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_next_reference()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'ER-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.conduct_emerging_risk_ref_seq')::text, 5, '0');
$$;

CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_require(_actions text[])
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;
  FOREACH _a IN ARRAY _actions LOOP
    IF public.has_permission(_uid, 'market_conduct', _a) THEN RETURN _uid; END IF;
  END LOOP;
  RAISE EXCEPTION 'not_authorized: market_conduct.%', _actions[1] USING ERRCODE = '42501';
END $$;

CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_guard(_risk_id uuid, _actions text[])
RETURNS public.conduct_emerging_risks LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.conduct_emerging_risks;
BEGIN
  _uid := public.conduct_emerging_risk_require(_actions);
  SELECT * INTO _row FROM public.conduct_emerging_risks WHERE id = _risk_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'emerging_risk_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', _actions[1],
               _row.regulator_id, _row.sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: emerging risk out of regulatory scope' USING ERRCODE = '42501';
  END IF;
  RETURN _row;
END $$;

-- 3. cross-entity fact layer ------------------------------------------------
-- Deterministic aggregation across entities in a sector for a stated window.
CREATE OR REPLACE FUNCTION public.conduct_cross_entity_snapshot(
  _sector_id uuid DEFAULT NULL,
  _window_days integer DEFAULT 180,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid; _from date; _to date; _out jsonb;
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

  WITH scoped AS (
    SELECT c.id, c.licensee_id, c.sector_id, c.complaint_type_id, c.status, c.created_at, c.regulator_id
      FROM public.complaints c
     WHERE c.created_at::date BETWEEN _from AND _to
       AND (_sector_id IS NULL OR c.sector_id = _sector_id)
       AND (_regulator_id IS NULL OR c.regulator_id = _regulator_id)
  ),
  by_entity AS (
    SELECT s.licensee_id, l.entity_name AS licensee_name, count(*) AS complaint_count
      FROM scoped s LEFT JOIN public.licensees l ON l.id = s.licensee_id
     WHERE s.licensee_id IS NOT NULL
     GROUP BY s.licensee_id, l.entity_name
  ),
  by_theme AS (
    SELECT COALESCE(t.name, 'Unclassified') AS theme,
           count(*) AS complaint_count,
           count(DISTINCT s.licensee_id) AS entity_count
      FROM scoped s LEFT JOIN public.complaint_types t ON t.id = s.complaint_type_id
     GROUP BY COALESCE(t.name, 'Unclassified')
  ),
  sig AS (
    SELECT count(*) AS signal_count, count(DISTINCT licensee_id) AS signal_entities
      FROM public.conduct_signals
     WHERE created_at::date BETWEEN _from AND _to
       AND (_sector_id IS NULL OR sector_id = _sector_id)
       AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  ),
  pat AS (
    SELECT count(*) AS pattern_count, count(DISTINCT licensee_id) AS pattern_entities
      FROM public.conduct_clusters
     WHERE created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR regulator_id = _regulator_id)
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id),
    'totals', jsonb_build_object(
      'complaints', (SELECT count(*) FROM scoped),
      'entities_with_complaints', (SELECT count(*) FROM by_entity),
      'signals', (SELECT signal_count FROM sig),
      'entities_with_signals', (SELECT signal_entities FROM sig),
      'patterns', (SELECT pattern_count FROM pat),
      'entities_with_patterns', (SELECT pattern_entities FROM pat)),
    'by_entity', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'licensee_id', licensee_id, 'licensee_name', licensee_name, 'complaint_count', complaint_count)
        ORDER BY complaint_count DESC, licensee_name)
      FROM by_entity), '[]'::jsonb),
    'by_theme', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'theme', theme, 'complaint_count', complaint_count, 'entity_count', entity_count)
        ORDER BY complaint_count DESC, theme)
      FROM by_theme), '[]'::jsonb),
    'cross_entity_themes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'theme', theme, 'complaint_count', complaint_count, 'entity_count', entity_count)
        ORDER BY entity_count DESC, complaint_count DESC)
      FROM by_theme WHERE entity_count >= 2), '[]'::jsonb),
    'method', 'Deterministic aggregation of recorded complaints, conduct signals and detected patterns for the stated window. No estimation and no AI involvement.'
  ) INTO _out;

  RETURN _out;
END $$;

-- 4. governed emerging-risk operations -------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _ref text; _title text; _basis text; _sector uuid; _reg uuid;
BEGIN
  _uid := public.conduct_emerging_risk_require(ARRAY['run_conduct_analytics','manage_complaints']);
  _title := btrim(COALESCE(_payload->>'title',''));
  _basis := btrim(COALESCE(_payload->>'basis',''));
  IF length(_title) < 5 THEN
    RAISE EXCEPTION 'A risk title of at least 5 characters is required' USING ERRCODE = '22023';
  END IF;
  IF length(_basis) < 10 THEN
    RAISE EXCEPTION 'A written basis of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  _sector := nullif(_payload->>'sector_id','')::uuid;
  _reg := nullif(_payload->>'regulator_id','')::uuid;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'manage_complaints',
               _reg, _sector, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: emerging risk out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  _ref := public.conduct_emerging_risk_next_reference();

  INSERT INTO public.conduct_emerging_risks(
    reference, regulator_id, sector_id, title, summary, thematic_scope, severity,
    systemic_potential, confidence, entity_count, driver_metrics, fact_basis,
    window_start, window_end, basis, owner_id, created_by)
  VALUES (
    _ref, _reg, _sector, _title,
    nullif(btrim(COALESCE(_payload->>'summary','')),''),
    COALESCE(nullif(_payload->>'thematic_scope',''), 'cross_entity'),
    COALESCE(nullif(_payload->>'severity',''), 'medium'),
    COALESCE(nullif(_payload->>'systemic_potential',''), 'unassessed'),
    COALESCE(nullif(_payload->>'confidence',''), 'indicative'),
    COALESCE(nullif(_payload->>'entity_count','')::int, 0),
    COALESCE(_payload->'driver_metrics', '{}'::jsonb),
    COALESCE(_payload->'fact_basis', '{}'::jsonb),
    nullif(_payload->>'window_start','')::date,
    nullif(_payload->>'window_end','')::date,
    _basis,
    nullif(_payload->>'owner_id','')::uuid,
    _uid)
  RETURNING id INTO _id;

  INSERT INTO public.conduct_emerging_risk_events(risk_id, event_type, to_status, rationale, actor_id)
  VALUES (_id, 'CREATE', 'IDENTIFIED', _basis, _uid);

  PERFORM public.log_compliance_audit('CREATE', 'conduct_emerging_risk', _id, NULL,
    (SELECT to_jsonb(r) FROM public.conduct_emerging_risks r WHERE r.id = _id),
    'Emerging conduct risk recorded: ' || _ref);

  RETURN jsonb_build_object('id', _id, 'reference', _ref, 'status', 'IDENTIFIED');
END $$;

CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_transition(
  _risk_id uuid, _to_status text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.conduct_emerging_risks; _allowed boolean;
BEGIN
  _row := public.conduct_emerging_risk_guard(_risk_id, ARRAY['manage_complaints','run_conduct_analytics']);
  _uid := auth.uid();
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _to_status NOT IN ('IDENTIFIED','ASSESSING','CONFIRMED','MONITORING','DISMISSED','CLOSED') THEN
    RAISE EXCEPTION 'unsupported_status: %', _to_status USING ERRCODE = '22023';
  END IF;
  IF _row.status = _to_status THEN
    RAISE EXCEPTION 'no_state_change: already %', _to_status USING ERRCODE = '22023';
  END IF;

  _allowed := CASE _row.status
    WHEN 'IDENTIFIED' THEN _to_status IN ('ASSESSING','DISMISSED')
    WHEN 'ASSESSING'  THEN _to_status IN ('CONFIRMED','DISMISSED')
    WHEN 'CONFIRMED'  THEN _to_status IN ('MONITORING','CLOSED')
    WHEN 'MONITORING' THEN _to_status IN ('CLOSED','CONFIRMED')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.conduct_emerging_risks
     SET status = _to_status,
         closed_at = CASE WHEN _to_status IN ('CLOSED','DISMISSED') THEN now() ELSE NULL END,
         closure_note = CASE WHEN _to_status IN ('CLOSED','DISMISSED') THEN btrim(_rationale) ELSE closure_note END,
         updated_at = now()
   WHERE id = _risk_id;

  INSERT INTO public.conduct_emerging_risk_events(risk_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_risk_id, 'STATUS_CHANGE', _row.status, _to_status, btrim(_rationale), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_emerging_risk', _risk_id,
    jsonb_build_object('status', _row.status), jsonb_build_object('status', _to_status),
    'Emerging conduct risk ' || _row.reference || ': ' || _row.status || ' -> ' || _to_status);

  RETURN jsonb_build_object('id', _risk_id, 'reference', _row.reference,
                            'from_status', _row.status, 'to_status', _to_status);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_emerging_risk_link_record(
  _risk_id uuid, _record_type text, _record_id uuid,
  _record_reference text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.conduct_emerging_risks; _id uuid; _lic uuid;
BEGIN
  _row := public.conduct_emerging_risk_guard(_risk_id, ARRAY['manage_complaints','run_conduct_analytics']);
  _uid := auth.uid();
  IF _row.status IN ('CLOSED','DISMISSED') THEN
    RAISE EXCEPTION 'emerging_risk_closed: a concluded risk cannot be amended' USING ERRCODE = '22023';
  END IF;
  IF _record_type NOT IN ('signal','complaint','cluster','conduct_alert','complaint_outcome') THEN
    RAISE EXCEPTION 'unsupported_record_type: %', _record_type USING ERRCODE = '22023';
  END IF;

  IF _record_type = 'complaint' THEN
    SELECT licensee_id INTO _lic FROM public.complaints WHERE id = _record_id;
  ELSIF _record_type = 'signal' THEN
    SELECT licensee_id INTO _lic FROM public.conduct_signals WHERE id = _record_id;
  ELSIF _record_type = 'cluster' THEN
    SELECT licensee_id INTO _lic FROM public.conduct_clusters WHERE id = _record_id;
  ELSIF _record_type = 'conduct_alert' THEN
    SELECT licensee_id INTO _lic FROM public.conduct_alerts WHERE id = _record_id;
  END IF;

  INSERT INTO public.conduct_emerging_risk_records(
    risk_id, record_type, record_id, record_reference, licensee_id, note, linked_by)
  VALUES (_risk_id, _record_type, _record_id, nullif(btrim(COALESCE(_record_reference,'')),''),
          _lic, nullif(btrim(COALESCE(_note,'')),''), _uid)
  ON CONFLICT (risk_id, record_type, record_id) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    RETURN jsonb_build_object('risk_id', _risk_id, 'already_linked', true);
  END IF;

  UPDATE public.conduct_emerging_risks r
     SET entity_count = (SELECT count(DISTINCT licensee_id)
                           FROM public.conduct_emerging_risk_records
                          WHERE risk_id = _risk_id AND licensee_id IS NOT NULL),
         updated_at = now()
   WHERE r.id = _risk_id;

  INSERT INTO public.conduct_emerging_risk_events(risk_id, event_type, rationale, metadata, actor_id)
  VALUES (_risk_id, 'RECORD_LINKED', _note,
          jsonb_build_object('record_type', _record_type, 'record_id', _record_id), _uid);

  RETURN jsonb_build_object('id', _id, 'risk_id', _risk_id, 'already_linked', false);
END $$;

REVOKE ALL ON FUNCTION public.conduct_emerging_risk_create(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_transition(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.conduct_emerging_risk_link_record(uuid, text, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.conduct_cross_entity_snapshot(uuid, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_create(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_transition(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_emerging_risk_link_record(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_cross_entity_snapshot(uuid, integer, uuid) TO authenticated;