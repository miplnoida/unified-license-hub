
-- ===================================================================
-- AML-03 (1/3) — generic supervisory assessment programme configuration
-- Additive only. No existing object is dropped, renamed or altered.
-- ===================================================================

-- ---------- vocabulary (governed, server-owned) ----------
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_programme_vocabulary (
  kind          text NOT NULL,          -- PERIOD_RULE | QUESTION_CLASS | ASSESSMENT_TYPE | TRIGGER_CODE
  code          text NOT NULL,
  label         text NOT NULL,
  description    text,
  requires_value boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, code)
);
GRANT SELECT ON public.supervisory_assessment_programme_vocabulary TO authenticated;
GRANT ALL    ON public.supervisory_assessment_programme_vocabulary TO service_role;
ALTER TABLE public.supervisory_assessment_programme_vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programme vocabulary is readable by signed-in staff"
  ON public.supervisory_assessment_programme_vocabulary FOR SELECT TO authenticated USING (true);

INSERT INTO public.supervisory_assessment_programme_vocabulary(kind, code, label, description, requires_value, sort_order)
VALUES
 ('PERIOD_RULE','MANUAL_REQUIRED','Officer enters the period','No period is derived; the officer must state it.',false,10),
 ('PERIOD_RULE','TRAILING_DAYS','Trailing days','The period is the stated number of days ending at the end offset.',true,20),
 ('PERIOD_RULE','TRAILING_MONTHS','Trailing months','The period is the stated number of months ending at the end offset.',true,30),
 ('PERIOD_RULE','PRIOR_ASSESSMENT_FORWARD','From the prior assessment','The period starts at the end of the prior assessment period.',false,40),
 ('PERIOD_RULE','EVENT_WINDOW','Event window','The period is a window around the triggering event.',true,50),
 ('QUESTION_CLASS','CORE','Core',NULL,false,10),
 ('QUESTION_CLASS','CONDITIONAL','Conditional',NULL,false,20),
 ('QUESTION_CLASS','ENHANCED','Enhanced',NULL,false,30)
ON CONFLICT (kind, code) DO NOTHING;

-- canonical assessment types already used by supervisory_assessment
INSERT INTO public.supervisory_assessment_programme_vocabulary(kind, code, label, sort_order)
SELECT 'ASSESSMENT_TYPE', c, l, o FROM (VALUES
 ('PERIODIC','Periodic',10),('INITIAL_BASELINE','Initial baseline',20),
 ('FOLLOW_UP','Follow-up',30),('EVENT_DRIVEN','Event driven',40),
 ('THEMATIC','Thematic',50),('TARGETED','Targeted',60)) v(c,l,o)
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO public.supervisory_assessment_programme_vocabulary(kind, code, label, sort_order)
SELECT 'TRIGGER_CODE', c, l, o FROM (VALUES
 ('PERIODIC','Periodic cycle',10),('REASSESSMENT','Reassessment requirement',20),
 ('EVENT_DRIVEN','Event or intelligence',30),('FOLLOW_UP','Follow-up of prior assessment',40),
 ('THEMATIC','Thematic review',50)) v(c,l,o)
ON CONFLICT (kind, code) DO NOTHING;

-- ---------- programme set ----------
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_programme_set (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,
  set_version   text NOT NULL,
  name          text NOT NULL,
  description   text,
  domain_code   text NOT NULL,
  regulator_id  uuid REFERENCES public.regulators(id),
  origin        text NOT NULL DEFAULT 'REGULATOR_AUTHORED',
  status        text NOT NULL DEFAULT 'DRAFT',
  effective_from date,
  effective_to   date,
  adopted_from_id uuid REFERENCES public.supervisory_assessment_programme_set(id),
  supersedes_id   uuid REFERENCES public.supervisory_assessment_programme_set(id),
  notes         text,
  created_by    uuid,
  submitted_by  uuid,
  submitted_at  timestamptz,
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  approved_by   uuid,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_programme_set_origin_chk
    CHECK (origin IN ('MIPL_REFERENCE','REGULATOR_ADOPTED','REGULATOR_AUTHORED')),
  CONSTRAINT supervisory_assessment_programme_set_status_chk
    CHECK (status IN ('DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED','RETIRED')),
  CONSTRAINT supervisory_assessment_programme_set_version_uq UNIQUE (code, set_version)
);
GRANT SELECT ON public.supervisory_assessment_programme_set TO authenticated;
GRANT ALL    ON public.supervisory_assessment_programme_set TO service_role;
ALTER TABLE public.supervisory_assessment_programme_set ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programme sets are readable inside authorised regulator scope"
  ON public.supervisory_assessment_programme_set FOR SELECT TO authenticated
  USING (public.supervisory_methodology_regulator_scope_readable(domain_code, regulator_id));

-- ---------- programme ----------
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_programme (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_set_id uuid NOT NULL REFERENCES public.supervisory_assessment_programme_set(id) ON DELETE CASCADE,
  programme_code  text NOT NULL,
  label           text NOT NULL,
  description     text,
  assessment_type text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 100,
  recurrence_months integer,
  period_rule     text NOT NULL DEFAULT 'MANUAL_REQUIRED',
  period_value    integer,
  end_offset_days integer NOT NULL DEFAULT 0,
  allow_manual_override boolean NOT NULL DEFAULT true,
  requires_prior_assessment boolean NOT NULL DEFAULT false,
  requires_trigger_signal   boolean NOT NULL DEFAULT false,
  summary_required boolean NOT NULL DEFAULT true,
  question_class_scope text[] NOT NULL DEFAULT ARRAY['CORE']::text[],
  included_dimension_codes text[] NOT NULL DEFAULT '{}'::text[],
  excluded_dimension_codes text[] NOT NULL DEFAULT '{}'::text[],
  guidance        text,
  rule_detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance      text NOT NULL DEFAULT 'GOVERNED',
  retired_at      timestamptz,
  retired_by      uuid,
  retirement_rationale text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_programme_code_uq UNIQUE (programme_set_id, programme_code),
  CONSTRAINT supervisory_assessment_programme_period_value_chk
    CHECK (period_value IS NULL OR period_value > 0)
);
GRANT SELECT ON public.supervisory_assessment_programme TO authenticated;
GRANT ALL    ON public.supervisory_assessment_programme TO service_role;
ALTER TABLE public.supervisory_assessment_programme ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programmes follow their programme set scope"
  ON public.supervisory_assessment_programme FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set s
                  WHERE s.id = programme_set_id
                    AND public.supervisory_methodology_regulator_scope_readable(s.domain_code, s.regulator_id)));

-- ---------- programme trigger ----------
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_programme_trigger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id  uuid NOT NULL REFERENCES public.supervisory_assessment_programme(id) ON DELETE CASCADE,
  trigger_code  text NOT NULL,
  label         text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  is_default    boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 100,
  requires_signal            boolean NOT NULL DEFAULT false,
  requires_prior_assessment  boolean NOT NULL DEFAULT false,
  guidance      text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_programme_trigger_uq UNIQUE (programme_id, trigger_code)
);
GRANT SELECT ON public.supervisory_assessment_programme_trigger TO authenticated;
GRANT ALL    ON public.supervisory_assessment_programme_trigger TO service_role;
ALTER TABLE public.supervisory_assessment_programme_trigger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programme triggers follow their programme set scope"
  ON public.supervisory_assessment_programme_trigger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_assessment_programme p
                  JOIN public.supervisory_assessment_programme_set s ON s.id = p.programme_set_id
                  WHERE p.id = programme_id
                    AND public.supervisory_methodology_regulator_scope_readable(s.domain_code, s.regulator_id)));

-- ---------- append-only history ----------
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_programme_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_set_id uuid NOT NULL REFERENCES public.supervisory_assessment_programme_set(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  from_status   text,
  to_status     text,
  rationale     text,
  before_state  jsonb,
  after_state   jsonb,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id      uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supervisory_assessment_programme_event TO authenticated;
GRANT ALL    ON public.supervisory_assessment_programme_event TO service_role;
ALTER TABLE public.supervisory_assessment_programme_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programme history follows its programme set scope"
  ON public.supervisory_assessment_programme_event FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set s
                  WHERE s.id = programme_set_id
                    AND public.supervisory_methodology_regulator_scope_readable(s.domain_code, s.regulator_id)));

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_event_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'append_only: supervisory assessment programme history cannot be changed or deleted'
    USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS supervisory_assessment_programme_event_immutable
  ON public.supervisory_assessment_programme_event;
CREATE TRIGGER supervisory_assessment_programme_event_immutable
  BEFORE UPDATE OR DELETE ON public.supervisory_assessment_programme_event
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_programme_event_append_only();

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS t_touch_programme_set ON public.supervisory_assessment_programme_set;
CREATE TRIGGER t_touch_programme_set BEFORE UPDATE ON public.supervisory_assessment_programme_set
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_programme_touch();
DROP TRIGGER IF EXISTS t_touch_programme ON public.supervisory_assessment_programme;
CREATE TRIGGER t_touch_programme BEFORE UPDATE ON public.supervisory_assessment_programme
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_programme_touch();
DROP TRIGGER IF EXISTS t_touch_programme_trigger ON public.supervisory_assessment_programme_trigger;
CREATE TRIGGER t_touch_programme_trigger BEFORE UPDATE ON public.supervisory_assessment_programme_trigger
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_programme_touch();

-- ===================================================================
-- authority helpers
-- ===================================================================

-- Manage authority for an existing set: domain + owning regulator, and the set
-- must still be editable. Reference (regulator_id IS NULL) content requires
-- domain manage authority only; it never becomes regulator policy in place.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_require_manage(_set_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _s public.supervisory_assessment_programme_set;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id = _set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE = '22023'; END IF;
  IF _s.regulator_id IS NULL THEN
    _uid := public.supervisory_domain_require_manage(_s.domain_code);
  ELSE
    _uid := public.supervisory_domain_require_manage_for_regulator(_s.domain_code, _s.regulator_id);
  END IF;
  IF _s.status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'frozen_version: % % is % and cannot be changed; create a new version instead',
      _s.code, _s.set_version, _s.status USING ERRCODE = '42501';
  END IF;
  RETURN _uid;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_require_draft(_set_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _st text;
BEGIN
  _uid := public.supervisory_assessment_programme_set_require_manage(_set_id);
  SELECT status INTO _st FROM public.supervisory_assessment_programme_set WHERE id = _set_id;
  IF _st <> 'DRAFT' THEN
    RAISE EXCEPTION 'not_draft: the programme set is in % and its content is read-only; return it to draft first', _st
      USING ERRCODE = '42501'; END IF;
  RETURN _uid;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_require_approval(_set_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _d text; _reg uuid; _perm text; _regcode text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  SELECT s.domain_code, s.regulator_id, a.policy_approval_permission INTO _d, _reg, _perm
    FROM public.supervisory_assessment_programme_set s
    LEFT JOIN public.supervisory_domain_authority a ON a.domain_code = s.domain_code
   WHERE s.id = _set_id;
  IF _d IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE = '22023'; END IF;
  IF _perm IS NULL THEN
    RAISE EXCEPTION 'not_authorized: no dedicated policy approval permission is registered for domain %; assessment programme sets cannot be approved', _d
      USING ERRCODE = '42501'; END IF;
  SELECT code INTO _regcode FROM public.regulators WHERE id = _reg;
  IF public.user_has_regulator_authority(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _reg) THEN
    RETURN _uid; END IF;
  RAISE EXCEPTION 'not_authorized: % for regulator % is required to approve this assessment programme set',
    _perm, COALESCE(_regcode,'(unscoped)') USING ERRCODE = '42501';
END $$;

-- ===================================================================
-- validation / readiness
-- ===================================================================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_validate(_set_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.supervisory_assessment_programme_set; _err jsonb := '[]'::jsonb; _warn jsonb := '[]'::jsonb;
        _r record; _n int;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id = _set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_s.domain_code, _s.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: outside your authorised regulator scope' USING ERRCODE = '42501'; END IF;

  IF NOT public.supervisory_domain_valid(_s.domain_code) THEN
    _err := _err || jsonb_build_object('area','SET','code','DOMAIN_INVALID',
      'message', format('%s is not a supported supervisory domain.', _s.domain_code)); END IF;

  IF _s.origin = 'MIPL_REFERENCE' AND _s.regulator_id IS NOT NULL THEN
    _err := _err || jsonb_build_object('area','SET','code','REFERENCE_OWNED_BY_REGULATOR',
      'message','A MIPL reference programme set cannot be owned by a regulator.'); END IF;
  IF _s.origin <> 'MIPL_REFERENCE' AND _s.regulator_id IS NULL THEN
    _err := _err || jsonb_build_object('area','SET','code','REGULATOR_REQUIRED',
      'message','A regulator-owned programme set must state its regulator.'); END IF;

  IF _s.effective_from IS NOT NULL AND _s.effective_to IS NOT NULL AND _s.effective_to < _s.effective_from THEN
    _err := _err || jsonb_build_object('area','SET','code','EFFECTIVE_DATES_INVALID',
      'message','The effective end date is before the effective start date.'); END IF;

  SELECT count(*) INTO _n FROM public.supervisory_assessment_programme
   WHERE programme_set_id = _set_id AND is_active AND retired_at IS NULL;
  IF _n = 0 THEN
    _err := _err || jsonb_build_object('area','PROGRAMMES','code','NO_ACTIVE_PROGRAMME',
      'message','A programme set must contain at least one active programme.'); END IF;

  FOR _r IN SELECT * FROM public.supervisory_assessment_programme
             WHERE programme_set_id = _set_id AND retired_at IS NULL LOOP

    IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_vocabulary
                    WHERE kind='ASSESSMENT_TYPE' AND code = _r.assessment_type AND is_active) THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','ASSESSMENT_TYPE_INVALID',
        'programme_code', _r.programme_code,
        'message', format('%s is not a governed assessment type.', _r.assessment_type)); END IF;

    IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_vocabulary v
                    WHERE v.kind='PERIOD_RULE' AND v.code = _r.period_rule AND v.is_active) THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','PERIOD_RULE_INVALID',
        'programme_code', _r.programme_code,
        'message', format('%s is not a governed period rule.', _r.period_rule));
    ELSIF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_vocabulary v
                   WHERE v.kind='PERIOD_RULE' AND v.code = _r.period_rule AND v.requires_value)
          AND COALESCE(_r.period_value,0) <= 0 THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','PERIOD_VALUE_REQUIRED',
        'programme_code', _r.programme_code,
        'message', format('Period rule %s requires a positive period value.', _r.period_rule)); END IF;

    IF _r.period_rule = 'MANUAL_REQUIRED' AND NOT _r.allow_manual_override THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','PERIOD_UNSATISFIABLE',
        'programme_code', _r.programme_code,
        'message','The period must be entered by the officer, but manual entry is not permitted.'); END IF;

    IF array_length(_r.question_class_scope,1) IS NULL THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','QUESTION_CLASS_SCOPE_EMPTY',
        'programme_code', _r.programme_code,
        'message','At least one question class must be in scope.');
    ELSIF EXISTS (SELECT 1 FROM unnest(_r.question_class_scope) q
                   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_vocabulary
                                      WHERE kind='QUESTION_CLASS' AND code = q AND is_active)) THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','QUESTION_CLASS_INVALID',
        'programme_code', _r.programme_code,
        'message','The question-class scope contains a value outside the governed vocabulary.'); END IF;

    IF EXISTS (SELECT 1 FROM unnest(_r.included_dimension_codes) c
                WHERE c = ANY(_r.excluded_dimension_codes)) THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','DIMENSION_SCOPE_CONFLICT',
        'programme_code', _r.programme_code,
        'message','A dimension cannot be both explicitly included and excluded.'); END IF;

    SELECT count(*) INTO _n FROM public.supervisory_assessment_programme_trigger
     WHERE programme_id = _r.id AND is_active;
    IF _n = 0 THEN
      _err := _err || jsonb_build_object('area','TRIGGERS','code','NO_ACTIVE_TRIGGER',
        'programme_code', _r.programme_code,
        'message','A programme must allow at least one active trigger.'); END IF;

    SELECT count(*) INTO _n FROM public.supervisory_assessment_programme_trigger
     WHERE programme_id = _r.id AND is_default;
    IF _n > 1 THEN
      _err := _err || jsonb_build_object('area','TRIGGERS','code','MULTIPLE_DEFAULT_TRIGGERS',
        'programme_code', _r.programme_code,
        'message','Only one trigger may be the default.'); END IF;
    IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_trigger
                WHERE programme_id = _r.id AND is_default AND NOT is_active) THEN
      _err := _err || jsonb_build_object('area','TRIGGERS','code','DEFAULT_TRIGGER_NOT_ALLOWED',
        'programme_code', _r.programme_code,
        'message','The default trigger is not an allowed active trigger.'); END IF;
    IF _n = 0 THEN
      _warn := _warn || jsonb_build_object('area','TRIGGERS','code','NO_DEFAULT_TRIGGER',
        'programme_code', _r.programme_code,
        'message','No default trigger is set; the officer will have to choose one.'); END IF;

    IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_trigger
                WHERE programme_id = _r.id AND is_active
                  AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_vocabulary
                                   WHERE kind='TRIGGER_CODE' AND code = trigger_code AND is_active)) THEN
      _err := _err || jsonb_build_object('area','TRIGGERS','code','TRIGGER_CODE_INVALID',
        'programme_code', _r.programme_code,
        'message','A trigger code is outside the governed trigger vocabulary.'); END IF;

    IF _r.requires_prior_assessment AND _r.assessment_type = 'INITIAL_BASELINE' THEN
      _err := _err || jsonb_build_object('area','PROGRAMME','code','PRIOR_ASSESSMENT_INCONSISTENT',
        'programme_code', _r.programme_code,
        'message','An initial baseline programme cannot require a prior assessment.'); END IF;

    IF _r.period_rule = 'PRIOR_ASSESSMENT_FORWARD' AND NOT _r.requires_prior_assessment THEN
      _warn := _warn || jsonb_build_object('area','PROGRAMME','code','PRIOR_ASSESSMENT_ADVISORY',
        'programme_code', _r.programme_code,
        'message','The period is derived from a prior assessment, but a prior assessment is not required.'); END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'programme_set_id', _set_id, 'status', _s.status,
    'errors', _err, 'warnings', _warn,
    'error_count', jsonb_array_length(_err), 'warning_count', jsonb_array_length(_warn),
    'ready_for_review', jsonb_array_length(_err) = 0,
    'ready_for_approval', jsonb_array_length(_err) = 0);
END $$;

-- ===================================================================
-- governed writers
-- ===================================================================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_create(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _d text; _reg uuid; _code text; _ver text; _id uuid;
BEGIN
  _d   := upper(btrim(COALESCE(_payload->>'domain_code','')));
  _reg := NULLIF(_payload->>'regulator_id','')::uuid;
  _code:= upper(btrim(COALESCE(_payload->>'code','')));
  _ver := btrim(COALESCE(_payload->>'set_version','1.0'));
  IF _code = '' OR btrim(COALESCE(_payload->>'name','')) = '' THEN
    RAISE EXCEPTION 'a code and a name are required' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_domain_valid(_d) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _d USING ERRCODE = '22023'; END IF;
  IF _reg IS NULL THEN
    RAISE EXCEPTION 'regulator_required: a regulator-authored programme set must state its owning regulator'
      USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_domain_require_manage_for_regulator(_d, _reg);

  INSERT INTO public.supervisory_assessment_programme_set(
    code, set_version, name, description, domain_code, regulator_id, origin, status,
    effective_from, effective_to, notes, created_by)
  VALUES (_code, _ver, btrim(_payload->>'name'), NULLIF(btrim(COALESCE(_payload->>'description','')),''),
          _d, _reg, 'REGULATOR_AUTHORED', 'DRAFT',
          NULLIF(_payload->>'effective_from','')::date, NULLIF(_payload->>'effective_to','')::date,
          NULLIF(btrim(COALESCE(_payload->>'notes','')),''), _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, to_status, rationale, after_state, actor_id)
  VALUES (_id,'CREATED','DRAFT', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''),
          to_jsonb((SELECT s FROM public.supervisory_assessment_programme_set s WHERE s.id=_id)), _uid);

  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'supervisory_assessment_programme_set',
    _id::text, NULL, jsonb_build_object('code',_code,'set_version',_ver,'domain_code',_d,'regulator_id',_reg),
    NULL, NULL, NULL, '{}'::jsonb);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_save(_set_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _before jsonb;
BEGIN
  _uid := public.supervisory_assessment_programme_set_require_draft(_set_id);
  _before := to_jsonb((SELECT s FROM public.supervisory_assessment_programme_set s WHERE s.id=_set_id));

  UPDATE public.supervisory_assessment_programme_set SET
    name          = COALESCE(NULLIF(btrim(COALESCE(_payload->>'name','')),''), name),
    description   = CASE WHEN _payload ? 'description' THEN NULLIF(btrim(COALESCE(_payload->>'description','')),'') ELSE description END,
    effective_from= CASE WHEN _payload ? 'effective_from' THEN NULLIF(_payload->>'effective_from','')::date ELSE effective_from END,
    effective_to  = CASE WHEN _payload ? 'effective_to'   THEN NULLIF(_payload->>'effective_to','')::date   ELSE effective_to END,
    notes         = CASE WHEN _payload ? 'notes' THEN NULLIF(btrim(COALESCE(_payload->>'notes','')),'') ELSE notes END
  WHERE id = _set_id;

  INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, rationale, before_state, after_state, actor_id)
  VALUES (_set_id,'METADATA_UPDATED', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _before,
          to_jsonb((SELECT s FROM public.supervisory_assessment_programme_set s WHERE s.id=_set_id)), _uid);
  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,'supervisory_assessment_programme_set',
    _set_id::text, _before, to_jsonb(_payload), NULL, NULL, NULL, '{}'::jsonb);
  RETURN _set_id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_upsert(_set_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _before jsonb; _classes text[]; _inc text[]; _exc text[]; _code text;
BEGIN
  _uid := public.supervisory_assessment_programme_set_require_draft(_set_id);
  _id  := NULLIF(_payload->>'id','')::uuid;
  _code:= upper(btrim(COALESCE(_payload->>'programme_code','')));
  IF _code = '' OR btrim(COALESCE(_payload->>'label','')) = '' THEN
    RAISE EXCEPTION 'a programme code and label are required' USING ERRCODE = '22023'; END IF;

  SELECT COALESCE(array_agg(upper(btrim(x))), ARRAY['CORE']::text[]) INTO _classes
    FROM jsonb_array_elements_text(COALESCE(_payload->'question_class_scope','["CORE"]'::jsonb)) x;
  SELECT COALESCE(array_agg(upper(btrim(x))), '{}'::text[]) INTO _inc
    FROM jsonb_array_elements_text(COALESCE(_payload->'included_dimension_codes','[]'::jsonb)) x;
  SELECT COALESCE(array_agg(upper(btrim(x))), '{}'::text[]) INTO _exc
    FROM jsonb_array_elements_text(COALESCE(_payload->'excluded_dimension_codes','[]'::jsonb)) x;

  IF _id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme
                WHERE programme_set_id = _set_id AND programme_code = _code) THEN
      RAISE EXCEPTION 'duplicate_programme_code: % already exists in this programme set', _code
        USING ERRCODE = '22023'; END IF;

    INSERT INTO public.supervisory_assessment_programme(
      programme_set_id, programme_code, label, description, assessment_type, is_active, sort_order,
      recurrence_months, period_rule, period_value, end_offset_days, allow_manual_override,
      requires_prior_assessment, requires_trigger_signal, summary_required,
      question_class_scope, included_dimension_codes, excluded_dimension_codes, guidance, rule_detail, created_by)
    VALUES (_set_id, _code, btrim(_payload->>'label'),
      NULLIF(btrim(COALESCE(_payload->>'description','')),''),
      upper(btrim(COALESCE(_payload->>'assessment_type','PERIODIC'))),
      COALESCE((_payload->>'is_active')::boolean, true),
      COALESCE((_payload->>'sort_order')::int, 100),
      NULLIF(_payload->>'recurrence_months','')::int,
      upper(btrim(COALESCE(_payload->>'period_rule','MANUAL_REQUIRED'))),
      NULLIF(_payload->>'period_value','')::int,
      COALESCE((_payload->>'end_offset_days')::int, 0),
      COALESCE((_payload->>'allow_manual_override')::boolean, true),
      COALESCE((_payload->>'requires_prior_assessment')::boolean, false),
      COALESCE((_payload->>'requires_trigger_signal')::boolean, false),
      COALESCE((_payload->>'summary_required')::boolean, true),
      _classes, _inc, _exc,
      NULLIF(btrim(COALESCE(_payload->>'guidance','')),''),
      COALESCE(_payload->'rule_detail','{}'::jsonb), _uid)
    RETURNING id INTO _id;

    INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, rationale, after_state, actor_id, detail)
    VALUES (_set_id,'PROGRAMME_ADDED', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''),
            to_jsonb((SELECT p FROM public.supervisory_assessment_programme p WHERE p.id=_id)), _uid,
            jsonb_build_object('programme_code',_code));
  ELSE
    SELECT to_jsonb(p) INTO _before FROM public.supervisory_assessment_programme p
      WHERE p.id = _id AND p.programme_set_id = _set_id;
    IF _before IS NULL THEN
      RAISE EXCEPTION 'not_found: programme in this programme set' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme
                WHERE programme_set_id = _set_id AND programme_code = _code AND id <> _id) THEN
      RAISE EXCEPTION 'duplicate_programme_code: % already exists in this programme set', _code
        USING ERRCODE = '22023'; END IF;

    UPDATE public.supervisory_assessment_programme SET
      programme_code = _code,
      label = btrim(_payload->>'label'),
      description = NULLIF(btrim(COALESCE(_payload->>'description','')),''),
      assessment_type = upper(btrim(COALESCE(_payload->>'assessment_type', assessment_type))),
      is_active = COALESCE((_payload->>'is_active')::boolean, is_active),
      sort_order = COALESCE((_payload->>'sort_order')::int, sort_order),
      recurrence_months = NULLIF(_payload->>'recurrence_months','')::int,
      period_rule = upper(btrim(COALESCE(_payload->>'period_rule', period_rule))),
      period_value = NULLIF(_payload->>'period_value','')::int,
      end_offset_days = COALESCE((_payload->>'end_offset_days')::int, end_offset_days),
      allow_manual_override = COALESCE((_payload->>'allow_manual_override')::boolean, allow_manual_override),
      requires_prior_assessment = COALESCE((_payload->>'requires_prior_assessment')::boolean, requires_prior_assessment),
      requires_trigger_signal = COALESCE((_payload->>'requires_trigger_signal')::boolean, requires_trigger_signal),
      summary_required = COALESCE((_payload->>'summary_required')::boolean, summary_required),
      question_class_scope = _classes,
      included_dimension_codes = _inc,
      excluded_dimension_codes = _exc,
      guidance = NULLIF(btrim(COALESCE(_payload->>'guidance','')),''),
      rule_detail = COALESCE(_payload->'rule_detail', rule_detail)
    WHERE id = _id;

    INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, rationale, before_state, after_state, actor_id, detail)
    VALUES (_set_id,'PROGRAMME_UPDATED', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _before,
            to_jsonb((SELECT p FROM public.supervisory_assessment_programme p WHERE p.id=_id)), _uid,
            jsonb_build_object('programme_code',_code));
  END IF;

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action,'supervisory_assessment_programme',
    _id::text, _before, to_jsonb(_payload), NULL, NULL, NULL, '{}'::jsonb);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_retire(_programme_id uuid, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _set uuid; _before jsonb;
BEGIN
  SELECT programme_set_id INTO _set FROM public.supervisory_assessment_programme WHERE id = _programme_id;
  IF _set IS NULL THEN RAISE EXCEPTION 'not_found: programme' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_assessment_programme_set_require_draft(_set);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  SELECT to_jsonb(p) INTO _before FROM public.supervisory_assessment_programme p WHERE p.id=_programme_id;

  UPDATE public.supervisory_assessment_programme
     SET is_active = false, retired_at = now(), retired_by = _uid, retirement_rationale = btrim(_rationale)
   WHERE id = _programme_id;

  INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, rationale, before_state, after_state, actor_id)
  VALUES (_set,'PROGRAMME_RETIRED', btrim(_rationale), _before,
          to_jsonb((SELECT p FROM public.supervisory_assessment_programme p WHERE p.id=_programme_id)), _uid);
  RETURN _programme_id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_trigger_upsert(_programme_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _set uuid; _id uuid; _code text; _before jsonb; _lbl text;
BEGIN
  SELECT programme_set_id INTO _set FROM public.supervisory_assessment_programme WHERE id = _programme_id;
  IF _set IS NULL THEN RAISE EXCEPTION 'not_found: programme' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_assessment_programme_set_require_draft(_set);

  _code := upper(btrim(COALESCE(_payload->>'trigger_code','')));
  IF _code = '' THEN RAISE EXCEPTION 'a trigger code is required' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_vocabulary
                  WHERE kind='TRIGGER_CODE' AND code=_code AND is_active) THEN
    RAISE EXCEPTION 'trigger_code_invalid: % is not a governed trigger code', _code USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(NULLIF(btrim(COALESCE(_payload->>'label','')),''), label)
    INTO _lbl FROM public.supervisory_assessment_programme_vocabulary
   WHERE kind='TRIGGER_CODE' AND code=_code;

  _id := NULLIF(_payload->>'id','')::uuid;
  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.supervisory_assessment_programme_trigger
      WHERE programme_id=_programme_id AND trigger_code=_code;
  END IF;

  IF COALESCE((_payload->>'is_default')::boolean,false) THEN
    UPDATE public.supervisory_assessment_programme_trigger SET is_default=false
      WHERE programme_id=_programme_id AND (_id IS NULL OR id <> _id);
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.supervisory_assessment_programme_trigger(
      programme_id, trigger_code, label, description, is_active, is_default, sort_order,
      requires_signal, requires_prior_assessment, guidance, created_by)
    VALUES (_programme_id, _code, _lbl, NULLIF(btrim(COALESCE(_payload->>'description','')),''),
      COALESCE((_payload->>'is_active')::boolean,true),
      COALESCE((_payload->>'is_default')::boolean,false),
      COALESCE((_payload->>'sort_order')::int,100),
      COALESCE((_payload->>'requires_signal')::boolean,false),
      COALESCE((_payload->>'requires_prior_assessment')::boolean,false),
      NULLIF(btrim(COALESCE(_payload->>'guidance','')),''), _uid)
    RETURNING id INTO _id;
    INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, after_state, actor_id, detail)
    VALUES (_set,'TRIGGER_ADDED',
      to_jsonb((SELECT t FROM public.supervisory_assessment_programme_trigger t WHERE t.id=_id)), _uid,
      jsonb_build_object('programme_id',_programme_id,'trigger_code',_code));
  ELSE
    SELECT to_jsonb(t) INTO _before FROM public.supervisory_assessment_programme_trigger t WHERE t.id=_id;
    UPDATE public.supervisory_assessment_programme_trigger SET
      trigger_code=_code, label=_lbl,
      description=NULLIF(btrim(COALESCE(_payload->>'description','')),''),
      is_active=COALESCE((_payload->>'is_active')::boolean,is_active),
      is_default=COALESCE((_payload->>'is_default')::boolean,is_default),
      sort_order=COALESCE((_payload->>'sort_order')::int,sort_order),
      requires_signal=COALESCE((_payload->>'requires_signal')::boolean,requires_signal),
      requires_prior_assessment=COALESCE((_payload->>'requires_prior_assessment')::boolean,requires_prior_assessment),
      guidance=NULLIF(btrim(COALESCE(_payload->>'guidance','')),'')
    WHERE id=_id;
    INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, before_state, after_state, actor_id, detail)
    VALUES (_set,'TRIGGER_UPDATED', _before,
      to_jsonb((SELECT t FROM public.supervisory_assessment_programme_trigger t WHERE t.id=_id)), _uid,
      jsonb_build_object('programme_id',_programme_id,'trigger_code',_code));
  END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_trigger_remove(_trigger_id uuid, _rationale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _set uuid; _before jsonb;
BEGIN
  SELECT p.programme_set_id, to_jsonb(t) INTO _set, _before
    FROM public.supervisory_assessment_programme_trigger t
    JOIN public.supervisory_assessment_programme p ON p.id = t.programme_id
   WHERE t.id = _trigger_id;
  IF _set IS NULL THEN RAISE EXCEPTION 'not_found: programme trigger' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_assessment_programme_set_require_draft(_set);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  DELETE FROM public.supervisory_assessment_programme_trigger WHERE id = _trigger_id;
  INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, rationale, before_state, actor_id)
  VALUES (_set,'TRIGGER_REMOVED', btrim(_rationale), _before, _uid);
  RETURN true;
END $$;

-- ---------- lifecycle (maker/checker) ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_lifecycle(
  _set_id uuid, _to_status text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _s public.supervisory_assessment_programme_set; _to text; _v jsonb;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id = _set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE = '22023'; END IF;
  _to := upper(btrim(COALESCE(_to_status,'')));

  IF _to NOT IN ('REVIEW','DRAFT','APPROVED','ACTIVE','RETIRED') THEN
    RAISE EXCEPTION 'unsupported_transition: %', _to USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','ACTIVE','RETIRED') THEN
    _uid := public.supervisory_assessment_programme_set_require_approval(_set_id);
    IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
      RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  ELSE
    IF _s.regulator_id IS NULL THEN _uid := public.supervisory_domain_require_manage(_s.domain_code);
    ELSE _uid := public.supervisory_domain_require_manage_for_regulator(_s.domain_code, _s.regulator_id); END IF;
  END IF;

  IF _to = 'REVIEW' THEN
    IF _s.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'unsupported_transition: % cannot be submitted from %', _s.code, _s.status USING ERRCODE='22023'; END IF;
    _v := public.supervisory_assessment_programme_set_validate(_set_id);
    IF (_v->>'error_count')::int > 0 THEN
      RAISE EXCEPTION 'validation_blocked: % structural error(s) must be resolved before review', _v->>'error_count'
        USING ERRCODE = '22023'; END IF;
    UPDATE public.supervisory_assessment_programme_set
       SET status='REVIEW', submitted_by=_uid, submitted_at=now() WHERE id=_set_id;

  ELSIF _to = 'DRAFT' THEN
    IF _s.status <> 'REVIEW' THEN
      RAISE EXCEPTION 'unsupported_transition: only a set in review can be returned to draft' USING ERRCODE='22023'; END IF;
    UPDATE public.supervisory_assessment_programme_set
       SET status='DRAFT', reviewed_by=_uid, reviewed_at=now() WHERE id=_set_id;

  ELSIF _to = 'APPROVED' THEN
    IF _s.status <> 'REVIEW' THEN
      RAISE EXCEPTION 'unsupported_transition: only a set in review can be approved' USING ERRCODE='22023'; END IF;
    IF _s.created_by = _uid THEN
      RAISE EXCEPTION 'maker_checker: the author of a programme set cannot approve it' USING ERRCODE='42501'; END IF;
    IF _s.submitted_by = _uid THEN
      RAISE EXCEPTION 'maker_checker: the officer who submitted the programme set cannot approve it' USING ERRCODE='42501'; END IF;
    _v := public.supervisory_assessment_programme_set_validate(_set_id);
    IF (_v->>'error_count')::int > 0 THEN
      RAISE EXCEPTION 'validation_blocked: % structural error(s) must be resolved before approval', _v->>'error_count'
        USING ERRCODE = '22023'; END IF;
    UPDATE public.supervisory_assessment_programme_set
       SET status='APPROVED', approved_by=_uid, approved_at=now() WHERE id=_set_id;

  ELSIF _to = 'ACTIVE' THEN
    IF _s.status <> 'APPROVED' THEN
      RAISE EXCEPTION 'unsupported_transition: only an approved set can be activated' USING ERRCODE='22023'; END IF;
    IF _s.origin = 'MIPL_REFERENCE' THEN
      RAISE EXCEPTION 'reference_not_regulator_policy: a MIPL reference programme set cannot be activated as regulator policy; adopt it first'
        USING ERRCODE='42501'; END IF;
    UPDATE public.supervisory_assessment_programme_set
       SET status='SUPERSEDED'
     WHERE domain_code=_s.domain_code AND regulator_id IS NOT DISTINCT FROM _s.regulator_id
       AND code=_s.code AND status='ACTIVE' AND id <> _set_id;
    UPDATE public.supervisory_assessment_programme_set
       SET status='ACTIVE', effective_from=COALESCE(effective_from, current_date) WHERE id=_set_id;

  ELSIF _to = 'RETIRED' THEN
    UPDATE public.supervisory_assessment_programme_set SET status='RETIRED' WHERE id=_set_id;
  END IF;

  INSERT INTO public.supervisory_assessment_programme_event(
    programme_set_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_set_id,
    CASE _to WHEN 'REVIEW' THEN 'SUBMITTED' WHEN 'DRAFT' THEN 'RETURNED'
             WHEN 'APPROVED' THEN 'APPROVED' WHEN 'ACTIVE' THEN 'ACTIVATED' ELSE 'RETIRED' END,
    _s.status, _to, NULLIF(btrim(COALESCE(_rationale,'')),''), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::compliance_audit_action,
    'supervisory_assessment_programme_set', _set_id::text,
    jsonb_build_object('status',_s.status), jsonb_build_object('status',_to),
    NULLIF(btrim(COALESCE(_rationale,'')),''), NULL, NULL, '{}'::jsonb);
  RETURN _set_id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_set_new_version(
  _set_id uuid, _new_version text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _s public.supervisory_assessment_programme_set; _new uuid; _p record; _np uuid;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id = _set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE='22023'; END IF;
  IF _s.regulator_id IS NULL THEN _uid := public.supervisory_domain_require_manage(_s.domain_code);
  ELSE _uid := public.supervisory_domain_require_manage_for_regulator(_s.domain_code, _s.regulator_id); END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE='22023'; END IF;
  IF btrim(COALESCE(_new_version,'')) = '' THEN
    RAISE EXCEPTION 'a new version identifier is required' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set
              WHERE code=_s.code AND set_version=btrim(_new_version)) THEN
    RAISE EXCEPTION 'duplicate_version: % % already exists', _s.code, _new_version USING ERRCODE='22023'; END IF;

  INSERT INTO public.supervisory_assessment_programme_set(
    code, set_version, name, description, domain_code, regulator_id, origin, status,
    adopted_from_id, supersedes_id, notes, created_by)
  VALUES (_s.code, btrim(_new_version), _s.name, _s.description, _s.domain_code, _s.regulator_id,
          _s.origin, 'DRAFT', _s.adopted_from_id, _s.id, _s.notes, _uid)
  RETURNING id INTO _new;

  FOR _p IN SELECT * FROM public.supervisory_assessment_programme WHERE programme_set_id=_set_id LOOP
    INSERT INTO public.supervisory_assessment_programme(
      programme_set_id, programme_code, label, description, assessment_type, is_active, sort_order,
      recurrence_months, period_rule, period_value, end_offset_days, allow_manual_override,
      requires_prior_assessment, requires_trigger_signal, summary_required, question_class_scope,
      included_dimension_codes, excluded_dimension_codes, guidance, rule_detail, provenance,
      retired_at, retired_by, retirement_rationale, created_by)
    VALUES (_new, _p.programme_code, _p.label, _p.description, _p.assessment_type, _p.is_active, _p.sort_order,
      _p.recurrence_months, _p.period_rule, _p.period_value, _p.end_offset_days, _p.allow_manual_override,
      _p.requires_prior_assessment, _p.requires_trigger_signal, _p.summary_required, _p.question_class_scope,
      _p.included_dimension_codes, _p.excluded_dimension_codes, _p.guidance, _p.rule_detail, _p.provenance,
      _p.retired_at, _p.retired_by, _p.retirement_rationale, _uid)
    RETURNING id INTO _np;
    INSERT INTO public.supervisory_assessment_programme_trigger(
      programme_id, trigger_code, label, description, is_active, is_default, sort_order,
      requires_signal, requires_prior_assessment, guidance, created_by)
    SELECT _np, trigger_code, label, description, is_active, is_default, sort_order,
           requires_signal, requires_prior_assessment, guidance, _uid
      FROM public.supervisory_assessment_programme_trigger WHERE programme_id = _p.id;
  END LOOP;

  INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new,'NEW_VERSION','DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('supersedes_id',_s.id,'source_version',_s.set_version));
  RETURN _new;
END $$;

-- ---------- reference adoption ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_programme_adopt_reference(
  _reference_set_id uuid, _regulator_id uuid, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _s public.supervisory_assessment_programme_set; _new uuid; _reg text; _ver text;
        _p record; _np uuid;
BEGIN
  SELECT * INTO _s FROM public.supervisory_assessment_programme_set WHERE id=_reference_set_id;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment programme set' USING ERRCODE='22023'; END IF;
  IF _s.origin <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'not_a_reference_package: % % has origin %', _s.code, _s.set_version, _s.origin
      USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE='22023'; END IF;

  _uid := public.supervisory_domain_require_manage_for_regulator(_s.domain_code, _regulator_id);
  SELECT code INTO _reg FROM public.regulators WHERE id=_regulator_id;
  _ver := _s.set_version || '+' || _reg;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_programme_set
              WHERE code=_s.code AND set_version=_ver) THEN
    RAISE EXCEPTION 'already_adopted: % % is already adopted by %', _s.code, _s.set_version, _reg
      USING ERRCODE='22023'; END IF;

  INSERT INTO public.supervisory_assessment_programme_set(
    code, set_version, name, description, domain_code, regulator_id, origin, status,
    adopted_from_id, notes, created_by)
  VALUES (_s.code, _ver, _s.name, _s.description, _s.domain_code, _regulator_id,
          'REGULATOR_ADOPTED','DRAFT', _s.id, _s.notes, _uid)
  RETURNING id INTO _new;

  FOR _p IN SELECT * FROM public.supervisory_assessment_programme WHERE programme_set_id=_s.id LOOP
    INSERT INTO public.supervisory_assessment_programme(
      programme_set_id, programme_code, label, description, assessment_type, is_active, sort_order,
      recurrence_months, period_rule, period_value, end_offset_days, allow_manual_override,
      requires_prior_assessment, requires_trigger_signal, summary_required, question_class_scope,
      included_dimension_codes, excluded_dimension_codes, guidance, rule_detail, created_by)
    VALUES (_new, _p.programme_code, _p.label, _p.description, _p.assessment_type, _p.is_active, _p.sort_order,
      _p.recurrence_months, _p.period_rule, _p.period_value, _p.end_offset_days, _p.allow_manual_override,
      _p.requires_prior_assessment, _p.requires_trigger_signal, _p.summary_required, _p.question_class_scope,
      _p.included_dimension_codes, _p.excluded_dimension_codes, _p.guidance, _p.rule_detail, _uid)
    RETURNING id INTO _np;
    INSERT INTO public.supervisory_assessment_programme_trigger(
      programme_id, trigger_code, label, description, is_active, is_default, sort_order,
      requires_signal, requires_prior_assessment, guidance, created_by)
    SELECT _np, trigger_code, label, description, is_active, is_default, sort_order,
           requires_signal, requires_prior_assessment, guidance, _uid
      FROM public.supervisory_assessment_programme_trigger WHERE programme_id=_p.id;
  END LOOP;

  INSERT INTO public.supervisory_assessment_programme_event(programme_set_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new,'ADOPTED','DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('adopted_from',_s.id,'reference_version',_s.set_version,'regulator_id',_regulator_id));
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'supervisory_assessment_programme_set',
    _new::text, NULL, jsonb_build_object('adopted_from',_s.id,'set_version',_ver,'regulator_id',_regulator_id),
    btrim(_rationale), NULL, NULL, '{}'::jsonb);
  RETURN _new;
END $$;
