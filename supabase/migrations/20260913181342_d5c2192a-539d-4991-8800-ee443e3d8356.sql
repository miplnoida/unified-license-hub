CREATE OR REPLACE FUNCTION public.supervisory_policy_component_reference_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE _contract jsonb; _map jsonb; _field text; _spec jsonb; _coll text;
        _allowed jsonb; _item jsonb; _i integer; _e jsonb; _v text;
BEGIN
  _map := public.supervisory_policy_component_reference_map(NEW.component_type);
  IF _map IS NULL OR NEW.content IS NULL THEN RETURN NEW; END IF;

  _contract := public.supervisory_policy_component_content_contract(NEW.component_type);
  _coll := COALESCE(_contract->>'collection','items');
  IF jsonb_typeof(COALESCE(NEW.content->_coll,'null'::jsonb)) <> 'array' THEN RETURN NEW; END IF;

  FOR _field IN SELECT jsonb_object_keys(_map) LOOP
    _spec := _map->_field;
    _allowed := COALESCE(public.supervisory_policy_component_reference_values(
                  _spec->>'source', NEW.domain_code, NEW.regulator_id), '[]'::jsonb);

    _i := 0;
    FOR _item IN SELECT * FROM jsonb_array_elements(NEW.content->_coll) LOOP
      _i := _i + 1;
      IF jsonb_typeof(_item) <> 'object' OR NOT (_item ? _field) THEN CONTINUE; END IF;

      IF jsonb_typeof(_item->_field) = 'array' THEN
        FOR _e IN SELECT * FROM jsonb_array_elements(_item->_field) LOOP
          _v := btrim(_e #>> '{}');
          IF _v <> '' AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(_allowed) o
                WHERE upper(o->>'value') = upper(_v)) THEN
            RAISE EXCEPTION 'invalid_reference: entry %, % "%" does not exist in %',
              _i, _field, _v, lower(replace(_spec->>'source','_',' ')) USING ERRCODE = '22023';
          END IF;
        END LOOP;
      ELSIF jsonb_typeof(_item->_field) = 'string' THEN
        _v := btrim(_item->>_field);
        IF _v <> '' AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(_allowed) o
              WHERE upper(o->>'value') = upper(_v)) THEN
          RAISE EXCEPTION 'invalid_reference: entry %, % "%" does not exist in %',
            _i, _field, _v, lower(replace(_spec->>'source','_',' ')) USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS supervisory_policy_component_reference_guard_trg
  ON public.supervisory_policy_component;

CREATE TRIGGER supervisory_policy_component_reference_guard_trg
  BEFORE INSERT OR UPDATE OF content ON public.supervisory_policy_component
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_policy_component_reference_guard();
