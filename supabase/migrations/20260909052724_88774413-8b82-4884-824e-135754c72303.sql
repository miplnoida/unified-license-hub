
-- ===================================================================
-- AML-03 (3/3) — read models, runtime options service, snapshot
-- ===================================================================

ALTER TABLE public.supervisory_assessment
  ADD COLUMN IF NOT EXISTS assessment_programme_set_id uuid REFERENCES public.supervisory_assessment_programme_set(id),
  ADD COLUMN IF NOT EXISTS assessment_programme_id uuid REFERENCES public.supervisory_assessment_programme(id),
  ADD COLUMN IF NOT EXISTS assessment_programme_code text,
  ADD COLUMN IF NOT EXISTS assessment_programme_version text,
  ADD COLUMN IF NOT EXISTS assessment_programme_provenance text;

-- ---------- register ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_register(
  _search text DEFAULT NULL, _domain_code text DEFAULT NULL, _origin text DEFAULT NULL,
  _status text DEFAULT NULL, _regulator_id uuid DEFAULT NULL,
  _sort text DEFAULT 'updated_at', _dir text DEFAULT 'desc',
  _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _rows jsonb; _total int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  WITH scoped AS (
    SELECT s.* FROM public.supervisory_assessment_programme_set s
     WHERE public.supervisory_methodology_regulator_scope_readable(s.domain_code, s.regulator_id)
       AND (_domain_code IS NULL OR s.domain_code = upper(_domain_code))
       AND (_origin IS NULL OR s.origin = upper(_origin))
       AND (_status IS NULL OR s.status = upper(_status))
       AND (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
       AND (_search IS NULL OR btrim(_search) = '' OR
            s.code ILIKE '%'||btrim(_search)||'%' OR s.name ILIKE '%'||btrim(_search)||'%')
  ), enriched AS (
    SELECT s.*, r.code AS regulator_code, r.name AS regulator_name,
           (SELECT count(*) FROM public.supervisory_assessment_programme p
             WHERE p.programme_set_id = s.id AND p.retired_at IS NULL) AS programme_count,
           (SELECT count(*) FROM public.supervisory_assessment_programme p
             WHERE p.programme_set_id = s.id AND p.is_active AND p.retired_at IS NULL) AS active_programme_count,
           (SELECT count(*) FROM public.supervisory_policy_profile_binding b
             WHERE b.component_type='ASSESSMENT_PROGRAMME' AND b.component_id = s.id) AS profile_binding_count
      FROM scoped s LEFT JOIN public.regulators r ON r.id = s.regulator_id
  )
  SELECT count(*) INTO _total FROM enriched;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY
           CASE WHEN lower(COALESCE(_dir,'desc'))='asc' THEN x.sort_key END ASC,
           CASE WHEN lower(COALESCE(_dir,'desc'))<>'asc' THEN x.sort_key END DESC), '[]'::jsonb)
    INTO _rows
    FROM (
      SELECT s.id, s.code, s.set_version, s.name, s.description, s.domain_code, s.regulator_id,
             r.code AS regulator_code, r.name AS regulator_name, s.origin, s.status,
             s.effective_from, s.effective_to, s.adopted_from_id, s.supersedes_id,
             s.created_at, s.updated_at,
             (SELECT count(*) FROM public.supervisory_assessment_programme p
               WHERE p.programme_set_id = s.id AND p.retired_at IS NULL) AS programme_count,
             (SELECT count(*) FROM public.supervisory_assessment_programme p
               WHERE p.programme_set_id = s.id AND p.is_active AND p.retired_at IS NULL) AS active_programme_count,
             (SELECT count(*) FROM public.supervisory_policy_profile_binding b
               WHERE b.component_type='ASSESSMENT_PROGRAMME' AND b.component_id = s.id) AS profile_binding_count,
             CASE COALESCE(_sort,'updated_at')
               WHEN 'code' THEN s.code WHEN 'status' THEN s.status
               WHEN 'origin' THEN s.origin WHEN 'domain_code' THEN s.domain_code
               ELSE to_char(s.updated_at,'YYYY-MM-DD HH24:MI:SS') END AS sort_key
        FROM public.supervisory_assessment_programme_set s
        LEFT JOIN public.regulators r ON r.id = s.regulator_id
       WHERE public.supervisory_methodology_regulator_scope_readable(s.domain_code, s.regulator_id)
         AND (_domain_code IS NULL OR s.domain_code = upper(_domain_code))
         AND (_origin IS NULL OR s.origin = upper(_origin))
         AND (_status IS NULL OR s.status = upper(_status))
         AND (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
         AND (_search IS NULL OR btrim(_search) = '' OR
              s.code ILIKE '%'||btrim(_search)||'%' OR s.name ILIKE '%'||btrim(_search)||'%')
       LIMIT GREATEST(COALESCE(_limit,50),1) OFFSET GREATEST(COALESCE(_offset,0),0)
    ) x;

  RETURN jsonb_build_object('rows', _rows, 'total', _total);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_register_options()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _scope jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _scope := public.supervisory_authorised_regulator_options(NULL, NULL);

  RETURN jsonb_build_object(
    'domains', (SELECT COALESCE(jsonb_agg(DISTINCT domain_code), '[]'::jsonb)
                  FROM public.supervisory_assessment_programme_set s
                 WHERE public.supervisory_methodology_regulator_scope_readable(s.domain_code, s.regulator_id)),
    'origins', jsonb_build_array('MIPL_REFERENCE','REGULATOR_ADOPTED','REGULATOR_AUTHORED'),
    'statuses', jsonb_build_array('DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED','RETIRED'),
    'regulators', COALESCE(_scope->'regulators','[]'::jsonb),
    'selectable_regulator_count', COALESCE(_scope->'selectable_count','0'::jsonb),
    'cross_regulator_allowed', COALESCE(_scope->'cross_regulator_allowed','false'::jsonb),
    'active_regulator', COALESCE(_scope->'active_regulator','null'::jsonb),
    'regulator_scope_reason', _scope->'reason',
    'period_rules', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='PERIOD_RULE' AND v.is_active),
    'question_classes', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='QUESTION_CLASS' AND v.is_active),
    'assessment_types', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='ASSESSMENT_TYPE' AND v.is_active),
    'trigger_codes', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.sort_order),'[]'::jsonb)
                       FROM public.supervisory_assessment_programme_vocabulary v
                      WHERE v.kind='TRIGGER_CODE' AND v.is_active));
END $$;

-- ---------- capabilities ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_action_capabilities(_set_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _s public.supervisory_assessment_programme_set;
        _manage boolean := false; _approve boolean := false; _reason text; _v jsonb;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id=_set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE='22023'; END IF;

  BEGIN
    IF _s.regulator_id IS NULL THEN PERFORM public.supervisory_domain_require_manage(_s.domain_code);
    ELSE PERFORM public.supervisory_domain_require_manage_for_regulator(_s.domain_code, _s.regulator_id); END IF;
    _manage := true;
  EXCEPTION WHEN OTHERS THEN _manage := false; _reason := SQLERRM; END;

  BEGIN
    PERFORM public.supervisory_assessment_programme_set_require_approval(_set_id);
    _approve := true;
  EXCEPTION WHEN OTHERS THEN _approve := false; END;

  _v := public.supervisory_assessment_programme_set_validate(_set_id);

  RETURN jsonb_build_object(
    'programme_set_id', _set_id, 'status', _s.status, 'origin', _s.origin,
    'editable', _manage AND _s.status = 'DRAFT',
    'can_manage', _manage,
    'can_submit', _manage AND _s.status='DRAFT' AND (_v->>'error_count')::int = 0,
    'can_return', _manage AND _s.status='REVIEW',
    'can_approve', _approve AND _s.status='REVIEW'
                   AND _s.created_by IS DISTINCT FROM _uid
                   AND _s.submitted_by IS DISTINCT FROM _uid
                   AND (_v->>'error_count')::int = 0,
    'can_activate', _approve AND _s.status='APPROVED' AND _s.origin <> 'MIPL_REFERENCE',
    'can_retire', _approve AND _s.status IN ('ACTIVE','APPROVED','SUPERSEDED'),
    'can_new_version', _manage AND _s.status IN ('APPROVED','ACTIVE','SUPERSEDED','RETIRED'),
    'can_adopt', _s.origin = 'MIPL_REFERENCE',
    'maker_checker_block', CASE
       WHEN _s.status='REVIEW' AND (_s.created_by = _uid OR _s.submitted_by = _uid)
         THEN 'You authored or submitted this programme set, so another officer must approve it.' END,
    'validation', _v,
    'reason', _reason);
END $$;

-- ---------- detail ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_detail(_set_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.supervisory_assessment_programme_set; _out jsonb;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id=_set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE='22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_s.domain_code, _s.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: outside your authorised regulator scope' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object(
    'set', to_jsonb(_s) || jsonb_build_object(
      'regulator_code', (SELECT code FROM public.regulators WHERE id=_s.regulator_id),
      'regulator_name', (SELECT name FROM public.regulators WHERE id=_s.regulator_id),
      'adopted_from', (SELECT jsonb_build_object('id',a.id,'code',a.code,'set_version',a.set_version,'origin',a.origin)
                         FROM public.supervisory_assessment_programme_set a WHERE a.id=_s.adopted_from_id),
      'supersedes', (SELECT jsonb_build_object('id',a.id,'code',a.code,'set_version',a.set_version,'status',a.status)
                         FROM public.supervisory_assessment_programme_set a WHERE a.id=_s.supersedes_id)),
    'programmes', (SELECT COALESCE(jsonb_agg(to_jsonb(p) || jsonb_build_object(
                       'triggers', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.trigger_code),'[]'::jsonb)
                                      FROM public.supervisory_assessment_programme_trigger t
                                     WHERE t.programme_id = p.id))
                     ORDER BY p.sort_order, p.programme_code), '[]'::jsonb)
                    FROM public.supervisory_assessment_programme p WHERE p.programme_set_id=_set_id),
    'profile_bindings', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                            'profile_id', pr.id, 'profile_code', pr.code,
                            'profile_version', pr.profile_version, 'profile_status', pr.status,
                            'profile_origin', pr.origin,
                            'bound_version', b.component_version)),'[]'::jsonb)
                          FROM public.supervisory_policy_profile_binding b
                          JOIN public.supervisory_policy_profile pr ON pr.id = b.profile_id
                         WHERE b.component_type='ASSESSMENT_PROGRAMME' AND b.component_id=_set_id),
    'versions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'set_version',v.set_version,
                       'status',v.status,'origin',v.origin) ORDER BY v.created_at),'[]'::jsonb)
                   FROM public.supervisory_assessment_programme_set v WHERE v.code=_s.code),
    'validation', public.supervisory_assessment_programme_set_validate(_set_id)
  ) INTO _out;
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_event_register(
  _set_id uuid, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.supervisory_assessment_programme_set;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id=_set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE='22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_s.domain_code, _s.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: outside your authorised regulator scope' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('rows', (
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC),'[]'::jsonb) FROM (
      SELECT ev.*, p.full_name AS actor_name
        FROM public.supervisory_assessment_programme_event ev
        LEFT JOIN public.profiles p ON p.id = ev.actor_id
       WHERE ev.programme_set_id=_set_id
       ORDER BY ev.created_at DESC
       LIMIT GREATEST(COALESCE(_limit,100),1) OFFSET GREATEST(COALESCE(_offset,0),0)) e),
    'total', (SELECT count(*) FROM public.supervisory_assessment_programme_event WHERE programme_set_id=_set_id));
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_compare(_set_id uuid, _baseline_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment_programme_set; _b public.supervisory_assessment_programme_set;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment_programme_set WHERE id=_set_id;
  SELECT * INTO _b FROM public.supervisory_assessment_programme_set WHERE id=_baseline_id;
  IF _a.id IS NULL OR _b.id IS NULL THEN
    RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE='22023'; END IF;
  IF NOT (public.supervisory_methodology_regulator_scope_readable(_a.domain_code,_a.regulator_id)
      AND public.supervisory_methodology_regulator_scope_readable(_b.domain_code,_b.regulator_id)) THEN
    RAISE EXCEPTION 'not_authorized: outside your authorised regulator scope' USING ERRCODE='42501'; END IF;

  RETURN jsonb_build_object(
    'subject', jsonb_build_object('id',_a.id,'code',_a.code,'set_version',_a.set_version,'status',_a.status),
    'baseline', jsonb_build_object('id',_b.id,'code',_b.code,'set_version',_b.set_version,'status',_b.status),
    'programmes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'programme_code', COALESCE(x.programme_code, y.programme_code),
        'change', CASE WHEN y.programme_code IS NULL THEN 'ADDED'
                       WHEN x.programme_code IS NULL THEN 'REMOVED'
                       WHEN to_jsonb(x) - 'id' - 'programme_set_id' - 'created_at' - 'updated_at' - 'created_by'
                          IS DISTINCT FROM
                            to_jsonb(y) - 'id' - 'programme_set_id' - 'created_at' - 'updated_at' - 'created_by'
                         THEN 'CHANGED' ELSE 'UNCHANGED' END,
        'subject', to_jsonb(x), 'baseline', to_jsonb(y)) ORDER BY COALESCE(x.programme_code,y.programme_code)),'[]'::jsonb)
      FROM (SELECT * FROM public.supervisory_assessment_programme WHERE programme_set_id=_a.id) x
      FULL OUTER JOIN (SELECT * FROM public.supervisory_assessment_programme WHERE programme_set_id=_b.id) y
        ON y.programme_code = x.programme_code));
END $$;

-- ===================================================================
-- runtime: programme options for an entity
-- ===================================================================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_period_for(
  _programme public.supervisory_assessment_programme, _prior_period_end date, _as_of date)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _end date; _start date;
BEGIN
  _end := _as_of - COALESCE(_programme.end_offset_days,0);
  IF _programme.period_rule = 'TRAILING_DAYS' THEN
    _start := _end - (COALESCE(_programme.period_value,0) - 1);
  ELSIF _programme.period_rule = 'TRAILING_MONTHS' THEN
    _start := (_end - make_interval(months => COALESCE(_programme.period_value,0)))::date + 1;
  ELSIF _programme.period_rule = 'PRIOR_ASSESSMENT_FORWARD' THEN
    _start := CASE WHEN _prior_period_end IS NULL THEN NULL ELSE _prior_period_end + 1 END;
  ELSIF _programme.period_rule = 'EVENT_WINDOW' THEN
    _start := _end - (COALESCE(_programme.period_value,0) - 1);
  ELSE
    _start := NULL; _end := NULL;
  END IF;
  RETURN jsonb_build_object(
    'period_rule', _programme.period_rule, 'period_value', _programme.period_value,
    'end_offset_days', _programme.end_offset_days,
    'suggested_period_start', _start, 'suggested_period_end', _end,
    'manual_entry_required', _programme.period_rule = 'MANUAL_REQUIRED' OR _start IS NULL,
    'allow_manual_override', _programme.allow_manual_override);
END $$;

-- Resolves the programme set that governs a new assessment for an entity.
-- CONFIGURED           = an ACTIVE regulator-owned programme set applies.
-- LEGACY_COMPATIBILITY = no regulator configuration exists yet, so the MIPL
--                        reference package stands in for the platform's previous
--                        built-in behaviour. It is not regulator policy.
-- UNAVAILABLE          = nothing applies; the refusal reason is returned.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_options_for_entity(
  _entity_id uuid, _domain_code text, _as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _d text; _asof date := COALESCE(_as_of, current_date);
        _ctx jsonb; _reg uuid; _set public.supervisory_assessment_programme_set;
        _mode text; _prior record; _programmes jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  _d := upper(btrim(COALESCE(_domain_code,'')));
  IF NOT public.supervisory_domain_valid(_d) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _d USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  -- the server derives regulator and sector context; the browser supplies none
  _ctx := public.supervisory_methodology_context_internal(_entity_id, _d, _asof);
  _reg := NULLIF(_ctx->>'regulator_id','')::uuid;

  SELECT * INTO _set FROM public.supervisory_assessment_programme_set s
   WHERE s.domain_code = _d AND s.status='ACTIVE' AND s.origin <> 'MIPL_REFERENCE'
     AND s.regulator_id IS NOT DISTINCT FROM _reg
     AND (s.effective_from IS NULL OR s.effective_from <= _asof)
     AND (s.effective_to IS NULL OR s.effective_to >= _asof)
   ORDER BY s.effective_from DESC NULLS LAST, s.updated_at DESC LIMIT 1;

  IF _set.id IS NOT NULL THEN
    _mode := 'CONFIGURED';
  ELSE
    SELECT * INTO _set FROM public.supervisory_assessment_programme_set s
     WHERE s.domain_code = _d AND s.origin='MIPL_REFERENCE'
     ORDER BY s.created_at DESC LIMIT 1;
    IF _set.id IS NULL THEN
      RETURN jsonb_build_object('mode','UNAVAILABLE','entity_id',_entity_id,'domain_code',_d,
        'reason', format('No assessment programme configuration exists for %s. A supervisory administrator must approve and activate an assessment programme set.', _d),
        'programmes','[]'::jsonb);
    END IF;
    _mode := 'LEGACY_COMPATIBILITY';
  END IF;

  SELECT a.id, a.period_end INTO _prior
    FROM public.supervisory_assessment a
   WHERE a.entity_id=_entity_id AND a.domain_code=_d
   ORDER BY a.created_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'programme_id', p.id, 'programme_code', p.programme_code, 'label', p.label,
           'description', p.description, 'assessment_type', p.assessment_type,
           'guidance', p.guidance, 'summary_required', p.summary_required,
           'question_class_scope', to_jsonb(p.question_class_scope),
           'requires_prior_assessment', p.requires_prior_assessment,
           'requires_trigger_signal', p.requires_trigger_signal,
           'prior_assessment_id', CASE WHEN p.requires_prior_assessment THEN _prior.id END,
           'period', public.supervisory_assessment_programme_period_for(p, _prior.period_end, _asof),
           'triggers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                            'trigger_code', t.trigger_code, 'label', t.label,
                            'is_default', t.is_default, 'requires_signal', t.requires_signal,
                            'requires_prior_assessment', t.requires_prior_assessment,
                            'guidance', t.guidance) ORDER BY t.sort_order, t.trigger_code),'[]'::jsonb)
                          FROM public.supervisory_assessment_programme_trigger t
                         WHERE t.programme_id=p.id AND t.is_active)
         ) ORDER BY p.sort_order, p.programme_code), '[]'::jsonb)
    INTO _programmes
    FROM public.supervisory_assessment_programme p
   WHERE p.programme_set_id=_set.id AND p.is_active AND p.retired_at IS NULL;

  RETURN jsonb_build_object(
    'mode', _mode,
    'entity_id', _entity_id, 'domain_code', _d, 'as_of', _asof,
    'regulator_id', _reg,
    'programme_set', jsonb_build_object('id',_set.id,'code',_set.code,'set_version',_set.set_version,
      'name',_set.name,'origin',_set.origin,'status',_set.status),
    'compatibility_notice', CASE WHEN _mode='LEGACY_COMPATIBILITY' THEN
      'These choices come from the MIPL reference package, which reproduces the platform''s previous built-in behaviour. They are not approved regulator policy and do not satisfy policy profile readiness.' END,
    'prior_assessment_id', _prior.id,
    'programmes', _programmes,
    'methodology', jsonb_build_object('id', NULLIF(_ctx->>'methodology_id','')::uuid,
                                      'version', _ctx->>'methodology_version',
                                      'status', _ctx->>'status'));
END $$;

-- ===================================================================
-- programme-driven assessment creation
-- ===================================================================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_create_programmed(
  _entity_id uuid, _domain_code text, _programme_id uuid,
  _trigger_type text DEFAULT NULL, _period_start date DEFAULT NULL, _period_end date DEFAULT NULL,
  _summary text DEFAULT NULL, _trigger_signal_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _opts jsonb; _p public.supervisory_assessment_programme; _set public.supervisory_assessment_programme_set;
        _allowed jsonb; _trig text; _period jsonb; _ps date; _pe date; _prior uuid; _res jsonb; _mode text;
BEGIN
  IF _programme_id IS NULL THEN
    RAISE EXCEPTION 'programme_required: an assessment programme must be selected' USING ERRCODE='22023'; END IF;

  -- the options service re-derives entity scope, regulator and configuration mode
  _opts := public.supervisory_assessment_programme_options_for_entity(_entity_id, _domain_code, current_date);
  _mode := _opts->>'mode';
  IF _mode = 'UNAVAILABLE' THEN
    RAISE EXCEPTION 'programme_unavailable: %', _opts->>'reason' USING ERRCODE='22023'; END IF;

  SELECT * INTO _p FROM public.supervisory_assessment_programme WHERE id=_programme_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme' USING ERRCODE='22023'; END IF;
  IF _p.programme_set_id <> (_opts->'programme_set'->>'id')::uuid THEN
    RAISE EXCEPTION 'programme_not_applicable: the selected programme does not belong to the programme configuration that applies to this entity'
      USING ERRCODE='42501'; END IF;
  IF NOT _p.is_active OR _p.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'programme_not_active: the selected programme is not active' USING ERRCODE='22023'; END IF;
  SELECT * INTO _set FROM public.supervisory_assessment_programme_set WHERE id=_p.programme_set_id;

  -- trigger: only a trigger the programme allows, defaulting to its default
  SELECT COALESCE(jsonb_agg(trigger_code), '[]'::jsonb) INTO _allowed
    FROM public.supervisory_assessment_programme_trigger
   WHERE programme_id=_p.id AND is_active;
  _trig := upper(btrim(COALESCE(_trigger_type,'')));
  IF _trig = '' THEN
    SELECT trigger_code INTO _trig FROM public.supervisory_assessment_programme_trigger
     WHERE programme_id=_p.id AND is_active AND is_default LIMIT 1;
  END IF;
  IF _trig IS NULL OR NOT (_allowed @> to_jsonb(_trig)) THEN
    RAISE EXCEPTION 'trigger_not_allowed: programme % does not allow trigger %; allowed triggers are %',
      _p.programme_code, COALESCE(NULLIF(_trig,''),'(none)'), _allowed USING ERRCODE='22023'; END IF;

  IF _p.requires_trigger_signal OR EXISTS (
       SELECT 1 FROM public.supervisory_assessment_programme_trigger
        WHERE programme_id=_p.id AND trigger_code=_trig AND requires_signal) THEN
    IF _trigger_signal_id IS NULL THEN
      RAISE EXCEPTION 'trigger_signal_required: programme % requires the triggering signal or event to be recorded', _p.programme_code
        USING ERRCODE='22023'; END IF;
  END IF;

  -- prior assessment requirement
  IF _p.requires_prior_assessment OR EXISTS (
       SELECT 1 FROM public.supervisory_assessment_programme_trigger
        WHERE programme_id=_p.id AND trigger_code=_trig AND requires_prior_assessment) THEN
    SELECT id INTO _prior FROM public.supervisory_assessment
     WHERE entity_id=_entity_id AND domain_code=upper(_domain_code)
     ORDER BY created_at DESC LIMIT 1;
    IF _prior IS NULL THEN
      RAISE EXCEPTION 'prior_assessment_required: programme % requires a previous % assessment of this entity',
        _p.programme_code, upper(_domain_code) USING ERRCODE='22023'; END IF;
  END IF;

  -- period: derived by the server; manual dates only where the programme permits
  _period := public.supervisory_assessment_programme_period_for(
               _p, (SELECT period_end FROM public.supervisory_assessment
                     WHERE entity_id=_entity_id AND domain_code=upper(_domain_code)
                     ORDER BY created_at DESC LIMIT 1), current_date);
  _ps := NULLIF(_period->>'suggested_period_start','')::date;
  _pe := NULLIF(_period->>'suggested_period_end','')::date;

  IF _period_start IS NOT NULL OR _period_end IS NOT NULL THEN
    IF NOT _p.allow_manual_override THEN
      RAISE EXCEPTION 'period_override_not_permitted: programme % derives its review period and does not permit manual dates', _p.programme_code
        USING ERRCODE='42501'; END IF;
    _ps := COALESCE(_period_start, _ps); _pe := COALESCE(_period_end, _pe);
  END IF;

  IF _ps IS NULL OR _pe IS NULL THEN
    RAISE EXCEPTION 'period_required: programme % requires the review period to be stated', _p.programme_code
      USING ERRCODE='22023'; END IF;
  IF _pe < _ps THEN
    RAISE EXCEPTION 'period_invalid: the review period ends before it starts' USING ERRCODE='22023'; END IF;

  IF _p.summary_required AND length(btrim(COALESCE(_summary,''))) = 0 THEN
    RAISE EXCEPTION 'summary_required: programme % requires a scope and summary', _p.programme_code
      USING ERRCODE='22023'; END IF;

  _res := public.supervisory_assessment_create(
    _entity_id, upper(_domain_code), _p.assessment_type, _ps, _pe, NULL, _trig,
    _trigger_signal_id, _summary, NULL, _prior, NULL);

  UPDATE public.supervisory_assessment SET
    assessment_programme_set_id = _set.id,
    assessment_programme_id = _p.id,
    assessment_programme_code = _p.programme_code,
    assessment_programme_version = _set.set_version,
    assessment_programme_provenance = CASE WHEN _mode='CONFIGURED'
      THEN 'PROGRAMME_CONFIGURED' ELSE 'PROGRAMME_REFERENCE_COMPATIBILITY' END
  WHERE id = (_res->>'id')::uuid;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES ((_res->>'id')::uuid, 'PROGRAMME_APPLIED',
    'Assessment created from governed programme configuration.',
    jsonb_build_object('programme_set_id',_set.id,'programme_set_code',_set.code,
      'programme_set_version',_set.set_version,'programme_id',_p.id,'programme_code',_p.programme_code,
      'assessment_type',_p.assessment_type,'trigger_type',_trig,
      'period_start',_ps,'period_end',_pe,'mode',_mode), auth.uid());

  RETURN _res || jsonb_build_object('programme', jsonb_build_object(
    'programme_set_id',_set.id,'programme_set_code',_set.code,'programme_set_version',_set.set_version,
    'programme_id',_p.id,'programme_code',_p.programme_code,'assessment_type',_p.assessment_type,
    'trigger_type',_trig,'period_start',_ps,'period_end',_pe,'mode',_mode));
END $$;
