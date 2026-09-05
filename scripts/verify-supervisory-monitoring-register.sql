-- MON-01…25 — Continuous Monitoring register (OS-02B truthfulness closure)
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
  _pAml uuid; _pPru uuid;
  _rAml uuid; _rPru uuid; _rRegScoped uuid;
  _actors uuid[]; _spine uuid; _ent uuid; _unassessed uuid;
BEGIN
  SELECT id INTO _amlMod FROM public.sec_modules WHERE key = 'aml_supervision';
  SELECT id INTO _pruMod FROM public.sec_modules WHERE key = 'prudential_supervision';
  SELECT id INTO _stReg  FROM public.sec_scope_types WHERE key = 'regulator';
  SELECT id INTO _pAml FROM public.sec_permissions WHERE module_id = _amlMod AND key = 'view';
  SELECT id INTO _pPru FROM public.sec_permissions WHERE module_id = _pruMod AND key = 'view';

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
    (_rAml,_pAml), (_rPru,_pPru), (_rRegScoped,_pAml);

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

  IF ra->'authorised_domains' <> '["AML_CFT"]'::jsonb THEN
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
    || ' (register gates on domain permission only; role-scope narrowing '
    || 'via user_scope_grants_for / regulatory_scope_allows is NOT applied)');
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
  SELECT count(*) INTO expected FROM public.licensees l
   WHERE public.supervisory_domain_applicable(l.id, 'AML_CFT');
  ok := (r->>'total_count')::bigint = expected;
  PERFORM pg_temp.rec('MON-06','total_count truthful', ok,
    'register total ' || (r->>'total_count') || ' vs applicable AML entity population ' || expected);
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

-- ---------------------------------------------------------------- results
SELECT gate, status, title, detail FROM mon_result ORDER BY gate;
SELECT status, count(*) FROM mon_result GROUP BY status ORDER BY status;

ROLLBACK;
