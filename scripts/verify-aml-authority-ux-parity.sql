-- ============================================================================
-- AML/CFT authority UX parity verifier — AUTHUX-01 … AUTHUX-10
--
-- Proves that what the officer is shown before creating an AML/CFT assessment
-- is the server's own determination, produced by the same entity-context
-- operation the creation routine uses, so the preview cannot diverge from what
-- is actually bound — and that the preview itself carries no authority.
--
--   psql "$SUPABASE_DB_URL" -f scripts/verify-aml-authority-ux-parity.sql
-- ============================================================================
\pset pager off
\set ON_ERROR_STOP off
SET client_min_messages = notice;
SET row_security = on;

BEGIN;

CREATE TEMP TABLE ux_gate(gate text primary key, claim text, pass boolean, detail text);
-- gates are recorded while impersonating `authenticated`, for this transaction only
GRANT SELECT, INSERT, UPDATE ON ux_gate TO authenticated;

CREATE FUNCTION pg_temp.gate(_g text, _c text, _p boolean, _d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO ux_gate(gate, claim, pass, detail) VALUES (_g,_c,_p,_d)
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
-- AUTHUX-01  the preview operation is a governed, non-anonymous operation
-- ---------------------------------------------------------------------------
DO $$
DECLARE _def text; _anon boolean; _auth boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname='public'
   WHERE p.proname = 'supervisory_methodology_resolve_for_entity';

  _anon := has_function_privilege('anon',
    'public.supervisory_methodology_resolve_for_entity(uuid,text,date)', 'EXECUTE');
  _auth := has_function_privilege('authenticated',
    'public.supervisory_methodology_resolve_for_entity(uuid,text,date)', 'EXECUTE');

  PERFORM pg_temp.gate('AUTHUX-01',
    'the methodology preview is a SECURITY DEFINER operation with a pinned search_path, executable by signed-in officers and never anonymously',
    _def IS NOT NULL AND _def LIKE '%SECURITY DEFINER%' AND _def LIKE '%search_path%'
      AND _auth AND NOT _anon,
    format('defined=%s anon_execute=%s authenticated_execute=%s', _def IS NOT NULL, _anon, _auth));

  PERFORM pg_temp.gate('AUTHUX-02',
    'the preview authorises the caller and enforces entity scope server-side rather than trusting the browser',
    _def LIKE '%supervisory_spine_require%' AND _def LIKE '%supervisory_entity_scope_check%',
    format('authority_check=%s scope_check=%s',
      _def LIKE '%supervisory_spine_require%', _def LIKE '%supervisory_entity_scope_check%'));
END $$;

-- ---------------------------------------------------------------------------
-- AUTHUX-03  the preview and the creation routine share one resolution path
-- ---------------------------------------------------------------------------
DO $$
DECLARE _prev text; _create text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _prev FROM pg_proc
   WHERE proname='supervisory_methodology_resolve_for_entity';
  SELECT pg_get_functiondef(oid) INTO _create FROM pg_proc
   WHERE proname='supervisory_assessment_create';

  PERFORM pg_temp.gate('AUTHUX-03',
    'the preview and assessment creation resolve the methodology through the same entity-context helper, so they cannot drift',
    _prev LIKE '%supervisory_methodology_context_internal%'
      AND _create LIKE '%supervisory_methodology_context_internal%',
    format('preview_uses_helper=%s create_uses_helper=%s',
      _prev LIKE '%supervisory_methodology_context_internal%',
      _create LIKE '%supervisory_methodology_context_internal%'));
END $$;

-- ---------------------------------------------------------------------------
-- AUTHUX-04  an unauthenticated caller gets no preview at all
-- ---------------------------------------------------------------------------
DO $$
DECLARE _ent uuid; _err text; _ok boolean := false;
BEGIN
  SELECT sa.entity_id INTO _ent FROM public.supervisory_assessment sa
   WHERE sa.domain_code='AML_CFT' AND sa.entity_id IS NOT NULL LIMIT 1;

  PERFORM pg_temp.act_as_none();
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.supervisory_methodology_resolve_for_entity(_ent, 'AML_CFT');
  EXCEPTION WHEN others THEN _err := SQLERRM; _ok := true;
  END;
  RESET ROLE;

  PERFORM pg_temp.gate('AUTHUX-04',
    'an unauthenticated caller cannot obtain a methodology preview', _ok,
    COALESCE(_err,'no exception raised — an unauthenticated preview was served'));
END $$;

-- ---------------------------------------------------------------------------
-- AUTHUX-05 … AUTHUX-07  preview parity with what creation actually binds
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _sa uuid; _ent uuid; _sector uuid; _reg uuid;
  _p jsonb; _res jsonb; _rows bigint; _rows_after bigint;
  _ok5 boolean; _ok6 boolean; _ok7 boolean;
BEGIN
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1;
  SELECT sa.entity_id INTO _ent FROM public.supervisory_assessment sa
   WHERE sa.domain_code='AML_CFT' AND sa.entity_id IS NOT NULL LIMIT 1;
  SELECT l.sector_id, s.regulator_id INTO _sector, _reg
    FROM public.licensees l LEFT JOIN public.sectors s ON s.id=l.sector_id WHERE l.id=_ent;

  IF _sa IS NULL OR _ent IS NULL THEN
    PERFORM pg_temp.gate('AUTHUX-05','the preview reports the version creation will bind', false,
      'insufficient fixture: no super_admin identity or no AML entity');
    RETURN;
  END IF;

  SELECT count(*) INTO _rows FROM public.supervisory_assessment;

  -- AML-CLOSE-02D fixture modernisation: creation requires an explicit AML/CFT
  -- perimeter (AML-CLOSE-02C). TEST-only determination, rolled back; an
  -- existing determination for the entity is left untouched.
  INSERT INTO public.supervisory_domain_perimeter(entity_id, domain_code, is_applicable, basis)
  VALUES (_ent, 'AML_CFT', true, 'TEST ONLY verifier fixture (rolled back) — not a regulatory determination')
  ON CONFLICT (entity_id, domain_code) DO NOTHING;
  PERFORM pg_temp.act_as(_sa);
  SET LOCAL ROLE authenticated;

  _p := public.supervisory_methodology_resolve_for_entity(_ent, 'AML_CFT');

  SELECT count(*) INTO _rows_after FROM public.supervisory_assessment;
  PERFORM pg_temp.gate('AUTHUX-06',
    'obtaining the preview creates no assessment and carries no authority of its own',
    _rows_after = _rows, format('assessments before=%s after=%s', _rows, _rows_after));

  _ok7 := (_p->>'sector_id')::uuid IS NOT DISTINCT FROM _sector
          AND (_p->>'regulator_id')::uuid IS NOT DISTINCT FROM _reg
          AND (_p->>'as_of')::date = current_date;
  PERFORM pg_temp.gate('AUTHUX-07',
    'the preview derives sector, regulator and the effective date server-side from the entity, not from the browser',
    _ok7, format('preview sector=%s regulator=%s as_of=%s / entity sector=%s regulator=%s',
      _p->>'sector_id', _p->>'regulator_id', _p->>'as_of', _sector, _reg));

  _res := public.supervisory_assessment_create(_ent, 'AML_CFT', 'PERIODIC',
            current_date - 365, current_date - 1, NULL, 'PERIODIC', NULL,
            'Authority UX parity gate: the preview must equal the bound version.');

  _ok5 := (_p->>'status') = 'RESOLVED'
          AND (_p->>'methodology_id')::uuid = (_res->>'methodology_id')::uuid
          AND (_p->>'methodology_version') = (_res->>'methodology_version')
          AND (_p->'methodology'->>'status') = 'ACTIVE';
  PERFORM pg_temp.gate('AUTHUX-05',
    'the version and version number shown to the officer are exactly the ones creation binds, and they are ACTIVE',
    _ok5, format('preview=%s/%s bound=%s/%s preview_status=%s',
      _p->>'methodology_id', _p->>'methodology_version',
      _res->>'methodology_id', _res->>'methodology_version', _p->'methodology'->>'status'));

  RESET ROLE;
  PERFORM pg_temp.act_as_none();
END $$;

-- ---------------------------------------------------------------------------
-- AUTHUX-08  an ambiguous configuration is shown as ambiguous and refused
-- ---------------------------------------------------------------------------
DO $$
DECLARE _sa uuid; _ent uuid; _sector uuid; _p jsonb; _err text; _okRef boolean := false;
BEGIN
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1;
  SELECT sa.entity_id INTO _ent FROM public.supervisory_assessment sa
   WHERE sa.domain_code='AML_CFT' AND sa.entity_id IS NOT NULL LIMIT 1;
  SELECT l.sector_id INTO _sector FROM public.licensees l WHERE l.id=_ent;

  INSERT INTO public.supervisory_methodology(code, domain_code, name, version, status,
    sector_id, effective_from, scoring_scale, definition)
  VALUES ('ZZ_UX_TWIN_A','AML_CFT','UX parity twin A','9.7','ACTIVE',
          _sector, current_date - 1, '[]'::jsonb, '{}'::jsonb),
         ('ZZ_UX_TWIN_B','AML_CFT','UX parity twin B','9.8','ACTIVE',
          _sector, current_date - 1, '[]'::jsonb, '{}'::jsonb);

  PERFORM pg_temp.act_as(_sa);
  SET LOCAL ROLE authenticated;

  _p := public.supervisory_methodology_resolve_for_entity(_ent, 'AML_CFT');
  BEGIN
    PERFORM public.supervisory_assessment_create(_ent, 'AML_CFT', 'PERIODIC',
      current_date - 365, current_date - 1, NULL, 'PERIODIC', NULL,
      'Authority UX parity gate: an ambiguous configuration must be refused.');
  EXCEPTION WHEN others THEN _err := SQLERRM;
    _okRef := SQLERRM LIKE '%methodology_ambiguous%';
  END;

  RESET ROLE;
  PERFORM pg_temp.act_as_none();

  PERFORM pg_temp.gate('AUTHUX-08',
    'an ambiguous methodology configuration is surfaced as ambiguous and creation is refused rather than silently ranked',
    (_p->>'status') = 'AMBIGUOUS' AND (_p->>'methodology_id') IS NULL AND _okRef,
    format('preview_status=%s preview_version=%s create_error=%s',
      _p->>'status', COALESCE(_p->>'methodology_id','(none)'),
      COALESCE(_err,'no exception raised')));

  DELETE FROM public.supervisory_methodology WHERE code IN ('ZZ_UX_TWIN_A','ZZ_UX_TWIN_B');
END $$;

-- ---------------------------------------------------------------------------
-- AUTHUX-09 … AUTHUX-10  no applicable version: shown as such, and refused
-- ---------------------------------------------------------------------------
DO $$
DECLARE _sa uuid; _ent uuid; _p jsonb; _err text; _okRef boolean := false;
BEGIN
  SELECT ur.user_id INTO _sa FROM public.user_roles ur WHERE ur.role='super_admin' LIMIT 1;
  SELECT sa.entity_id INTO _ent FROM public.supervisory_assessment sa
   WHERE sa.domain_code='AML_CFT' AND sa.entity_id IS NOT NULL LIMIT 1;

  -- withdraw every applicable AML version for the remainder of this transaction
  UPDATE public.supervisory_methodology SET status='RETIRED'
   WHERE domain_code='AML_CFT' AND status='ACTIVE';

  PERFORM pg_temp.act_as(_sa);
  SET LOCAL ROLE authenticated;

  _p := public.supervisory_methodology_resolve_for_entity(_ent, 'AML_CFT');
  BEGIN
    PERFORM public.supervisory_assessment_create(_ent, 'AML_CFT', 'PERIODIC',
      current_date - 365, current_date - 1, NULL, 'PERIODIC', NULL,
      'Authority UX parity gate: no applicable version must block creation.');
  EXCEPTION WHEN others THEN _err := SQLERRM;
    _okRef := SQLERRM LIKE '%methodology_unavailable%';
  END;

  RESET ROLE;
  PERFORM pg_temp.act_as_none();

  PERFORM pg_temp.gate('AUTHUX-09',
    'where no currently effective version applies the preview says so and offers no version to the officer',
    (_p->>'status') = 'NONE_APPLICABLE' AND (_p->>'methodology_id') IS NULL
      AND (_p->'methodology') = 'null'::jsonb,
    format('status=%s methodology=%s reason=%s',
      _p->>'status', _p->'methodology', COALESCE(_p->>'reason','(none)')));

  PERFORM pg_temp.gate('AUTHUX-10',
    'creation is refused outright when no version applies — there is no fallback to the latest active version',
    _okRef, COALESCE(_err,'no exception raised — an assessment was created with no applicable version'));
END $$;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
SELECT gate,
       CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
       claim,
       COALESCE(detail,'') AS detail
  FROM ux_gate
 ORDER BY gate;

SELECT count(*) FILTER (WHERE pass) AS passed,
       count(*) FILTER (WHERE NOT pass) AS failed,
       count(*) AS total
  FROM ux_gate;

ROLLBACK;
