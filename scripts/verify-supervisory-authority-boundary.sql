-- ============================================================================
-- Supervisory authority boundary verifier — AUTH-01 … AUTH-14
--
-- Proves that the canonical supervisory objects can only be changed through the
-- governed operations, that the methodology version bound to an assessment is
-- the server's determination, and that a frozen methodology version is
-- structurally immutable.
--
-- Every prohibited action is EXECUTED, not merely inspected: a gate passes only
-- when the database actually refuses.
--
--   psql "$SUPABASE_DB_URL" -f scripts/verify-supervisory-authority-boundary.sql
-- ============================================================================
\pset pager off
\set ON_ERROR_STOP off
SET client_min_messages = notice;
SET row_security = on;

BEGIN;

CREATE TEMP TABLE auth_gate(gate text primary key, claim text, pass boolean, detail text);
-- gates are recorded while impersonating `authenticated`, so the scratch table
-- must be reachable from that role for the duration of this transaction only.
GRANT SELECT, INSERT, UPDATE ON auth_gate TO authenticated;

CREATE FUNCTION pg_temp.gate(_g text, _c text, _p boolean, _d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO auth_gate(gate, claim, pass, detail) VALUES (_g,_c,_p,_d)
  ON CONFLICT (gate) DO UPDATE SET claim=EXCLUDED.claim, pass=EXCLUDED.pass, detail=EXCLUDED.detail;
$$;

CREATE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub',_uid,'role','authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_none() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims','', true);
$$;

-- ---------------------------------------------------------------------------
-- AUTH-01 … AUTH-04  no API role holds direct write authority on the canonical
--                    supervisory objects, and no write RLS policy exists
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _tables text[] := ARRAY[
    'supervisory_methodology','supervisory_methodology_dimension',
    'supervisory_methodology_question','supervisory_methodology_event',
    'supervisory_assessment','supervisory_assessment_dimension',
    'supervisory_assessment_question_response','supervisory_assessment_event'];
  _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name = ANY (_tables)
     AND g.grantee IN ('anon','authenticated')
     AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  PERFORM pg_temp.gate('AUTH-01',
    'no signed-in or anonymous API role holds INSERT/UPDATE/DELETE/TRUNCATE on any canonical supervisory table',
    _n = 0, format('%s offending grant(s)', _n));

  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name = ANY (_tables)
     AND g.grantee = 'anon';
  PERFORM pg_temp.gate('AUTH-02',
    'the anonymous role holds no privilege at all on the canonical supervisory tables',
    _n = 0, format('%s anon grant(s)', _n));

  SELECT count(*) INTO _n
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relname = ANY (_tables)
     AND pol.polcmd IN ('a','w','d','*');
  PERFORM pg_temp.gate('AUTH-03',
    'no direct-write row policy remains on any canonical supervisory table',
    _n = 0, format('%s write policy/policies', _n));

  SELECT count(*) INTO _n
    FROM unnest(_tables) t
   WHERE NOT EXISTS (SELECT 1 FROM pg_policy pol
                      WHERE pol.polrelid = ('public.'||t)::regclass AND pol.polcmd = 'r')
      OR NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = ('public.'||t)::regclass);
  PERFORM pg_temp.gate('AUTH-04',
    'every canonical supervisory table still enforces RLS and still has a governed read policy',
    _n = 0, format('%s table(s) without RLS or without a read policy', _n));
END $$;

-- ---------------------------------------------------------------------------
-- AUTH-05  a signed-in officer with full supervisory authority is still
--          refused a direct table write (executed, not inspected)
-- ---------------------------------------------------------------------------
DO $$
DECLARE _sa uuid; _a uuid; _err text; _ok5 boolean := false; _ok6 boolean := false;
        _ok7 boolean := false; _ok8 boolean := false;
BEGIN
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role = 'super_admin' LIMIT 1;
  SELECT id INTO _a FROM public.supervisory_assessment WHERE domain_code='AML_CFT' LIMIT 1;
  IF _sa IS NULL OR _a IS NULL THEN
    PERFORM pg_temp.gate('AUTH-05','a signed-in super administrator cannot write the assessment table directly',
      false, 'no super_admin identity or no AML assessment fixture available');
    RETURN;
  END IF;

  PERFORM pg_temp.act_as(_sa);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.supervisory_assessment SET summary = 'direct tamper' WHERE id = _a;
    _err := 'no error raised — the direct update was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _ok5 := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('AUTH-05',
    'a signed-in super administrator cannot update the assessment table directly', _ok5, _err);

  BEGIN
    INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code, dimension_group)
    VALUES (_a, 'ZZ_DIRECT', 'OTHER');
    _err := 'no error raised — the direct insert was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _ok6 := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('AUTH-06',
    'a signed-in super administrator cannot insert an assessment dimension directly', _ok6, _err);

  BEGIN
    INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale)
    VALUES (_a, 'FABRICATED', 'hand-written history');
    _err := 'no error raised — a fabricated business event was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _ok7 := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('AUTH-07',
    'assessment history is server-generated: a signed-in user cannot write an event directly', _ok7, _err);

  BEGIN
    UPDATE public.supervisory_methodology_dimension SET weight = 0.99
     WHERE methodology_id = (SELECT methodology_id FROM public.supervisory_assessment WHERE id = _a);
    _err := 'no error raised — a direct methodology weight change was accepted';
  EXCEPTION WHEN insufficient_privilege THEN _ok8 := true; _err := SQLERRM;
            WHEN others THEN _err := SQLERRM;
  END;
  PERFORM pg_temp.gate('AUTH-08',
    'a signed-in user cannot re-weight a methodology dimension directly', _ok8, _err);

  RESET ROLE;
  PERFORM pg_temp.act_as_none();
END $$;

-- ---------------------------------------------------------------------------
-- AUTH-09 … AUTH-11  server-authoritative methodology binding
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _sa uuid; _ent uuid; _sector uuid; _reg uuid; _resolved uuid; _foreign uuid;
  _res jsonb; _err text; _ok9 boolean := false; _ok10 boolean := false; _ok11 boolean := false;
BEGIN
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role = 'super_admin' LIMIT 1;
  SELECT sa.entity_id INTO _ent FROM public.supervisory_assessment sa
   WHERE sa.domain_code='AML_CFT' AND sa.entity_id IS NOT NULL LIMIT 1;
  SELECT l.sector_id, s.regulator_id INTO _sector, _reg
    FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id WHERE l.id = _ent;
  _resolved := public.supervisory_methodology_resolve('AML_CFT', _sector, current_date, _reg);
  SELECT id INTO _foreign FROM public.supervisory_methodology
   WHERE domain_code <> 'AML_CFT' AND status='ACTIVE' LIMIT 1;

  IF _sa IS NULL OR _ent IS NULL OR _resolved IS NULL OR _foreign IS NULL THEN
    PERFORM pg_temp.gate('AUTH-09','creation binds the server-resolved methodology version', false,
      'insufficient fixture: identity, entity, resolved AML methodology or foreign methodology missing');
    RETURN;
  END IF;

  PERFORM pg_temp.act_as(_sa);
  SET LOCAL ROLE authenticated;

  -- AUTH-09 no caller-supplied methodology at all → server binds the resolved one
  _res := public.supervisory_assessment_create(_ent, 'AML_CFT', 'PERIODIC',
            current_date - 365, current_date - 1, NULL, 'PERIODIC', NULL,
            'Authority boundary gate: server-resolved methodology binding.');
  _ok9 := (_res->>'methodology_id')::uuid = _resolved
          AND (_res->'methodology_resolution'->>'status') = 'RESOLVED';
  PERFORM pg_temp.gate('AUTH-09',
    'creation with no caller-supplied methodology binds the server-resolved version', _ok9,
    format('bound=%s resolved=%s', _res->>'methodology_id', _resolved));

  -- AUTH-10 a foreign-domain methodology is refused
  _err := NULL;
  BEGIN
    PERFORM public.supervisory_assessment_create(_ent, 'AML_CFT', 'PERIODIC',
      current_date - 365, current_date - 1, _foreign, 'PERIODIC', NULL,
      'Authority boundary gate: foreign-domain methodology must be refused.');
  EXCEPTION WHEN others THEN _err := SQLERRM;
    _ok10 := SQLERRM LIKE '%methodology_selection_mismatch%';
  END;
  PERFORM pg_temp.gate('AUTH-10',
    'a methodology version of another supervisory domain is refused at creation', _ok10,
    COALESCE(_err,'no exception raised — the foreign methodology was accepted'));

  -- AUTH-11 a non-resolved AML version (the superseded one) is refused
  _err := NULL;
  BEGIN
    PERFORM public.supervisory_assessment_create(_ent, 'AML_CFT', 'PERIODIC',
      current_date - 365, current_date - 1,
      (SELECT id FROM public.supervisory_methodology
        WHERE domain_code='AML_CFT' AND id <> _resolved ORDER BY created_at LIMIT 1),
      'PERIODIC', NULL,
      'Authority boundary gate: a non-resolved AML version must be refused.');
  EXCEPTION WHEN others THEN _err := SQLERRM;
    _ok11 := SQLERRM LIKE '%methodology_selection_mismatch%';
  END;
  PERFORM pg_temp.gate('AUTH-11',
    'a valid but non-resolved methodology version supplied by the caller is refused', _ok11,
    COALESCE(_err,'no exception raised — a caller-selected version was accepted'));

  RESET ROLE;
  PERFORM pg_temp.act_as_none();
END $$;

-- ---------------------------------------------------------------------------
-- AUTH-12  a sector-scoped version is never selected for an entity with no
--          sector, and an equally applicable pair is refused as ambiguous
-- ---------------------------------------------------------------------------
DO $$
DECLARE _sector uuid; _r jsonb; _ok boolean; _okAmb boolean;
BEGIN
  SELECT id INTO _sector FROM public.sectors LIMIT 1;

  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, status,
    sector_id, effective_from, scoring_scale, definition)
  VALUES ('ZZ_AUTH_SECTOR','AML_CFT','Authority gate sector-scoped fixture','9.1','ACTIVE',
          _sector, current_date - 1, '[]'::jsonb, '{}'::jsonb);

  -- a NULL entity sector must not pick up the sector-scoped version
  _r := public.supervisory_methodology_resolve_detail('AML_CFT', NULL, current_date);
  _ok := NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(_r->'candidates') c
     WHERE c->>'sector_id' IS NOT NULL);
  PERFORM pg_temp.gate('AUTH-12',
    'a NULL entity sector is not a wildcard: no sector-scoped methodology version is eligible', _ok,
    format('status=%s candidates=%s', _r->>'status', _r->'candidates'));

  -- a second, identically scoped and dated version makes resolution ambiguous
  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, status,
    sector_id, effective_from, scoring_scale, definition)
  VALUES ('ZZ_AUTH_TWIN','AML_CFT','Authority gate twin fixture','9.2','ACTIVE',
          _sector, current_date - 1, '[]'::jsonb, '{}'::jsonb);

  _r := public.supervisory_methodology_resolve_detail('AML_CFT', _sector, current_date);
  _okAmb := (_r->>'status') = 'AMBIGUOUS' AND (_r->>'methodology_id') IS NULL;
  PERFORM pg_temp.gate('AUTH-13',
    'two equally applicable methodology versions are refused as ambiguous rather than silently ranked',
    _okAmb, format('status=%s candidate_count=%s', _r->>'status', _r->>'candidate_count'));

  DELETE FROM public.supervisory_methodology WHERE code IN ('ZZ_AUTH_SECTOR','ZZ_AUTH_TWIN');
END $$;

-- ---------------------------------------------------------------------------
-- AUTH-14  a frozen methodology version is structurally immutable, and a new
--          version leaves the current version and its history untouched
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _sa uuid; _cur uuid; _nv uuid; _before text; _after text;
  _err text; _okFreeze boolean := false; _okToggle boolean := false; _okVersion boolean := false;
BEGIN
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1;
  SELECT id INTO _cur FROM public.supervisory_methodology
   WHERE domain_code='AML_CFT' AND status='ACTIVE' ORDER BY effective_from DESC NULLS LAST LIMIT 1;
  IF _sa IS NULL OR _cur IS NULL THEN
    PERFORM pg_temp.gate('AUTH-14','a frozen methodology version is structurally immutable', false,
      'no super_admin identity or no ACTIVE AML methodology');
    RETURN;
  END IF;

  SELECT md5(string_agg(d.dimension_code || ':' || COALESCE(d.weight::text,'-') || ':' || d.active::text,
             '|' ORDER BY d.dimension_code))
    INTO _before FROM public.supervisory_methodology_dimension d WHERE d.methodology_id = _cur;

  PERFORM pg_temp.act_as(_sa);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.supervisory_methodology_dimension_save(_cur,
      jsonb_build_object('dimension_code','ZZ_AUTH_NEW','dimension_group','INHERENT_RISK','weight',0.5));
  EXCEPTION WHEN others THEN _err := SQLERRM; _okFreeze := SQLERRM LIKE '%methodology_immutable%';
  END;
  PERFORM pg_temp.gate('AUTH-14',
    'a frozen methodology version refuses a new or re-weighted dimension', _okFreeze,
    COALESCE(_err,'no exception raised — a frozen version accepted a structural change'));

  _err := NULL;
  BEGIN
    PERFORM public.supervisory_methodology_dimension_save(_cur,
      jsonb_build_object('dimension_code',
        (SELECT dimension_code FROM public.supervisory_methodology_dimension
          WHERE methodology_id=_cur ORDER BY dimension_code LIMIT 1),
        'active', false));
  EXCEPTION WHEN others THEN _err := SQLERRM; _okToggle := SQLERRM LIKE '%methodology_immutable%';
  END;
  PERFORM pg_temp.gate('AUTH-15',
    'a frozen methodology version refuses even a dimension activation toggle', _okToggle,
    COALESCE(_err,'no exception raised — a frozen version accepted an activation change'));

  _err := NULL;
  BEGIN
    _nv := public.supervisory_methodology_new_version(_cur, '9.9',
             'Authority boundary gate: structural change belongs to a new version.');
    PERFORM public.supervisory_methodology_dimension_save(_nv,
      jsonb_build_object('dimension_code','ZZ_AUTH_NEW','dimension_group','INHERENT_RISK','weight',0.5));
    _okVersion := true;
  EXCEPTION WHEN others THEN _err := SQLERRM;
  END;

  RESET ROLE;
  PERFORM pg_temp.act_as_none();

  SELECT md5(string_agg(d.dimension_code || ':' || COALESCE(d.weight::text,'-') || ':' || d.active::text,
             '|' ORDER BY d.dimension_code))
    INTO _after FROM public.supervisory_methodology_dimension d WHERE d.methodology_id = _cur;

  PERFORM pg_temp.gate('AUTH-16',
    'the structural change is accepted on a new draft version and the current version is unchanged',
    _okVersion AND _before = _after,
    COALESCE(_err, format('new_version=%s current_version_structure_unchanged=%s',
      COALESCE(_nv::text,'(none)'), (_before = _after))));
END $$;

-- ---------------------------------------------------------------------------
-- AUTH-17  materialisation is idempotent and concurrency safe
-- ---------------------------------------------------------------------------
DO $$
DECLARE _a uuid; _one jsonb; _two jsonb; _expected int;
BEGIN
  SELECT id INTO _a FROM public.supervisory_assessment
   WHERE domain_code='AML_CFT' AND methodology_id IS NOT NULL LIMIT 1;
  _one := public.supervisory_assessment_dimension_materialise_internal(_a, NULL);
  _two := public.supervisory_assessment_dimension_materialise_internal(_a, NULL);
  _expected := (_one->>'expected')::int;
  PERFORM pg_temp.gate('AUTH-17',
    'repeated materialisation neither raises a unique violation nor creates a duplicate dimension',
    (_two->>'created')::int = 0 AND (_two->>'status') = 'ALREADY_COMPLETE'
      AND (_two->>'existing')::int >= _expected,
    format('first=%s/%s second=%s/%s expected=%s',
      _one->>'status', _one->>'created', _two->>'status', _two->>'created', _expected));
END $$;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
SELECT gate,
       CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       claim,
       COALESCE(detail,'') AS detail
  FROM auth_gate
 ORDER BY gate;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
  FROM auth_gate;

ROLLBACK;
