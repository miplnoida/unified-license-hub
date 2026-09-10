-- =====================================================================
-- AML-UAT-01 defect correction — canonical rating codes in portfolio trends
-- =====================================================================
-- Acceptance testing showed the portfolio movement trends splitting one
-- rating into two buckets ("HIGH" and "high") because a small number of
-- historical movement rows carry lower-case rating codes. The immutable
-- movement ledger is not modified; the server now reports canonical
-- upper-case rating codes in the movement rows and in the opening and
-- closing distributions, so one rating is always one bucket.
-- No band, threshold, interval or regulator policy is introduced.
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_internal(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _p jsonb := COALESCE(_payload, '{}'::jsonb);
  _d text := upper(COALESCE(_p->>'domain_code','AML_CFT'));
  _as_of date := COALESCE(NULLIF(_p->>'as_of','')::date, current_date);
  _pfrom date;
  _pto date;
  _limit int := LEAST(GREATEST(COALESCE(NULLIF(_p->>'limit','')::int, 500), 1), 2000);

  /* filters */
  _f_reg uuid := NULLIF(_p->>'regulator_id','')::uuid;
  _f_sector uuid := NULLIF(_p->>'sector_id','')::uuid;
  _f_risk text := NULLIF(upper(_p->>'risk_code'),'');
  _f_prov text := NULLIF(upper(_p->>'provenance'),'');
  _f_state text := NULLIF(upper(_p->>'monitoring_state'),'');
  _f_astatus text := NULLIF(upper(_p->>'assessment_status'),'');
  _f_prog uuid := NULLIF(_p->>'programme_id','')::uuid;
  _f_cons text := NULLIF(upper(_p->>'consequence_action_type'),'');
  _f_eff_from date := NULLIF(_p->>'effective_from','')::date;
  _f_eff_to date := NULLIF(_p->>'effective_to','')::date;
  _f_rev_from date := NULLIF(_p->>'review_from','')::date;
  _f_rev_to date := NULLIF(_p->>'review_to','')::date;

  _rec record;
  _src jsonb; _v jsonb;
  _rows jsonb := '[]'::jsonb;
  _visible int := 0;
  _kept int := 0;
  _truncated boolean := false;

  _bucket text; _risk text; _state text; _reason text; _reason_codes jsonb;
  _eff date; _next_review date; _basis text;
  _prov text; _calc text;
  _open_cons int; _open_reassess uuid; _restricted boolean;
  _findings int; _exams int; _ivs int; _enf int;
  _asmt_status text; _asmt_id uuid; _pub_id uuid; _prog_id uuid;
  _entity_ids uuid[] := '{}';

  /* aggregates */
  _c_with int := 0; _c_without int := 0;
  _b_calc int := 0; _b_ovr int := 0; _b_leg int := 0; _b_nc int := 0; _b_norisk int := 0;
  _s_current int := 0; _s_due int := 0; _s_over int := 0; _s_event int := 0;
  _s_unsched int := 0; _s_blocked int := 0; _s_legacy int := 0;
  _e_reassess int := 0; _e_cons int := 0;
  _t_find int := 0; _t_exam int := 0; _t_iv int := 0; _t_enf int := 0;
  _dist jsonb; _rdist jsonb;
  _movements jsonb; _up int; _down int; _flat int; _other int;
  _opening jsonb; _closing jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  _pto   := COALESCE(NULLIF(_p->>'period_to','')::date, _as_of);
  _pfrom := COALESCE(NULLIF(_p->>'period_from','')::date, (_pto - 365));
  IF _pfrom > _pto THEN
    RAISE EXCEPTION 'invalid_period: period_from % is after period_to %', _pfrom, _pto
      USING ERRCODE = '22023';
  END IF;

  FOR _rec IN
    SELECT l.id, l.name, l.lead_regulator_id, l.sector_id, l.status
      FROM public.licensees l
     ORDER BY l.name, l.id
  LOOP
    /* -------- visibility: regulator, domain and supervisory perimeter ----- */
    IF NOT public.supervisory_monitoring_scope_admits(_uid, _d, _rec.id,
             _rec.lead_regulator_id, _rec.sector_id) THEN
      CONTINUE;
    END IF;
    _visible := _visible + 1;

    _src := public.supervisory_consequence_source_internal(_rec.id, _d, NULL);
    _prov := _src->>'rating_provenance';
    _calc := _src->>'calculation_availability';
    _risk := _src->>'current_rating';
    _eff  := NULLIF(_src->>'effective_from','')::timestamptz::date;
    _pub_id := NULLIF(_src->'publication'->>'id','')::uuid;
    _asmt_id := NULLIF(_src->'assessment'->>'id','')::uuid;
    _asmt_status := _src->'assessment'->>'status';
    _prog_id := NULLIF(_src->'assessment'->>'assessment_programme_id','')::uuid;
    _reason_codes := '[]'::jsonb;

    IF (_src->>'source_kind') = 'NONE' THEN
      _bucket := 'NO_RISK'; _risk := NULL;
      _state := 'BLOCKED'; _reason := 'NO_RISK_OF_RECORD';
      _next_review := NULL; _basis := NULL;
      _reason_codes := _reason_codes || jsonb_build_array(jsonb_build_object(
        'field','current_risk','code','NO_RISK_OF_RECORD',
        'detail','No AML/CFT risk-of-record exists for this entity. No rating or band is inferred.'));
    ELSE
      /* the AML-09 read model owns the review cycle: it is read, never re-derived */
      _v := public.supervisory_risk_monitoring_view(_rec.id, _d);
      _state := _v->>'monitoring_state';
      _reason := _v->>'reason_code';
      _next_review := NULLIF(_v->'schedule'->>'next_review_date','')::date;
      _basis := _v->'schedule'->>'due_date_basis';

      /* as-of restatement uses the same server rule against the requested date */
      IF _as_of <> current_date AND _state IN ('CURRENT','DUE','OVERDUE')
         AND _next_review IS NOT NULL THEN
        _state := CASE WHEN _next_review < _as_of THEN 'OVERDUE'
                       WHEN _next_review = _as_of THEN 'DUE'
                       ELSE 'CURRENT' END;
        _reason := CASE _state WHEN 'OVERDUE' THEN 'REVIEW_DATE_PASSED'
                               WHEN 'DUE' THEN 'REVIEW_DUE_TODAY'
                               ELSE 'REVIEW_NOT_YET_DUE' END;
      END IF;

      _bucket := CASE
        WHEN _prov = 'APPROVED_OVERRIDE' THEN 'APPROVED_OVERRIDE'
        WHEN _prov = 'COMPUTED' AND _calc = 'CALCULATED' THEN 'CALCULATED'
        WHEN (_src->>'source_kind') = 'LEGACY_RISK_RECORD'
          OR _prov = 'LEGACY_OFFICER_RATING' THEN 'LEGACY'
        ELSE 'NOT_CALCULABLE' END;

      IF _bucket = 'LEGACY' THEN
        _reason_codes := _reason_codes || jsonb_build_array(jsonb_build_object(
          'field','provenance','code','LEGACY_RISK_RECORD',
          'detail','The risk-of-record predates governed publication. It is not a calculated rating.'));
      END IF;
      IF _bucket = 'NOT_CALCULABLE' THEN
        _reason_codes := _reason_codes || jsonb_build_array(jsonb_build_object(
          'field','provenance','code', COALESCE(NULLIF(_calc,''),'UNAVAILABLE'),
          'detail','No approved calculation outcome is available, so this is not a calculated rating.'));
      END IF;
    END IF;

    /* ---------------- open governed consequences (AML-08) ----------------- */
    SELECT count(*) INTO _open_cons FROM public.supervisory_consequence_decision c
     WHERE c.entity_id = _rec.id AND c.domain_code = _d
       AND upper(COALESCE(c.status,'')) NOT IN ('WITHDRAWN','SUPERSEDED','CLOSED','CANCELLED')
       AND (_f_cons IS NULL OR upper(COALESCE(c.action_type,'')) = _f_cons);

    SELECT r.id INTO _open_reassess FROM public.supervisory_reassessment_requirement r
     WHERE r.entity_id = _rec.id AND r.domain_code = _d
       AND r.status NOT IN ('FULFILLED','CANCELLED')
     ORDER BY r.created_at DESC LIMIT 1;

    /* -------- exposure counts: restricted matters are never counted ------- */
    SELECT count(*) INTO _findings FROM public.supervisory_finding f
     WHERE f.entity_id = _rec.id AND upper(COALESCE(f.domain_code,'')) = _d
       AND f.status NOT IN ('CLOSED','SUPERSEDED','DRAFT')
       AND upper(COALESCE(f.confidentiality,'')) NOT IN ('RESTRICTED','CONFIDENTIAL');
    SELECT count(*) INTO _exams FROM public.examinations x
     WHERE x.entity_id = _rec.id AND upper(COALESCE(x.domain_code,'')) = _d
       AND x.closed_at IS NULL;
    SELECT count(*) INTO _ivs FROM public.supervisory_intervention i
     WHERE i.licensee_id = _rec.id AND upper(COALESCE(i.domain_code,'')) = _d
       AND upper(COALESCE(i.status,'')) IN ('PROPOSED','ENDORSED','ACTIVE');
    SELECT count(*) INTO _enf FROM public.enforcement_actions a
     WHERE a.entity_id = _rec.id
       AND lower(COALESCE(a.status,'')) NOT IN ('closed','withdrawn');
    _restricted := public.entity_restricted_matter_present(_rec.id);
    IF _restricted THEN
      _reason_codes := _reason_codes || jsonb_build_array(jsonb_build_object(
        'field','open_findings','code','RESTRICTED_SOURCE_WITHHELD',
        'detail','A restricted supervisory matter exists. It is reported as present only and is excluded from every count.'));
    END IF;

    /* -------------------------- server-side filters ----------------------- */
    IF _f_reg IS NOT NULL AND _rec.lead_regulator_id IS DISTINCT FROM _f_reg THEN CONTINUE; END IF;
    IF _f_sector IS NOT NULL AND _rec.sector_id IS DISTINCT FROM _f_sector THEN CONTINUE; END IF;
    IF _f_risk IS NOT NULL AND upper(COALESCE(_risk,'')) <> _f_risk THEN CONTINUE; END IF;
    IF _f_prov IS NOT NULL AND _bucket <> _f_prov THEN CONTINUE; END IF;
    IF _f_state IS NOT NULL AND _state <> _f_state THEN CONTINUE; END IF;
    IF _f_astatus IS NOT NULL AND upper(COALESCE(_asmt_status,'')) <> _f_astatus THEN CONTINUE; END IF;
    IF _f_prog IS NOT NULL AND _prog_id IS DISTINCT FROM _f_prog THEN CONTINUE; END IF;
    IF _f_cons IS NOT NULL AND _open_cons = 0 THEN CONTINUE; END IF;
    IF _f_eff_from IS NOT NULL AND (_eff IS NULL OR _eff < _f_eff_from) THEN CONTINUE; END IF;
    IF _f_eff_to IS NOT NULL AND (_eff IS NULL OR _eff > _f_eff_to) THEN CONTINUE; END IF;
    IF _f_rev_from IS NOT NULL AND (_next_review IS NULL OR _next_review < _f_rev_from) THEN CONTINUE; END IF;
    IF _f_rev_to IS NOT NULL AND (_next_review IS NULL OR _next_review > _f_rev_to) THEN CONTINUE; END IF;

    /* ------------------------------ aggregate ----------------------------- */
    _kept := _kept + 1;
    _entity_ids := _entity_ids || _rec.id;
    IF _bucket = 'NO_RISK' THEN _c_without := _c_without + 1; ELSE _c_with := _c_with + 1; END IF;
    _b_calc   := _b_calc   + (CASE WHEN _bucket='CALCULATED' THEN 1 ELSE 0 END);
    _b_ovr    := _b_ovr    + (CASE WHEN _bucket='APPROVED_OVERRIDE' THEN 1 ELSE 0 END);
    _b_leg    := _b_leg    + (CASE WHEN _bucket='LEGACY' THEN 1 ELSE 0 END);
    _b_nc     := _b_nc     + (CASE WHEN _bucket='NOT_CALCULABLE' THEN 1 ELSE 0 END);
    _b_norisk := _b_norisk + (CASE WHEN _bucket='NO_RISK' THEN 1 ELSE 0 END);
    _s_current  := _s_current  + (CASE WHEN _state='CURRENT' THEN 1 ELSE 0 END);
    _s_due      := _s_due      + (CASE WHEN _state='DUE' THEN 1 ELSE 0 END);
    _s_over     := _s_over     + (CASE WHEN _state='OVERDUE' THEN 1 ELSE 0 END);
    _s_event    := _s_event    + (CASE WHEN _state='EVENT_TRIGGERED' THEN 1 ELSE 0 END);
    _s_unsched  := _s_unsched  + (CASE WHEN _state='UNSCHEDULED' THEN 1 ELSE 0 END);
    _s_blocked  := _s_blocked  + (CASE WHEN _state='BLOCKED' THEN 1 ELSE 0 END);
    _s_legacy   := _s_legacy   + (CASE WHEN _state='LEGACY' THEN 1 ELSE 0 END);
    IF _open_reassess IS NOT NULL THEN _e_reassess := _e_reassess + 1; END IF;
    IF _open_cons > 0 THEN _e_cons := _e_cons + 1; END IF;
    _t_find := _t_find + _findings; _t_exam := _t_exam + _exams;
    _t_iv := _t_iv + _ivs; _t_enf := _t_enf + _enf;

    IF _kept > _limit THEN
      _truncated := true;
    ELSE
      _rows := _rows || jsonb_build_array(jsonb_build_object(
        'entity_id', _rec.id, 'entity_name', _rec.name, 'entity_status', _rec.status,
        'regulator_id', _rec.lead_regulator_id, 'sector_id', _rec.sector_id,
        'domain_code', _d,
        'current_risk', _risk,
        'inherent_rating', _src->'risk_state'->>'inherent_rating',
        'control_rating', _src->'risk_state'->>'control_rating',
        'provenance_bucket', _bucket,
        'rating_provenance', _prov,
        'calculation_availability', _calc,
        'effective_from', _eff,
        'risk_age_days', CASE WHEN _eff IS NULL THEN NULL ELSE (_as_of - _eff) END,
        'source_kind', _src->>'source_kind',
        'publication_id', _pub_id,
        'assessment_id', _asmt_id,
        'assessment_reference', _src->'assessment'->>'reference',
        'assessment_status', _asmt_status,
        'assessment_programme_id', _prog_id,
        'assessment_programme_code', _src->'assessment'->>'assessment_programme_code',
        'monitoring_state', _state,
        'monitoring_reason_code', _reason,
        'next_review_date', _next_review,
        'due_date_basis', _basis,
        'open_reassessment_id', _open_reassess,
        'open_consequence_count', _open_cons,
        'open_findings', _findings,
        'open_examinations', _exams,
        'open_interventions', _ivs,
        'open_enforcement', _enf,
        'restricted_matter_present', _restricted,
        'reason_codes', _reason_codes,
        'routes', jsonb_build_object(
          'entity','/supervision/aml/entities/' || _rec.id::text,
          'assessment', CASE WHEN _asmt_id IS NULL THEN NULL
                             ELSE '/supervision/aml/assessments/' || _asmt_id::text END,
          'findings','/supervision/findings?entity=' || _rec.id::text,
          'examinations','/supervision/examinations?entity=' || _rec.id::text)));
    END IF;
  END LOOP;

  /* ------------------------- risk distribution -------------------------- */
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'provenance_bucket', x->>'risk_code'), '[]'::jsonb)
    INTO _dist
    FROM (
      SELECT jsonb_build_object(
               'risk_code', COALESCE(r->>'current_risk','NONE'),
               'provenance_bucket', r->>'provenance_bucket',
               'entities', count(*)) AS x
        FROM jsonb_array_elements(_rows) r
       GROUP BY r->>'provenance_bucket', COALESCE(r->>'current_risk','NONE')
    ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'monitoring_state'), '[]'::jsonb)
    INTO _rdist
    FROM (
      SELECT jsonb_build_object('monitoring_state', r->>'monitoring_state',
                                'entities', count(*)) AS x
        FROM jsonb_array_elements(_rows) r GROUP BY r->>'monitoring_state'
    ) s;

  /* --------- trends: immutable risk movement history only --------------- */
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'movement_id', m.id, 'entity_id', m.entity_id, 'entity_name', l.name,
      'previous_rating', upper(NULLIF(m.previous_rating,'')), 'new_rating', upper(NULLIF(m.new_rating,'')),
      'previous_inherent', m.previous_inherent, 'new_inherent', m.new_inherent,
      'previous_control', m.previous_control, 'new_control', m.new_control,
      'trend', m.trend,
      'direction', CASE upper(COALESCE(m.trend,''))
                     WHEN 'DETERIORATING' THEN 'UPWARD'
                     WHEN 'IMPROVING' THEN 'DOWNWARD'
                     WHEN 'STABLE' THEN 'UNCHANGED'
                     ELSE 'UNCLASSIFIED' END,
      'reason', m.reason, 'trigger_kind', m.trigger_kind,
      'previous_assessment_id', m.previous_assessment_id,
      'new_assessment_id', m.new_assessment_id,
      'legacy_movement', (m.new_assessment_id IS NULL),
      'source_publication_id', p.id,
      'approved_by', m.approved_by, 'approved_at', m.approved_at,
      'occurred_on', COALESCE(m.approved_at, m.created_at)::date,
      'lineage', jsonb_strip_nulls(jsonb_build_object(
        'requirement_id', m.requirement_id, 'examination_id', m.examination_id,
        'supporting_finding_ids', to_jsonb(m.supporting_finding_ids),
        'remediation_action_ids', to_jsonb(m.remediation_action_ids)))
      ) ORDER BY COALESCE(m.approved_at, m.created_at) DESC), '[]'::jsonb),
    count(*) FILTER (WHERE upper(COALESCE(m.trend,'')) = 'DETERIORATING'),
    count(*) FILTER (WHERE upper(COALESCE(m.trend,'')) = 'IMPROVING'),
    count(*) FILTER (WHERE upper(COALESCE(m.trend,'')) = 'STABLE'),
    count(*) FILTER (WHERE upper(COALESCE(m.trend,'')) NOT IN ('DETERIORATING','IMPROVING','STABLE'))
    INTO _movements, _up, _down, _flat, _other
    FROM public.entity_risk_state_movement m
    JOIN public.licensees l ON l.id = m.entity_id
    LEFT JOIN public.supervisory_assessment_risk_publication p
           ON p.assessment_id = m.new_assessment_id AND p.entity_id = m.entity_id
   WHERE m.entity_id = ANY (_entity_ids)
     AND upper(COALESCE(m.domain_code,'')) = _d
     AND COALESCE(m.approved_at, m.created_at)::date BETWEEN _pfrom AND _pto;

  /* opening and closing distributions come from the same movement history */
  SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) INTO _opening FROM (
    SELECT COALESCE(o.k,'NONE') k, count(*) n FROM (
      SELECT r->>'entity_id' AS e,
             COALESCE(
               (SELECT upper(NULLIF(m.previous_rating,'')) FROM public.entity_risk_state_movement m
                 WHERE m.entity_id = (r->>'entity_id')::uuid
                   AND upper(COALESCE(m.domain_code,'')) = _d
                   AND COALESCE(m.approved_at, m.created_at)::date BETWEEN _pfrom AND _pto
                 ORDER BY COALESCE(m.approved_at, m.created_at) ASC LIMIT 1),
               upper(NULLIF(r->>'current_risk',''))) AS k
        FROM jsonb_array_elements(_rows) r) o
     GROUP BY COALESCE(o.k,'NONE')) s;

  SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) INTO _closing FROM (
    SELECT COALESCE(o.k,'NONE') k, count(*) n FROM (
      SELECT COALESCE(
               (SELECT upper(NULLIF(m.new_rating,'')) FROM public.entity_risk_state_movement m
                 WHERE m.entity_id = (r->>'entity_id')::uuid
                   AND upper(COALESCE(m.domain_code,'')) = _d
                   AND COALESCE(m.approved_at, m.created_at)::date BETWEEN _pfrom AND _pto
                 ORDER BY COALESCE(m.approved_at, m.created_at) DESC LIMIT 1),
               upper(NULLIF(r->>'current_risk',''))) AS k
        FROM jsonb_array_elements(_rows) r) o
     GROUP BY COALESCE(o.k,'NONE')) s;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'as_of', _as_of,
    'domain_code', _d,
    'source', 'SERVER_READ_MODEL',
    'filters', jsonb_strip_nulls(jsonb_build_object(
      'domain_code', _d, 'as_of', _as_of,
      'period_from', _pfrom, 'period_to', _pto,
      'regulator_id', _f_reg, 'sector_id', _f_sector,
      'risk_code', _f_risk, 'provenance', _f_prov,
      'monitoring_state', _f_state, 'assessment_status', _f_astatus,
      'programme_id', _f_prog, 'consequence_action_type', _f_cons,
      'effective_from', _f_eff_from, 'effective_to', _f_eff_to,
      'review_from', _f_rev_from, 'review_to', _f_rev_to,
      'limit', _limit)),
    'summary', jsonb_build_object(
      'as_of', _as_of,
      'domain_code', _d,
      'regulator_id', _f_reg,
      'visible_entity_total', _visible,
      'entity_total', _kept,
      'entities_with_current_risk', _c_with,
      'entities_without_risk', _c_without,
      'calculated_risk_total', _b_calc,
      'approved_override_total', _b_ovr,
      'legacy_risk_total', _b_leg,
      'not_calculable_total', _b_nc,
      'no_risk_total', _b_norisk,
      'review_current_total', _s_current,
      'review_due_total', _s_due,
      'review_overdue_total', _s_over,
      'review_event_triggered_total', _s_event,
      'review_unscheduled_total', _s_unsched,
      'review_blocked_total', _s_blocked,
      'review_legacy_total', _s_legacy,
      'entities_with_open_reassessment', _e_reassess,
      'entities_with_open_consequence', _e_cons,
      'open_findings_total', _t_find,
      'open_examinations_total', _t_exam,
      'open_interventions_total', _t_iv,
      'open_enforcement_total', _t_enf),
    'risk_distribution', _dist,
    'review_distribution', _rdist,
    'trends', jsonb_build_object(
      'period_from', _pfrom, 'period_to', _pto,
      'source','entity_risk_state_movement',
      'opening', _opening, 'closing', _closing,
      'upward_movements', _up, 'downward_movements', _down,
      'unchanged_movements', _flat, 'unclassified_movements', _other,
      'movements', _movements),
    'entities', _rows,
    'row_count', jsonb_array_length(_rows),
    'truncated', _truncated,
    'notes', jsonb_build_array(
      'Legacy and NOT_CALCULABLE records are not calculated ratings. They are reported in their own buckets and are never placed in a calculated risk band.',
      'Restricted or confidential supervisory matters are reported as present only. They are excluded from every count and never disclosed.',
      'Review states, review dates and risk ratings are read from the canonical records. No review interval, band or portfolio threshold is assumed.'));
END $function$

;
