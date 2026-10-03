-- AML/CFT assessment-dimension linkage verifier (LINK gates).
--
-- Proves that the canonical binding of an assessment dimension to a methodology
-- dimension is
--
--     assessment.methodology_id + assessment_dimension.dimension_code
--        -> exactly one supervisory_methodology_dimension
--
-- that the server (not the browser) decides it, that the database refuses a
-- foreign / wrong-code link even outside the RPC, and that the governed
-- deterministic repair operation is exact and idempotent.
--
-- No methodology, policy or supervisory rating decision is taken here. Every
-- fixture and every write run happens inside the transaction, which ends in
-- ROLLBACK.
--
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/verify-aml-dimension-linkage.sql

BEGIN;

CREATE TEMP TABLE link_gate(id text, name text, result text, detail text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.gate(_id text, _name text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO link_gate VALUES (_id, _name, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail);
$$;
GRANT INSERT ON link_gate TO authenticated;

-- an identity holding aml_supervision.manage_config (used for governed calls)
CREATE OR REPLACE FUNCTION pg_temp.admin_uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT u.id FROM auth.users u
   WHERE public.has_permission(u.id,'aml_supervision','manage_config')
     AND public.has_permission(u.id,'aml_supervision','edit')
   ORDER BY u.email LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_uid::text,'role','authenticated')::text, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.act_as_none() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims','{}', true); END $$;

-- ==========================================================================
-- A. Repair the deterministic links (write run inside the transaction), then
--    assert the resulting linkage state. The dry run is asserted first.
-- ==========================================================================
DO $$
DECLARE _uid uuid; _dry jsonb; _w jsonb; _again jsonb;
        _before_ratings text; _after_ratings text; _expect_repairable int;
BEGIN
  _uid := pg_temp.admin_uid();
  IF _uid IS NULL THEN
    PERFORM pg_temp.gate('LINK-09','governed dry-run repair produces the expected counts', false,
      'no identity with aml_supervision.manage_config + edit exists');
    RETURN;
  END IF;

  SELECT count(*) INTO _expect_repairable
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
   WHERE upper(a.domain_code) = 'AML_CFT'
     AND a.methodology_id IS NOT NULL
     AND d.methodology_dimension_id IS NULL
     AND public.supervisory_methodology_dimension_resolve(a.methodology_id, d.dimension_code) IS NOT NULL;

  SELECT md5(string_agg(d.id::text || ':' || COALESCE(d.inherent_rating,'-') || COALESCE(d.control_rating,'-')
              || COALESCE(d.residual_rating,'-') || COALESCE(d.weight::text,'-')
              || COALESCE(d.rationale,'-') || COALESCE(d.dimension_group,'-'), '|' ORDER BY d.id))
    INTO _before_ratings
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
   WHERE upper(a.domain_code) = 'AML_CFT';

  PERFORM pg_temp.act_as(_uid);
  SET LOCAL ROLE authenticated;
  _dry := public.supervisory_assessment_dimension_relink('AML_CFT', true,
    'linkage verifier dry run: deterministic methodology dimension binding');
  _w := public.supervisory_assessment_dimension_relink('AML_CFT', false,
    'linkage verifier write run: deterministic methodology dimension binding');
  _again := public.supervisory_assessment_dimension_relink('AML_CFT', false,
    'linkage verifier idempotence run: deterministic methodology dimension binding');
  RESET ROLE;
  PERFORM pg_temp.act_as_none();

  SELECT md5(string_agg(d.id::text || ':' || COALESCE(d.inherent_rating,'-') || COALESCE(d.control_rating,'-')
              || COALESCE(d.residual_rating,'-') || COALESCE(d.weight::text,'-')
              || COALESCE(d.rationale,'-') || COALESCE(d.dimension_group,'-'), '|' ORDER BY d.id))
    INTO _after_ratings
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
   WHERE upper(a.domain_code) = 'AML_CFT';

  PERFORM pg_temp.gate('LINK-09','governed dry-run repair produces the expected counts',
    (_dry->>'dry_run')::boolean
    AND (_dry->>'repairable')::int = _expect_repairable
    AND (_dry->>'repaired')::int = 0
    AND (_dry->>'ambiguous')::int = 0
    AND (_dry->>'cross_methodology_conflicts')::int = 0
    AND (_dry->>'code_mismatch_conflicts')::int = 0
    AND jsonb_array_length(_dry->'proposed_updates') = _expect_repairable,
    format('considered=%s exact=%s repairable=%s (expected %s) ambiguous=%s unmatched=%s cross=%s code_mismatch=%s resp_repairable=%s resp_conflicts=%s resp_orphans=%s',
      _dry->>'considered', _dry->>'exact_matches', _dry->>'repairable', _expect_repairable,
      _dry->>'ambiguous', _dry->>'unmatched', _dry->>'cross_methodology_conflicts',
      _dry->>'code_mismatch_conflicts', _dry->>'responses_repairable',
      _dry->>'response_link_conflicts', _dry->>'responses_without_assessment_dimension'));

  PERFORM pg_temp.gate('LINK-10','repair is idempotent and changes nothing but the link',
    (_w->>'repaired')::int = _expect_repairable
    AND (_again->>'repaired')::int = 0
    AND (_again->>'repairable')::int = 0
    AND _before_ratings = _after_ratings,
    format('first write repaired=%s, second write repaired=%s, judged/weight/rationale digest unchanged=%s',
      _w->>'repaired', _again->>'repaired', (_before_ratings = _after_ratings)::text));
END $$;

-- ==========================================================================
-- B. Resulting linkage state (read-only assertions on the AML population)
-- ==========================================================================
DO $$
DECLARE _unlinked int; _cross int; _codemis int; _resp_md int; _resp_ad int; _unresolvable int;
        _codes text;
BEGIN
  SELECT count(*) INTO _unlinked
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
   WHERE upper(a.domain_code) = 'AML_CFT' AND a.methodology_id IS NOT NULL
     AND d.methodology_dimension_id IS NULL
     AND public.supervisory_methodology_dimension_resolve(a.methodology_id, d.dimension_code) IS NOT NULL;
  PERFORM pg_temp.gate('LINK-01','every resolvable AML assessment dimension carries its canonical link',
    _unlinked = 0, format('%s resolvable dimensions still unlinked', _unlinked));

  SELECT count(*) INTO _cross
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
    JOIN public.supervisory_methodology_dimension md ON md.id = d.methodology_dimension_id
   WHERE upper(a.domain_code) = 'AML_CFT' AND md.methodology_id <> a.methodology_id;
  PERFORM pg_temp.gate('LINK-02','no AML assessment dimension links a foreign methodology dimension',
    _cross = 0, format('%s cross-methodology links', _cross));

  SELECT count(*) INTO _codemis
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
    JOIN public.supervisory_methodology_dimension md ON md.id = d.methodology_dimension_id
   WHERE upper(a.domain_code) = 'AML_CFT' AND md.dimension_code <> d.dimension_code;
  PERFORM pg_temp.gate('LINK-03','linked methodology dimension always carries the same dimension code',
    _codemis = 0, format('%s code mismatches', _codemis));

  SELECT count(*) INTO _resp_md
    FROM public.supervisory_assessment_question_response r
    JOIN public.supervisory_assessment a ON a.id = r.assessment_id
    JOIN public.supervisory_assessment_dimension d
      ON d.assessment_id = r.assessment_id AND d.dimension_code = r.dimension_code
   WHERE upper(a.domain_code) = 'AML_CFT'
     AND (r.methodology_id IS DISTINCT FROM a.methodology_id
          OR (d.methodology_dimension_id IS NOT NULL
              AND r.methodology_dimension_id IS DISTINCT FROM d.methodology_dimension_id));
  PERFORM pg_temp.gate('LINK-04','question-response methodology provenance matches the dimension link',
    _resp_md = 0, format('%s responses disagree with the assessment dimension link', _resp_md));

  SELECT count(*) INTO _resp_ad
    FROM public.supervisory_assessment_question_response r
    JOIN public.supervisory_assessment a ON a.id = r.assessment_id
    JOIN public.supervisory_assessment_dimension d
      ON d.assessment_id = r.assessment_id AND d.dimension_code = r.dimension_code
   WHERE upper(a.domain_code) = 'AML_CFT' AND r.assessment_dimension_id IS DISTINCT FROM d.id;
  PERFORM pg_temp.gate('LINK-05','question-response assessment dimension id is canonical where applicable',
    _resp_ad = 0, format('%s responses carry a wrong or missing assessment dimension id', _resp_ad));

  SELECT count(*), COALESCE(string_agg(DISTINCT d.dimension_code, ','),'-') INTO _unresolvable, _codes
    FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
   WHERE upper(a.domain_code) = 'AML_CFT' AND a.methodology_id IS NOT NULL
     AND public.supervisory_methodology_dimension_resolve(a.methodology_id, d.dimension_code) IS NULL;
  PERFORM pg_temp.gate('LINK-11','no AML dimension code is absent from the bound methodology',
    _unresolvable = 0,
    format('%s dimensions use codes absent from their bound methodology: %s (a methodology decision, not deterministically repairable)',
      _unresolvable, _codes));
END $$;

-- ==========================================================================
-- C. Server writer authority (synthetic fixtures)
-- ==========================================================================
DO $$
DECLARE _uid uuid; _ent uuid; _mA uuid; _mB uuid; _dA uuid; _dA2 uuid; _dB uuid;
        _a uuid; _res jsonb; _err text; _ok6 boolean := false; _ok7 boolean := false;
        _row public.supervisory_assessment_dimension;
BEGIN
  _uid := pg_temp.admin_uid();
  -- AML-CLOSE-02C: choose an entity inside an established AML/CFT perimeter.
  SELECT a.entity_id INTO _ent FROM public.supervisory_assessment a
    JOIN public.supervisory_domain_perimeter p ON p.entity_id=a.entity_id AND p.domain_code='AML_CFT' AND p.is_applicable
   WHERE upper(a.domain_code)='AML_CFT' LIMIT 1;
  IF _uid IS NULL OR _ent IS NULL THEN
    PERFORM pg_temp.gate('LINK-06','writer refuses a foreign methodology dimension', false,
      'no usable identity/entity fixture');
    RETURN;
  END IF;

  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, scoring_scale, definition)
  VALUES ('ZZ_LINK_A','AML_CFT','Linkage fixture A','1',
          '[{"code":"LOW","ordinal":1},{"code":"HIGH","ordinal":2}]'::jsonb,'{}'::jsonb)
  RETURNING id INTO _mA;
  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, scoring_scale, definition)
  VALUES ('ZZ_LINK_B','AML_CFT','Linkage fixture B','1',
          '[{"code":"LOW","ordinal":1},{"code":"HIGH","ordinal":2}]'::jsonb,'{}'::jsonb)
  RETURNING id INTO _mB;

  INSERT INTO public.supervisory_methodology_dimension(methodology_id, dimension_code, dimension_group,
    label, dimension_kind, weight, min_evidence_count)
  VALUES (_mA,'LK_ONE','INHERENT_RISK','Fixture one','INHERENT',1,0) RETURNING id INTO _dA;
  INSERT INTO public.supervisory_methodology_dimension(methodology_id, dimension_code, dimension_group,
    label, dimension_kind, weight, min_evidence_count)
  VALUES (_mA,'LK_TWO','CONTROL_EFFECTIVENESS','Fixture two','CONTROL',1,0) RETURNING id INTO _dA2;
  INSERT INTO public.supervisory_methodology_dimension(methodology_id, dimension_code, dimension_group,
    label, dimension_kind, weight, min_evidence_count)
  VALUES (_mB,'LK_ONE','INHERENT_RISK','Foreign fixture','INHERENT',1,0) RETURNING id INTO _dB;

  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, methodology_id,
    methodology_version, period_start, period_end, assessment_date, status, created_by)
  VALUES ('ZZ-LINK-1',_ent,'AML_CFT',_mA,'1','2026-01-01','2026-03-31','2026-04-01','draft',_uid)
  RETURNING id INTO _a;

  PERFORM pg_temp.act_as(_uid);
  SET LOCAL ROLE authenticated;

  -- LINK-06 foreign methodology dimension
  BEGIN
    PERFORM public.supervisory_assessment_dimension_upsert(
      _assessment_id := _a, _dimension_code := 'LK_ONE', _dimension_group := 'INHERENT_RISK',
      _methodology_dimension_id := _dB);
  EXCEPTION WHEN others THEN _err := SQLERRM; _ok6 := SQLERRM LIKE '%cross_methodology%';
  END;
  PERFORM pg_temp.gate('LINK-06','writer refuses a foreign methodology dimension', _ok6,
    COALESCE(_err,'no exception raised — the foreign link was accepted'));

  -- LINK-07 wrong-code methodology dimension of the same methodology
  _err := NULL;
  BEGIN
    PERFORM public.supervisory_assessment_dimension_upsert(
      _assessment_id := _a, _dimension_code := 'LK_ONE', _dimension_group := 'INHERENT_RISK',
      _methodology_dimension_id := _dA2);
  EXCEPTION WHEN others THEN _err := SQLERRM; _ok7 := SQLERRM LIKE '%code_mismatch%';
  END;
  PERFORM pg_temp.gate('LINK-07','writer refuses a wrong-code methodology dimension', _ok7,
    COALESCE(_err,'no exception raised — the wrong-code link was accepted'));

  -- LINK-08 writer resolves the canonical dimension with no caller id at all
  _res := public.supervisory_assessment_dimension_upsert(
    _assessment_id := _a, _dimension_code := 'LK_ONE', _dimension_group := 'INHERENT_RISK');
  RESET ROLE;
  PERFORM pg_temp.act_as_none();

  SELECT * INTO _row FROM public.supervisory_assessment_dimension WHERE id = (_res->>'id')::uuid;
  PERFORM pg_temp.gate('LINK-08','writer resolves the canonical dimension without caller authority',
    _row.methodology_dimension_id = _dA,
    format('server-resolved link=%s expected=%s (caller supplied none)',
      COALESCE(_row.methodology_dimension_id::text,'(null)'), _dA));

  -- LINK-12 database guard defends a bypassing code path
  DECLARE _ok12 boolean := false; _ok12b boolean := false;
  BEGIN
    BEGIN
      UPDATE public.supervisory_assessment_dimension SET methodology_dimension_id = _dB WHERE id = _row.id;
    EXCEPTION WHEN others THEN _ok12 := SQLERRM LIKE '%cross_methodology%';
    END;
    BEGIN
      UPDATE public.supervisory_assessment_dimension SET methodology_dimension_id = _dA2 WHERE id = _row.id;
    EXCEPTION WHEN others THEN _ok12b := SQLERRM LIKE '%code_mismatch%';
    END;
    PERFORM pg_temp.gate('LINK-12','database guard refuses a bad link outside the RPC',
      _ok12 AND _ok12b,
      format('direct foreign-link update refused=%s, direct wrong-code update refused=%s', _ok12, _ok12b));
  END;
END $$;

SELECT id, name, result, detail FROM link_gate ORDER BY id;
SELECT count(*) FILTER (WHERE result = 'PASS') AS pass,
       count(*) FILTER (WHERE result = 'FAIL') AS fail,
       count(*) AS total FROM link_gate;

ROLLBACK;
