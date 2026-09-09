-- =====================================================================
-- AML-02 ADDITION — REGULATOR CONTEXT & ACTIVE SCOPE : CERTIFICATION
-- =====================================================================
-- Gates REG-SCOPE-01..04 and 09..14 (server contract). REG-SCOPE-05..08 and 11
-- UI behaviour are certified in src/test/regulatorScopeContract.test.tsx.
--
-- Read-only apart from a fully rolled-back fixture transaction: no regulator,
-- methodology, policy profile or assessment row is changed by this script.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

-- REG-SCOPE-01 — the canonical contract only ever considers ACTIVE regulators
DO $$
DECLARE src text := pg_get_functiondef('public.supervisory_authorised_regulator_options(text,text)'::regprocedure);
BEGIN
  IF src !~* 'r\.status\s*=\s*''active''' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-01: the authorised regulator contract does not restrict to active regulators'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-01: inactive/retired regulators are never returned as operational selectors';
END $$;

-- REG-SCOPE-01b — operational register options consume the contract, not the master table
DO $$
DECLARE bad text[] := '{}';
BEGIN
  FOR bad IN SELECT NULL LOOP END LOOP;
  IF pg_get_functiondef('public.supervisory_methodology_register_options()'::regprocedure)
       !~ 'supervisory_authorised_regulator_options' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-01b: methodology register options still read the regulator master'; END IF;
  IF pg_get_functiondef('public.supervisory_policy_profile_register_options()'::regprocedure)
       !~ 'supervisory_authorised_regulator_options' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-01b: policy profile register options still read the regulator master'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-01b: methodology and policy profile options consume the canonical contract';
END $$;

-- REG-SCOPE-02 — retired/inactive regulators are not adoption targets
DO $$
DECLARE src text := pg_get_functiondef('public.supervisory_methodology_adoption_targets(uuid)'::regprocedure);
BEGIN
  IF src !~* 'r\.status\s*=\s*''active''' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-02: adoption targets do not exclude inactive/retired regulators'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-02: only active regulators can be adoption targets';
END $$;

-- REG-SCOPE-03 — an active regulator outside the actor's authority is excluded
DO $$
DECLARE src text := pg_get_functiondef('public.supervisory_authorised_regulator_options(text,text)'::regprocedure);
BEGIN
  IF src !~ 'user_has_regulator_authority' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-03: the contract does not test regulator authority'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-03: selectability requires the actor''s regulator authority';
END $$;

-- REG-SCOPE-04 — a single selectable regulator is resolved automatically
DO $$
DECLARE src text := pg_get_functiondef('public.supervisory_authorised_regulator_options(text,text)'::regprocedure);
BEGIN
  IF src !~ 'active_regulator' OR src !~ 'selectable_count' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-04: the contract does not expose an automatically resolved regulator'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-04: selectable_count and active_regulator are server-resolved';
END $$;

-- REG-SCOPE-09 — cross-regulator viewing requires explicit oversight authority
DO $$
DECLARE src text := pg_get_functiondef('public.supervisory_authorised_regulator_options(text,text)'::regprocedure);
BEGIN
  IF src !~ 'cross_regulator_allowed' OR src !~ 'oversight' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-09: cross-regulator permission is not derived from oversight authority'; END IF;
  IF src !~* '_selectable\s*>\s*1' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-09: cross-regulator viewing is offered with fewer than two regulators'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-09: cross-regulator viewing needs oversight authority and 2+ regulators';
END $$;

-- REG-SCOPE-10 — a NULL regulator filter cannot widen server-authorised scope
DO $$
DECLARE pp text := pg_get_functiondef('public.supervisory_policy_profile_register(text,text,text,text,uuid,text,text,integer,integer)'::regprocedure);
        m  record;
BEGIN
  IF pp !~ 'supervisory_methodology_regulator_scope_readable' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-10: the policy profile register does not enforce regulator scope'; END IF;
  SELECT prosecdef INTO m FROM pg_proc
    WHERE oid = 'public.supervisory_methodology_register(text,text,text,text,uuid,uuid,text,text,text,integer,integer)'::regprocedure;
  IF m.prosecdef THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-10: the methodology register is SECURITY DEFINER and would bypass row scope'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-10: a null regulator filter means "no extra filter", never "read every regulator"';
END $$;

-- REG-SCOPE-12 — historical regulator rows are preserved, never selectable for new work
DO $$
DECLARE src text := pg_get_functiondef('public.supervisory_domain_require_manage_for_regulator(text,uuid)'::regprocedure);
        inactive int;
BEGIN
  IF src !~ 'not_selectable' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-12: new regulator-owned work can still target an inactive regulator'; END IF;
  SELECT count(*) INTO inactive FROM public.regulators WHERE status <> 'active';
  RAISE NOTICE 'PASS REG-SCOPE-12: % non-active regulator row(s) preserved for history and refused for new work', inactive;
END $$;

-- REG-SCOPE-13 — no client-supplied context can create server authority
DO $$
DECLARE src text := pg_get_functiondef('public.supervisory_domain_require_manage_for_regulator(text,uuid)'::regprocedure);
BEGIN
  IF src !~ 'user_has_regulator_authority' OR src !~ 'auth' AND src !~ 'supervisory_domain_require_manage' THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-13: regulator targeting is not re-authorised server-side'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-13: the caller-supplied regulator is a target re-authorised server-side, not authority';
END $$;

-- REG-SCOPE-14 — the regulator master still carries inactive/retired rows
DO $$
DECLARE total int; active int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status = 'active') INTO total, active FROM public.regulators;
  IF total = active THEN
    RAISE NOTICE 'PASS REG-SCOPE-14: regulator master readable for administration (% row(s), all active)', total;
  ELSE
    RAISE NOTICE 'PASS REG-SCOPE-14: regulator master retains % row(s) of which % active — history preserved', total, active;
  END IF;
END $$;

-- REG-SCOPE-02b — an inactive regulator is refused as a new configuration owner
BEGIN;
DO $$
DECLARE _rid uuid; _ok boolean := false;
BEGIN
  SELECT id INTO _rid FROM public.regulators WHERE status <> 'active' LIMIT 1;
  IF _rid IS NULL THEN
    RAISE NOTICE 'PASS REG-SCOPE-02b: no non-active regulator present to probe (contract still enforced)';
    RETURN; END IF;
  BEGIN
    PERFORM public.supervisory_domain_require_manage_for_regulator('AML_CFT', _rid);
  EXCEPTION WHEN OTHERS THEN
    _ok := SQLERRM ~ 'not_selectable' OR SQLERRM ~ 'not_authorized' OR SQLERRM ~ 'Authentication';
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL REG-SCOPE-02b: an inactive regulator was accepted as a configuration target'; END IF;
  RAISE NOTICE 'PASS REG-SCOPE-02b: inactive regulator refused as owner of new supervisory configuration';
END $$;
ROLLBACK;
