-- =====================================================================
-- Supervisory policy component family: governed, versioned configuration
-- for the ten previously unimplemented policy component types.
-- Non-destructive; reuses existing scope, requirement and probe kernel.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.supervisory_policy_component (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_type    text NOT NULL REFERENCES public.supervisory_policy_component_type(component_type),
  code              text NOT NULL,
  component_version text NOT NULL,
  domain_code       text NOT NULL,
  regulator_id      uuid REFERENCES public.regulators(id),
  sector_id         uuid,
  name              text NOT NULL,
  purpose           text,
  status            text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE','SUPERSEDED','RETIRED')),
  origin            text NOT NULL DEFAULT 'REGULATOR_AUTHORED'
    CHECK (origin IN ('MIPL_REFERENCE','REGULATOR_ADOPTED','REGULATOR_AUTHORED')),
  content           jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from    date,
  effective_to      date,
  notes             text,
  supersedes_id     uuid REFERENCES public.supervisory_policy_component(id),
  created_by        uuid,
  submitted_by      uuid,
  submitted_at      timestamptz,
  approved_by       uuid,
  approved_at       timestamptz,
  activated_at      timestamptz,
  superseded_at     timestamptz,
  retired_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_policy_component_code_version_uniq
    UNIQUE (component_type, code, component_version)
);

CREATE INDEX IF NOT EXISTS supervisory_policy_component_scope_idx
  ON public.supervisory_policy_component (component_type, domain_code, regulator_id, status);

GRANT SELECT ON public.supervisory_policy_component TO authenticated;
GRANT ALL    ON public.supervisory_policy_component TO service_role;
ALTER TABLE public.supervisory_policy_component ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy components readable within regulator supervisory scope"
  ON public.supervisory_policy_component FOR SELECT TO authenticated
  USING (public.supervisory_methodology_regulator_scope_readable(domain_code, regulator_id));

CREATE TABLE IF NOT EXISTS public.supervisory_policy_component_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.supervisory_policy_component(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  from_status  text,
  to_status    text,
  rationale    text,
  actor_id     uuid,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supervisory_policy_component_event_idx
  ON public.supervisory_policy_component_event (component_id, created_at DESC);

GRANT SELECT ON public.supervisory_policy_component_event TO authenticated;
GRANT ALL    ON public.supervisory_policy_component_event TO service_role;
ALTER TABLE public.supervisory_policy_component_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy component events follow component readability"
  ON public.supervisory_policy_component_event FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_policy_component c
                  WHERE c.id = component_id
                    AND public.supervisory_methodology_regulator_scope_readable(c.domain_code, c.regulator_id)));

-- ------------------------------------------------------------ immutability
CREATE OR REPLACE FUNCTION public.tg_supervisory_policy_component_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('APPROVED','ACTIVE','SUPERSEDED','RETIRED') THEN
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.component_version IS DISTINCT FROM OLD.component_version
       OR NEW.component_type IS DISTINCT FROM OLD.component_type
       OR NEW.domain_code IS DISTINCT FROM OLD.domain_code
       OR NEW.regulator_id IS DISTINCT FROM OLD.regulator_id THEN
      RAISE EXCEPTION 'immutable_component_version: % % is % and cannot be edited; create a new version instead',
        OLD.code, OLD.component_version, OLD.status USING ERRCODE = '22023';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supervisory_policy_component_immutable_trg ON public.supervisory_policy_component;
CREATE TRIGGER supervisory_policy_component_immutable_trg
  BEFORE UPDATE ON public.supervisory_policy_component
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_policy_component_immutable();

CREATE OR REPLACE FUNCTION public.tg_supervisory_policy_component_event_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'append_only: policy component history cannot be modified or removed'
    USING ERRCODE = '22023';
END $$;

DROP TRIGGER IF EXISTS supervisory_policy_component_event_append_only_trg ON public.supervisory_policy_component_event;
CREATE TRIGGER supervisory_policy_component_event_append_only_trg
  BEFORE UPDATE OR DELETE ON public.supervisory_policy_component_event
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_policy_component_event_append_only();

-- --------------------------------------------------------- content contract
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_contract(_component_type text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(btrim(COALESCE(_component_type,'')))
    WHEN 'SECTOR_OVERLAY' THEN jsonb_build_object(
      'collection','sectors','item_label','sector rule',
      'required_fields', jsonb_build_array('sector_code','applicability'),
      'enums', jsonb_build_object('applicability', jsonb_build_array('APPLICABLE','NOT_APPLICABLE','MODIFIED')))
    WHEN 'FACT_CONFIG' THEN jsonb_build_object(
      'collection','facts','item_label','fact',
      'required_fields', jsonb_build_array('fact_code','data_type'),
      'enums', jsonb_build_object('data_type', jsonb_build_array('NUMBER','TEXT','BOOLEAN','DATE','PERCENT')))
    WHEN 'SOURCE_BINDING' THEN jsonb_build_object(
      'collection','bindings','item_label','source binding',
      'required_fields', jsonb_build_array('fact_code','source_kind','source_reference'),
      'enums', jsonb_build_object('source_kind', jsonb_build_array('RETURN','FORM','MANUAL','EXTERNAL','DERIVED')))
    WHEN 'EVIDENCE_POLICY' THEN jsonb_build_object(
      'collection','rules','item_label','evidence rule',
      'required_fields', jsonb_build_array('scope','sufficiency'),
      'enums', jsonb_build_object('sufficiency', jsonb_build_array('REQUIRED','OPTIONAL','PROHIBITED')),
      'positive_numbers', jsonb_build_array('minimum_items'))
    WHEN 'MATERIALITY_POLICY' THEN jsonb_build_object(
      'collection','thresholds','item_label','materiality threshold',
      'required_fields', jsonb_build_array('measure','operator','value'),
      'enums', jsonb_build_object('operator', jsonb_build_array('GT','GTE','LT','LTE','EQ')))
    WHEN 'JUDGEMENT_POLICY' THEN jsonb_build_object(
      'collection','rules','item_label','override rule',
      'required_fields', jsonb_build_array('direction','max_band_steps','rationale_min_length'),
      'enums', jsonb_build_object('direction', jsonb_build_array('UP','DOWN','BOTH')),
      'positive_numbers', jsonb_build_array('max_band_steps','rationale_min_length'))
    WHEN 'RESPONSE_POLICY' THEN jsonb_build_object(
      'collection','responses','item_label','supervisory response',
      'required_fields', jsonb_build_array('risk_band','actions'),
      'non_empty_arrays', jsonb_build_array('actions'),
      'positive_numbers', jsonb_build_array('timeframe_days'))
    WHEN 'SLA_POLICY' THEN jsonb_build_object(
      'collection','stages','item_label','SLA stage',
      'required_fields', jsonb_build_array('stage','days'),
      'positive_numbers', jsonb_build_array('days'))
    WHEN 'DASHBOARD_POLICY' THEN jsonb_build_object(
      'collection','tiles','item_label','dashboard tile',
      'required_fields', jsonb_build_array('tile_key','metric','audience'))
    WHEN 'NOTIFICATION_POLICY' THEN jsonb_build_object(
      'collection','triggers','item_label','notification trigger',
      'required_fields', jsonb_build_array('event','channels','recipients'),
      'non_empty_arrays', jsonb_build_array('channels','recipients'),
      'enum_arrays', jsonb_build_object('channels', jsonb_build_array('EMAIL','IN_APP','SMS')))
    ELSE NULL::jsonb END
$$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_validate(
  _component_type text, _content jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _c jsonb; _coll text; _items jsonb; _item jsonb; _errors text[] := ARRAY[]::text[];
        _i integer := 0; _f text; _n text; _label text; _allowed jsonb; _val jsonb; _arr jsonb; _e jsonb;
BEGIN
  _c := public.supervisory_policy_component_content_contract(_component_type);
  IF _c IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors',
      to_jsonb(ARRAY['unsupported_component_type: no content contract is registered for '
                     || COALESCE(_component_type,'(null)')]));
  END IF;

  _coll  := _c->>'collection';
  _label := _c->>'item_label';
  _items := COALESCE(_content->_coll, 'null'::jsonb);

  IF jsonb_typeof(_items) <> 'array' THEN
    _errors := _errors || format('%s must be provided as a list of %s entries', _coll, _label);
  ELSIF jsonb_array_length(_items) = 0 THEN
    _errors := _errors || format('at least one %s must be configured', _label);
  ELSE
    FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
      _i := _i + 1;
      IF jsonb_typeof(_item) <> 'object' THEN
        _errors := _errors || format('%s %s is not a valid entry', _label, _i);
        CONTINUE;
      END IF;

      FOR _f IN SELECT jsonb_array_elements_text(_c->'required_fields') LOOP
        _val := _item->_f;
        IF _val IS NULL OR _val = 'null'::jsonb
           OR (jsonb_typeof(_val) = 'string' AND btrim(_val #>> '{}') = '') THEN
          _errors := _errors || format('%s %s: %s is required', _label, _i, _f);
        END IF;
      END LOOP;

      IF _c ? 'enums' THEN
        FOR _f IN SELECT jsonb_object_keys(_c->'enums') LOOP
          _allowed := _c->'enums'->_f;
          IF _item ? _f AND jsonb_typeof(_item->_f) = 'string'
             AND NOT (_allowed @> to_jsonb(upper(btrim(_item->>_f)))) THEN
            _errors := _errors || format('%s %s: %s must be one of %s', _label, _i, _f,
                                         array_to_string(ARRAY(SELECT jsonb_array_elements_text(_allowed)), ', '));
          END IF;
        END LOOP;
      END IF;

      IF _c ? 'non_empty_arrays' THEN
        FOR _f IN SELECT jsonb_array_elements_text(_c->'non_empty_arrays') LOOP
          _arr := _item->_f;
          IF _arr IS NULL OR jsonb_typeof(_arr) <> 'array' OR jsonb_array_length(_arr) = 0 THEN
            _errors := _errors || format('%s %s: %s must contain at least one entry', _label, _i, _f);
          END IF;
        END LOOP;
      END IF;

      IF _c ? 'enum_arrays' THEN
        FOR _f IN SELECT jsonb_object_keys(_c->'enum_arrays') LOOP
          _allowed := _c->'enum_arrays'->_f;
          IF jsonb_typeof(COALESCE(_item->_f,'null'::jsonb)) = 'array' THEN
            FOR _e IN SELECT * FROM jsonb_array_elements(_item->_f) LOOP
              IF NOT (_allowed @> to_jsonb(upper(btrim(_e #>> '{}')))) THEN
                _errors := _errors || format('%s %s: %s value %s is not permitted', _label, _i, _f, _e #>> '{}');
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      IF _c ? 'positive_numbers' THEN
        FOR _f IN SELECT jsonb_array_elements_text(_c->'positive_numbers') LOOP
          IF _item ? _f AND _item->_f <> 'null'::jsonb THEN
            BEGIN
              IF (_item->>_f)::numeric <= 0 THEN
                _errors := _errors || format('%s %s: %s must be greater than zero', _label, _i, _f);
              END IF;
            EXCEPTION WHEN OTHERS THEN
              _errors := _errors || format('%s %s: %s must be a number', _label, _i, _f);
            END;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(_errors,1) IS NULL,
    'contract', _c,
    'item_count', CASE WHEN jsonb_typeof(_items) = 'array' THEN jsonb_array_length(_items) ELSE 0 END,
    'errors', to_jsonb(_errors));
END $$;

-- --------------------------------------------------------------- authority
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_require_manage(
  _domain_code text, _regulator_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _regulator_id IS NULL THEN
    RETURN public.supervisory_domain_require_manage(_domain_code);
  END IF;
  RETURN public.supervisory_domain_require_manage_for_regulator(_domain_code, _regulator_id);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_require_approval(
  _domain_code text, _regulator_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _perm text; _regcode text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  SELECT policy_approval_permission INTO _perm
    FROM public.supervisory_domain_authority WHERE domain_code = _domain_code;
  IF _perm IS NULL THEN
    RAISE EXCEPTION 'not_authorized: no dedicated policy approval permission is registered for domain %; policy components cannot be approved', _domain_code
      USING ERRCODE = '42501'; END IF;

  SELECT code INTO _regcode FROM public.regulators WHERE id = _regulator_id;

  IF public.user_has_regulator_authority(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _regulator_id) THEN
    RETURN _uid; END IF;

  RAISE EXCEPTION 'not_authorized: % for regulator % is required to approve this policy component',
    _perm, COALESCE(_regcode,'(unscoped)') USING ERRCODE = '42501';
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_component_require_manage(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_require_approval(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_require_manage(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_require_approval(text, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------- operations
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_create(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _ct text; _domain text; _reg uuid; _id uuid; _t record;
BEGIN
  _ct     := upper(btrim(COALESCE(_payload->>'component_type','')));
  _domain := upper(btrim(COALESCE(_payload->>'domain_code','')));
  _reg    := NULLIF(_payload->>'regulator_id','')::uuid;

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

  _uid := public.supervisory_policy_component_require_manage(_domain, _reg);

  INSERT INTO public.supervisory_policy_component
    (component_type, code, component_version, domain_code, regulator_id, sector_id,
     name, purpose, content, effective_from, effective_to, notes, created_by)
  VALUES (_ct, btrim(_payload->>'code'), btrim(_payload->>'component_version'), _domain, _reg,
          NULLIF(_payload->>'sector_id','')::uuid,
          btrim(_payload->>'name'), NULLIF(btrim(COALESCE(_payload->>'purpose','')),''),
          COALESCE(_payload->'content','{}'::jsonb),
          NULLIF(_payload->>'effective_from','')::date,
          NULLIF(_payload->>'effective_to','')::date,
          NULLIF(btrim(COALESCE(_payload->>'notes','')),''), _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_policy_component_event
    (component_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_id, 'CREATED', 'DRAFT', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid,
          jsonb_build_object('component_type', _ct, 'domain_code', _domain));

  RETURN jsonb_build_object('component_id', _id, 'status', 'DRAFT');
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_save(_component_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _r public.supervisory_policy_component;
BEGIN
  SELECT * INTO _r FROM public.supervisory_policy_component WHERE id = _component_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: policy component' USING ERRCODE = '22023'; END IF;
  IF _r.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'invalid_state: only a DRAFT policy component can be edited; % % is %',
      _r.code, _r.component_version, _r.status USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_policy_component_require_manage(_r.domain_code, _r.regulator_id);

  UPDATE public.supervisory_policy_component SET
    name           = COALESCE(NULLIF(btrim(COALESCE(_payload->>'name','')),''), name),
    purpose        = CASE WHEN _payload ? 'purpose' THEN NULLIF(btrim(COALESCE(_payload->>'purpose','')),'') ELSE purpose END,
    content        = CASE WHEN _payload ? 'content' THEN COALESCE(_payload->'content','{}'::jsonb) ELSE content END,
    effective_from = CASE WHEN _payload ? 'effective_from' THEN NULLIF(_payload->>'effective_from','')::date ELSE effective_from END,
    effective_to   = CASE WHEN _payload ? 'effective_to' THEN NULLIF(_payload->>'effective_to','')::date ELSE effective_to END,
    notes          = CASE WHEN _payload ? 'notes' THEN NULLIF(btrim(COALESCE(_payload->>'notes','')),'') ELSE notes END
  WHERE id = _component_id;

  INSERT INTO public.supervisory_policy_component_event
    (component_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_component_id, 'EDITED', 'DRAFT', 'DRAFT',
          NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid,
          jsonb_build_object('fields', (SELECT jsonb_agg(k) FROM jsonb_object_keys(_payload) k)));

  RETURN jsonb_build_object('component_id', _component_id, 'status', 'DRAFT');
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_validate(_component_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.supervisory_policy_component;
BEGIN
  SELECT * INTO _r FROM public.supervisory_policy_component WHERE id = _component_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: policy component' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_r.domain_code, _r.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy component is outside your supervisory scope' USING ERRCODE = '42501'; END IF;
  RETURN public.supervisory_policy_component_content_validate(_r.component_type, _r.content);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_lifecycle(
  _component_id uuid, _to_status text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.supervisory_policy_component; _to text; _uid uuid; _v jsonb; _superseded integer := 0;
BEGIN
  _to := upper(btrim(COALESCE(_to_status,'')));
  SELECT * INTO _r FROM public.supervisory_policy_component WHERE id = _component_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: policy component' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'validation_error: a rationale of at least 10 characters is required for every lifecycle transition'
      USING ERRCODE = '22023'; END IF;

  IF _to = 'SUBMITTED' THEN
    IF _r.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'invalid_transition: only a DRAFT component can be submitted (currently %)', _r.status
        USING ERRCODE = '22023'; END IF;
    _uid := public.supervisory_policy_component_require_manage(_r.domain_code, _r.regulator_id);
    _v := public.supervisory_policy_component_content_validate(_r.component_type, _r.content);
    IF NOT (_v->>'valid')::boolean THEN
      RAISE EXCEPTION 'validation_error: the configuration is incomplete: %',
        array_to_string(ARRAY(SELECT jsonb_array_elements_text(_v->'errors')), '; ') USING ERRCODE = '22023'; END IF;
    UPDATE public.supervisory_policy_component
       SET status = 'SUBMITTED', submitted_by = _uid, submitted_at = now() WHERE id = _component_id;

  ELSIF _to = 'DRAFT' THEN
    IF _r.status <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'invalid_transition: only a SUBMITTED component can be returned to draft (currently %)', _r.status
        USING ERRCODE = '22023'; END IF;
    _uid := public.supervisory_policy_component_require_manage(_r.domain_code, _r.regulator_id);
    UPDATE public.supervisory_policy_component
       SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL WHERE id = _component_id;

  ELSIF _to = 'APPROVED' THEN
    IF _r.status <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'invalid_transition: only a SUBMITTED component can be approved (currently %)', _r.status
        USING ERRCODE = '22023'; END IF;
    _uid := public.supervisory_policy_component_require_approval(_r.domain_code, _r.regulator_id);
    IF _uid = _r.submitted_by THEN
      RAISE EXCEPTION 'maker_checker: the person who submitted this component cannot approve it'
        USING ERRCODE = '22023'; END IF;
    _v := public.supervisory_policy_component_content_validate(_r.component_type, _r.content);
    IF NOT (_v->>'valid')::boolean THEN
      RAISE EXCEPTION 'validation_error: the configuration is no longer valid: %',
        array_to_string(ARRAY(SELECT jsonb_array_elements_text(_v->'errors')), '; ') USING ERRCODE = '22023'; END IF;
    UPDATE public.supervisory_policy_component
       SET status = 'APPROVED', approved_by = _uid, approved_at = now() WHERE id = _component_id;

  ELSIF _to = 'ACTIVE' THEN
    IF _r.status <> 'APPROVED' THEN
      RAISE EXCEPTION 'invalid_transition: only an APPROVED component can be activated (currently %)', _r.status
        USING ERRCODE = '22023'; END IF;
    _uid := public.supervisory_policy_component_require_approval(_r.domain_code, _r.regulator_id);
    UPDATE public.supervisory_policy_component
       SET status = 'SUPERSEDED', superseded_at = now()
     WHERE component_type = _r.component_type AND code = _r.code AND domain_code = _r.domain_code
       AND regulator_id IS NOT DISTINCT FROM _r.regulator_id
       AND status = 'ACTIVE' AND id <> _component_id;
    GET DIAGNOSTICS _superseded = ROW_COUNT;
    UPDATE public.supervisory_policy_component
       SET status = 'ACTIVE', activated_at = now() WHERE id = _component_id;

  ELSIF _to = 'RETIRED' THEN
    IF _r.status NOT IN ('APPROVED','ACTIVE') THEN
      RAISE EXCEPTION 'invalid_transition: only an APPROVED or ACTIVE component can be retired (currently %)', _r.status
        USING ERRCODE = '22023'; END IF;
    _uid := public.supervisory_policy_component_require_approval(_r.domain_code, _r.regulator_id);
    UPDATE public.supervisory_policy_component
       SET status = 'RETIRED', retired_at = now() WHERE id = _component_id;
  ELSE
    RAISE EXCEPTION 'invalid_transition: % is not a supported target status', _to USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_policy_component_event
    (component_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_component_id, 'LIFECYCLE', _r.status, _to, btrim(_rationale), _uid,
          jsonb_build_object('superseded_versions', _superseded));

  RETURN jsonb_build_object('component_id', _component_id, 'status', _to,
                            'superseded_versions', _superseded);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_new_version(
  _component_id uuid, _new_version text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.supervisory_policy_component; _uid uuid; _id uuid; _nv text;
BEGIN
  _nv := btrim(COALESCE(_new_version,''));
  SELECT * INTO _r FROM public.supervisory_policy_component WHERE id = _component_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: policy component' USING ERRCODE = '22023'; END IF;
  IF _nv = '' THEN RAISE EXCEPTION 'validation_error: a new version label is required' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'validation_error: a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_policy_component_require_manage(_r.domain_code, _r.regulator_id);

  INSERT INTO public.supervisory_policy_component
    (component_type, code, component_version, domain_code, regulator_id, sector_id, name, purpose,
     content, notes, supersedes_id, created_by, origin)
  VALUES (_r.component_type, _r.code, _nv, _r.domain_code, _r.regulator_id, _r.sector_id,
          _r.name, _r.purpose, _r.content, _r.notes, _r.id, _uid, 'REGULATOR_AUTHORED')
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_policy_component_event
    (component_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_id, 'NEW_VERSION', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('from_component_id', _r.id, 'from_version', _r.component_version));

  RETURN jsonb_build_object('component_id', _id, 'status', 'DRAFT', 'component_version', _nv);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_register(
  _component_type text DEFAULT NULL, _domain_code text DEFAULT NULL,
  _status text DEFAULT NULL, _search text DEFAULT NULL,
  _limit integer DEFAULT 100, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _rows jsonb; _total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  WITH visible AS (
    SELECT c.*, t.label AS type_label, r.code AS regulator_code
      FROM public.supervisory_policy_component c
      JOIN public.supervisory_policy_component_type t ON t.component_type = c.component_type
      LEFT JOIN public.regulators r ON r.id = c.regulator_id
     WHERE public.supervisory_methodology_regulator_scope_readable(c.domain_code, c.regulator_id)
       AND (_component_type IS NULL OR c.component_type = upper(btrim(_component_type)))
       AND (_domain_code IS NULL OR c.domain_code = upper(btrim(_domain_code)))
       AND (_status IS NULL OR c.status = upper(btrim(_status)))
       AND (_search IS NULL OR btrim(_search) = ''
            OR c.code ILIKE '%'||btrim(_search)||'%' OR c.name ILIKE '%'||btrim(_search)||'%')
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'component_type', x->>'code', x->>'component_version'), '[]'::jsonb),
         (SELECT count(*) FROM visible)
    INTO _rows, _total
    FROM (
      SELECT jsonb_build_object(
               'id', v.id, 'component_type', v.component_type, 'type_label', v.type_label,
               'code', v.code, 'component_version', v.component_version, 'name', v.name,
               'domain_code', v.domain_code, 'regulator_id', v.regulator_id,
               'regulator_code', v.regulator_code, 'status', v.status, 'origin', v.origin,
               'item_count', (public.supervisory_policy_component_content_validate(v.component_type, v.content)->>'item_count')::int,
               'is_valid', (public.supervisory_policy_component_content_validate(v.component_type, v.content)->>'valid')::boolean,
               'effective_from', v.effective_from, 'effective_to', v.effective_to,
               'submitted_at', v.submitted_at, 'approved_at', v.approved_at,
               'activated_at', v.activated_at, 'updated_at', v.updated_at) AS x
        FROM visible v
       ORDER BY v.component_type, v.code, v.component_version
       LIMIT GREATEST(COALESCE(_limit,100),1) OFFSET GREATEST(COALESCE(_offset,0),0)) s;

  RETURN jsonb_build_object('total', COALESCE(_total,0), 'rows', _rows,
    'types', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'component_type', t.component_type, 'label', t.label,
                        'description', t.description,
                        'authorable', public.supervisory_policy_component_content_contract(t.component_type) IS NOT NULL,
                        'contract', public.supervisory_policy_component_content_contract(t.component_type))
                      ORDER BY t.sort_order), '[]'::jsonb)
               FROM public.supervisory_policy_component_type t));
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_detail(_component_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.supervisory_policy_component; _can_manage boolean := false; _can_approve boolean := false;
BEGIN
  SELECT * INTO _r FROM public.supervisory_policy_component WHERE id = _component_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: policy component' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_r.domain_code, _r.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy component is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  BEGIN PERFORM public.supervisory_policy_component_require_manage(_r.domain_code, _r.regulator_id);
    _can_manage := true; EXCEPTION WHEN OTHERS THEN _can_manage := false; END;
  BEGIN PERFORM public.supervisory_policy_component_require_approval(_r.domain_code, _r.regulator_id);
    _can_approve := true; EXCEPTION WHEN OTHERS THEN _can_approve := false; END;

  RETURN jsonb_build_object(
    'component', jsonb_build_object(
      'id', _r.id, 'component_type', _r.component_type,
      'type_label', (SELECT label FROM public.supervisory_policy_component_type WHERE component_type = _r.component_type),
      'code', _r.code, 'component_version', _r.component_version, 'name', _r.name,
      'purpose', _r.purpose, 'domain_code', _r.domain_code, 'regulator_id', _r.regulator_id,
      'sector_id', _r.sector_id, 'status', _r.status, 'origin', _r.origin, 'content', _r.content,
      'effective_from', _r.effective_from, 'effective_to', _r.effective_to, 'notes', _r.notes,
      'supersedes_id', _r.supersedes_id,
      'submitted_by', _r.submitted_by, 'submitted_at', _r.submitted_at,
      'approved_by', _r.approved_by, 'approved_at', _r.approved_at,
      'activated_at', _r.activated_at, 'retired_at', _r.retired_at,
      'created_at', _r.created_at, 'updated_at', _r.updated_at),
    'contract', public.supervisory_policy_component_content_contract(_r.component_type),
    'validation', public.supervisory_policy_component_content_validate(_r.component_type, _r.content),
    'capabilities', jsonb_build_object(
      'can_manage', _can_manage, 'can_approve', _can_approve,
      'can_edit', _can_manage AND _r.status = 'DRAFT',
      'can_submit', _can_manage AND _r.status = 'DRAFT',
      'can_return', _can_manage AND _r.status = 'SUBMITTED',
      'can_approve_now', _can_approve AND _r.status = 'SUBMITTED'
                         AND (_r.submitted_by IS NULL OR _r.submitted_by <> auth.uid()),
      'can_activate', _can_approve AND _r.status = 'APPROVED',
      'can_retire', _can_approve AND _r.status IN ('APPROVED','ACTIVE'),
      'can_new_version', _can_manage AND _r.status IN ('APPROVED','ACTIVE','SUPERSEDED','RETIRED')),
    'history', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                         'id', e.id, 'event_type', e.event_type, 'from_status', e.from_status,
                         'to_status', e.to_status, 'rationale', e.rationale, 'actor_id', e.actor_id,
                         'detail', e.detail, 'created_at', e.created_at) ORDER BY e.created_at DESC), '[]'::jsonb)
                  FROM public.supervisory_policy_component_event e WHERE e.component_id = _r.id));
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_approval_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', c.id, 'component_type', c.component_type, 'type_label', t.label,
             'code', c.code, 'component_version', c.component_version, 'name', c.name,
             'domain_code', c.domain_code, 'regulator_id', c.regulator_id,
             'submitted_by', c.submitted_by, 'submitted_at', c.submitted_at,
             'status', c.status) ORDER BY c.submitted_at), '[]'::jsonb)
          FROM public.supervisory_policy_component c
          JOIN public.supervisory_policy_component_type t ON t.component_type = c.component_type
         WHERE c.status = 'SUBMITTED'
           AND public.supervisory_methodology_regulator_scope_readable(c.domain_code, c.regulator_id));
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_component_create(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_save(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_validate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_lifecycle(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_new_version(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_register(text, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_approval_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_content_validate(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_policy_component_content_contract(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_create(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_save(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_validate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_lifecycle(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_new_version(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_register(text, text, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_approval_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_content_validate(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_content_contract(text) TO authenticated, service_role;

-- ---------------------------------------- probe / candidates: generic family
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_probe(_component_type text, _component_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t record; _out jsonb;
BEGIN
  SELECT * INTO _t FROM public.supervisory_policy_component_type
   WHERE component_type = upper(btrim(COALESCE(_component_type,'')));
  IF _t.component_type IS NULL THEN
    RAISE EXCEPTION 'unknown_component_type: %', _component_type USING ERRCODE = '22023'; END IF;
  IF NOT _t.is_available THEN
    RAISE EXCEPTION 'component_type_not_implemented: % is registered in the component catalogue but its architecture does not exist yet, so it cannot be bound', _t.component_type
      USING ERRCODE = '22023'; END IF;

  IF _t.component_type = 'METHODOLOGY' THEN
    SELECT jsonb_build_object(
             'component_id', m.id, 'component_table', 'supervisory_methodology',
             'component_code', m.code, 'component_version', m.version,
             'component_status', m.status, 'domain_code', m.domain_code,
             'regulator_id', m.regulator_id, 'sector_id', m.sector_id, 'origin', m.origin,
             'label', m.code || ' ' || m.version)
      INTO _out FROM public.supervisory_methodology m WHERE m.id = _component_id;

  ELSIF _t.component_type = 'CALCULATION_CONFIG' THEN
    SELECT jsonb_build_object(
             'component_id', c.id, 'component_table', 'supervisory_calculation_config',
             'component_code', m.code || '/calc', 'component_version', c.config_version::text,
             'component_status', c.status, 'domain_code', m.domain_code,
             'regulator_id', m.regulator_id, 'sector_id', m.sector_id, 'origin', m.origin,
             'label', m.code || ' ' || m.version || ' calculation v' || c.config_version)
      INTO _out
      FROM public.supervisory_calculation_config c
      JOIN public.supervisory_methodology m ON m.id = c.methodology_id
     WHERE c.id = _component_id;

  ELSIF _t.component_type = 'ASSESSMENT_PROGRAMME' THEN
    SELECT jsonb_build_object(
             'component_id', s.id, 'component_table', 'supervisory_assessment_programme_set',
             'component_code', s.code, 'component_version', s.set_version,
             'component_status', s.status, 'domain_code', s.domain_code,
             'regulator_id', s.regulator_id, 'sector_id', NULL, 'origin', s.origin,
             'label', s.code || ' ' || s.set_version)
      INTO _out FROM public.supervisory_assessment_programme_set s WHERE s.id = _component_id;

  ELSE
    SELECT jsonb_build_object(
             'component_id', c.id, 'component_table', 'supervisory_policy_component',
             'component_code', c.code, 'component_version', c.component_version,
             'component_status', c.status, 'domain_code', c.domain_code,
             'regulator_id', c.regulator_id, 'sector_id', c.sector_id, 'origin', c.origin,
             'label', c.code || ' ' || c.component_version)
      INTO _out FROM public.supervisory_policy_component c
     WHERE c.id = _component_id AND c.component_type = _t.component_type;
  END IF;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'not_found: no % component exists with id %', _t.component_type, _component_id
      USING ERRCODE = '22023'; END IF;
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_component_candidates(_profile_id uuid, _component_type text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.supervisory_policy_profile; _ct text; _rows jsonb;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  _ct := upper(btrim(COALESCE(_component_type,'')));

  IF _ct = 'METHODOLOGY' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'component_id', m.id, 'component_code', m.code, 'component_version', m.version,
             'component_status', m.status, 'origin', m.origin, 'name', m.name,
             'label', m.code || ' ' || m.version || ' (' || m.status || ')') ORDER BY m.code, m.version), '[]'::jsonb)
      INTO _rows FROM public.supervisory_methodology m
     WHERE m.domain_code = _p.domain_code
       AND m.status IN ('APPROVED','ACTIVE')
       AND m.origin <> 'MIPL_REFERENCE'
       AND (_p.regulator_id IS NULL OR m.regulator_id IS NULL OR m.regulator_id = _p.regulator_id);

  ELSIF _ct = 'CALCULATION_CONFIG' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'component_id', c.id, 'component_code', m.code || '/calc',
             'component_version', c.config_version::text, 'component_status', c.status,
             'origin', m.origin, 'name', m.name,
             'label', m.code || ' ' || m.version || ' calculation v' || c.config_version
                      || ' (' || c.status || ')') ORDER BY m.code, c.config_version), '[]'::jsonb)
      INTO _rows
      FROM public.supervisory_calculation_config c
      JOIN public.supervisory_methodology m ON m.id = c.methodology_id
     WHERE m.domain_code = _p.domain_code
       AND c.status IN ('APPROVED','ACTIVE')
       AND m.origin <> 'MIPL_REFERENCE'
       AND (_p.regulator_id IS NULL OR m.regulator_id IS NULL OR m.regulator_id = _p.regulator_id);

  ELSIF _ct = 'ASSESSMENT_PROGRAMME' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'component_id', s.id, 'component_code', s.code, 'component_version', s.set_version,
             'component_status', s.status, 'origin', s.origin, 'name', s.name,
             'label', s.code || ' ' || s.set_version || ' (' || s.status || ')') ORDER BY s.code, s.set_version), '[]'::jsonb)
      INTO _rows FROM public.supervisory_assessment_programme_set s
     WHERE s.domain_code = _p.domain_code
       AND s.status IN ('APPROVED','ACTIVE')
       AND s.origin <> 'MIPL_REFERENCE'
       AND (_p.regulator_id IS NULL OR s.regulator_id IS NULL OR s.regulator_id = _p.regulator_id);

  ELSIF public.supervisory_policy_component_content_contract(_ct) IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'component_id', c.id, 'component_code', c.code, 'component_version', c.component_version,
             'component_status', c.status, 'origin', c.origin, 'name', c.name,
             'label', c.code || ' ' || c.component_version || ' (' || c.status || ')')
             ORDER BY c.code, c.component_version), '[]'::jsonb)
      INTO _rows FROM public.supervisory_policy_component c
     WHERE c.component_type = _ct
       AND c.domain_code = _p.domain_code
       AND c.status IN ('APPROVED','ACTIVE')
       AND c.origin <> 'MIPL_REFERENCE'
       AND (_p.regulator_id IS NULL OR c.regulator_id IS NULL OR c.regulator_id = _p.regulator_id);
  ELSE
    _rows := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'component_type', _ct,
    'is_available', COALESCE((SELECT is_available FROM public.supervisory_policy_component_type
                               WHERE component_type = _ct), false),
    'candidates', COALESCE(_rows,'[]'::jsonb));
END $$;

-- ------------------------------------------------- catalogue now available
UPDATE public.supervisory_policy_component_type SET
  component_table = 'supervisory_policy_component',
  is_available = true,
  default_requirement = CASE WHEN default_requirement = 'NOT_APPLICABLE' THEN 'OPTIONAL' ELSE default_requirement END,
  description = CASE component_type
    WHEN 'SECTOR_OVERLAY' THEN 'Versioned sector applicability and modification rules layered over the methodology.'
    WHEN 'FACT_CONFIG' THEN 'Versioned catalogue of supervisory facts and their data types.'
    WHEN 'SOURCE_BINDING' THEN 'Versioned bindings from supervisory facts to their authoritative sources.'
    WHEN 'EVIDENCE_POLICY' THEN 'Versioned evidence sufficiency rules per assessment scope.'
    WHEN 'MATERIALITY_POLICY' THEN 'Versioned materiality thresholds used in supervisory judgement.'
    WHEN 'JUDGEMENT_POLICY' THEN 'Versioned override rules: permitted direction, band steps and rationale requirements.'
    WHEN 'RESPONSE_POLICY' THEN 'Versioned mapping from risk band to permitted supervisory responses and timeframes.'
    WHEN 'SLA_POLICY' THEN 'Versioned service levels per supervisory stage.'
    WHEN 'DASHBOARD_POLICY' THEN 'Versioned dashboard tiles, metrics and audiences.'
    WHEN 'NOTIFICATION_POLICY' THEN 'Versioned notification triggers, channels and recipients.'
    ELSE description END,
  updated_at = now()
WHERE component_type IN ('SECTOR_OVERLAY','FACT_CONFIG','SOURCE_BINDING','EVIDENCE_POLICY',
                         'MATERIALITY_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY','SLA_POLICY',
                         'DASHBOARD_POLICY','NOTIFICATION_POLICY');