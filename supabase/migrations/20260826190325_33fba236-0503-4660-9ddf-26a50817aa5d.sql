-- MC-11 Part 4 — governed evidence pack generation

CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_facts(
  _pack_type text, _subject_id uuid, _subject_key text,
  _sectors uuid[], _period_start date, _period_end date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ps timestamptz := _period_start::timestamptz;
        _pe timestamptz := (_period_end + 1)::timestamptz;
        _attention uuid[]; _facts jsonb;
BEGIN
  -- Resolve the supervisory attention items that anchor the chain.
  SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) INTO _attention
    FROM public.conduct_attention_items a
   WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors))
     AND CASE _pack_type
           WHEN 'entity'        THEN _subject_id = ANY(COALESCE(a.entity_ids,'{}'::uuid[]))
           WHEN 'theme'         THEN a.theme = _subject_key
           WHEN 'emerging_risk' THEN a.emerging_risk_id = _subject_id
           WHEN 'attention'     THEN a.id = _subject_id
           WHEN 'plan'          THEN EXISTS (SELECT 1 FROM public.conduct_supervisory_plans p
                                              WHERE p.id = _subject_id AND p.attention_id = a.id)
           WHEN 'intervention'  THEN EXISTS (SELECT 1 FROM public.conduct_interventions i
                                              WHERE i.id = _subject_id AND i.attention_id = a.id)
           ELSE true
         END;

  SELECT jsonb_build_object(
    'attention_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'reference', a.reference, 'title', a.title, 'status', a.status,
        'source_type', a.source_type, 'theme', a.theme, 'sector_id', a.sector_id,
        'materiality', a.materiality, 'urgency', a.urgency,
        'supervisory_basis', a.supervisory_basis,
        'calculated_priority', a.calculated_priority, 'confirmed_priority', a.confirmed_priority,
        'confirmation_rationale', a.confirmation_rationale, 'confirmed_at', a.confirmed_at,
        'target_review_date', a.target_review_date,
        'disposition', a.disposition, 'disposition_rationale', a.disposition_rationale,
        'created_at', a.created_at, 'closed_at', a.closed_at) ORDER BY a.created_at), '[]'::jsonb)
      FROM public.conduct_attention_items a WHERE a.id = ANY(_attention)),
    'priority_calculations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'attention_id', c.attention_id, 'calculated_priority', c.calculated_priority,
        'score', c.score, 'inputs', c.inputs, 'calculated_at', c.calculated_at,
        'config_version', c.config_version) ORDER BY c.calculated_at), '[]'::jsonb)
      FROM public.conduct_attention_priority_calcs c WHERE c.attention_id = ANY(_attention)),
    'plans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'reference', p.reference, 'title', p.title, 'status', p.status,
        'planning_period', p.planning_period, 'objective', p.objective,
        'objective_source', p.objective_source, 'factual_basis', p.factual_basis,
        'priority', p.priority, 'target_completion', p.target_completion,
        'submitted_at', p.submitted_at, 'approved_at', p.approved_at, 'approved_by', p.approved_by,
        'completed_at', p.completed_at, 'attention_id', p.attention_id) ORDER BY p.created_at), '[]'::jsonb)
      FROM public.conduct_supervisory_plans p
       WHERE (p.attention_id = ANY(_attention) OR (_pack_type = 'plan' AND p.id = _subject_id))
         AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'interventions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id, 'reference', i.reference, 'title', i.title, 'status', i.status,
        'intervention_type', i.intervention_type, 'catalogue_code', i.catalogue_code,
        'basis', i.basis, 'licensee_id', i.licensee_id, 'theme', i.theme,
        'planned_start', i.planned_start, 'planned_end', i.planned_end,
        'endorsed_by', i.endorsed_by, 'endorsed_at', i.endorsed_at,
        'activated_at', i.activated_at, 'completed_at', i.completed_at,
        'outcome_result', i.outcome_result, 'outcome_rationale', i.outcome_rationale,
        'outcome_recorded_at', i.outcome_recorded_at,
        'followup_due_date', i.followup_due_date, 'followup_completed_at', i.followup_completed_at,
        'attention_id', i.attention_id, 'plan_id', i.plan_id) ORDER BY i.created_at), '[]'::jsonb)
      FROM public.conduct_interventions i
       WHERE (i.attention_id = ANY(_attention)
              OR (_pack_type = 'intervention' AND i.id = _subject_id)
              OR (_pack_type = 'entity' AND i.licensee_id = _subject_id)
              OR (_pack_type = 'plan' AND i.plan_id = _subject_id))
         AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'reassessments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id, 'attention_id', r.attention_id, 'intervention_id', r.intervention_id,
        'assessment', r.assessment, 'concern_state', r.concern_state, 'next_step', r.next_step,
        'next_review_date', r.next_review_date, 'assessed_by', r.assessed_by,
        'assessed_at', r.assessed_at) ORDER BY r.assessed_at), '[]'::jsonb)
      FROM public.conduct_attention_reassessments r WHERE r.attention_id = ANY(_attention)),
    'emerging_risks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id, 'reference', e.reference, 'title', e.title, 'status', e.status,
        'severity', e.severity, 'confidence', e.confidence, 'systemic_potential', e.systemic_potential,
        'entity_count', e.entity_count, 'window_start', e.window_start, 'window_end', e.window_end,
        'sector_id', e.sector_id, 'created_at', e.created_at, 'closed_at', e.closed_at)
        ORDER BY e.created_at), '[]'::jsonb)
      FROM public.conduct_emerging_risks e
       WHERE (_sectors IS NULL OR e.sector_id = ANY(_sectors))
         AND ((_pack_type = 'emerging_risk' AND e.id = _subject_id)
              OR e.id IN (SELECT a.emerging_risk_id FROM public.conduct_attention_items a
                           WHERE a.id = ANY(_attention) AND a.emerging_risk_id IS NOT NULL))),
    'findings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', f.id, 'reference', f.finding_reference, 'title', f.title, 'status', f.status,
        'severity', f.severity, 'entity_id', f.entity_id, 'opened_at', f.opened_at,
        'closed_at', f.closed_at) ORDER BY f.opened_at), '[]'::jsonb)
      FROM public.conduct_findings f
      LEFT JOIN public.licensees l ON l.id = f.entity_id
       WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
         AND ((_pack_type = 'entity' AND f.entity_id = _subject_id)
              OR (_pack_type = 'period_sector' AND f.opened_at >= _ps AND f.opened_at < _pe))),
    'entities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name,
               'sector_id', l.sector_id, 'status', l.status) ORDER BY l.name), '[]'::jsonb)
      FROM public.licensees l
       WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
         AND ((_pack_type = 'entity' AND l.id = _subject_id)
              OR (_pack_type <> 'entity' AND l.id IN (
                    SELECT unnest(COALESCE(a.entity_ids,'{}'::uuid[]))
                      FROM public.conduct_attention_items a WHERE a.id = ANY(_attention))))))
    INTO _facts;

  RETURN _facts;
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_evidence_pack_facts(text, uuid, text, uuid[], date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_generate(
  _pack_type text,
  _subject_id uuid DEFAULT NULL,
  _subject_key text DEFAULT NULL,
  _subject_label text DEFAULT NULL,
  _period_start date DEFAULT NULL,
  _period_end date DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _regeneration_reason text DEFAULT NULL,
  _existing_pack_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _sectors uuid[]; _ps date; _pe date; _pack public.conduct_evidence_packs;
        _key text; _label text; _sector uuid := _sector_id; _facts jsonb; _metrics jsonb;
        _defs jsonb; _defver text; _snapshot jsonb; _sig text; _ver integer; _ids jsonb;
        _d record; _mv integer; _ref text;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);
  _pe := COALESCE(_period_end, current_date);
  _ps := COALESCE(_period_start, (_pe - interval '90 days')::date);
  IF _pack_type NOT IN ('entity','theme','emerging_risk','attention','plan','intervention','period_sector') THEN
    RAISE EXCEPTION 'invalid_pack_type: %', _pack_type USING ERRCODE = '22023';
  END IF;
  IF _pack_type <> 'period_sector' AND _subject_id IS NULL AND COALESCE(btrim(_subject_key),'') = '' THEN
    RAISE EXCEPTION 'subject_required: an evidence pack must name its subject' USING ERRCODE = '22023';
  END IF;

  -- Resolve the subject label and sector from the authoritative record.
  _key := COALESCE(NULLIF(btrim(_subject_key), ''), _subject_id::text, 'period');
  _label := NULLIF(btrim(_subject_label), '');
  IF _pack_type = 'entity' THEN
    SELECT l.name, l.sector_id INTO _label, _sector FROM public.licensees l WHERE l.id = _subject_id;
  ELSIF _pack_type = 'emerging_risk' THEN
    SELECT e.title, e.sector_id INTO _label, _sector FROM public.conduct_emerging_risks e WHERE e.id = _subject_id;
  ELSIF _pack_type = 'attention' THEN
    SELECT a.title, a.sector_id INTO _label, _sector FROM public.conduct_attention_items a WHERE a.id = _subject_id;
  ELSIF _pack_type = 'plan' THEN
    SELECT p.title, p.sector_id INTO _label, _sector FROM public.conduct_supervisory_plans p WHERE p.id = _subject_id;
  ELSIF _pack_type = 'intervention' THEN
    SELECT i.title, i.sector_id INTO _label, _sector FROM public.conduct_interventions i WHERE i.id = _subject_id;
  END IF;
  IF _pack_type NOT IN ('theme','period_sector') AND _label IS NULL THEN
    RAISE EXCEPTION 'subject_not_found: the % subject does not exist or is outside your remit', _pack_type
      USING ERRCODE = 'no_data_found';
  END IF;
  IF _sector IS NOT NULL AND _sectors IS NOT NULL AND NOT (_sector = ANY(_sectors)) THEN
    RAISE EXCEPTION 'out_of_scope: the subject sits outside your authorised sectors' USING ERRCODE = '42501';
  END IF;
  _label := COALESCE(_label, _key);

  _facts := public.conduct_evidence_pack_facts(_pack_type, _subject_id, _key, _sectors, _ps, _pe);

  _metrics := '{}'::jsonb;
  FOR _d IN SELECT code FROM public.conduct_mi_definitions WHERE is_active ORDER BY sort_order LOOP
    SELECT count(*) INTO _mv FROM public.conduct_mi_records(_d.code,
      CASE WHEN _sector IS NOT NULL THEN ARRAY[_sector] ELSE _sectors END, _ps, _pe);
    _metrics := _metrics || jsonb_build_object(_d.code, _mv);
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name,
           'business_meaning', d.business_meaning, 'inclusion_criteria', d.inclusion_criteria,
           'exclusion_criteria', d.exclusion_criteria, 'time_basis', d.time_basis,
           'calculation_version', d.calculation_version) ORDER BY d.sort_order), '[]'::jsonb),
         'mi.v' || COALESCE(max(d.calculation_version), 1)::text || '.' || count(*)::text
    INTO _defs, _defver FROM public.conduct_mi_definitions d WHERE d.is_active;

  _snapshot := jsonb_build_object(
    'pack_type', _pack_type,
    'subject', jsonb_build_object('id', _subject_id, 'key', _key, 'label', _label, 'sector_id', _sector),
    'scope', public.conduct_mi_scope_header(
       CASE WHEN _sector IS NOT NULL THEN ARRAY[_sector] ELSE _sectors END, _ps, _pe),
    'facts', _facts,
    'definitions', _defs,
    'definition_version', _defver,
    'content_class', 'fact',
    'note', 'This pack records the supervisory position as at generation. Later activity appears only in a newer version.');

  _sig := public.conduct_360_fingerprint(jsonb_build_object(
    'facts', _facts, 'metrics', _metrics, 'definition_version', _defver,
    'subject', _snapshot -> 'subject', 'period', jsonb_build_object('start', _ps, 'end', _pe)));

  SELECT jsonb_build_object(
    'attention_items', COALESCE((SELECT jsonb_agg(x->>'id') FROM jsonb_array_elements(_facts->'attention_items') x), '[]'::jsonb),
    'plans', COALESCE((SELECT jsonb_agg(x->>'id') FROM jsonb_array_elements(_facts->'plans') x), '[]'::jsonb),
    'interventions', COALESCE((SELECT jsonb_agg(x->>'id') FROM jsonb_array_elements(_facts->'interventions') x), '[]'::jsonb),
    'reassessments', COALESCE((SELECT jsonb_agg(x->>'id') FROM jsonb_array_elements(_facts->'reassessments') x), '[]'::jsonb),
    'emerging_risks', COALESCE((SELECT jsonb_agg(x->>'id') FROM jsonb_array_elements(_facts->'emerging_risks') x), '[]'::jsonb),
    'findings', COALESCE((SELECT jsonb_agg(x->>'id') FROM jsonb_array_elements(_facts->'findings') x), '[]'::jsonb))
    INTO _ids;

  IF _existing_pack_id IS NOT NULL THEN
    SELECT * INTO _pack FROM public.conduct_evidence_packs WHERE id = _existing_pack_id;
    IF _pack.id IS NULL THEN
      RAISE EXCEPTION 'pack_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    IF COALESCE(btrim(_regeneration_reason),'') = '' THEN
      RAISE EXCEPTION 'reason_required: regenerating an evidence pack requires a recorded reason' USING ERRCODE = '22023';
    END IF;
  ELSE
    _ref := 'EP-' || to_char(now(), 'YYYYMMDD') || '-' ||
            upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.conduct_evidence_packs
      (reference, pack_type, subject_id, subject_key, subject_label, regulator_id, sector_id,
       sectors_in_view, period_start, period_end, created_by)
    VALUES (_ref, _pack_type, _subject_id, _key, _label, _regulator_id, _sector,
            COALESCE(CASE WHEN _sector IS NOT NULL THEN ARRAY[_sector] ELSE _sectors END, '{}'::uuid[]),
            _ps, _pe, _uid)
    RETURNING * INTO _pack;
  END IF;

  _ver := _pack.current_version + 1;
  INSERT INTO public.conduct_evidence_pack_versions
    (pack_id, version, snapshot, metric_package, source_record_ids, facts_signature,
     definition_version, regeneration_reason, generated_by)
  VALUES (_pack.id, _ver, _snapshot, _metrics, _ids, _sig, _defver,
          NULLIF(btrim(COALESCE(_regeneration_reason,'')), ''), _uid);

  UPDATE public.conduct_evidence_packs
     SET current_version = _ver, status = 'GENERATED', updated_at = now()
   WHERE id = _pack.id;

  RETURN jsonb_build_object(
    'pack_id', _pack.id, 'reference', _pack.reference, 'version', _ver,
    'facts_signature', _sig, 'definition_version', _defver,
    'snapshot', _snapshot, 'metrics', _metrics, 'source_record_ids', _ids,
    'previous_versions_preserved', _ver - 1,
    'provenance', jsonb_build_object('source', 'conduct_evidence_pack_generate',
                                     'content_class', 'fact', 'ai_content', false));
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_evidence_pack_generate(text, uuid, text, text, date, date, uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_evidence_pack_generate(text, uuid, text, text, date, date, uuid, uuid, text, uuid) TO authenticated;

-- Read a specific pack version (historical view).
CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_read(_pack_id uuid, _version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _sectors uuid[]; _p public.conduct_evidence_packs; _v public.conduct_evidence_pack_versions;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  SELECT * INTO _p FROM public.conduct_evidence_packs WHERE id = _pack_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'pack_not_found' USING ERRCODE = 'no_data_found'; END IF;
  _sectors := public.conduct_planning_scope(_uid, _p.sector_id, _p.regulator_id);
  IF _p.sector_id IS NOT NULL AND _sectors IS NOT NULL AND NOT (_p.sector_id = ANY(_sectors)) THEN
    RAISE EXCEPTION 'out_of_scope: this pack sits outside your authorised sectors' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _v FROM public.conduct_evidence_pack_versions
   WHERE pack_id = _pack_id AND version = COALESCE(_version, _p.current_version);
  IF _v.id IS NULL THEN RAISE EXCEPTION 'version_not_found' USING ERRCODE = 'no_data_found'; END IF;

  RETURN jsonb_build_object(
    'pack', jsonb_build_object('id', _p.id, 'reference', _p.reference, 'pack_type', _p.pack_type,
      'subject_id', _p.subject_id, 'subject_label', _p.subject_label, 'sector_id', _p.sector_id,
      'period_start', _p.period_start, 'period_end', _p.period_end,
      'current_version', _p.current_version, 'status', _p.status, 'created_at', _p.created_at),
    'version', jsonb_build_object('version', _v.version, 'snapshot', _v.snapshot,
      'metrics', _v.metric_package, 'source_record_ids', _v.source_record_ids,
      'ai_assistance', _v.ai_assistance, 'facts_signature', _v.facts_signature,
      'definition_version', _v.definition_version, 'regeneration_reason', _v.regeneration_reason,
      'generated_by', _v.generated_by, 'generated_at', _v.generated_at),
    'versions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('version', x.version,
                    'generated_at', x.generated_at, 'generated_by', x.generated_by,
                    'facts_signature', x.facts_signature, 'regeneration_reason', x.regeneration_reason)
                    ORDER BY x.version DESC), '[]'::jsonb)
                  FROM public.conduct_evidence_pack_versions x WHERE x.pack_id = _pack_id));
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_evidence_pack_read(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_evidence_pack_read(uuid, integer) TO authenticated;

-- Record an export of a pack version.
CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_export_log(
  _pack_id uuid, _version integer, _format text, _scope jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _p public.conduct_evidence_packs; _sectors uuid[];
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  SELECT * INTO _p FROM public.conduct_evidence_packs WHERE id = _pack_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'pack_not_found' USING ERRCODE = 'no_data_found'; END IF;
  _sectors := public.conduct_planning_scope(_uid, _p.sector_id, _p.regulator_id);
  IF _p.sector_id IS NOT NULL AND _sectors IS NOT NULL AND NOT (_p.sector_id = ANY(_sectors)) THEN
    RAISE EXCEPTION 'out_of_scope' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.conduct_evidence_pack_exports (pack_id, version, format, scope, exported_by)
  VALUES (_pack_id, _version, lower(_format), COALESCE(_scope, '{}'::jsonb), _uid)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_evidence_pack_export_log(uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_evidence_pack_export_log(uuid, integer, text, jsonb) TO authenticated;

-- List packs visible to the caller.
CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_list(
  _pack_type text DEFAULT NULL, _subject_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL, _regulator_id uuid DEFAULT NULL, _limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _sectors uuid[];
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);
  RETURN jsonb_build_object('packs', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference,
             'pack_type', p.pack_type, 'subject_id', p.subject_id, 'subject_label', p.subject_label,
             'sector_id', p.sector_id, 'period_start', p.period_start, 'period_end', p.period_end,
             'current_version', p.current_version, 'status', p.status,
             'created_by', p.created_by, 'created_at', p.created_at,
             'latest_signature', (SELECT v.facts_signature FROM public.conduct_evidence_pack_versions v
                                   WHERE v.pack_id = p.id ORDER BY v.version DESC LIMIT 1))
             ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.conduct_evidence_packs p2
             WHERE (_pack_type IS NULL OR p2.pack_type = _pack_type)
               AND (_subject_id IS NULL OR p2.subject_id = _subject_id)
               AND (_sectors IS NULL OR p2.sector_id IS NULL OR p2.sector_id = ANY(_sectors))
             ORDER BY p2.created_at DESC
             LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500))) p));
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_evidence_pack_list(text, uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_evidence_pack_list(text, uuid, uuid, uuid, integer) TO authenticated;

-- Release debt register read (release certification view).
CREATE OR REPLACE FUNCTION public.release_debt_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM public.release_debt_register),
    'open', (SELECT count(*) FROM public.release_debt_register WHERE status IN ('OPEN','IN_PROGRESS')),
    'security_blocking', (SELECT count(*) FROM public.release_debt_register WHERE security_blocking AND status IN ('OPEN','IN_PROGRESS')),
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('item_code', d.item_code,
        'test_reference', d.test_reference, 'assertion', d.assertion, 'title', d.title,
        'classification', d.classification, 'description', d.description,
        'security_blocking', d.security_blocking, 'release_blocking', d.release_blocking,
        'status', d.status, 'owner_role', d.owner_role, 'raised_in_phase', d.raised_in_phase,
        'target_phase', d.target_phase, 'intended_verification', d.intended_verification)
        ORDER BY d.item_code), '[]'::jsonb) FROM public.release_debt_register d));
END $$;

REVOKE EXECUTE ON FUNCTION public.release_debt_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_debt_summary() TO authenticated;