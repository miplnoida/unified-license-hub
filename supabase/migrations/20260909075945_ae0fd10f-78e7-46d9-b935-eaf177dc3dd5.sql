
-- ============ Structured question applicability rules (AML-04) ============
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_question_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.supervisory_methodology_question(id) ON DELETE CASCADE,
  rule_kind text NOT NULL CHECK (rule_kind IN ('APPLICABILITY','TRIGGER')),
  rule_version integer NOT NULL DEFAULT 1,
  rule_definition jsonb NOT NULL,
  rule_summary text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  provenance text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supervisory_methodology_question_rule_active_uq
  ON public.supervisory_methodology_question_rule(question_id, rule_kind) WHERE active;
CREATE INDEX IF NOT EXISTS supervisory_methodology_question_rule_meth_idx
  ON public.supervisory_methodology_question_rule(methodology_id);

GRANT SELECT ON public.supervisory_methodology_question_rule TO authenticated;
GRANT ALL ON public.supervisory_methodology_question_rule TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_methodology_question_rule FROM authenticated;

ALTER TABLE public.supervisory_methodology_question_rule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in staff read question rules" ON public.supervisory_methodology_question_rule;
CREATE POLICY "Signed-in staff read question rules"
  ON public.supervisory_methodology_question_rule FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_rule_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_supervisory_methodology_question_rule_touch
  ON public.supervisory_methodology_question_rule;
CREATE TRIGGER trg_supervisory_methodology_question_rule_touch
  BEFORE UPDATE ON public.supervisory_methodology_question_rule
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_methodology_question_rule_touch();

-- ============ Server-owned rule vocabulary ============
CREATE OR REPLACE FUNCTION public.supervisory_question_rule_vocabulary()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'groups', jsonb_build_array('ALL','ANY','NOT'),
    'operators', jsonb_build_array(
      jsonb_build_object('code','EQ','label','equals','arity','VALUE','types',jsonb_build_array('text','uuid')),
      jsonb_build_object('code','NEQ','label','does not equal','arity','VALUE','types',jsonb_build_array('text','uuid')),
      jsonb_build_object('code','IN','label','is one of','arity','VALUES','types',jsonb_build_array('text','uuid')),
      jsonb_build_object('code','NOT_IN','label','is not one of','arity','VALUES','types',jsonb_build_array('text','uuid')),
      jsonb_build_object('code','EXISTS','label','is recorded','arity','NONE','types',jsonb_build_array('text','uuid')),
      jsonb_build_object('code','NOT_EXISTS','label','is not recorded','arity','NONE','types',jsonb_build_array('text','uuid')),
      jsonb_build_object('code','TRUE','label','always true','arity','NONE','types',jsonb_build_array()),
      jsonb_build_object('code','FALSE','label','always false','arity','NONE','types',jsonb_build_array())
    ),
    'sources', jsonb_build_array(
      jsonb_build_object('code','ASSESSMENT.PROGRAMME_CODE','label','Assessment programme code','data_type','text','available',true,'allowed_values',
        (SELECT COALESCE(jsonb_agg(DISTINCT programme_code), '[]'::jsonb) FROM public.supervisory_assessment_programme WHERE is_active AND retired_at IS NULL)),
      jsonb_build_object('code','ASSESSMENT.ASSESSMENT_TYPE','label','Assessment type','data_type','text','available',true,'allowed_values',
        (SELECT COALESCE(jsonb_agg(DISTINCT assessment_type), '[]'::jsonb) FROM public.supervisory_assessment_programme WHERE is_active AND retired_at IS NULL)),
      jsonb_build_object('code','ASSESSMENT.TRIGGER_TYPE','label','Assessment trigger','data_type','text','available',true,'allowed_values',
        (SELECT COALESCE(jsonb_agg(DISTINCT trigger_code), '[]'::jsonb) FROM public.supervisory_assessment_programme_trigger WHERE is_active)),
      jsonb_build_object('code','ENTITY.SECTOR_ID','label','Entity sector','data_type','uuid','available',true,'allowed_values',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('value',s.id,'label',s.name) ORDER BY s.name), '[]'::jsonb) FROM public.sectors s)),
      jsonb_build_object('code','ENTITY.SUB_SECTOR_ID','label','Entity sub-sector','data_type','uuid','available',true,'allowed_values','[]'::jsonb),
      jsonb_build_object('code','ENTITY.CATEGORY_ID','label','Entity category','data_type','uuid','available',true,'allowed_values','[]'::jsonb),
      jsonb_build_object('code','ENTITY.ENTITY_STATUS','label','Entity regulatory status','data_type','text','available',true,'allowed_values','[]'::jsonb),
      jsonb_build_object('code','ENTITY.SYSTEMIC_IMPORTANCE','label','Systemic importance','data_type','text','available',true,'allowed_values','[]'::jsonb),
      jsonb_build_object('code','ENTITY.LIFECYCLE_STAGE_ID','label','Entity lifecycle stage','data_type','uuid','available',true,'allowed_values','[]'::jsonb),
      jsonb_build_object('code','ENTITY.JURISDICTION','label','Entity jurisdiction','data_type','text','available',false,
        'unavailable_reason','REGISTERED_BUT_UNAVAILABLE: no canonical jurisdiction attribute is bound to the entity context yet.','allowed_values','[]'::jsonb),
      jsonb_build_object('code','ENTITY.REGULATED_ACTIVITY','label','Regulated activity','data_type','text','available',false,
        'unavailable_reason','REGISTERED_BUT_UNAVAILABLE: regulated-activity applicability is not yet a canonical resolvable source.','allowed_values','[]'::jsonb),
      jsonb_build_object('code','FACT','label','Methodology fact observation','data_type','text','available',false,'prefix',true,
        'unavailable_reason','REGISTERED_BUT_UNAVAILABLE: fact observations arrive with the Fact Registry (AML-05).','allowed_values','[]'::jsonb)
    ),
    'note','React must render this vocabulary. Applicability sources and operators are server-owned.');
$$;
REVOKE ALL ON FUNCTION public.supervisory_question_rule_vocabulary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_question_rule_vocabulary() TO authenticated, service_role;

-- ============ Structural rule validation (no executable text ever) ============
CREATE OR REPLACE FUNCTION public.supervisory_question_rule_check(_def jsonb, _depth integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _errs jsonb := '[]'::jsonb; _op text; _src text; _child jsonb; _avail boolean; _dtype text;
        _vocab jsonb; _srcdef jsonb;
BEGIN
  IF _depth > 8 THEN
    RETURN jsonb_build_array(jsonb_build_object('code','RULE_MALFORMED','message','The rule is nested too deeply.'));
  END IF;
  IF _def IS NULL OR jsonb_typeof(_def) <> 'object' THEN
    RETURN jsonb_build_array(jsonb_build_object('code','RULE_MALFORMED','message','Each rule node must be an object.'));
  END IF;

  _op := upper(btrim(COALESCE(_def->>'op','')));
  IF _op = '' THEN
    RETURN jsonb_build_array(jsonb_build_object('code','RULE_MALFORMED','message','Each rule node must state an operator.'));
  END IF;

  IF _op IN ('ALL','ANY') THEN
    IF jsonb_typeof(COALESCE(_def->'rules','null'::jsonb)) <> 'array'
       OR jsonb_array_length(_def->'rules') = 0 THEN
      RETURN jsonb_build_array(jsonb_build_object('code','RULE_MALFORMED',
        'message', format('%s must contain at least one nested rule.', _op)));
    END IF;
    FOR _child IN SELECT * FROM jsonb_array_elements(_def->'rules') LOOP
      _errs := _errs || public.supervisory_question_rule_check(_child, _depth + 1);
    END LOOP;
    RETURN _errs;
  END IF;

  IF _op = 'NOT' THEN
    IF _def->'rule' IS NULL THEN
      RETURN jsonb_build_array(jsonb_build_object('code','RULE_MALFORMED','message','NOT must contain exactly one nested rule.'));
    END IF;
    RETURN public.supervisory_question_rule_check(_def->'rule', _depth + 1);
  END IF;

  IF _op IN ('TRUE','FALSE') THEN RETURN '[]'::jsonb; END IF;

  IF _op NOT IN ('EQ','NEQ','IN','NOT_IN','EXISTS','NOT_EXISTS') THEN
    RETURN jsonb_build_array(jsonb_build_object('code','RULE_OPERATOR_INVALID',
      'message', format('%s is not a governed operator.', _op)));
  END IF;

  _src := upper(btrim(COALESCE(_def->>'source','')));
  IF _src = '' THEN
    RETURN jsonb_build_array(jsonb_build_object('code','RULE_MALFORMED','message','A comparison must state a source field.'));
  END IF;

  _vocab := public.supervisory_question_rule_vocabulary();
  SELECT x INTO _srcdef FROM jsonb_array_elements(_vocab->'sources') x WHERE x->>'code' = _src;
  IF _srcdef IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object('code','RULE_SOURCE_UNSUPPORTED',
      'message', format('%s is not a supported applicability source.', _src)));
  END IF;
  _avail := COALESCE((_srcdef->>'available')::boolean, false);
  IF NOT _avail THEN
    RETURN jsonb_build_array(jsonb_build_object('code','RULE_SOURCE_UNSUPPORTED',
      'message', COALESCE(_srcdef->>'unavailable_reason',
        format('%s is registered but cannot yet be resolved by the server.', _src))));
  END IF;
  _dtype := _srcdef->>'data_type';

  IF _op IN ('EXISTS','NOT_EXISTS') THEN
    IF _def ? 'value' OR _def ? 'values' THEN
      _errs := _errs || jsonb_build_object('code','RULE_VALUE_INVALID',
        'message', format('%s does not take a comparison value.', _op));
    END IF;
    RETURN _errs;
  END IF;

  IF _op IN ('EQ','NEQ') THEN
    IF NOT (_def ? 'value') OR jsonb_typeof(_def->'value') NOT IN ('string','number','boolean')
       OR btrim(COALESCE(_def->>'value','')) = '' THEN
      _errs := _errs || jsonb_build_object('code','RULE_VALUE_INVALID',
        'message', format('%s requires a single non-empty value.', _op));
    ELSIF _dtype = 'uuid' AND NOT (_def->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      _errs := _errs || jsonb_build_object('code','RULE_VALUE_INVALID',
        'message', format('%s expects a recorded identifier.', _src));
    END IF;
    RETURN _errs;
  END IF;

  -- IN / NOT_IN
  IF jsonb_typeof(COALESCE(_def->'values','null'::jsonb)) <> 'array'
     OR jsonb_array_length(_def->'values') = 0 THEN
    _errs := _errs || jsonb_build_object('code','RULE_VALUE_INVALID',
      'message', format('%s requires at least one value.', _op));
    RETURN _errs;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_def->'values') v
              WHERE jsonb_typeof(v) NOT IN ('string','number')
                 OR btrim(COALESCE(v#>>'{}','')) = ''
                 OR (_dtype = 'uuid' AND NOT (v#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))) THEN
    _errs := _errs || jsonb_build_object('code','RULE_VALUE_INVALID',
      'message', format('%s holds a value that does not match the type of %s.', _op, _src));
  END IF;
  RETURN _errs;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_question_rule_check(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_question_rule_check(jsonb, integer) TO authenticated, service_role;

-- Human-readable summary, server-generated (React never invents rule prose)
CREATE OR REPLACE FUNCTION public.supervisory_question_rule_describe(_def jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _op text; _parts text[] := '{}'; _child jsonb;
BEGIN
  IF _def IS NULL OR jsonb_typeof(_def) <> 'object' THEN RETURN NULL; END IF;
  _op := upper(btrim(COALESCE(_def->>'op','')));
  IF _op IN ('ALL','ANY') THEN
    FOR _child IN SELECT * FROM jsonb_array_elements(COALESCE(_def->'rules','[]'::jsonb)) LOOP
      _parts := _parts || COALESCE(public.supervisory_question_rule_describe(_child),'?');
    END LOOP;
    RETURN '(' || array_to_string(_parts, CASE WHEN _op='ALL' THEN ' and ' ELSE ' or ' END) || ')';
  ELSIF _op = 'NOT' THEN
    RETURN 'not ' || COALESCE(public.supervisory_question_rule_describe(_def->'rule'),'?');
  ELSIF _op = 'TRUE' THEN RETURN 'always applies';
  ELSIF _op = 'FALSE' THEN RETURN 'never applies';
  ELSIF _op IN ('EXISTS','NOT_EXISTS') THEN
    RETURN format('%s %s', _def->>'source', CASE WHEN _op='EXISTS' THEN 'is recorded' ELSE 'is not recorded' END);
  ELSIF _op IN ('EQ','NEQ') THEN
    RETURN format('%s %s %s', _def->>'source', CASE WHEN _op='EQ' THEN '=' ELSE '<>' END, _def->>'value');
  ELSE
    RETURN format('%s %s [%s]', _def->>'source', CASE WHEN _op='IN' THEN 'in' ELSE 'not in' END,
      (SELECT string_agg(v#>>'{}', ', ') FROM jsonb_array_elements(COALESCE(_def->'values','[]'::jsonb)) v));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_question_rule_describe(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_question_rule_describe(jsonb) TO authenticated, service_role;

-- ============ Governed authoring ============
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_rule_save(
  _methodology_id uuid, _question_id uuid, _rule_kind text, _rule_definition jsonb,
  _rationale text, _provenance text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _kind text; _errs jsonb; _q public.supervisory_methodology_question; _id uuid; _summary text;
BEGIN
  _uid := public.supervisory_methodology_require_authoring(_methodology_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'rationale_required: state at least 10 characters of rationale for this rule change' USING ERRCODE='22023'; END IF;

  _kind := upper(btrim(COALESCE(_rule_kind,'')));
  IF _kind NOT IN ('APPLICABILITY','TRIGGER') THEN
    RAISE EXCEPTION 'rule_kind_invalid: % is not a governed rule kind', _kind USING ERRCODE='22023'; END IF;

  SELECT * INTO _q FROM public.supervisory_methodology_question WHERE id = _question_id;
  IF _q.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology question' USING ERRCODE='22023'; END IF;
  IF _q.methodology_id <> _methodology_id THEN
    RAISE EXCEPTION 'RULE_CROSS_METHODOLOGY_REFERENCE: the question belongs to a different methodology version'
      USING ERRCODE='42501'; END IF;

  _errs := public.supervisory_question_rule_check(_rule_definition, 0);
  IF jsonb_array_length(_errs) > 0 THEN
    RAISE EXCEPTION '%: %', _errs->0->>'code', _errs->0->>'message' USING ERRCODE='22023'; END IF;

  _summary := public.supervisory_question_rule_describe(_rule_definition);

  UPDATE public.supervisory_methodology_question_rule
     SET active = false WHERE question_id = _question_id AND rule_kind = _kind AND active;

  INSERT INTO public.supervisory_methodology_question_rule(
    methodology_id, question_id, rule_kind, rule_version, rule_definition, rule_summary, provenance, created_by)
  VALUES (_methodology_id, _question_id, _kind,
    1 + COALESCE((SELECT max(rule_version) FROM public.supervisory_methodology_question_rule
                   WHERE question_id = _question_id AND rule_kind = _kind), 0),
    _rule_definition, _summary, _provenance, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, detail, actor_id)
  VALUES (_methodology_id, 'QUESTION_RULE_SAVED', _rationale,
    jsonb_build_object('question_id',_question_id,'question_code',_q.question_code,
      'rule_kind',_kind,'rule_id',_id,'rule_summary',_summary,'rule_definition',_rule_definition), _uid);

  RETURN jsonb_build_object('id',_id,'rule_kind',_kind,'rule_summary',_summary);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_methodology_question_rule_save(uuid,uuid,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_rule_save(uuid,uuid,text,jsonb,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_rule_remove(
  _rule_id uuid, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _r public.supervisory_methodology_question_rule;
BEGIN
  SELECT * INTO _r FROM public.supervisory_methodology_question_rule WHERE id = _rule_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'not_found: question rule' USING ERRCODE='22023'; END IF;
  _uid := public.supervisory_methodology_require_authoring(_r.methodology_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'rationale_required: state at least 10 characters of rationale' USING ERRCODE='22023'; END IF;

  UPDATE public.supervisory_methodology_question_rule SET active = false WHERE id = _rule_id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, detail, actor_id)
  VALUES (_r.methodology_id, 'QUESTION_RULE_REMOVED', _rationale,
    jsonb_build_object('question_id',_r.question_id,'rule_kind',_r.rule_kind,'rule_id',_rule_id), _uid);

  RETURN jsonb_build_object('id',_rule_id,'active',false);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_methodology_question_rule_remove(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_rule_remove(uuid,text) TO authenticated, service_role;

-- Read model for the Studio question editor
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_rules(_question_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',r.id,'rule_kind',r.rule_kind,'rule_version',r.rule_version,
           'rule_definition',r.rule_definition,'rule_summary',r.rule_summary,
           'provenance',r.provenance,'active',r.active,'created_at',r.created_at,
           'readiness', CASE WHEN jsonb_array_length(public.supervisory_question_rule_check(r.rule_definition,0)) = 0
                             THEN 'EXECUTABLE' ELSE 'NOT_EXECUTABLE' END,
           'findings', public.supervisory_question_rule_check(r.rule_definition,0)
         ) ORDER BY r.rule_kind), '[]'::jsonb)
    FROM public.supervisory_methodology_question_rule r
   WHERE r.question_id = _question_id AND r.active AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.supervisory_methodology_question_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_rules(uuid) TO authenticated, service_role;
