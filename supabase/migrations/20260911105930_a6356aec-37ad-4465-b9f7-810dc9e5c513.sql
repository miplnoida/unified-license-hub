-- PCOMP-R1 — Operational policy profile convergence.
-- One server-authoritative effective-profile resolver, cross-component
-- compatibility validation, an immutable per-assessment policy snapshot,
-- a runtime-capability contract and governance corrections.

ALTER TABLE public.supervisory_policy_component_type
  ADD COLUMN IF NOT EXISTS is_validatable      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bindable         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_runtime_consumed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_certified        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canonical_owner     text,
  ADD COLUMN IF NOT EXISTS capability_note     text;

UPDATE public.supervisory_policy_component_type SET
  is_validatable = true, is_bindable = true, is_runtime_consumed = true, is_certified = true,
  canonical_owner = 'supervisory_methodology (AML-02)',
  capability_note = 'Resolved and consumed by assessment creation and the question plan.'
 WHERE component_type = 'METHODOLOGY';

UPDATE public.supervisory_policy_component_type SET
  is_validatable = true, is_bindable = true, is_runtime_consumed = true, is_certified = true,
  canonical_owner = 'supervisory_calculation_config (AML-06)',
  capability_note = 'Consumed by the governed calculation run and materiality rules.'
 WHERE component_type = 'CALCULATION_CONFIG';

UPDATE public.supervisory_policy_component_type SET
  is_validatable = true, is_bindable = true, is_runtime_consumed = true, is_certified = true,
  canonical_owner = 'supervisory_assessment_programme_set (AML-03)',
  capability_note = 'Consumed by programmed assessment creation and period derivation.'
 WHERE component_type = 'ASSESSMENT_PROGRAMME';

UPDATE public.supervisory_policy_component_type SET
  is_validatable = true, is_bindable = true, is_runtime_consumed = false, is_certified = false
 WHERE component_type IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING','EVIDENCE_POLICY',
   'MATERIALITY_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY','SLA_POLICY','DASHBOARD_POLICY',
   'NOTIFICATION_POLICY');

UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'supervisory_methodology question applicability (AML-04)',
  capability_note = 'Authoring and binding only. Question applicability still governs assessments.'
 WHERE component_type = 'SECTOR_OVERLAY';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'supervisory_methodology_fact_requirement (AML-05)',
  capability_note = 'Authoring and binding only; references canonical methodology facts, never a second fact dictionary.'
 WHERE component_type = 'FACT_CONFIG';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'AML-05 governed fact / evidence source architecture',
  capability_note = 'Authoring and binding only; fact codes must resolve to canonical methodology facts.'
 WHERE component_type = 'SOURCE_BINDING';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'supervisory_assessment_evidence_basis + supervisory_evidence_basis_type (AML-05)',
  capability_note = 'Authoring and binding only; evidence scopes and kinds must resolve to canonical vocabulary.'
 WHERE component_type = 'EVIDENCE_POLICY';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'supervisory_calculation_materiality_rule (AML-06)',
  capability_note = 'Authoring and binding only; the calculation configuration remains the single materiality engine.'
 WHERE component_type = 'MATERIALITY_POLICY';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'supervisory_calculation_override / rating approval (AML-06, AML-07)',
  capability_note = 'Authoring and binding only; override authority stays with the calculation and approval architecture.'
 WHERE component_type = 'JUDGEMENT_POLICY';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'supervisory_consequence_decision (AML-08)',
  capability_note = 'Authoring and binding only; no automatic rating-to-action mapping is performed.'
 WHERE component_type = 'RESPONSE_POLICY';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'supervisory work item / workflow deadlines',
  capability_note = 'Authoring and binding only; work item due dates still come from the workflow layer.'
 WHERE component_type = 'SLA_POLICY';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'AML-10 portfolio read models + regulatory_metrics',
  capability_note = 'Authoring and binding only; portfolio reporting remains server authoritative.'
 WHERE component_type = 'DASHBOARD_POLICY';
UPDATE public.supervisory_policy_component_type SET
  canonical_owner = 'notification_event_configs / Communication Hub',
  capability_note = 'Authoring and binding only; delivery remains owned by the notification infrastructure.'
 WHERE component_type = 'NOTIFICATION_POLICY';

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_capability(_component_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'component_type', t.component_type,
    'label', t.label,
    'sort_order', t.sort_order,
    'authoring_available', t.is_available,
    'validatable', t.is_validatable,
    'bindable', t.is_bindable,
    'runtime_consumed', t.is_runtime_consumed,
    'certified', t.is_certified,
    'canonical_owner', t.canonical_owner,
    'capability_note', t.capability_note,
    'capability_state', CASE
      WHEN t.is_certified THEN 'CERTIFIED'
      WHEN t.is_runtime_consumed THEN 'RUNTIME_CONSUMED'
      WHEN t.is_bindable THEN 'BINDABLE'
      WHEN t.is_validatable THEN 'VALIDATABLE'
      WHEN t.is_available THEN 'AUTHORING_AVAILABLE'
      ELSE 'UNAVAILABLE' END
    ) ORDER BY t.sort_order), '[]'::jsonb)
    FROM public.supervisory_policy_component_type t
   WHERE _component_type IS NULL
      OR t.component_type = upper(btrim(_component_type));
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_vocabulary(_kind text, _profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _k text; _out jsonb; _calc uuid; _meth uuid;
BEGIN
  _k := upper(btrim(COALESCE(_kind,'')));

  IF _profile_id IS NOT NULL THEN
    SELECT component_id INTO _calc FROM public.supervisory_policy_profile_binding
     WHERE profile_id = _profile_id AND component_type = 'CALCULATION_CONFIG';
    SELECT component_id INTO _meth FROM public.supervisory_policy_profile_binding
     WHERE profile_id = _profile_id AND component_type = 'METHODOLOGY';
  END IF;

  IF _k = 'RISK_BAND' THEN
    IF _calc IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(DISTINCT b.band_code), '[]'::jsonb) INTO _out
        FROM public.supervisory_calculation_band b WHERE b.config_id = _calc;
    END IF;
    IF _out IS NULL OR jsonb_array_length(_out) = 0 THEN
      SELECT COALESCE(jsonb_agg(DISTINCT s.code), '[]'::jsonb) INTO _out
        FROM public.supervisory_rating_scale s WHERE s.is_active;
    END IF;

  ELSIF _k = 'RISK_BAND_ORDERED' THEN
    SELECT COALESCE(jsonb_agg(s.code ORDER BY s.ordinal), '[]'::jsonb) INTO _out
      FROM public.supervisory_rating_scale s WHERE s.is_active;

  ELSIF _k = 'CONSEQUENCE_ACTION' THEN
    _out := jsonb_build_array('SUPERVISORY_PLAN','REASSESSMENT_REQUIREMENT','SUPERVISORY_INTERVENTION',
                              'EXAMINATION','SUPERVISORY_FINDING','ENFORCEMENT_ACTION');

  ELSIF _k = 'WORKFLOW_STAGE' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO _out FROM (
      SELECT upper(k.key) AS x FROM public.lifecycle_stages k WHERE k.is_active
      UNION SELECT upper(v) FROM unnest(ARRAY['DRAFT','SUBMITTED','REVIEWED','RETURNED_FOR_REVISION',
                                              'APPROVED','CLOSED']) v) s;

  ELSIF _k = 'EVIDENCE_SCOPE' THEN
    _out := jsonb_build_array('ASSESSMENT','DIMENSION','QUESTION');

  ELSIF _k = 'EVIDENCE_KIND' THEN
    SELECT COALESCE(jsonb_agg(t.code ORDER BY t.code), '[]'::jsonb) INTO _out
      FROM public.supervisory_evidence_basis_type t;

  ELSIF _k = 'SECTOR' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(s.code)), '[]'::jsonb) INTO _out
      FROM public.sectors s WHERE s.code IS NOT NULL;

  ELSIF _k = 'FACT' THEN
    IF _meth IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(DISTINCT upper(f.fact_code)), '[]'::jsonb) INTO _out
        FROM public.supervisory_methodology_fact_requirement f WHERE f.methodology_id = _meth;
    ELSE
      SELECT COALESCE(jsonb_agg(DISTINCT upper(f.fact_code)), '[]'::jsonb) INTO _out
        FROM public.supervisory_methodology_fact_requirement f;
    END IF;

  ELSIF _k = 'SOURCE_KIND' THEN
    _out := jsonb_build_array('RETURN','FORM','MANUAL','EXTERNAL','DERIVED');

  ELSIF _k = 'METRIC' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(m.code)), '[]'::jsonb) INTO _out
      FROM public.regulatory_metrics m WHERE COALESCE(m.is_active,true);

  ELSIF _k = 'NOTIFICATION_EVENT' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(c.event_key)), '[]'::jsonb) INTO _out
      FROM public.notification_event_configs c WHERE COALESCE(c.is_active,true);

  ELSIF _k = 'NOTIFICATION_CHANNEL' THEN
    _out := jsonb_build_array('EMAIL','IN_APP','SMS');

  ELSIF _k = 'RECIPIENT_ROLE' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(e.enumlabel)), '[]'::jsonb) INTO _out
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'workflow_notification_recipient';

  ELSIF _k = 'MATERIALITY_MEASURE' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT upper(x)), '[]'::jsonb) INTO _out FROM (
      SELECT r.parameter_code AS x FROM public.supervisory_calculation_materiality_rule r
       WHERE _calc IS NULL OR r.config_id = _calc
      UNION SELECT r.fact_code FROM public.supervisory_calculation_materiality_rule r
       WHERE (_calc IS NULL OR r.config_id = _calc) AND r.fact_code IS NOT NULL
      UNION SELECT f.fact_code FROM public.supervisory_methodology_fact_requirement f
       WHERE _meth IS NULL OR f.methodology_id = _meth) s;

  ELSE
    RAISE EXCEPTION 'unknown_vocabulary: %', _k USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(_out, '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_hash(_component_type text, _component_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _t text := upper(btrim(COALESCE(_component_type,''))); _h text;
BEGIN
  IF _component_id IS NULL THEN RETURN NULL; END IF;
  IF _t = 'METHODOLOGY' THEN
    SELECT md5(m.id::text||'|'||m.code||'|'||m.version||'|'||m.status||'|'||COALESCE(m.definition::text,''))
      INTO _h FROM public.supervisory_methodology m WHERE m.id = _component_id;
  ELSIF _t = 'CALCULATION_CONFIG' THEN
    SELECT md5(c.id::text||'|'||c.config_version::text||'|'||c.status||'|'||
               COALESCE((SELECT string_agg(b.band_kind||b.band_code||b.min_score||b.max_score, ',' ORDER BY b.sort_order)
                           FROM public.supervisory_calculation_band b WHERE b.config_id = c.id),''))
      INTO _h FROM public.supervisory_calculation_config c WHERE c.id = _component_id;
  ELSIF _t = 'ASSESSMENT_PROGRAMME' THEN
    SELECT md5(s.id::text||'|'||s.code||'|'||s.set_version||'|'||s.status)
      INTO _h FROM public.supervisory_assessment_programme_set s WHERE s.id = _component_id;
  ELSE
    SELECT md5(c.id::text||'|'||c.code||'|'||c.component_version||'|'||c.status||'|'||c.content::text)
      INTO _h FROM public.supervisory_policy_component c WHERE c.id = _component_id;
  END IF;
  RETURN _h;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_compatibility(_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p public.supervisory_policy_profile;
  _f jsonb := '[]'::jsonb;
  _meth_id uuid; _prog_id uuid; _calc_id uuid;
  _m public.supervisory_methodology; _s public.supervisory_assessment_programme_set;
  _c public.supervisory_calculation_config;
  _row record; _item jsonb; _vocab jsonb; _ordered jsonb; _seen text[]; _txt text;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  SELECT component_id INTO _meth_id FROM public.supervisory_policy_profile_binding
   WHERE profile_id = _profile_id AND component_type = 'METHODOLOGY';
  SELECT component_id INTO _prog_id FROM public.supervisory_policy_profile_binding
   WHERE profile_id = _profile_id AND component_type = 'ASSESSMENT_PROGRAMME';
  SELECT component_id INTO _calc_id FROM public.supervisory_policy_profile_binding
   WHERE profile_id = _profile_id AND component_type = 'CALCULATION_CONFIG';

  IF _meth_id IS NOT NULL THEN
    SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _meth_id;
    IF _m.id IS NULL THEN
      _f := _f || jsonb_build_object('code','METHODOLOGY_MISSING','severity','ERROR',
        'component_type','METHODOLOGY','message','The bound methodology version no longer exists.');
    ELSE
      IF _m.domain_code <> _p.domain_code THEN
        _f := _f || jsonb_build_object('code','METHODOLOGY_DOMAIN_MISMATCH','severity','ERROR',
          'component_type','METHODOLOGY','message','The bound methodology belongs to domain '||_m.domain_code||
            ' but this profile governs '||_p.domain_code||'.');
      END IF;
      IF _m.regulator_id IS NOT NULL AND _p.regulator_id IS NOT NULL AND _m.regulator_id <> _p.regulator_id THEN
        _f := _f || jsonb_build_object('code','METHODOLOGY_REGULATOR_MISMATCH','severity','ERROR',
          'component_type','METHODOLOGY','message','The bound methodology is owned by a different regulator.');
      END IF;
      IF _m.status <> 'ACTIVE' THEN
        _f := _f || jsonb_build_object('code','METHODOLOGY_NOT_ACTIVE','severity','ERROR',
          'component_type','METHODOLOGY','message','The bound methodology version is '||_m.status||
            ' and cannot govern operational assessments.');
      END IF;
      IF _m.origin = 'MIPL_REFERENCE' THEN
        _f := _f || jsonb_build_object('code','METHODOLOGY_REFERENCE_CONTENT','severity','ERROR',
          'component_type','METHODOLOGY','message','Reference methodology content must be adopted by the regulator before it can govern assessments.');
      END IF;
    END IF;
  END IF;

  IF _prog_id IS NOT NULL THEN
    SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id = _prog_id;
    IF _s.id IS NULL THEN
      _f := _f || jsonb_build_object('code','PROGRAMME_MISSING','severity','ERROR',
        'component_type','ASSESSMENT_PROGRAMME','message','The bound assessment programme no longer exists.');
    ELSE
      IF _s.domain_code <> _p.domain_code THEN
        _f := _f || jsonb_build_object('code','PROGRAMME_DOMAIN_MISMATCH','severity','ERROR',
          'component_type','ASSESSMENT_PROGRAMME','message','The bound assessment programme belongs to domain '||_s.domain_code||'.');
      END IF;
      IF _s.regulator_id IS NOT NULL AND _p.regulator_id IS NOT NULL AND _s.regulator_id <> _p.regulator_id THEN
        _f := _f || jsonb_build_object('code','PROGRAMME_REGULATOR_MISMATCH','severity','ERROR',
          'component_type','ASSESSMENT_PROGRAMME','message','The bound assessment programme is owned by a different regulator.');
      END IF;
      IF _s.status NOT IN ('APPROVED','ACTIVE') THEN
        _f := _f || jsonb_build_object('code','PROGRAMME_NOT_APPROVED','severity','ERROR',
          'component_type','ASSESSMENT_PROGRAMME','message','The bound assessment programme is '||_s.status||'.');
      END IF;
    END IF;
  END IF;

  IF _calc_id IS NOT NULL THEN
    SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _calc_id;
    IF _c.id IS NULL THEN
      _f := _f || jsonb_build_object('code','CALCULATION_MISSING','severity','ERROR',
        'component_type','CALCULATION_CONFIG','message','The bound calculation configuration no longer exists.');
    ELSE
      IF _meth_id IS NULL THEN
        _f := _f || jsonb_build_object('code','CALCULATION_WITHOUT_METHODOLOGY','severity','ERROR',
          'component_type','CALCULATION_CONFIG','message','A calculation configuration cannot be bound without the methodology version it belongs to.');
      ELSIF _c.methodology_id <> _meth_id THEN
        _f := _f || jsonb_build_object('code','CALCULATION_METHODOLOGY_MISMATCH','severity','ERROR',
          'component_type','CALCULATION_CONFIG','message','The bound calculation configuration belongs to a different methodology version than the one this profile binds.');
      END IF;
      IF _c.status NOT IN ('APPROVED','ACTIVE') THEN
        _f := _f || jsonb_build_object('code','CALCULATION_NOT_APPROVED','severity','ERROR',
          'component_type','CALCULATION_CONFIG','message','The bound calculation configuration is '||_c.status||'.');
      END IF;
    END IF;
  END IF;

  FOR _row IN
    SELECT b.component_type, c.id, c.code, c.component_version, c.content, c.status, c.origin
      FROM public.supervisory_policy_profile_binding b
      JOIN public.supervisory_policy_component c ON c.id = b.component_id
     WHERE b.profile_id = _profile_id
       AND b.component_type NOT IN ('METHODOLOGY','CALCULATION_CONFIG','ASSESSMENT_PROGRAMME')
  LOOP
    IF _row.origin = 'MIPL_REFERENCE' THEN
      _f := _f || jsonb_build_object('code','COMPONENT_REFERENCE_CONTENT','severity','ERROR',
        'component_type', _row.component_type,
        'message','Reference content cannot be bound as regulator policy; adopt it as regulator-owned content first.');
    END IF;

    IF _row.component_type = 'RESPONSE_POLICY' THEN
      _vocab := public.supervisory_policy_vocabulary('RISK_BAND', _profile_id);
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'responses','[]'::jsonb)) LOOP
        IF NOT (_vocab @> to_jsonb(upper(COALESCE(_item->>'risk_band','')))) THEN
          _f := _f || jsonb_build_object('code','RESPONSE_RISK_BAND_UNKNOWN','severity','ERROR',
            'component_type','RESPONSE_POLICY',
            'message','Risk band '||COALESCE(_item->>'risk_band','(blank)')||' does not exist in the effective rating vocabulary.');
        END IF;
        FOR _txt IN SELECT jsonb_array_elements_text(COALESCE(_item->'actions','[]'::jsonb)) LOOP
          IF NOT (public.supervisory_policy_vocabulary('CONSEQUENCE_ACTION') @> to_jsonb(upper(_txt))) THEN
            _f := _f || jsonb_build_object('code','RESPONSE_ACTION_UNKNOWN','severity','ERROR',
              'component_type','RESPONSE_POLICY',
              'message','Supervisory action '||_txt||' is not in the canonical supervisory consequence catalogue.');
          END IF;
        END LOOP;
      END LOOP;

    ELSIF _row.component_type = 'SLA_POLICY' THEN
      _vocab := public.supervisory_policy_vocabulary('WORKFLOW_STAGE');
      _seen := ARRAY[]::text[];
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'stages','[]'::jsonb)) LOOP
        _txt := upper(btrim(COALESCE(_item->>'stage','')));
        IF NOT (_vocab @> to_jsonb(_txt)) THEN
          _f := _f || jsonb_build_object('code','SLA_STAGE_UNKNOWN','severity','ERROR',
            'component_type','SLA_POLICY',
            'message','Stage '||COALESCE(NULLIF(_txt,''),'(blank)')||' does not resolve to a real supervisory or workflow stage.');
        END IF;
        IF COALESCE((_item->>'days')::numeric, 0) <= 0 THEN
          _f := _f || jsonb_build_object('code','SLA_DAYS_INVALID','severity','ERROR',
            'component_type','SLA_POLICY','message','Stage '||_txt||' must state a positive number of days.');
        END IF;
        IF _txt = ANY(_seen) THEN
          _f := _f || jsonb_build_object('code','SLA_STAGE_DUPLICATE','severity','ERROR',
            'component_type','SLA_POLICY','message','Stage '||_txt||' is configured more than once.');
        END IF;
        _seen := _seen || _txt;
      END LOOP;

    ELSIF _row.component_type = 'EVIDENCE_POLICY' THEN
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'rules','[]'::jsonb)) LOOP
        IF NOT (public.supervisory_policy_vocabulary('EVIDENCE_SCOPE') @> to_jsonb(upper(COALESCE(_item->>'scope','')))) THEN
          _f := _f || jsonb_build_object('code','EVIDENCE_SCOPE_UNKNOWN','severity','ERROR',
            'component_type','EVIDENCE_POLICY',
            'message','Evidence scope '||COALESCE(_item->>'scope','(blank)')||' is not a canonical evidence scope.');
        END IF;
        IF COALESCE(_item->>'evidence_kind','') <> ''
           AND NOT (public.supervisory_policy_vocabulary('EVIDENCE_KIND') @> to_jsonb(upper(_item->>'evidence_kind'))) THEN
          _f := _f || jsonb_build_object('code','EVIDENCE_KIND_UNKNOWN','severity','ERROR',
            'component_type','EVIDENCE_POLICY',
            'message','Evidence kind '||(_item->>'evidence_kind')||' is not in the canonical evidence basis vocabulary.');
        END IF;
      END LOOP;

    ELSIF _row.component_type = 'JUDGEMENT_POLICY' THEN
      _ordered := public.supervisory_policy_vocabulary('RISK_BAND_ORDERED');
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'rules','[]'::jsonb)) LOOP
        IF NOT (jsonb_build_array('UP','DOWN','BOTH') @> to_jsonb(upper(COALESCE(_item->>'direction','')))) THEN
          _f := _f || jsonb_build_object('code','JUDGEMENT_DIRECTION_INVALID','severity','ERROR',
            'component_type','JUDGEMENT_POLICY','message','Override direction '||COALESCE(_item->>'direction','(blank)')||' is not valid.');
        END IF;
        IF COALESCE((_item->>'max_band_steps')::numeric,0) <= 0
           OR COALESCE((_item->>'max_band_steps')::numeric,0) > jsonb_array_length(_ordered) THEN
          _f := _f || jsonb_build_object('code','JUDGEMENT_BAND_STEPS_INVALID','severity','ERROR',
            'component_type','JUDGEMENT_POLICY',
            'message','Maximum band movement must be between 1 and '||jsonb_array_length(_ordered)||' for the effective rating vocabulary.');
        END IF;
        IF COALESCE((_item->>'rationale_min_length')::numeric,0) <= 0 THEN
          _f := _f || jsonb_build_object('code','JUDGEMENT_RATIONALE_INVALID','severity','ERROR',
            'component_type','JUDGEMENT_POLICY','message','A positive minimum rationale length is required.');
        END IF;
      END LOOP;

    ELSIF _row.component_type = 'SECTOR_OVERLAY' THEN
      _vocab := public.supervisory_policy_vocabulary('SECTOR');
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'sectors','[]'::jsonb)) LOOP
        IF NOT (_vocab @> to_jsonb(upper(COALESCE(_item->>'sector_code','')))) THEN
          _f := _f || jsonb_build_object('code','SECTOR_CODE_UNKNOWN','severity','ERROR',
            'component_type','SECTOR_OVERLAY',
            'message','Sector '||COALESCE(_item->>'sector_code','(blank)')||' does not resolve from canonical sector reference data.');
        END IF;
      END LOOP;

    ELSIF _row.component_type = 'FACT_CONFIG' THEN
      _vocab := public.supervisory_policy_vocabulary('FACT', _profile_id);
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'facts','[]'::jsonb)) LOOP
        IF NOT (_vocab @> to_jsonb(upper(COALESCE(_item->>'fact_code','')))) THEN
          _f := _f || jsonb_build_object('code','FACT_NOT_CANONICAL','severity','ERROR',
            'component_type','FACT_CONFIG',
            'message','Fact '||COALESCE(_item->>'fact_code','(blank)')||' is not a canonical methodology fact requirement. '||
              'Fact configuration may reference or qualify canonical facts but must not create a parallel fact dictionary.');
        END IF;
      END LOOP;

    ELSIF _row.component_type = 'SOURCE_BINDING' THEN
      _vocab := public.supervisory_policy_vocabulary('FACT', _profile_id);
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'bindings','[]'::jsonb)) LOOP
        IF NOT (_vocab @> to_jsonb(upper(COALESCE(_item->>'fact_code','')))) THEN
          _f := _f || jsonb_build_object('code','SOURCE_FACT_UNKNOWN','severity','ERROR',
            'component_type','SOURCE_BINDING',
            'message','Fact '||COALESCE(_item->>'fact_code','(blank)')||' does not resolve to a canonical methodology fact.');
        END IF;
        IF NOT (public.supervisory_policy_vocabulary('SOURCE_KIND') @> to_jsonb(upper(COALESCE(_item->>'source_kind','')))) THEN
          _f := _f || jsonb_build_object('code','SOURCE_KIND_UNKNOWN','severity','ERROR',
            'component_type','SOURCE_BINDING',
            'message','Source kind '||COALESCE(_item->>'source_kind','(blank)')||' is not supported by the platform source registry.');
        END IF;
      END LOOP;

    ELSIF _row.component_type = 'MATERIALITY_POLICY' THEN
      _vocab := public.supervisory_policy_vocabulary('MATERIALITY_MEASURE', _profile_id);
      IF _calc_id IS NULL THEN
        _f := _f || jsonb_build_object('code','MATERIALITY_WITHOUT_CALCULATION','severity','ERROR',
          'component_type','MATERIALITY_POLICY',
          'message','Materiality policy may only qualify a bound calculation configuration; the calculation configuration remains the single materiality engine.');
      END IF;
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'thresholds','[]'::jsonb)) LOOP
        IF NOT (_vocab @> to_jsonb(upper(COALESCE(_item->>'measure','')))) THEN
          _f := _f || jsonb_build_object('code','MATERIALITY_MEASURE_UNKNOWN','severity','ERROR',
            'component_type','MATERIALITY_POLICY',
            'message','Measure '||COALESCE(_item->>'measure','(blank)')||' does not resolve to a canonical materiality parameter or methodology fact.');
        END IF;
      END LOOP;

    ELSIF _row.component_type = 'DASHBOARD_POLICY' THEN
      _vocab := public.supervisory_policy_vocabulary('METRIC');
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'tiles','[]'::jsonb)) LOOP
        IF NOT (_vocab @> to_jsonb(upper(COALESCE(_item->>'metric','')))) THEN
          _f := _f || jsonb_build_object('code','DASHBOARD_METRIC_UNKNOWN','severity','ERROR',
            'component_type','DASHBOARD_POLICY',
            'message','Metric '||COALESCE(_item->>'metric','(blank)')||' is not in the governed metric catalogue.');
        END IF;
        IF COALESCE(_item->>'query','') <> '' OR COALESCE(_item->>'sql','') <> ''
           OR COALESCE(_item->>'expression','') <> '' THEN
          _f := _f || jsonb_build_object('code','DASHBOARD_EXPRESSION_PROHIBITED','severity','ERROR',
            'component_type','DASHBOARD_POLICY',
            'message','Dashboard tiles must reference governed metrics; embedded queries or expressions are not permitted.');
        END IF;
      END LOOP;

    ELSIF _row.component_type = 'NOTIFICATION_POLICY' THEN
      FOR _item IN SELECT jsonb_array_elements(COALESCE(_row.content->'triggers','[]'::jsonb)) LOOP
        IF NOT (public.supervisory_policy_vocabulary('NOTIFICATION_EVENT') @> to_jsonb(upper(COALESCE(_item->>'event','')))) THEN
          _f := _f || jsonb_build_object('code','NOTIFICATION_EVENT_UNKNOWN','severity','ERROR',
            'component_type','NOTIFICATION_POLICY',
            'message','Event '||COALESCE(_item->>'event','(blank)')||' is not registered in the platform notification event catalogue.');
        END IF;
        FOR _txt IN SELECT jsonb_array_elements_text(COALESCE(_item->'channels','[]'::jsonb)) LOOP
          IF NOT (public.supervisory_policy_vocabulary('NOTIFICATION_CHANNEL') @> to_jsonb(upper(_txt))) THEN
            _f := _f || jsonb_build_object('code','NOTIFICATION_CHANNEL_UNKNOWN','severity','ERROR',
              'component_type','NOTIFICATION_POLICY','message','Channel '||_txt||' is not a supported delivery channel.');
          END IF;
        END LOOP;
        FOR _txt IN SELECT jsonb_array_elements_text(COALESCE(_item->'recipients','[]'::jsonb)) LOOP
          IF NOT (public.supervisory_policy_vocabulary('RECIPIENT_ROLE') @> to_jsonb(upper(_txt))) THEN
            _f := _f || jsonb_build_object('code','NOTIFICATION_RECIPIENT_UNKNOWN','severity','ERROR',
              'component_type','NOTIFICATION_POLICY',
              'message','Recipient '||_txt||' does not resolve from the governed recipient catalogue.');
          END IF;
        END LOOP;
        IF COALESCE(_item->>'expression','') <> '' OR COALESCE(_item->>'script','') <> '' THEN
          _f := _f || jsonb_build_object('code','NOTIFICATION_EXPRESSION_PROHIBITED','severity','ERROR',
            'component_type','NOTIFICATION_POLICY','message','Runtime executable expressions are not permitted in notification policy.');
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'profile_id', _profile_id,
    'checked_at', now(),
    'compatible', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_f) x WHERE x->>'severity' = 'ERROR'),
    'error_count', (SELECT count(*) FROM jsonb_array_elements(_f) x WHERE x->>'severity' = 'ERROR'),
    'findings', _f);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_effective_internal(
  _domain_code text, _regulator_id uuid, _sector_id uuid, _as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _d text; _as date; _cands jsonb; _tier int; _n int; _p public.supervisory_policy_profile;
        _domain_has_active boolean;
BEGIN
  _d  := upper(btrim(COALESCE(_domain_code,'')));
  _as := COALESCE(_as_of, current_date);

  SELECT EXISTS (SELECT 1 FROM public.supervisory_policy_profile p
                  WHERE p.domain_code = _d AND p.status = 'ACTIVE' AND p.origin <> 'MIPL_REFERENCE')
    INTO _domain_has_active;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'code', s.code, 'profile_version', s.profile_version,
           'regulator_id', s.regulator_id, 'sector_id', s.sector_id, 'tier', s.tier)
           ORDER BY s.tier DESC), '[]'::jsonb),
         max(s.tier)
    INTO _cands, _tier
    FROM (
      SELECT p.id, p.code, p.profile_version, p.regulator_id, p.sector_id,
             (CASE WHEN p.sector_id IS NOT NULL THEN 2 ELSE 0 END)
           + (CASE WHEN p.regulator_id IS NOT NULL THEN 1 ELSE 0 END) AS tier
        FROM public.supervisory_policy_profile p
        LEFT JOIN public.regulators r ON r.id = p.regulator_id
       WHERE p.domain_code = _d
         AND p.status = 'ACTIVE'
         AND p.origin <> 'MIPL_REFERENCE'
         AND (p.regulator_id IS NULL OR r.status = 'active')
         AND (_regulator_id IS NULL OR p.regulator_id IS NULL OR p.regulator_id = _regulator_id)
         AND (p.sector_id IS NULL OR _sector_id IS NULL OR p.sector_id = _sector_id)
         AND (p.effective_from IS NULL OR p.effective_from <= _as)
         AND (p.effective_to IS NULL OR p.effective_to >= _as)
    ) s;

  IF jsonb_array_length(_cands) = 0 THEN
    RETURN jsonb_build_object(
      'status','UNRESOLVED',
      'reason_code', CASE WHEN _domain_has_active THEN 'NO_APPLICABLE_ACTIVE_PROFILE'
                          ELSE 'NO_ACTIVE_PROFILE_CONFIGURED' END,
      'reason', CASE WHEN _domain_has_active
        THEN 'No active regulator-owned policy profile applies to this regulator, sector and date.'
        ELSE 'No active regulator-owned policy profile is configured for this domain.' END,
      'domain_code', _d, 'as_of', _as, 'regulator_id', _regulator_id, 'sector_id', _sector_id,
      'domain_has_active_profile', _domain_has_active, 'candidates', _cands);
  END IF;

  SELECT count(*) INTO _n FROM jsonb_array_elements(_cands) x WHERE (x->>'tier')::int = _tier;
  IF _n > 1 THEN
    RETURN jsonb_build_object(
      'status','AMBIGUOUS','reason_code','MULTIPLE_ACTIVE_PROFILES',
      'reason', _n || ' active policy profiles apply equally to this domain, regulator, sector and date. '||
                'Exactly one must be operative.',
      'domain_code', _d, 'as_of', _as, 'regulator_id', _regulator_id, 'sector_id', _sector_id,
      'domain_has_active_profile', _domain_has_active, 'candidates', _cands);
  END IF;

  SELECT * INTO _p FROM public.supervisory_policy_profile
   WHERE id = (SELECT (x->>'id')::uuid FROM jsonb_array_elements(_cands) x
                WHERE (x->>'tier')::int = _tier LIMIT 1);

  RETURN jsonb_build_object(
    'status','RESOLVED','reason_code','RESOLVED',
    'reason','Exactly one active regulator-owned policy profile applies.',
    'domain_code', _d, 'as_of', _as,
    'domain_has_active_profile', _domain_has_active,
    'specificity_tier', _tier,
    'candidate_count', jsonb_array_length(_cands),
    'profile', jsonb_build_object(
      'policy_profile_id', _p.id, 'code', _p.code, 'profile_version', _p.profile_version,
      'name', _p.name, 'domain_code', _p.domain_code, 'regulator_id', _p.regulator_id,
      'regulator_code', (SELECT code FROM public.regulators WHERE id = _p.regulator_id),
      'sector_id', _p.sector_id,
      'sector_code', (SELECT code FROM public.sectors WHERE id = _p.sector_id),
      'status', _p.status, 'origin', _p.origin,
      'effective_from', _p.effective_from, 'effective_to', _p.effective_to,
      'approved_at', _p.approved_at, 'activated_at', _p.activated_at),
    'components', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'component_type', b.component_type,
               'component_id', b.component_id,
               'component_table', b.component_table,
               'component_code', b.component_code,
               'component_version', b.component_version,
               'component_status_at_binding', b.component_status,
               'component_status_now', (public.supervisory_policy_component_probe(b.component_type, b.component_id))->>'component_status',
               'component_origin', (public.supervisory_policy_component_probe(b.component_type, b.component_id))->>'origin',
               'content_hash', public.supervisory_policy_component_content_hash(b.component_type, b.component_id),
               'capability', (public.supervisory_policy_component_capability(b.component_type))->0,
               'bound_at', b.bound_at) ORDER BY b.component_type), '[]'::jsonb)
        FROM public.supervisory_policy_profile_binding b WHERE b.profile_id = _p.id),
    'candidates', _cands);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_effective(
  _domain_code text, _regulator_id uuid DEFAULT NULL::uuid, _sector_id uuid DEFAULT NULL::uuid,
  _entity_id uuid DEFAULT NULL::uuid, _as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _d text; _as date; _reg uuid := _regulator_id; _sec uuid := _sector_id; _ctx jsonb; _res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _d  := upper(btrim(COALESCE(_domain_code,'')));
  _as := COALESCE(_as_of, current_date);
  IF NOT public.supervisory_domain_valid(_d) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _d USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_d, _reg) THEN
    RAISE EXCEPTION 'not_authorized: this supervisory scope is outside your authority' USING ERRCODE = '42501'; END IF;

  IF _entity_id IS NOT NULL THEN
    _ctx := public.supervisory_methodology_context_internal(_entity_id, _d, _as);
    IF _ctx->>'status' = 'ENTITY_NOT_FOUND' THEN
      RAISE EXCEPTION 'entity_not_found: the entity does not exist' USING ERRCODE = '22023'; END IF;
    _sec := COALESCE(_sec, NULLIF(_ctx->>'sector_id','')::uuid);
    _reg := COALESCE(_reg, NULLIF(_ctx->>'regulator_id','')::uuid);
  END IF;

  _res := public.supervisory_policy_profile_effective_internal(_d, _reg, _sec, _as);

  IF _res->>'status' = 'RESOLVED' THEN
    _res := _res || jsonb_build_object(
      'compatibility', public.supervisory_policy_profile_compatibility(
                         ((_res->'profile')->>'policy_profile_id')::uuid));
  END IF;

  RETURN _res || jsonb_build_object('entity_id', _entity_id, 'resolved_regulator_id', _reg,
                                    'resolved_sector_id', _sec);
END $function$;

CREATE TABLE IF NOT EXISTS public.supervisory_assessment_policy_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE RESTRICT,
  domain_code text NOT NULL,
  policy_profile_id uuid NOT NULL REFERENCES public.supervisory_policy_profile(id) ON DELETE RESTRICT,
  policy_profile_code text NOT NULL,
  policy_profile_version text NOT NULL,
  policy_profile_origin text NOT NULL,
  regulator_id uuid,
  sector_id uuid,
  resolved_as_of date NOT NULL,
  resolved_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_by uuid,
  methodology_id uuid,
  methodology_code text,
  methodology_version text,
  programme_set_id uuid,
  programme_code text,
  programme_version text,
  calculation_config_id uuid,
  calculation_config_version text,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_policy_snapshot_one_per_assessment UNIQUE (assessment_id)
);

GRANT SELECT ON public.supervisory_assessment_policy_snapshot TO authenticated;
GRANT ALL ON public.supervisory_assessment_policy_snapshot TO service_role;

ALTER TABLE public.supervisory_assessment_policy_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "policy basis readable with its assessment"
  ON public.supervisory_assessment_policy_snapshot;
CREATE POLICY "policy basis readable with its assessment"
  ON public.supervisory_assessment_policy_snapshot FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_assessment a
                  WHERE a.id = supervisory_assessment_policy_snapshot.assessment_id));

CREATE OR REPLACE FUNCTION public.supervisory_assessment_policy_snapshot_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'immutable: the assessment policy basis is append-only and cannot be %ed',
    lower(TG_OP) USING ERRCODE = '42501';
END $function$;

DROP TRIGGER IF EXISTS supervisory_assessment_policy_snapshot_immutable_trg
  ON public.supervisory_assessment_policy_snapshot;
CREATE TRIGGER supervisory_assessment_policy_snapshot_immutable_trg
  BEFORE UPDATE OR DELETE ON public.supervisory_assessment_policy_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_policy_snapshot_immutable();

CREATE INDEX IF NOT EXISTS supervisory_assessment_policy_snapshot_profile_idx
  ON public.supervisory_assessment_policy_snapshot (policy_profile_id);

CREATE OR REPLACE FUNCTION public.supervisory_assessment_policy_snapshot_stamp_internal(_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _ctx jsonb; _res jsonb; _comp jsonb; _prof jsonb;
        _id uuid; _hash text; _meth jsonb; _prog jsonb; _calc jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id) THEN
    RETURN jsonb_build_object('stamped', false, 'reason_code','ALREADY_STAMPED');
  END IF;

  _ctx := public.supervisory_methodology_context_internal(_a.entity_id, _a.domain_code, current_date);
  _res := public.supervisory_policy_profile_effective_internal(
            _a.domain_code, NULLIF(_ctx->>'regulator_id','')::uuid,
            NULLIF(_ctx->>'sector_id','')::uuid, current_date);

  IF _res->>'status' <> 'RESOLVED' THEN
    IF (_res->>'reason_code') = 'NO_ACTIVE_PROFILE_CONFIGURED' THEN
      INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
      VALUES (_assessment_id, 'POLICY_BASIS_UNAVAILABLE',
        'No active regulator-owned policy profile is configured for this domain, so no policy basis snapshot was taken.',
        _res, auth.uid());
      RETURN jsonb_build_object('stamped', false, 'reason_code', _res->>'reason_code',
                                'reason', _res->>'reason');
    END IF;
    RAISE EXCEPTION 'policy_profile_%: %', lower(_res->>'status'), _res->>'reason' USING ERRCODE = '22023';
  END IF;

  _prof := _res->'profile';
  _comp := _res->'components';

  IF NOT (public.supervisory_policy_profile_compatibility((_prof->>'policy_profile_id')::uuid)->>'compatible')::boolean THEN
    RAISE EXCEPTION 'policy_profile_incompatible: the active policy profile % % does not pass cross-component compatibility validation',
      _prof->>'code', _prof->>'profile_version' USING ERRCODE = '22023';
  END IF;

  SELECT x INTO _meth FROM jsonb_array_elements(_comp) x WHERE x->>'component_type' = 'METHODOLOGY';
  SELECT x INTO _prog FROM jsonb_array_elements(_comp) x WHERE x->>'component_type' = 'ASSESSMENT_PROGRAMME';
  SELECT x INTO _calc FROM jsonb_array_elements(_comp) x WHERE x->>'component_type' = 'CALCULATION_CONFIG';

  _hash := md5((_prof->>'policy_profile_id')||'|'||(_prof->>'profile_version')||'|'||
    COALESCE((SELECT string_agg((x->>'component_type')||':'||COALESCE(x->>'component_version','')||':'||
                                COALESCE(x->>'content_hash',''), ',' ORDER BY x->>'component_type')
                FROM jsonb_array_elements(_comp) x), ''));

  INSERT INTO public.supervisory_assessment_policy_snapshot(
    assessment_id, domain_code, policy_profile_id, policy_profile_code, policy_profile_version,
    policy_profile_origin, regulator_id, sector_id, resolved_as_of, resolved_by,
    methodology_id, methodology_code, methodology_version,
    programme_set_id, programme_code, programme_version,
    calculation_config_id, calculation_config_version,
    components, resolution, content_hash)
  VALUES (
    _assessment_id, _a.domain_code, (_prof->>'policy_profile_id')::uuid, _prof->>'code',
    _prof->>'profile_version', _prof->>'origin',
    NULLIF(_prof->>'regulator_id','')::uuid, NULLIF(_prof->>'sector_id','')::uuid,
    current_date, auth.uid(),
    NULLIF(_meth->>'component_id','')::uuid, _meth->>'component_code', _meth->>'component_version',
    NULLIF(_prog->>'component_id','')::uuid, _prog->>'component_code', _prog->>'component_version',
    NULLIF(_calc->>'component_id','')::uuid, _calc->>'component_version',
    _comp, _res - 'candidates', _hash)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, 'POLICY_BASIS_STAMPED',
    'The governing policy profile and every bound component version were recorded as the immutable policy basis of this assessment.',
    jsonb_build_object('snapshot_id', _id, 'policy_profile_id', _prof->>'policy_profile_id',
      'policy_profile_code', _prof->>'code', 'policy_profile_version', _prof->>'profile_version',
      'content_hash', _hash, 'components', _comp), auth.uid());

  RETURN jsonb_build_object('stamped', true, 'snapshot_id', _id,
    'policy_profile_id', _prof->>'policy_profile_id',
    'policy_profile_version', _prof->>'profile_version', 'content_hash', _hash);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_policy_basis(_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment; _s public.supervisory_assessment_policy_snapshot;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  SELECT * INTO _s FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;

  IF _s.id IS NULL THEN
    RETURN jsonb_build_object(
      'status','NO_POLICY_BASIS',
      'assessment_id', _assessment_id,
      'reason','This assessment was created before an active regulator-owned policy profile governed its domain, so it carries no policy profile basis. Its methodology and programme provenance remain recorded on the assessment itself.',
      'methodology_id', _a.methodology_id,
      'assessment_programme_id', _a.assessment_programme_id,
      'assessment_programme_code', _a.assessment_programme_code,
      'assessment_programme_version', _a.assessment_programme_version,
      'assessment_programme_provenance', _a.assessment_programme_provenance);
  END IF;

  RETURN jsonb_build_object(
    'status','SNAPSHOTTED',
    'assessment_id', _assessment_id,
    'snapshot_id', _s.id,
    'policy_profile_id', _s.policy_profile_id,
    'policy_profile_code', _s.policy_profile_code,
    'policy_profile_version', _s.policy_profile_version,
    'policy_profile_origin', _s.policy_profile_origin,
    'regulator_id', _s.regulator_id,
    'regulator_code', (SELECT code FROM public.regulators WHERE id = _s.regulator_id),
    'sector_id', _s.sector_id,
    'resolved_as_of', _s.resolved_as_of,
    'resolved_at', _s.resolved_at,
    'methodology_id', _s.methodology_id,
    'methodology_code', _s.methodology_code,
    'methodology_version', _s.methodology_version,
    'programme_set_id', _s.programme_set_id,
    'programme_code', _s.programme_code,
    'programme_version', _s.programme_version,
    'calculation_config_id', _s.calculation_config_id,
    'calculation_config_version', _s.calculation_config_version,
    'components', _s.components,
    'content_hash', _s.content_hash,
    'resolution', _s.resolution);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_create(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _ct text; _domain text; _reg uuid; _id uuid; _t record; _origin text; _regstatus text;
BEGIN
  _ct     := upper(btrim(COALESCE(_payload->>'component_type','')));
  _domain := upper(btrim(COALESCE(_payload->>'domain_code','')));
  _reg    := NULLIF(_payload->>'regulator_id','')::uuid;
  _origin := upper(btrim(COALESCE(NULLIF(_payload->>'origin',''),'REGULATOR_AUTHORED')));

  SELECT * INTO _t FROM public.supervisory_policy_component_type WHERE component_type = _ct;
  IF _t.component_type IS NULL THEN
    RAISE EXCEPTION 'unknown_component_type: %', _ct USING ERRCODE = '22023'; END IF;
  IF public.supervisory_policy_component_content_contract(_ct) IS NULL THEN
    RAISE EXCEPTION 'unsupported_component_type: % is not authored through this workspace', _ct
      USING ERRCODE = '22023'; END IF;
  IF _domain = '' THEN
    RAISE EXCEPTION 'validation_error: domain_code is required' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(_payload->>'code'),'') = '' OR COALESCE(btrim(_payload->>'component_version'),'') = ''
     OR COALESCE(btrim(_payload->>'name'),'') = '' THEN
    RAISE EXCEPTION 'validation_error: code, component_version and name are required' USING ERRCODE = '22023'; END IF;
  IF _origin NOT IN ('MIPL_REFERENCE','REGULATOR_AUTHORED') THEN
    RAISE EXCEPTION 'validation_error: new policy content is authored either as regulator-owned content or as MIPL reference material'
      USING ERRCODE = '22023'; END IF;

  IF _origin = 'REGULATOR_AUTHORED' AND _reg IS NULL THEN
    RAISE EXCEPTION 'validation_error: regulator-owned policy content must name the owning regulator; platform-wide content can only be authored as MIPL reference material'
      USING ERRCODE = '22023'; END IF;
  IF _origin = 'MIPL_REFERENCE' THEN
    IF _reg IS NOT NULL THEN
      RAISE EXCEPTION 'validation_error: MIPL reference material is platform-wide and cannot name an owning regulator'
        USING ERRCODE = '22023'; END IF;
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'not_authorized: only platform administration may author MIPL reference material'
        USING ERRCODE = '42501'; END IF;
  END IF;
  IF _reg IS NOT NULL THEN
    SELECT status INTO _regstatus FROM public.regulators WHERE id = _reg;
    IF _regstatus IS NULL THEN
      RAISE EXCEPTION 'not_found: regulator' USING ERRCODE = '22023'; END IF;
    IF _regstatus <> 'active' THEN
      RAISE EXCEPTION 'validation_error: an inactive regulator cannot own new policy content'
        USING ERRCODE = '22023'; END IF;
  END IF;

  _uid := public.supervisory_policy_component_require_manage(_domain, _reg);

  INSERT INTO public.supervisory_policy_component
    (component_type, code, component_version, domain_code, regulator_id, sector_id,
     name, purpose, content, origin, effective_from, effective_to, notes, created_by)
  VALUES (_ct, btrim(_payload->>'code'), btrim(_payload->>'component_version'), _domain, _reg,
          NULLIF(_payload->>'sector_id','')::uuid,
          btrim(_payload->>'name'), NULLIF(btrim(COALESCE(_payload->>'purpose','')),''),
          COALESCE(_payload->'content','{}'::jsonb), _origin,
          NULLIF(_payload->>'effective_from','')::date,
          NULLIF(_payload->>'effective_to','')::date,
          NULLIF(btrim(COALESCE(_payload->>'notes','')),''), _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_policy_component_event
    (component_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_id, 'CREATED', 'DRAFT', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid,
          jsonb_build_object('component_type', _ct, 'domain_code', _domain, 'origin', _origin));

  RETURN jsonb_build_object('component_id', _id, 'status', 'DRAFT', 'origin', _origin);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_lifecycle(_profile_id uuid, _to_status text, _rationale text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.supervisory_policy_profile; _to text; _allowed boolean;
        _ready jsonb; _superseded int := 0; _compat jsonb;
BEGIN
  _to := upper(COALESCE(_to_status,''));
  SELECT * INTO _row FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_policy_profile_require_manage(_profile_id);

  _allowed := CASE _row.status
    WHEN 'DRAFT'    THEN _to = 'REVIEW'
    WHEN 'REVIEW'   THEN _to IN ('APPROVED','DRAFT')
    WHEN 'APPROVED' THEN _to = 'ACTIVE'
    WHEN 'ACTIVE'   THEN _to = 'RETIRED'
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','ACTIVE','RETIRED') AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','ACTIVE') AND _row.origin = 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'reference_profile_not_adoptable_in_place: % % is a MIPL reference profile; a regulator must adopt it before it can be approved or activated',
      _row.code, _row.profile_version USING ERRCODE = '42501'; END IF;

  IF _to IN ('APPROVED','ACTIVE') THEN
    _compat := public.supervisory_policy_profile_compatibility(_profile_id);
    IF NOT (_compat->>'compatible')::boolean THEN
      RAISE EXCEPTION 'compatibility_refused: the bound policy package is not internally compatible: %',
        COALESCE((SELECT string_agg((x->>'code')||' — '||(x->>'message'), '; ')
                    FROM jsonb_array_elements(_compat->'findings') x WHERE x->>'severity' = 'ERROR'),
                 'unknown') USING ERRCODE = '22023'; END IF;
  END IF;

  IF _to = 'APPROVED' THEN
    PERFORM public.supervisory_policy_profile_require_approval(_profile_id);
    IF _row.created_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the author of a policy profile version cannot approve it' USING ERRCODE = '42501'; END IF;
    IF _row.reviewed_by IS NOT NULL AND _row.reviewed_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the reviewer who submitted this version cannot also approve it' USING ERRCODE = '42501'; END IF;

    _ready := public.supervisory_policy_profile_readiness(_profile_id);
    IF NOT (_ready->>'is_ready_for_approval')::boolean THEN
      RAISE EXCEPTION 'approval_refused: required policy components are not satisfied: %',
        COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(_ready->'blockers')), '; '), 'unknown')
        USING ERRCODE = '22023'; END IF;
  END IF;

  IF _to = 'ACTIVE' THEN
    IF _row.approved_by IS NULL THEN
      RAISE EXCEPTION 'activation_refused: % % carries no recorded approval', _row.code, _row.profile_version
        USING ERRCODE = '42501'; END IF;
    IF _row.regulator_id IS NULL THEN
      RAISE EXCEPTION 'activation_refused: an operative policy profile must name its owning regulator'
        USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.regulators r WHERE r.id = _row.regulator_id AND r.status = 'active') THEN
      RAISE EXCEPTION 'activation_refused: an inactive regulator cannot provide current supervisory policy'
        USING ERRCODE = '42501'; END IF;

    _ready := public.supervisory_policy_profile_readiness(_profile_id);
    IF NOT (_ready->>'is_ready_for_activation')::boolean THEN
      RAISE EXCEPTION 'activation_refused: required policy components are not satisfied: %',
        COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(_ready->'activation_blockers')), '; '), 'unknown')
        USING ERRCODE = '22023'; END IF;

    UPDATE public.supervisory_policy_profile
       SET status = 'SUPERSEDED', superseded_at = now(),
           effective_to = COALESCE(effective_to, current_date), updated_at = now()
     WHERE domain_code = _row.domain_code
       AND COALESCE(regulator_id::text,'*') = COALESCE(_row.regulator_id::text,'*')
       AND COALESCE(sector_id::text,'*') = COALESCE(_row.sector_id::text,'*')
       AND status = 'ACTIVE' AND id <> _profile_id;
    GET DIAGNOSTICS _superseded = ROW_COUNT;
  END IF;

  UPDATE public.supervisory_policy_profile SET
    status = _to,
    reviewed_by  = CASE WHEN _to = 'REVIEW'   THEN _uid ELSE reviewed_by END,
    reviewed_at  = CASE WHEN _to = 'REVIEW'   THEN now() ELSE reviewed_at END,
    approved_by  = CASE WHEN _to = 'APPROVED' THEN _uid ELSE approved_by END,
    approved_at  = CASE WHEN _to = 'APPROVED' THEN now() ELSE approved_at END,
    activated_at = CASE WHEN _to = 'ACTIVE'   THEN now() ELSE activated_at END,
    retired_at   = CASE WHEN _to = 'RETIRED'  THEN now() ELSE retired_at END,
    effective_from = CASE WHEN _to = 'ACTIVE' THEN COALESCE(effective_from, current_date) ELSE effective_from END,
    effective_to = CASE WHEN _to = 'RETIRED' THEN COALESCE(effective_to, current_date) ELSE effective_to END
  WHERE id = _profile_id;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_profile_id, 'LIFECYCLE', _row.status, _to, NULLIF(btrim(COALESCE(_rationale,'')),''), _uid,
          jsonb_build_object('superseded_profiles', _superseded, 'readiness', _ready, 'compatibility', _compat));

  PERFORM public.log_compliance_audit(
          CASE WHEN _to = 'APPROVED' THEN 'APPROVE' ELSE 'WORKFLOW_TRANSITION' END::compliance_audit_action,
          'supervisory_policy_profile', _profile_id::text,
          jsonb_build_object('status', _row.status), jsonb_build_object('status', _to),
          NULLIF(btrim(COALESCE(_rationale,'')),''), NULL, NULL, '{}'::jsonb);

  RETURN jsonb_build_object('id', _profile_id, 'status', _to, 'superseded_profiles', _superseded,
                            'compatibility', _compat);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_resolve(_domain_code text, _regulator_id uuid DEFAULT NULL::uuid, _sector_id uuid DEFAULT NULL::uuid, _as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _res jsonb;
BEGIN
  _res := public.supervisory_policy_profile_effective(_domain_code, _regulator_id, _sector_id, NULL, _as_of);
  RETURN _res || jsonb_build_object(
    'resolved', (_res->>'status') = 'RESOLVED',
    'binds_operational_assessments', true,
    'note', 'New programmed assessments resolve this profile and record an immutable policy basis snapshot. '||
            'The ten generic policy components are authored and bound but not yet runtime consumed.');
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_create_programmed(_entity_id uuid, _domain_code text, _programme_id uuid, _trigger_type text DEFAULT NULL::text, _period_start date DEFAULT NULL::date, _period_end date DEFAULT NULL::date, _summary text DEFAULT NULL::text, _trigger_signal_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _opts jsonb; _p public.supervisory_assessment_programme; _set public.supervisory_assessment_programme_set;
        _allowed jsonb; _trig text; _period jsonb; _ps date; _pe date; _prior uuid; _res jsonb; _mode text;
        _plan jsonb; _ctx jsonb; _eff jsonb; _basis jsonb; _bound_prog uuid;
BEGIN
  IF _programme_id IS NULL THEN
    RAISE EXCEPTION 'programme_required: an assessment programme must be selected' USING ERRCODE='22023'; END IF;

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

  _ctx := public.supervisory_methodology_context_internal(_entity_id, upper(_domain_code), current_date);
  _eff := public.supervisory_policy_profile_effective_internal(
            upper(_domain_code), NULLIF(_ctx->>'regulator_id','')::uuid,
            NULLIF(_ctx->>'sector_id','')::uuid, current_date);
  IF (_eff->>'status') <> 'RESOLVED' AND (_eff->>'reason_code') <> 'NO_ACTIVE_PROFILE_CONFIGURED' THEN
    RAISE EXCEPTION 'policy_profile_unusable: %', _eff->>'reason' USING ERRCODE='22023'; END IF;
  IF (_eff->>'status') = 'RESOLVED' THEN
    SELECT NULLIF(x->>'component_id','')::uuid INTO _bound_prog
      FROM jsonb_array_elements(_eff->'components') x WHERE x->>'component_type' = 'ASSESSMENT_PROGRAMME';
    IF _bound_prog IS NOT NULL AND _bound_prog <> _set.id THEN
      RAISE EXCEPTION 'programme_not_in_effective_policy: the active policy profile % % binds a different assessment programme configuration',
        (_eff->'profile')->>'code', (_eff->'profile')->>'profile_version' USING ERRCODE='42501'; END IF;
  END IF;

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

  _plan := public.supervisory_assessment_question_plan_materialise_internal((_res->>'id')::uuid, auth.uid());

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES ((_res->>'id')::uuid, 'QUESTION_PLAN_MATERIALISED',
    'Question scope resolved from the exact methodology version and assessment programme.',
    jsonb_build_object('methodology_id', _res->>'methodology_id', 'programme_id', _p.id,
      'programme_code', _p.programme_code, 'programme_version', _set.set_version,
      'summary', _plan), auth.uid());

  _basis := public.supervisory_assessment_policy_snapshot_stamp_internal((_res->>'id')::uuid);

  RETURN _res || jsonb_build_object('question_plan', _plan) || jsonb_build_object('policy_basis', _basis)
    || jsonb_build_object('programme', jsonb_build_object(
    'programme_set_id',_set.id,'programme_set_code',_set.code,'programme_set_version',_set.set_version,
    'programme_id',_p.id,'programme_code',_p.programme_code,'assessment_type',_p.assessment_type,
    'trigger_type',_trig,'period_start',_ps,'period_end',_pe,'mode',_mode));
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_snapshot_stamp_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_snapshot_stamp_internal(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_policy_snapshot_stamp_internal(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.supervisory_policy_profile_effective_internal(text, uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_policy_profile_effective_internal(text, uuid, uuid, date) FROM anon;