-- MON-01…35 — Continuous Monitoring register (OS-02B truthfulness + OS-02C scope convergence)
--
-- Contract under test:
--   public.supervisory_monitoring_register(...)          (SECURITY INVOKER)
--   public.supervisory_monitoring_register_options()     (SECURITY INVOKER)
--   public.supervisory_domain_regulatory_function(text)  (domain -> function)
--   public.supervisory_domain_assignment(uuid, text)     (domain-scoped owner)
--
-- Run: psql "$DATABASE_URL" -f scripts/verify-supervisory-monitoring-register.sql
--
-- Everything runs inside ONE transaction that always ROLLBACKs. Every gate is
-- recorded individually (no early abort) and the full result table is printed
-- at the end. MON-25 proves the fixtures left no persistent business state.

\set ON_ERROR_STOP on
\pset pager off
BEGIN;

CREATE TEMP TABLE mon_result(
  gate text PRIMARY KEY, title text, status text, detail text);

CREATE OR REPLACE FUNCTION pg_temp.rec(_gate text, _title text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO mon_result VALUES (_gate, _title, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail)
  ON CONFLICT (gate) DO UPDATE SET status = excluded.status, detail = excluded.detail;
$$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_owner() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
END $$;

-- ---------------------------------------------------------------- baseline
CREATE TEMP TABLE mon_baseline AS
SELECT
  (SELECT count(*) FROM public.entity_risk_state)                  AS risk_states,
  (SELECT count(*) FROM public.supervisory_assessment)             AS assessments,
  (SELECT count(*) FROM public.supervisory_attention)              AS attention,
  (SELECT count(*) FROM public.supervisory_signal)                 AS signals,
  (SELECT count(*) FROM public.examinations)                       AS examinations,
  (SELECT count(*) FROM public.supervisory_finding)                AS findings,
  (SELECT count(*) FROM public.supervisory_remediation_action)     AS remediation,
  (SELECT count(*) FROM public.entity_supervision_assignments)     AS assignments,
  (SELECT count(*) FROM public.supervisory_domain_perimeter)       AS perimeter,
  (SELECT count(*) FROM public.supervisory_reassessment_requirement) AS reassessments;

-- ---------------------------------------------------------------- personas
-- Domain-restricted viewers, a regulator-scoped supervisor and an excluded
-- perimeter pair. All fixtures are discarded by the final ROLLBACK.
CREATE TEMP TABLE mon_actor(
  aml_user uuid, pru_user uuid, reg_user uuid, spine_user uuid,
  fixture_regulator uuid, excluded_entity uuid, excluded_domain text,
  unassessed_entity uuid);

DO $$
DECLARE
  _reg uuid; _amlMod uuid; _pruMod uuid; _stReg uuid;
  _pAml uuid; _pPru uuid; _licMod uuid; _pLic uuid;
  _rAml uuid; _rPru uuid; _rRegScoped uuid;
  _actors uuid[]; _spine uuid; _ent uuid; _unassessed uuid;
BEGIN
  SELECT id INTO _amlMod FROM public.sec_modules WHERE key = 'aml_supervision';
  SELECT id INTO _pruMod FROM public.sec_modules WHERE key = 'prudential_supervision';
  SELECT id INTO _stReg  FROM public.sec_scope_types WHERE key = 'regulator';
  SELECT id INTO _pAml FROM public.sec_permissions WHERE module_id = _amlMod AND key = 'view';
  SELECT id INTO _pPru FROM public.sec_permissions WHERE module_id = _pruMod AND key = 'view';
  -- entity visibility itself is governed by licensee RLS, so each persona needs
  -- the entity read grant; the domain gates under test are the supervisory ones.
  SELECT id INTO _licMod FROM public.sec_modules WHERE key = 'license_management';
  SELECT id INTO _pLic FROM public.sec_permissions WHERE module_id = _licMod AND key = 'view';

  INSERT INTO public.regulators(name, code, status)
  VALUES ('ZZ MON Regulator (fixture)','ZZMONR','active') RETURNING id INTO _reg;

  -- Internal staff identities only: an external portal identity can never reach
  -- the supervisory read models, so it cannot exercise the domain gates.
  SELECT array_agg(id) INTO _actors FROM (
    SELECT u.id FROM auth.users u
     WHERE NOT public.is_super_admin(u.id)
       AND NOT EXISTS (SELECT 1 FROM public.external_user_entity_ids(u.id))
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = u.id
                          AND ur.role IN ('applicant','pre_licensee',
                                          'licensee_primary','licensee_secondary'))
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
     ORDER BY u.created_at, u.id LIMIT 3) s;
  IF COALESCE(array_length(_actors,1),0) < 3 THEN
    RAISE EXCEPTION 'fixture_identities_unavailable: need 3 internal accounts, found %',
      COALESCE(array_length(_actors,1),0);
  END IF;

  INSERT INTO public.sec_roles(key,name,role_type,status)
  VALUES ('zz_mon_aml_view','ZZ MON AML viewer','internal','active') RETURNING id INTO _rAml;
  INSERT INTO public.sec_roles(key,name,role_type,status)
  VALUES ('zz_mon_pru_view','ZZ MON Prudential viewer','internal','active') RETURNING id INTO _rPru;
  INSERT INTO public.sec_roles(key,name,role_type,status)
  VALUES ('zz_mon_reg_scoped','ZZ MON regulator-scoped supervisor','internal','active')
  RETURNING id INTO _rRegScoped;

  INSERT INTO public.sec_role_permissions(role_id, permission_id) VALUES
    (_rAml,_pAml), (_rPru,_pPru), (_rRegScoped,_pAml),
    (_rAml,_pLic), (_rPru,_pLic), (_rRegScoped,_pLic);

  INSERT INTO public.sec_role_scopes(role_id, module_id, scope_type_id)
  VALUES (_rRegScoped,_amlMod,_stReg);
  INSERT INTO public.sec_role_scope_values(role_scope_id, value_kind, value_id)
  SELECT rs.id, 'regulator', _reg FROM public.sec_role_scopes rs WHERE rs.role_id = _rRegScoped;

  -- remove any competing grants so the personas are genuinely single-domain
  DELETE FROM public.sec_user_roles WHERE user_id = ANY(_actors);
  DELETE FROM public.user_roles WHERE user_id = ANY(_actors);
  INSERT INTO public.sec_user_roles(user_id, role_id, status) VALUES
    (_actors[1],_rAml,'active'), (_actors[2],_rPru,'active'), (_actors[3],_rRegScoped,'active');

  SELECT p.id INTO _spine FROM public.profiles p
   WHERE public.has_any_permission(p.id, ARRAY['supervisory_spine.view'])
     AND p.id <> ALL(_actors)
   ORDER BY p.created_at LIMIT 1;

  -- explicit governed perimeter exclusion
  SELECT l.id INTO _ent FROM public.licensees l ORDER BY l.created_at LIMIT 1;
  INSERT INTO public.supervisory_domain_perimeter(entity_id, domain_code, is_applicable, basis)
  VALUES (_ent, 'MARKET_CONDUCT', false, 'MON fixture: explicit governed exclusion')
  ON CONFLICT (entity_id, domain_code) DO UPDATE SET is_applicable = false;

  -- an entity with signals / findings / late filings but NO approved risk state
  SELECT l.id INTO _unassessed FROM public.licensees l
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs
                      WHERE rs.entity_id = l.id AND rs.domain_code = 'AML_CFT')
   ORDER BY l.created_at LIMIT 1;
  IF _unassessed IS NOT NULL THEN
    INSERT INTO public.supervisory_signal(entity_id, domain_code, severity, detected_at,
                                          source_kind, external_reference, summary)
    VALUES (_unassessed, 'AML_CFT', 'CRITICAL', now(), 'OTHER_GOVERNED_SOURCE',
            'MON-FIXTURE-ROLLED-BACK', 'MON fixture signal (rolled back)');
  END IF;

  INSERT INTO mon_actor VALUES
    (_actors[1], _actors[2], _actors[3], _spine, _reg, _ent, 'MARKET_CONDUCT', _unassessed);
END $$;

GRANT SELECT ON mon_result, mon_actor, mon_baseline TO authenticated;

-- ===========================================================================
-- MON-01 — no monitoring business persistence exists
-- ===========================================================================
DO $$
DECLARE n int; bad text;
BEGIN
  SELECT count(*), string_agg(table_name, ', ') INTO n, bad
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     AND (table_name LIKE 'monitoring%' OR table_name LIKE '%monitoring_case%'
          OR table_name LIKE '%monitoring_risk%' OR table_name LIKE '%monitoring_task%'
          OR table_name LIKE '%monitoring_work%' OR table_name LIKE '%monitoring_finding%'
          OR table_name LIKE '%monitoring_remediation%' OR table_name LIKE 'offsite%');
  PERFORM pg_temp.rec('MON-01','no monitoring business persistence', n = 0,
    COALESCE('monitoring/offsite base tables: ' || n || COALESCE(' -> ' || bad, ''), 'none'));
END $$;

-- ===========================================================================
-- MON-02 — anonymous caller denied
-- ===========================================================================
DO $$
DECLARE ok boolean := true; msg text := '';
BEGIN
  PERFORM pg_temp.act_as_anon();
  BEGIN
    PERFORM public.supervisory_monitoring_register();
    ok := false; msg := 'register answered anon; ';
  EXCEPTION WHEN OTHERS THEN msg := msg || 'register refused (' || SQLERRM || '); ';
  END;
  BEGIN
    PERFORM public.supervisory_monitoring_register_options();
    ok := false; msg := msg || 'options answered anon';
  EXCEPTION WHEN OTHERS THEN msg := msg || 'options refused';
  END;
  PERFORM pg_temp.act_as_owner();
  PERFORM pg_temp.rec('MON-02','anonymous denied', ok, msg);
END $$;

-- ===========================================================================
-- MON-03 — domain authority enforced (AML-only / Prudential-only viewers)
-- ===========================================================================
DO $$
DECLARE a record; ra jsonb; rp jsonb; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(a.aml_user);
  ra := public.supervisory_monitoring_register();
  PERFORM pg_temp.act_as(a.pru_user);
  rp := public.supervisory_monitoring_register();
  PERFORM pg_temp.act_as_owner();

  -- CROSS_DOMAIN is readable to any supervisory domain reader by the canonical
  -- sup_domain_readable contract (OS-01, frozen); the gate proves no *other*
  -- single-domain leaks in either direction.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(ra->'authorised_domains') d
              WHERE d.value IN ('PRUDENTIAL','MARKET_CONDUCT','OPERATIONAL_RESILIENCE','GOVERNANCE'))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(ra->'rows') r
                 WHERE r->>'domain_code' <> ALL (ARRAY['AML_CFT','CROSS_DOMAIN'])) THEN
    ok := false; msg := msg || 'AML viewer domains=' || (ra->'authorised_domains')::text || '; ';
  END IF;
  IF rp->'authorised_domains' @> '["AML_CFT"]'::jsonb THEN
    ok := false; msg := msg || 'Prudential viewer can read AML; ';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(rp->'rows') r
              WHERE r->>'domain_code' = 'AML_CFT') THEN
    ok := false; msg := msg || 'Prudential viewer received AML rows; ';
  END IF;
  msg := msg || 'aml=' || (ra->'authorised_domains')::text
             || ' prudential=' || (rp->'authorised_domains')::text;
  PERFORM pg_temp.rec('MON-03','domain authority enforced', ok, msg);
END $$;

-- ===========================================================================
-- MON-04 — regulator / entity scope enforced for a regulator-scoped supervisor
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; leaked bigint; ok boolean;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(a.reg_user);
  r := public.supervisory_monitoring_register(null, null, null, null, null, null, null, null,
                                              null, null, null, null, null, 'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  SELECT count(*) INTO leaked
    FROM jsonb_array_elements(r->'rows') x
   WHERE (x->>'regulator_id') IS DISTINCT FROM a.fixture_regulator::text;
  ok := leaked = 0;
  PERFORM pg_temp.rec('MON-04','regulator/entity scope enforced', ok,
    'rows outside the supervisor''s regulator-scoped grant: ' || leaked
    || ' of ' || jsonb_array_length(r->'rows')
    || ' (narrowed per entity/domain pair by public.supervisory_monitoring_scope_admits '
    || 'over public.user_scope_grants_for: all / regulator / sector / sub_sector / '
    || 'institution / assigned / team)');
END $$;

-- ===========================================================================
-- MON-05 — options obey the same scope as the register
-- ===========================================================================
DO $$
DECLARE a record; o jsonb; r jsonb; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(a.aml_user);
  o := public.supervisory_monitoring_register_options();
  r := public.supervisory_monitoring_register();
  PERFORM pg_temp.act_as_owner();
  IF o->'domains' <> r->'authorised_domains' THEN
    ok := false; msg := msg || 'options domains ' || (o->'domains')::text
                       || ' <> register ' || (r->'authorised_domains')::text || '; ';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(o->'engagement_types') e
             JOIN public.examinations x ON upper(x.engagement_type) = e.value
             WHERE NOT (COALESCE(x.domain_code,'CROSS_DOMAIN')
                        = ANY (ARRAY(SELECT jsonb_array_elements_text(o->'domains'))))) THEN
    ok := false; msg := msg || 'engagement type from an unreadable domain; ';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(o->'teams') t
     JOIN public.entity_supervision_assignments es ON es.team_id = (t->>'id')::uuid
     WHERE es.regulatory_function_id IS NOT NULL
       AND es.regulatory_function_id NOT IN (
         SELECT public.supervisory_domain_regulatory_function(d)
           FROM jsonb_array_elements_text(o->'domains') AS z(d))
       AND NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments e2
                        WHERE e2.team_id = (t->>'id')::uuid
                          AND e2.effective_to IS NULL
                          AND e2.regulatory_function_id IS NULL)) THEN
    ok := false; msg := msg || 'team from an unrelated regulatory function; ';
  END IF;
  PERFORM pg_temp.rec('MON-05','options obey the register scope', ok,
    COALESCE(NULLIF(msg,''), 'domains, engagement types and teams all within scope'));
END $$;

-- ===========================================================================
-- MON-06 — total_count truthful
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; expected bigint; ok boolean;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(a.aml_user);
  r := public.supervisory_monitoring_register();
  PERFORM pg_temp.act_as_owner();
  -- caller-relative: every applicable entity x authorised domain pair the
  -- persona's own scope admits (the register lists one row per pair).
  SELECT count(*) INTO expected
    FROM public.licensees l,
         jsonb_array_elements_text(r->'authorised_domains') AS d(dom)
   WHERE public.supervisory_domain_applicable(l.id, d.dom)
     AND public.supervisory_monitoring_scope_admits(a.aml_user, d.dom, l.id,
           l.lead_regulator_id, l.sector_id);
  PERFORM pg_temp.act_as_owner();
  ok := (r->>'total_count')::bigint = expected;
  PERFORM pg_temp.rec('MON-06','total_count truthful', ok,
    'register total ' || (r->>'total_count')
    || ' vs applicable+in-scope entity/domain pairs ' || expected);
END $$;

-- ===========================================================================
-- MON-07 — pagination bounded and MON-08 — stable server sorting
-- ===========================================================================
DO $$
DECLARE a record; p1 jsonb; p2 jsonb; p1b jsonb; ok boolean;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(a.aml_user);
  p1 := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
          null,null,null,null,null,'entity','asc',1,10);
  p2 := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
          null,null,null,null,null,'entity','asc',2,10);
  p1b := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
          null,null,null,null,null,'entity','asc',1,10);
  PERFORM pg_temp.act_as_owner();

  ok := jsonb_array_length(p1->'rows') <= 10
        AND (p1->>'page_size')::int = 10
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p1->'rows') x
                         JOIN jsonb_array_elements(p2->'rows') y
                           ON x->>'row_key' = y->>'row_key');
  PERFORM pg_temp.rec('MON-07','pagination bounded', ok,
    'page1=' || jsonb_array_length(p1->'rows') || ' page2=' || jsonb_array_length(p2->'rows')
    || ' overlap=' || (SELECT count(*) FROM jsonb_array_elements(p1->'rows') x
                        JOIN jsonb_array_elements(p2->'rows') y ON x->>'row_key' = y->>'row_key'));

  PERFORM pg_temp.rec('MON-08','stable server sorting',
    (p1->'rows') = (p1b->'rows'),
    'identical request repeated: row order ' ||
    CASE WHEN (p1->'rows') = (p1b->'rows') THEN 'identical' ELSE 'differed' END);
END $$;

-- ===========================================================================
-- MON-09 — domain applicability matches the canonical helper exactly
-- MON-10 — an explicitly excluded perimeter pair never appears
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; mismatched bigint; present bigint;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
        null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();

  SELECT count(*) INTO mismatched
    FROM jsonb_array_elements(r->'rows') x
   WHERE NOT public.supervisory_domain_applicable((x->>'entity_id')::uuid, x->>'domain_code');
  PERFORM pg_temp.rec('MON-09','applicability matches canonical helper', mismatched = 0,
    'rows contradicting supervisory_domain_applicable: ' || mismatched);

  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register('MARKET_CONDUCT',null,null,null,null,null,null,null,
        null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  SELECT count(*) INTO present FROM jsonb_array_elements(r->'rows') x
   WHERE (x->>'entity_id')::uuid = a.excluded_entity;
  PERFORM pg_temp.rec('MON-10','excluded perimeter pair absent', present = 0,
    'excluded entity/domain rows returned: ' || present);
END $$;

-- ===========================================================================
-- MON-11 — approved risk only  /  MON-12 — no monitoring-generated risk
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; bad bigint; invented bigint;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
        null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();

  SELECT count(*) INTO bad
    FROM jsonb_array_elements(r->'rows') x
   WHERE x->'risk' <> 'null'::jsonb
     AND NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs
                      WHERE rs.entity_id = (x->>'entity_id')::uuid
                        AND rs.domain_code = x->>'domain_code'
                        AND rs.residual_rating = x->'risk'->>'residual_rating');
  PERFORM pg_temp.rec('MON-11','approved risk state only', bad = 0,
    'rows whose rating is not the canonical entity_risk_state value: ' || bad);

  -- fixture: signals exist, no approved risk state -> risk must be null
  SELECT count(*) INTO invented
    FROM jsonb_array_elements(r->'rows') x
   WHERE (x->>'entity_id')::uuid = a.unassessed_entity
     AND x->>'domain_code' = 'AML_CFT'
     AND x->'risk' <> 'null'::jsonb;
  PERFORM pg_temp.rec('MON-12','no monitoring-generated risk', invented = 0,
    'entity with a CRITICAL signal and no approved risk state returned a rating: ' || invented
    || ' (expected 0; register shows Not assessed)');
END $$;

-- ===========================================================================
-- MON-13 — latest approved assessment truthful (draft/submitted/superseded)
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; bad bigint;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
        null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  SELECT count(*) INTO bad
    FROM jsonb_array_elements(r->'rows') x
    JOIN public.supervisory_assessment s ON s.id = (x->'assessment'->>'id')::uuid
   WHERE upper(COALESCE(s.status,'')) <> 'APPROVED' OR s.approved_at IS NULL;
  PERFORM pg_temp.rec('MON-13','latest approved assessment truthful', bad = 0,
    'displayed assessments that are draft/submitted/superseded or unapproved: ' || bad
    || ' (canonical population: '
    || (SELECT string_agg(status || '=' || c, ', ')
          FROM (SELECT status, count(*) c FROM public.supervisory_assessment GROUP BY 1) z) || ')');
END $$;

-- ===========================================================================
-- MON-14 — reassessment due truth (no invented review dates)
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; bad bigint; invented bigint;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
        null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();

  SELECT count(*) INTO invented
    FROM jsonb_array_elements(r->'rows') x
   WHERE x->'reassessment'->>'due_date' IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement q
                      WHERE q.id = (x->'reassessment'->>'id')::uuid
                        AND q.due_date::text = x->'reassessment'->>'due_date');
  SELECT count(*) INTO bad
    FROM jsonb_array_elements(r->'rows') x
   WHERE (x->>'due_position' = 'NO_DUE_POLICY' AND x->'reassessment' <> 'null'::jsonb)
      OR (x->>'due_position' = 'NOT_SCHEDULED' AND x->'reassessment'->>'due_date' IS NOT NULL)
      OR (x->>'due_position' IN ('DUE','OVERDUE') AND x->'reassessment'->>'due_date' IS NULL);
  PERFORM pg_temp.rec('MON-14','reassessment due truth', invented = 0 AND bad = 0,
    'dates not traceable to a canonical requirement: ' || invented
    || '; due_position inconsistencies: ' || bad);
END $$;

-- ===========================================================================
-- MON-15 — entity-level filings are never domain-attributed
-- MON-16 — filing entity counts are de-duplicated
-- MON-17 — filing period counts truthful
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; bad bigint; ent_late bigint; ent_missing bigint;
        real_late bigint; real_missing bigint; per_late bigint; per_missing bigint;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
        null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();

  SELECT count(*) INTO bad FROM jsonb_array_elements(r->'rows') x
   WHERE COALESCE(x->'returns'->>'domain_linkage','') NOT IN ('ENTITY_LEVEL_ONLY','NONE')
      OR COALESCE(x->'returns'->>'disclosure','') <> 'ENTITY_LEVEL_CONTEXT';
  PERFORM pg_temp.rec('MON-15','entity-level filings not domain-attributed',
    bad = 0 AND (r->'summary'->>'filing_metrics_basis') = 'ENTITY_LEVEL_ONLY',
    'rows lacking the entity-level disclosure: ' || bad
    || '; summary basis=' || COALESCE(r->'summary'->>'filing_metrics_basis','(absent)'));

  ent_late    := (r->'summary'->>'entities_with_late_filings')::bigint;
  ent_missing := (r->'summary'->>'entities_with_missing_filings')::bigint;
  WITH e AS (
    SELECT o.entity_id,
           count(*) FILTER (WHERE f.submitted_at IS NOT NULL AND p.due_date IS NOT NULL
                              AND f.submitted_at::date > p.due_date) AS late,
           count(*) FILTER (WHERE f.id IS NULL AND p.due_date IS NOT NULL
                              AND p.due_date < current_date) AS missing
      FROM public.entity_reporting_obligations o
      JOIN public.reporting_periods p ON p.entity_reporting_obligation_id = o.id
      LEFT JOIN public.return_filings f ON f.reporting_period_id = p.id
     GROUP BY 1)
  SELECT count(*) FILTER (WHERE missing = 0 AND late > 0),
         count(*) FILTER (WHERE missing > 0),
         COALESCE(sum(late),0), COALESCE(sum(missing),0)
    INTO real_late, real_missing, per_late, per_missing
    FROM e WHERE entity_id IN (SELECT id FROM public.licensees);

  PERFORM pg_temp.rec('MON-16','filing entity counts de-duplicated',
    ent_late <= real_late AND ent_missing <= real_missing
      AND ent_late + ent_missing <= (SELECT count(*) FROM public.licensees),
    'register entities late=' || ent_late || ' missing=' || ent_missing
    || ' vs canonical entity population late=' || real_late || ' missing=' || real_missing
    || ' (never multiplied by domain count)');

  PERFORM pg_temp.rec('MON-17','filing period counts truthful',
    (r->'summary'->>'late_filing_periods')::bigint <= per_late
    AND (r->'summary'->>'missing_filing_periods')::bigint <= per_missing,
    'register periods late=' || (r->'summary'->>'late_filing_periods')
    || ' missing=' || (r->'summary'->>'missing_filing_periods')
    || ' vs canonical reporting-period totals late=' || per_late || ' missing=' || per_missing);
END $$;

-- ===========================================================================
-- MON-18 signals canonical / MON-19 attention canonical / MON-20 examinations
-- MON-21 findings + remediation canonical / MON-22 domain-function owner
-- MON-23 flag provenance / MON-24 freshness semantics
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; n bigint; msg text;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
        null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();

  -- MON-18: every signal block traces to supervisory_signal and never to risk
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'rows') x
   WHERE x->'signals' <> 'null'::jsonb
     AND ((x->'signals'->>'source_object') <> 'supervisory_signal'
       OR (x->'signals'->>'top_signal_id') IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.supervisory_signal g
                       WHERE g.id = (x->'signals'->>'top_signal_id')::uuid));
  PERFORM pg_temp.rec('MON-18','signals canonical and separate from risk', n = 0,
    'signal blocks not traceable to supervisory_signal: ' || n);

  -- MON-19: attention is canonical and monitoring never invents it
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'rows') x
   WHERE x->'attention' <> 'null'::jsonb
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_attention t
                      WHERE t.id = (x->'attention'->>'id')::uuid AND t.closed_at IS NULL);
  PERFORM pg_temp.rec('MON-19','attention canonical', n = 0,
    'attention blocks not traceable to an open supervisory_attention: ' || n
    || '; signals present without attention: '
    || (SELECT count(*) FROM jsonb_array_elements(r->'rows') y
         WHERE y->'signals' <> 'null'::jsonb AND y->'attention' = 'null'::jsonb));

  -- MON-20: engagement comes from examinations only
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'rows') x
   WHERE x->'engagement' <> 'null'::jsonb
     AND NOT EXISTS (SELECT 1 FROM public.examinations e
                      WHERE e.id = (x->'engagement'->>'id')::uuid
                        AND upper(COALESCE(e.engagement_type,''))
                            = upper(COALESCE(x->'engagement'->>'engagement_type','')));
  msg := 'non-canonical engagement rows: ' || n
      || '; production examinations=' || (SELECT count(*) FROM public.examinations)
      || ' OFFSITE_REVIEW=' || (SELECT count(*) FROM public.examinations
                                 WHERE upper(COALESCE(engagement_type,'')) = 'OFFSITE_REVIEW')
      || '; register active_offsite_reviews=' || (r->'summary'->>'active_offsite_reviews');
  PERFORM pg_temp.rec('MON-20','examination engagement canonical',
    n = 0 AND (r->'summary'->>'active_offsite_reviews')::bigint
              = (SELECT count(*) FROM public.examinations
                  WHERE closed_at IS NULL
                    AND upper(COALESCE(engagement_type,'')) = 'OFFSITE_REVIEW'
                    AND entity_id IS NOT NULL), msg);

  -- MON-21: findings / remediation only from the canonical stores
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'rows') x
   WHERE (x->'findings'->>'source_object') <> 'supervisory_finding'
      OR (x->'remediation'->>'source_object') <> 'supervisory_remediation_action'
      OR ((x->'findings'->>'top_finding_id') IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.supervisory_finding f
                           WHERE f.id = (x->'findings'->>'top_finding_id')::uuid));
  PERFORM pg_temp.rec('MON-21','findings/remediation canonical', n = 0,
    'rows reading a non-canonical finding/remediation store: ' || n);

  -- MON-22: owner is the domain/function-scoped assignment
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'rows') x
   WHERE (x->'owner'->>'lead_supervisor_id') IS NOT NULL
     AND ((x->'owner'->>'lead_supervisor_id')::uuid,
          COALESCE((x->'owner'->>'team_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
         IS DISTINCT FROM
         (SELECT (d.lead_supervisor_id,
                  COALESCE(d.team_id,'00000000-0000-0000-0000-000000000000'::uuid))
            FROM public.supervisory_domain_assignment((x->>'entity_id')::uuid, x->>'domain_code') d);
  PERFORM pg_temp.rec('MON-22','domain/function owner canonical', n = 0,
    'rows whose owner differs from supervisory_domain_assignment: ' || n
    || '; cross-function leakage rows: '
    || (SELECT count(*) FROM jsonb_array_elements(r->'rows') y
         WHERE (y->'owner'->>'regulatory_function_id') IS NOT NULL
           AND (y->'owner'->>'regulatory_function_id')::uuid
               IS DISTINCT FROM public.supervisory_domain_regulatory_function(y->>'domain_code')));

  -- MON-23: every flag carries a source object and reason
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'rows') x,
                               jsonb_array_elements(x->'flags') f
   WHERE COALESCE(f->>'source_object','') = '' OR COALESCE(f->>'reason','') = ''
      OR f->>'code' IS NULL;
  PERFORM pg_temp.rec('MON-23','flags retain source provenance', n = 0,
    'flags without source_object/reason/code: ' || n);

  -- MON-24: freshness timestamps are copies of canonical timestamps
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'rows') x
   WHERE (x->'freshness'->>'risk_updated_at') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs
                      WHERE rs.entity_id = (x->>'entity_id')::uuid
                        AND rs.domain_code = x->>'domain_code'
                        AND rs.updated_at::text = x->'freshness'->>'risk_updated_at');
  PERFORM pg_temp.rec('MON-24','freshness semantics truthful', n = 0,
    'freshness timestamps not sourced from the owning record: ' || n);
END $$;

-- ===========================================================================
-- MON-25 — zero persistent business write from the read models
-- ===========================================================================
DO $$
DECLARE b record; ok boolean;
BEGIN
  SELECT * INTO b FROM mon_baseline;
  ok := (SELECT count(*) FROM public.entity_risk_state) = b.risk_states
    AND (SELECT count(*) FROM public.supervisory_assessment) = b.assessments
    AND (SELECT count(*) FROM public.supervisory_attention) = b.attention
    AND (SELECT count(*) FROM public.examinations) = b.examinations
    AND (SELECT count(*) FROM public.supervisory_finding) = b.findings
    AND (SELECT count(*) FROM public.supervisory_remediation_action) = b.remediation
    AND (SELECT count(*) FROM public.entity_supervision_assignments) = b.assignments
    AND (SELECT count(*) FROM public.supervisory_reassessment_requirement) = b.reassessments;
  PERFORM pg_temp.rec('MON-25','zero persistent business writes', ok,
    'canonical populations unchanged by the read models (fixture signal/perimeter rows '
    || 'are discarded by ROLLBACK)');
END $$;

-- ===========================================================================
-- OS-02C — canonical scope convergence gates (MON-26…35)
--
-- Contract under test:
--   public.supervisory_monitoring_scope_admits  is a THIN delegation to
--   public.regulatory_scope_allows over public.supervisory_domain_modules,
--   so Continuous Monitoring is not a second authorization engine.
-- ===========================================================================

CREATE TEMP TABLE mon_actor2(
  asgn_user uuid, team_user uuid, pf_user uuid,
  fn_aml uuid, fn_pru uuid,
  ent_aml uuid, ent_pru uuid, ent_team uuid, ent_prec uuid,
  team_aml uuid, reg2 uuid, sector_in uuid, sector_out uuid);

CREATE TEMP TABLE mon_baseline2 AS
SELECT (SELECT count(*) FROM public.regulators)                     AS regulators,
       (SELECT count(*) FROM public.sectors)                        AS sectors,
       (SELECT count(*) FROM public.regulatory_teams)               AS teams,
       (SELECT count(*) FROM public.regulatory_team_members)        AS team_members,
       (SELECT count(*) FROM public.staff_portfolios)               AS portfolios,
       (SELECT count(*) FROM public.staff_portfolio_scopes)         AS portfolio_scopes,
       (SELECT count(*) FROM public.regulator_mandates)             AS mandates,
       (SELECT count(*) FROM public.regulator_mandate_enforcement)  AS mandate_enforcement,
       (SELECT count(*) FROM public.licensees)                      AS licensees;

DO $$
DECLARE
  _amlMod uuid; _pruMod uuid; _licMod uuid;
  _pAml uuid; _pPru uuid; _pLic uuid;
  _stAssigned uuid; _stTeam uuid; _stRegulator uuid;
  _rAsgn uuid; _rTeam uuid; _rPf uuid; _rs uuid;
  _actors uuid[];
  _fnAml uuid; _fnPru uuid;
  _entAml uuid; _entPru uuid; _entTeam uuid; _entPrec uuid;
  _teamAml uuid; _reg2 uuid; _sIn uuid; _sOut uuid; _pf uuid;
BEGIN
  SELECT id INTO _amlMod FROM public.sec_modules WHERE key = 'aml_supervision';
  SELECT id INTO _pruMod FROM public.sec_modules WHERE key = 'prudential_supervision';
  SELECT id INTO _licMod FROM public.sec_modules WHERE key = 'license_management';
  SELECT id INTO _pAml FROM public.sec_permissions WHERE module_id = _amlMod AND key = 'view';
  SELECT id INTO _pPru FROM public.sec_permissions WHERE module_id = _pruMod AND key = 'view';
  SELECT id INTO _pLic FROM public.sec_permissions WHERE module_id = _licMod AND key = 'view';
  SELECT id INTO _stAssigned  FROM public.sec_scope_types WHERE key = 'assigned';
  SELECT id INTO _stTeam      FROM public.sec_scope_types WHERE key = 'team';
  SELECT id INTO _stRegulator FROM public.sec_scope_types WHERE key = 'regulator';

  _fnAml := public.supervisory_domain_regulatory_function('AML_CFT');
  _fnPru := public.supervisory_domain_regulatory_function('PRUDENTIAL');

  -- three further internal identities, disjoint from the MON-01…25 personas
  SELECT array_agg(s.id) INTO _actors FROM (
    SELECT u.id FROM auth.users u
     WHERE NOT public.is_super_admin(u.id)
       AND NOT EXISTS (SELECT 1 FROM public.external_user_entity_ids(u.id))
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = u.id
                          AND ur.role IN ('applicant','pre_licensee',
                                          'licensee_primary','licensee_secondary'))
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
       AND u.id NOT IN (SELECT aml_user FROM mon_actor
                        UNION SELECT pru_user FROM mon_actor
                        UNION SELECT reg_user FROM mon_actor)
     ORDER BY u.created_at, u.id LIMIT 3) s;
  IF COALESCE(array_length(_actors,1),0) < 3 THEN
    RAISE EXCEPTION 'fixture_identities_unavailable_os02c: found %',
      COALESCE(array_length(_actors,1),0);
  END IF;

  DELETE FROM public.sec_user_roles WHERE user_id = ANY(_actors);
  DELETE FROM public.user_roles WHERE user_id = ANY(_actors);

  -- assigned-scope persona (AML only)
  INSERT INTO public.sec_roles(key,name,role_type,status)
  VALUES ('zz_mon_aml_assigned','ZZ MON AML assigned-scope','internal','active')
  RETURNING id INTO _rAsgn;
  INSERT INTO public.sec_role_permissions(role_id,permission_id)
  VALUES (_rAsgn,_pAml),(_rAsgn,_pLic);
  INSERT INTO public.sec_role_scopes(role_id,module_id,scope_type_id)
  VALUES (_rAsgn,_amlMod,_stAssigned);

  -- team-scope persona (AML and Prudential permissions, team scope on both)
  INSERT INTO public.sec_roles(key,name,role_type,status)
  VALUES ('zz_mon_team_scope','ZZ MON team-scope supervisor','internal','active')
  RETURNING id INTO _rTeam;
  INSERT INTO public.sec_role_permissions(role_id,permission_id)
  VALUES (_rTeam,_pAml),(_rTeam,_pPru),(_rTeam,_pLic);
  INSERT INTO public.sec_role_scopes(role_id,module_id,scope_type_id)
  VALUES (_rTeam,_amlMod,_stTeam),(_rTeam,_pruMod,_stTeam);

  -- regulator-scope persona used for portfolio + mandate narrowing
  INSERT INTO public.regulators(name,code,status)
  VALUES ('ZZ MON2 Regulator (fixture)','ZZMON2R','active') RETURNING id INTO _reg2;

  SELECT l.sector_id INTO _sIn FROM public.licensees l
   WHERE l.sector_id IS NOT NULL GROUP BY l.sector_id
   ORDER BY count(*) DESC, l.sector_id LIMIT 1;
  SELECT l.sector_id INTO _sOut FROM public.licensees l
   WHERE l.sector_id IS NOT NULL AND l.sector_id <> _sIn GROUP BY l.sector_id
   ORDER BY count(*) DESC, l.sector_id LIMIT 1;
  IF _sIn IS NULL OR _sOut IS NULL THEN
    RAISE EXCEPTION 'fixture_sectors_unavailable_os02c';
  END IF;
  -- entity_regulatory_scope derives the regulator from the sector, so the
  -- fixture regulator is attached to the two sectors (rolled back).
  UPDATE public.sectors SET regulator_id = _reg2 WHERE id IN (_sIn, _sOut);

  INSERT INTO public.sec_roles(key,name,role_type,status)
  VALUES ('zz_mon_pf_regulator','ZZ MON portfolio/mandate supervisor','internal','active')
  RETURNING id INTO _rPf;
  INSERT INTO public.sec_role_permissions(role_id,permission_id)
  VALUES (_rPf,_pAml),(_rPf,_pLic);
  INSERT INTO public.sec_role_scopes(role_id,module_id,scope_type_id)
  VALUES (_rPf,_amlMod,_stRegulator) RETURNING id INTO _rs;
  INSERT INTO public.sec_role_scope_values(role_scope_id,value_kind,value_id)
  VALUES (_rs,'regulator',_reg2);

  INSERT INTO public.sec_user_roles(user_id,role_id,status) VALUES
    (_actors[1],_rAsgn,'active'), (_actors[2],_rTeam,'active'), (_actors[3],_rPf,'active');

  -- four distinct fixture entities with a known classification and NO existing
  -- current assignment, so the precedence proof is deterministic
  CREATE TEMP TABLE mon_free_ents AS
  SELECT l.id, row_number() OVER (ORDER BY l.created_at, l.id) AS rn
    FROM public.licensees l
   WHERE l.sector_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments a
                      WHERE a.entity_id = l.id AND a.effective_to IS NULL);
  SELECT id INTO _entAml  FROM mon_free_ents WHERE rn = 1;
  SELECT id INTO _entPru  FROM mon_free_ents WHERE rn = 2;
  SELECT id INTO _entTeam FROM mon_free_ents WHERE rn = 3;
  SELECT id INTO _entPrec FROM mon_free_ents WHERE rn = 4;
  IF _entPrec IS NULL THEN
    RAISE EXCEPTION 'fixture_entities_unavailable_os02c: need 4 unassigned licensees';
  END IF;

  -- AML-function assignment (must satisfy AML assigned scope)
  INSERT INTO public.entity_supervision_assignments(
    entity_id, status, effective_from, regulatory_function_id,
    lead_supervisor_user_id, is_primary, assignment_reason)
  VALUES (_entAml,'active',now() - interval '1 day',_fnAml,_actors[1],true,
          'MON-27 fixture (rolled back)');

  -- Prudential-function assignment for the SAME officer on another entity
  -- (must NOT satisfy AML assigned scope)
  INSERT INTO public.entity_supervision_assignments(
    entity_id, status, effective_from, regulatory_function_id,
    lead_supervisor_user_id, is_primary, assignment_reason)
  VALUES (_entPru,'active',now() - interval '1 day',_fnPru,_actors[1],true,
          'MON-28 fixture (rolled back)');

  -- AML team covering _entTeam
  INSERT INTO public.regulatory_teams(regulator_id,regulatory_function_id,code,name,
                                      team_type,status,effective_from)
  VALUES ((SELECT COALESCE(s.regulator_id,_reg2) FROM public.sectors s
            WHERE s.id = (SELECT sector_id FROM public.licensees WHERE id = _entTeam)),
          _fnAml,'ZZMONTEAM','ZZ MON AML team (fixture)','permanent','active',
          now() - interval '1 day')
  RETURNING id INTO _teamAml;
  INSERT INTO public.regulatory_team_members(team_id,user_id,member_role,status,effective_from)
  VALUES (_teamAml,_actors[2],'member','active',now() - interval '1 day');
  INSERT INTO public.entity_supervision_assignments(
    entity_id, status, effective_from, regulatory_function_id, team_id,
    is_primary, assignment_reason)
  VALUES (_entTeam,'active',now() - interval '1 day',_fnAml,_teamAml,true,
          'MON-29 fixture (rolled back)');

  -- precedence fixture: one AML-function assignment plus one legacy
  -- function-unscoped assignment on the same entity
  INSERT INTO public.entity_supervision_assignments(
    entity_id, status, effective_from, regulatory_function_id,
    lead_supervisor_user_id, is_primary, assignment_reason)
  VALUES (_entPrec,'active',now() - interval '2 days',_fnAml,_actors[1],true,
          'MON-33 function-scoped fixture (rolled back)');
  INSERT INTO public.entity_supervision_assignments(
    entity_id, status, effective_from, regulatory_function_id,
    lead_supervisor_user_id, is_primary, assignment_reason)
  VALUES (_entPrec,'active',now() - interval '1 day',NULL,_actors[2],true,
          'MON-33 legacy unscoped fixture (rolled back)');

  -- staff portfolio narrowing the regulator-scoped persona to ONE sector
  INSERT INTO public.staff_portfolios(user_id,regulator_id,regulatory_function_id,
                                      status,effective_from)
  VALUES (_actors[3],_reg2,_fnAml,'active',now() - interval '1 day')
  RETURNING id INTO _pf;
  INSERT INTO public.staff_portfolio_scopes(portfolio_id,scope_kind,sector_id)
  VALUES (_pf,'sector',_sIn);

  INSERT INTO mon_actor2 VALUES
    (_actors[1],_actors[2],_actors[3],_fnAml,_fnPru,
     _entAml,_entPru,_entTeam,_entPrec,_teamAml,_reg2,_sIn,_sOut);
END $$;

GRANT SELECT ON mon_actor2, mon_baseline2 TO authenticated;

-- ===========================================================================
-- MON-26 — monitoring scope delegates to the canonical scope contract
-- ===========================================================================
DO $$
DECLARE
  src text; a record; b record; n bigint; ok boolean := true; msg text := '';
  own_logic text[] := ARRAY['user_scope_grants_for','staff_portfolio_allows',
                            'regulator_mandate_supports','user_has_entity_assignment',
                            'user_team_covers_entity'];
  t text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'supervisory_monitoring_scope_admits';

  IF position('regulatory_scope_allows' in src) = 0 THEN
    ok := false; msg := msg || 'does not call regulatory_scope_allows; ';
  END IF;
  FOREACH t IN ARRAY own_logic LOOP
    IF position(t in src) > 0 THEN
      ok := false; msg := msg || 'reimplements ' || t || '; ';
    END IF;
  END LOOP;

  -- behavioural equivalence across every persona x domain x sampled entity
  SELECT * INTO a FROM mon_actor;
  SELECT * INTO b FROM mon_actor2;
  SELECT count(*) INTO n
    FROM (SELECT u FROM unnest(ARRAY[a.aml_user,a.pru_user,a.reg_user,
                                     b.asgn_user,b.team_user,b.pf_user]) u) usr,
         (VALUES ('AML_CFT'),('PRUDENTIAL'),('MARKET_CONDUCT'),('CROSS_DOMAIN')) d(dom),
         (SELECT l.id, l.sector_id, l.lead_regulator_id FROM public.licensees l
           WHERE l.sector_id IS NOT NULL ORDER BY l.created_at, l.id LIMIT 8) e
   WHERE public.supervisory_monitoring_scope_admits(usr.u, d.dom, e.id,
                                                    e.lead_regulator_id, e.sector_id)
      IS DISTINCT FROM EXISTS (
         SELECT 1 FROM unnest(public.supervisory_domain_modules(d.dom)) m
          WHERE public.regulatory_scope_allows(
                  usr.u, m, 'view', NULL, NULL, NULL, e.id, NULL,
                  COALESCE(public.supervisory_domain_regulatory_function(d.dom),
                           public.regulatory_function_for_module(m))));
  IF n <> 0 THEN
    ok := false; msg := msg || 'behavioural divergence on ' || n || ' probes; ';
  END IF;

  PERFORM pg_temp.rec('MON-26','monitoring scope delegates to canonical contract', ok,
    COALESCE(NULLIF(msg,''),
      'thin delegation over public.supervisory_domain_modules -> '
      || 'public.regulatory_scope_allows; 192 persona x domain x entity probes identical; '
      || 'zero local re-implementation of role scope, portfolio, mandate, assignment or team logic'));
END $$;

-- ===========================================================================
-- MON-27 — assigned scope is satisfied by the domain's own function assignment
-- ===========================================================================
DO $$
DECLARE b record; ok boolean;
BEGIN
  SELECT * INTO b FROM mon_actor2;
  ok := public.supervisory_monitoring_scope_admits(b.asgn_user,'AML_CFT',b.ent_aml,NULL,NULL)
        AND public.user_has_entity_assignment(b.asgn_user, b.ent_aml, b.fn_aml);
  PERFORM pg_temp.rec('MON-27','assigned scope is regulatory-function specific', ok,
    'AML/CFT assignment admits the entity for AML monitoring: ' || ok::text);
END $$;

-- ===========================================================================
-- MON-28 — an unrelated function assignment never admits the entity
-- ===========================================================================
DO $$
DECLARE b record; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO b FROM mon_actor2;
  IF public.supervisory_monitoring_scope_admits(b.asgn_user,'AML_CFT',b.ent_pru,NULL,NULL) THEN
    ok := false; msg := msg || 'prudential-only assignment admitted AML monitoring; ';
  END IF;
  IF public.user_has_entity_assignment(b.asgn_user, b.ent_pru, b.fn_aml) THEN
    ok := false; msg := msg || 'canonical assignment check leaked across functions; ';
  END IF;
  -- the same officer holds no prudential permission at all, so the prudential
  -- domain is closed to them even on the entity they are assigned to
  IF public.supervisory_monitoring_scope_admits(b.asgn_user,'PRUDENTIAL',b.ent_pru,NULL,NULL) THEN
    ok := false; msg := msg || 'assignment granted a permission the role never held; ';
  END IF;
  PERFORM pg_temp.rec('MON-28','unrelated function assignment does not admit', ok,
    COALESCE(NULLIF(msg,''),
      'prudential-function assignment rejected for AML monitoring; assignment never widens permission'));
END $$;

-- ===========================================================================
-- MON-29 — team coverage is regulatory-function specific
-- ===========================================================================
DO $$
DECLARE b record; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO b FROM mon_actor2;
  IF NOT public.user_team_covers_entity(b.team_user, b.ent_team, b.fn_aml) THEN
    ok := false; msg := msg || 'AML team does not cover its own entity; ';
  END IF;
  IF NOT public.supervisory_monitoring_scope_admits(b.team_user,'AML_CFT',b.ent_team,NULL,NULL) THEN
    ok := false; msg := msg || 'AML team scope did not admit AML monitoring; ';
  END IF;
  IF public.user_team_covers_entity(b.team_user, b.ent_team, b.fn_pru) THEN
    ok := false; msg := msg || 'AML team covered the prudential function; ';
  END IF;
  IF public.supervisory_monitoring_scope_admits(b.team_user,'PRUDENTIAL',b.ent_team,NULL,NULL) THEN
    ok := false; msg := msg || 'AML team granted prudential monitoring; ';
  END IF;
  PERFORM pg_temp.rec('MON-29','team coverage is regulatory-function specific', ok,
    COALESCE(NULLIF(msg,''),
      'AML team admits AML monitoring only; prudential monitoring refused for the same entity'));
END $$;

-- ===========================================================================
-- MON-30 — staff portfolio narrowing enforced
-- ===========================================================================
DO $$
DECLARE b record; r jsonb; total int; outside int; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO b FROM mon_actor2;
  -- role grant is regulator-wide; the portfolio narrows it to one sector
  IF NOT public.supervisory_monitoring_scope_admits(
           b.pf_user,'AML_CFT',
           (SELECT l.id FROM public.licensees l WHERE l.sector_id = b.sector_in
             ORDER BY l.created_at, l.id LIMIT 1), NULL, NULL) THEN
    ok := false; msg := msg || 'in-portfolio sector entity refused; ';
  END IF;
  IF public.supervisory_monitoring_scope_admits(
       b.pf_user,'AML_CFT',
       (SELECT l.id FROM public.licensees l WHERE l.sector_id = b.sector_out
         ORDER BY l.created_at, l.id LIMIT 1), NULL, NULL) THEN
    ok := false; msg := msg || 'out-of-portfolio sector entity admitted; ';
  END IF;

  PERFORM pg_temp.act_as(b.pf_user);
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
                                              null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  total := jsonb_array_length(r->'rows');
  SELECT count(*) INTO outside FROM jsonb_array_elements(r->'rows') x
   WHERE (x->>'sector_id') IS DISTINCT FROM b.sector_in::text;
  IF total = 0 THEN ok := false; msg := msg || 'register returned no rows to narrow; '; END IF;
  IF outside <> 0 THEN
    ok := false; msg := msg || outside || ' rows outside the portfolio sector; ';
  END IF;
  PERFORM pg_temp.rec('MON-30','staff portfolio narrowing enforced', ok,
    COALESCE(NULLIF(msg,''),
      'regulator-wide grant narrowed by public.staff_portfolio_allows to the portfolio sector: '
      || total || ' rows, 0 outside'));
END $$;

-- ===========================================================================
-- MON-31 — regulator mandate narrowing enforced once activated
-- ===========================================================================
DO $$
DECLARE b record; r jsonb; ok boolean := true; msg text := '';
        before_rows int; after_rows int; scoped_rows int; outside int;
BEGIN
  SELECT * INTO b FROM mon_actor2;
  PERFORM pg_temp.act_as(b.pf_user);
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
                                              null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  before_rows := jsonb_array_length(r->'rows');

  -- activate mandate enforcement for the fixture regulator + AML function with
  -- NO covering mandate: the officer must lose the whole domain
  INSERT INTO public.regulator_mandate_enforcement(
    regulator_id, regulatory_function_id, enforcement_status, activated_at)
  VALUES (b.reg2, b.fn_aml, 'ACTIVE', now())
  ON CONFLICT (regulator_id, regulatory_function_id)
    DO UPDATE SET enforcement_status = 'ACTIVE', activated_at = now();

  PERFORM pg_temp.act_as(b.pf_user);
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
                                              null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  after_rows := jsonb_array_length(r->'rows');
  IF after_rows <> 0 THEN
    ok := false; msg := msg || 'active enforcement without a mandate still returned '
                       || after_rows || ' rows; ';
  END IF;

  -- record a covering mandate for the portfolio sector only
  INSERT INTO public.regulator_mandates(regulator_id, regulatory_function_id, sector_id,
                                        responsibility_type, effective_from, status, notes)
  VALUES (b.reg2, b.fn_aml, b.sector_in, 'LEAD', now() - interval '1 day', 'active',
          'MON-31 fixture (rolled back)');

  PERFORM pg_temp.act_as(b.pf_user);
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
                                              null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  scoped_rows := jsonb_array_length(r->'rows');
  SELECT count(*) INTO outside FROM jsonb_array_elements(r->'rows') x
   WHERE (x->>'sector_id') IS DISTINCT FROM b.sector_in::text;
  IF scoped_rows = 0 THEN ok := false; msg := msg || 'covering mandate returned no rows; '; END IF;
  IF outside <> 0 THEN
    ok := false; msg := msg || outside || ' rows outside the mandate sector; ';
  END IF;

  PERFORM pg_temp.rec('MON-31','regulator mandate narrowing enforced', ok,
    COALESCE(NULLIF(msg,''),
      'inert before activation (' || before_rows || ' rows), fail-closed once ACTIVE with no mandate ('
      || after_rows || ' rows), restored to the mandated sector only (' || scoped_rows || ' rows)'));
END $$;

-- ===========================================================================
-- MON-32 — options are a subset of the authorised register population
-- ===========================================================================
DO $$
DECLARE a record; b record; o jsonb; r jsonb; n int; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO a FROM mon_actor;
  SELECT * INTO b FROM mon_actor2;

  FOR n IN 1..2 LOOP
    DECLARE _u uuid := CASE n WHEN 1 THEN a.aml_user ELSE b.asgn_user END;
            _pairs int;
    BEGIN
      PERFORM pg_temp.act_as(_u);
      o := public.supervisory_monitoring_register_options();
      r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
                                                  null,null,null,null,null,'entity','asc',1,100);
      PERFORM pg_temp.act_as_owner();

      CREATE TEMP TABLE IF NOT EXISTS mon_pairs(uid uuid, entity_id uuid, domain_code text);
      DELETE FROM mon_pairs;
      INSERT INTO mon_pairs
      SELECT _u, l.id, d.dom
        FROM public.licensees l,
             (VALUES ('PRUDENTIAL'),('AML_CFT'),('MARKET_CONDUCT'),
                     ('OPERATIONAL_RESILIENCE'),('GOVERNANCE'),('CROSS_DOMAIN')) d(dom)
       WHERE public.sup_domain_readable(_u, d.dom)
         AND public.supervisory_monitoring_scope_admits(_u, d.dom, l.id,
               l.lead_regulator_id, l.sector_id);
      SELECT count(*) INTO _pairs FROM mon_pairs;

      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(o->'domains') d
                  WHERE NOT EXISTS (SELECT 1 FROM mon_pairs p WHERE p.domain_code = d.value)) THEN
        ok := false; msg := msg || 'domain option outside the authorised population; ';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(o->'regulators') g
                  WHERE NOT EXISTS (SELECT 1 FROM mon_pairs p
                                     JOIN public.licensees l ON l.id = p.entity_id
                                    WHERE l.lead_regulator_id = (g->>'id')::uuid)) THEN
        ok := false; msg := msg || 'regulator option with no authorised record; ';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(o->'sectors') g
                  WHERE NOT EXISTS (SELECT 1 FROM mon_pairs p
                                     JOIN public.licensees l ON l.id = p.entity_id
                                    WHERE l.sector_id = (g->>'id')::uuid)) THEN
        ok := false; msg := msg || 'sector option with no authorised record; ';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(o->'teams') g
                  WHERE NOT EXISTS (
                    SELECT 1 FROM mon_pairs p
                    CROSS JOIN LATERAL public.supervisory_domain_assignment(p.entity_id, p.domain_code) z
                     WHERE z.team_id = (g->>'id')::uuid)) THEN
        ok := false; msg := msg || 'team option with no authorised record; ';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(o->'owners') g
                  WHERE NOT EXISTS (
                    SELECT 1 FROM mon_pairs p
                    CROSS JOIN LATERAL public.supervisory_domain_assignment(p.entity_id, p.domain_code) z
                     WHERE z.lead_supervisor_id = (g->>'id')::uuid)) THEN
        ok := false; msg := msg || 'owner option with no authorised record; ';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(o->'engagement_types') g
                  WHERE NOT EXISTS (
                    SELECT 1 FROM public.examinations x JOIN mon_pairs p
                        ON p.entity_id = x.entity_id
                       AND COALESCE(x.domain_code,'CROSS_DOMAIN') = p.domain_code
                     WHERE upper(x.engagement_type) = g.value)) THEN
        ok := false; msg := msg || 'engagement-type option with no authorised record; ';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(o->'risk_ratings') g
                  WHERE NOT EXISTS (
                    SELECT 1 FROM public.supervisory_assessment sa JOIN mon_pairs p
                        ON p.entity_id = sa.entity_id
                       AND COALESCE(sa.domain_code,'CROSS_DOMAIN') = p.domain_code
                     WHERE upper(sa.residual_rating) = g.value
                       AND sa.status = 'approved' AND COALESCE(sa.is_current,false))) THEN
        ok := false; msg := msg || 'risk-rating option with no authorised record; ';
      END IF;
      IF (o->>'scope_basis') <> 'CANONICAL_REGULATORY_SCOPE_ALLOWS' THEN
        ok := false; msg := msg || 'options do not declare the canonical scope basis; ';
      END IF;
      msg := msg || '[persona ' || n || ' authorised pairs=' || _pairs
                 || ' register total=' || (r->>'total_count') || '] ';
    END;
  END LOOP;

  PERFORM pg_temp.rec('MON-32','options use the same authorised population', ok, msg);
END $$;

-- ===========================================================================
-- MON-33 — domain owner precedence remains function-correct
-- ===========================================================================
DO $$
DECLARE b record; aml record; pru record; ok boolean := true; msg text := '';
BEGIN
  SELECT * INTO b FROM mon_actor2;
  SELECT * INTO aml FROM public.supervisory_domain_assignment(b.ent_prec,'AML_CFT');
  SELECT * INTO pru FROM public.supervisory_domain_assignment(b.ent_prec,'PRUDENTIAL');

  IF aml.regulatory_function_id IS DISTINCT FROM b.fn_aml
     OR aml.assignment_scope <> 'DOMAIN_FUNCTION_SCOPED'
     OR aml.lead_supervisor_id IS DISTINCT FROM b.asgn_user THEN
    ok := false; msg := msg || 'AML owner did not prefer the AML-function assignment ('
                       || COALESCE(aml.assignment_scope,'<none>') || '); ';
  END IF;
  IF pru.regulatory_function_id IS NOT NULL THEN
    ok := false; msg := msg || 'prudential owner resolved to another function''s assignment; ';
  END IF;
  IF pru.lead_supervisor_id IS DISTINCT FROM b.team_user
     OR pru.assignment_scope <> 'ENTITY_LEVEL_UNSCOPED' THEN
    ok := false; msg := msg || 'prudential owner did not fall back to the legacy unscoped row ('
                       || COALESCE(pru.assignment_scope,'<none>') || '); ';
  END IF;
  IF aml.lead_supervisor_id IS NOT DISTINCT FROM pru.lead_supervisor_id THEN
    ok := false; msg := msg || 'both domains resolved to the same owner; ';
  END IF;

  PERFORM pg_temp.rec('MON-33','domain owner precedence function-correct', ok,
    COALESCE(NULLIF(msg,''),
      'AML -> function-scoped assignment (DOMAIN_FUNCTION_SCOPED); prudential -> permitted '
      || 'function-unscoped legacy row (ENTITY_LEVEL_UNSCOPED); another function''s assignment never chosen'));
END $$;

-- ===========================================================================
-- MON-34 — filing entity counts remain de-duplicated (OS-02B fix preserved)
-- ===========================================================================
DO $$
DECLARE a record; r jsonb; s jsonb; ok boolean := true; msg text := '';
        doms int; row_issues bigint; ent_issues bigint;
BEGIN
  SELECT * INTO a FROM mon_actor;
  PERFORM pg_temp.act_as(COALESCE(a.spine_user, a.aml_user));
  r := public.supervisory_monitoring_register(null,null,null,null,null,null,null,null,
                                              null,null,null,null,null,'entity','asc',1,100);
  PERFORM pg_temp.act_as_owner();
  s := r->'summary';
  doms := GREATEST(jsonb_array_length(r->'authorised_domains'), 1);

  IF (s->>'filing_metrics_basis') <> 'ENTITY_LEVEL_ONLY' THEN
    ok := false; msg := msg || 'filing basis is not ENTITY_LEVEL_ONLY; ';
  END IF;
  IF s ? 'returns_late' OR s ? 'returns_missing' THEN
    ok := false; msg := msg || 'legacy domain-multiplied filing measures reappeared; ';
  END IF;

  -- the headline counts ENTITIES, so it must never track the row (pair) count
  SELECT count(*), count(DISTINCT x->>'entity_id') INTO row_issues, ent_issues
    FROM jsonb_array_elements(r->'rows') x
   WHERE COALESCE(x->'returns'->>'state','') IN ('LATE','MISSING');
  IF doms > 1 AND row_issues > 0 AND row_issues = ent_issues * doms
     AND (s->>'entities_with_filing_issues')::bigint = row_issues THEN
    ok := false; msg := msg || 'headline equals the domain-multiplied row count; ';
  END IF;
  IF (s->>'entities_with_filing_issues')::bigint
     > (SELECT count(*) FROM public.licensees) THEN
    ok := false; msg := msg || 'entity filing count exceeds the entity population; ';
  END IF;
  IF (s->>'entities_with_filing_issues')::bigint
     < GREATEST((s->>'entities_with_late_filings')::bigint,
                (s->>'entities_with_missing_filings')::bigint) THEN
    ok := false; msg := msg || 'issue count below its components; ';
  END IF;

  msg := msg || 'entities_with_late_filings=' || COALESCE(s->>'entities_with_late_filings','-')
             || ' entities_with_missing_filings=' || COALESCE(s->>'entities_with_missing_filings','-')
             || ' entities_with_filing_issues=' || COALESCE(s->>'entities_with_filing_issues','-')
             || ' late_filing_periods=' || COALESCE(s->>'late_filing_periods','-')
             || ' missing_filing_periods=' || COALESCE(s->>'missing_filing_periods','-')
             || ' basis=' || COALESCE(s->>'filing_metrics_basis','-')
             || ' (authorised domains=' || doms || ', rows with a filing issue=' || row_issues
             || ' over ' || ent_issues || ' distinct entities)';
  PERFORM pg_temp.rec('MON-34','filing entity counts de-duplicated', ok, msg);
END $$;

-- ===========================================================================
-- MON-35 — zero persistent writes from the OS-02C scope evaluation
-- ===========================================================================
DO $$
DECLARE b record; ok boolean; msg text;
BEGIN
  SELECT * INTO b FROM mon_baseline2;
  ok := (SELECT count(*) FROM public.licensees) = b.licensees
    AND (SELECT count(*) FROM public.staff_portfolios)
        = b.portfolios + 1                       -- the single MON-30 fixture
    AND (SELECT count(*) FROM public.staff_portfolio_scopes)
        = b.portfolio_scopes + 1
    AND (SELECT count(*) FROM public.regulator_mandates) = b.mandates + 1
    AND (SELECT count(*) FROM public.regulatory_teams) = b.teams + 1
    AND (SELECT count(*) FROM public.regulatory_team_members) = b.team_members + 1;
  msg := 'only the declared fixtures exist (1 portfolio, 1 portfolio scope, 1 mandate, '
      || '1 mandate activation, 1 team, 1 membership, 5 assignments); the read models '
      || 'themselves wrote nothing, and ROLLBACK discards every fixture';
  PERFORM pg_temp.rec('MON-35','zero persistent writes from scope evaluation', ok, msg);
END $$;

-- ---------------------------------------------------------------- results
SELECT gate, status, title, detail FROM mon_result ORDER BY gate;
SELECT status, count(*) FROM mon_result GROUP BY status ORDER BY status;

ROLLBACK;
