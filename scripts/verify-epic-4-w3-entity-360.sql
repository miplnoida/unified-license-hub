-- =====================================================================
-- EPIC 4 / W3 — FINAL ENTITY 360 CONVERGENCE : CERTIFICATION
-- =====================================================================
-- Certifies the enterprise Entity 360 read model `entity_supervisory_360`
-- against a nine-scenario entity fixture (A-I) and proves the legacy AML
-- block is retired.
--
-- Conventions (identical to Epic 2 / Epic 3):
--   * one transaction, ROLLBACK at the end — no certification data persists;
--   * the read model is exercised as a REAL authenticated internal persona
--     (SET LOCAL ROLE authenticated + request.jwt.claims), never service_role;
--   * every gate RAISEs on failure so ON_ERROR_STOP aborts the run;
--   * no rating is computed by this script: gates compare the read model to
--     the authoritative supervisory records.
--
-- Scenarios:
--   A prudential only              F enforcement in train
--   B AML only                     G reassessment required
--   C conduct active               H approved assessment, no open work
--   D cross-domain elevated        I no assessment, no activity
--   E findings + remediation
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET 1
\pset pager off
SET row_security = on;

\set SUPERVISOR '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}'
\set ENTITYUSER '{"sub":"cf2c227e-52fd-46ff-b751-db30ecd20ec1","role":"authenticated"}'

BEGIN;

CREATE TEMP TABLE w3(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE w3j(k text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT ALL ON w3 TO authenticated;
GRANT ALL ON w3j TO authenticated;

-- --------------------------------------------------------------- fixture ----
DO $$
DECLARE
  _sector uuid := (SELECT id FROM public.sectors WHERE status = 'active' ORDER BY name LIMIT 1);
  _k text;
  _id uuid;
BEGIN
  FOREACH _k IN ARRAY ARRAY['a','b','c','d','e','f','g','h','i'] LOOP
    INSERT INTO public.licensees(name, sector_id, status)
    VALUES ('CERT E4 W3 ' || upper(_k), _sector, 'active')
    RETURNING id INTO _id;
    INSERT INTO w3(k,v) VALUES ('entity_' || _k, _id);
  END LOOP;
END $$;

-- the certification persona supervises every fixture entity
INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id, status,
       assignment_reason)
SELECT v, '0b522724-adcb-48bf-b21d-175339479616', 'active', 'EPIC 4 W3 certification'
FROM w3 WHERE k LIKE 'entity_%';

INSERT INTO w3(k,v) VALUES
  ('meth_prud', (SELECT id FROM public.supervisory_methodology
                  WHERE domain_code='PRUDENTIAL' AND status='ACTIVE'
                  ORDER BY effective_from DESC NULLS LAST LIMIT 1)),
  ('meth_aml',  (SELECT id FROM public.supervisory_methodology
                  WHERE domain_code='AML_CFT' AND status='ACTIVE'
                  ORDER BY effective_from DESC NULLS LAST LIMIT 1)),
  ('meth_cond', (SELECT id FROM public.supervisory_methodology
                  WHERE domain_code='MARKET_CONDUCT' AND status='ACTIVE'
                  ORDER BY effective_from DESC NULLS LAST LIMIT 1));

/* One approved assessment + risk state per scenario domain. The assessment is
   the ONLY thing that may drive a risk state, so each state points at one. */
CREATE OR REPLACE FUNCTION pg_temp.w3_assess(_entity uuid, _domain text, _meth uuid,
        _res text, _inh text, _ctl text, _ref text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.supervisory_assessment(reference, entity_id, domain_code, assessment_type,
         methodology_id, methodology_version, period_start, period_end, trigger_type,
         owner_id, status, residual_rating, inherent_rating, control_rating, summary,
         assessment_date, next_review_date, is_current, approved_by, approved_at,
         origin_provenance)
  VALUES (_ref, _entity, _domain, 'PERIODIC', _meth,
         (SELECT version FROM public.supervisory_methodology WHERE id = _meth),
         current_date - 180, current_date - 30, 'SCHEDULED',
         '0b522724-adcb-48bf-b21d-175339479616', 'approved', _res, _inh, _ctl,
         'Certification fixture assessment for ' || _domain,
         current_date - 20, current_date + 160, true,
         '0b522724-adcb-48bf-b21d-175339479616', now() - interval '20 days',
         'EPIC4_W3_CERTIFICATION')
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_dimension(assessment_id, dimension_code,
         dimension_group, inherent_rating, control_rating, residual_rating, rationale, trend)
  VALUES (_id, 'CERT_DIMENSION', _domain, _inh, _ctl, _res,
          'Fixture dimension rationale', 'STABLE');

  INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating, inherent_rating,
         control_rating, driving_assessment_id, effective_from, last_review_date,
         next_review_date, updated_by)
  VALUES (_entity, _domain, _res, _inh, _ctl, _id, current_date - 20, current_date - 20,
          current_date + 160, '0b522724-adcb-48bf-b21d-175339479616')
  ON CONFLICT (entity_id, domain_code) DO UPDATE
    SET residual_rating = EXCLUDED.residual_rating,
        inherent_rating = EXCLUDED.inherent_rating,
        control_rating = EXCLUDED.control_rating,
        driving_assessment_id = EXCLUDED.driving_assessment_id;

  INSERT INTO public.entity_risk_state_movement(entity_id, domain_code, new_assessment_id,
         previous_rating, new_rating, trend, reason, trigger_kind, approved_by, approved_at)
  VALUES (_entity, _domain, _id, 'MEDIUM', _res,
          CASE WHEN _res IN ('HIGH','SEVERE','MEDIUM_HIGH') THEN 'DETERIORATING' ELSE 'STABLE' END,
          'Certification fixture movement', 'ASSESSMENT_APPROVED',
          '0b522724-adcb-48bf-b21d-175339479616', now() - interval '20 days');
  RETURN _id;
END $$;

DO $$
DECLARE
  a uuid := (SELECT v FROM w3 WHERE k='entity_a');
  b uuid := (SELECT v FROM w3 WHERE k='entity_b');
  c uuid := (SELECT v FROM w3 WHERE k='entity_c');
  d uuid := (SELECT v FROM w3 WHERE k='entity_d');
  e uuid := (SELECT v FROM w3 WHERE k='entity_e');
  f uuid := (SELECT v FROM w3 WHERE k='entity_f');
  g uuid := (SELECT v FROM w3 WHERE k='entity_g');
  h uuid := (SELECT v FROM w3 WHERE k='entity_h');
  mp uuid := (SELECT v FROM w3 WHERE k='meth_prud');
  ma uuid := (SELECT v FROM w3 WHERE k='meth_aml');
  mc uuid := (SELECT v FROM w3 WHERE k='meth_cond');
  fid uuid; rid uuid; aid uuid;
BEGIN
  -- A: prudential only
  PERFORM pg_temp.w3_assess(a,'PRUDENTIAL',mp,'MEDIUM','MEDIUM','MEDIUM','CERT-W3-A-PRU');
  -- B: AML only
  PERFORM pg_temp.w3_assess(b,'AML_CFT',ma,'HIGH','HIGH','MEDIUM','CERT-W3-B-AML');
  -- C: conduct active
  PERFORM pg_temp.w3_assess(c,'MARKET_CONDUCT',mc,'MEDIUM','MEDIUM','MEDIUM','CERT-W3-C-CON');
  -- D: cross-domain elevated in two domains
  PERFORM pg_temp.w3_assess(d,'PRUDENTIAL',mp,'HIGH','HIGH','MEDIUM','CERT-W3-D-PRU');
  PERFORM pg_temp.w3_assess(d,'AML_CFT',ma,'MEDIUM_HIGH','HIGH','MEDIUM','CERT-W3-D-AML');
  -- E: findings + remediation (prudential)
  aid := pg_temp.w3_assess(e,'PRUDENTIAL',mp,'MEDIUM_HIGH','HIGH','MEDIUM','CERT-W3-E-PRU');
  INSERT INTO public.supervisory_finding(reference, entity_id, domain_code, finding_category,
         severity, title, observation, required_action, status, source_kind, assessment_id,
         owner_id, due_date, issued_by, issued_at, origin_provenance)
  VALUES ('CERT-W3-E-F1', e, 'PRUDENTIAL', 'PRUDENTIAL_REQUIREMENT', 'HIGH',
          'Fixture prudential finding', 'Observation', 'Remediate',
          'REMEDIATION_REQUIRED', 'ASSESSMENT', aid,
          '0b522724-adcb-48bf-b21d-175339479616', current_date + 20,
          '0b522724-adcb-48bf-b21d-175339479616', now(), 'EPIC4_W3_CERTIFICATION')
  RETURNING id INTO fid;
  INSERT INTO public.supervisory_remediation_action(reference, finding_id, entity_id, domain_code,
         description, required_outcome, owner_id, target_date, status)
  VALUES ('CERT-W3-E-R1', fid, e, 'PRUDENTIAL', 'Fixture remediation', 'Outcome',
          '0b522724-adcb-48bf-b21d-175339479616', current_date - 5, 'IN_PROGRESS');
  -- F: enforcement in train, linked to a canonical finding
  aid := pg_temp.w3_assess(f,'PRUDENTIAL',mp,'HIGH','HIGH','WEAK','CERT-W3-F-PRU');
  INSERT INTO public.supervisory_finding(reference, entity_id, domain_code, finding_category,
         severity, title, observation, required_action, status, source_kind, assessment_id,
         owner_id, due_date, issued_by, issued_at, origin_provenance)
  VALUES ('CERT-W3-F-F1', f, 'PRUDENTIAL', 'PRUDENTIAL_REQUIREMENT', 'CRITICAL',
          'Fixture escalated finding', 'Observation', 'Remediate',
          'REMEDIATION_REQUIRED', 'ASSESSMENT', aid,
          '0b522724-adcb-48bf-b21d-175339479616', current_date - 10,
          '0b522724-adcb-48bf-b21d-175339479616', now(), 'EPIC4_W3_CERTIFICATION')
  RETURNING id INTO fid;
  INSERT INTO public.enforcement_actions(entity_id, case_number, enforcement_type, date_opened,
         status, description, supervisory_finding_id, opened_by, stage, severity, source_kind)
  VALUES (f, 'CERT-W3-F-E1', 'directive', current_date - 3, 'open',
          'Fixture enforcement', fid, '0b522724-adcb-48bf-b21d-175339479616',
          'NOTICE', 'HIGH', 'SUPERVISORY_FINDING');
  -- G: reassessment required
  aid := pg_temp.w3_assess(g,'AML_CFT',ma,'MEDIUM','MEDIUM','MEDIUM','CERT-W3-G-AML');
  INSERT INTO public.supervisory_reassessment_requirement(entity_id, domain_code, trigger_kind,
         trigger_rationale, requested_type, previous_assessment_id, due_date, owner_id, status)
  VALUES (g, 'AML_CFT', 'FINDING_SEVERITY', 'Fixture reassessment trigger', 'TARGETED',
          aid, current_date + 30, '0b522724-adcb-48bf-b21d-175339479616', 'REQUIRED');
  -- H: approved assessment, nothing open
  PERFORM pg_temp.w3_assess(h,'PRUDENTIAL',mp,'LOW','LOW','STRONG','CERT-W3-H-PRU');
  -- I: intentionally untouched (no assessment, no activity)
END $$;

-- ------------------------------------------------------------ read model ----
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', :'SUPERVISOR', true);

INSERT INTO w3j(k,j)
SELECT k, public.entity_supervisory_360(v) FROM w3 WHERE k LIKE 'entity_%';

RESET ROLE;

-- ----------------------------------------------------------------- gates ----
DO $$
DECLARE
  ja jsonb := (SELECT j FROM w3j WHERE k='entity_a');
  jb jsonb := (SELECT j FROM w3j WHERE k='entity_b');
  jc jsonb := (SELECT j FROM w3j WHERE k='entity_c');
  jd jsonb := (SELECT j FROM w3j WHERE k='entity_d');
  je jsonb := (SELECT j FROM w3j WHERE k='entity_e');
  jf jsonb := (SELECT j FROM w3j WHERE k='entity_f');
  jg jsonb := (SELECT j FROM w3j WHERE k='entity_g');
  jh jsonb := (SELECT j FROM w3j WHERE k='entity_h');
  ji jsonb := (SELECT j FROM w3j WHERE k='entity_i');
  dom jsonb;
  n int;
BEGIN
  -- W3-01 every fixture entity resolves, with all six domains present
  IF EXISTS (SELECT 1 FROM w3j WHERE k LIKE 'entity_%' AND (j->>'found')::boolean IS NOT TRUE) THEN
    RAISE EXCEPTION 'W3-01 FAIL: a fixture entity did not resolve in the read model';
  END IF;
  IF EXISTS (SELECT 1 FROM w3j WHERE k LIKE 'entity_%'
             AND jsonb_array_length(j->'domains') <> 6) THEN
    RAISE EXCEPTION 'W3-01 FAIL: the read model must always return six risk domains';
  END IF;

  -- W3-02 A is prudential only: exactly one domain assessed
  IF (ja->'summary'->>'domains_assessed')::int <> 1 THEN
    RAISE EXCEPTION 'W3-02 FAIL: entity A should show one assessed domain, got %',
      ja->'summary'->>'domains_assessed';
  END IF;
  SELECT e INTO dom FROM jsonb_array_elements(ja->'domains') e WHERE e->>'domain_code'='AML_CFT';
  IF (dom->>'is_assessed')::boolean OR dom->>'residual_rating' IS NOT NULL THEN
    RAISE EXCEPTION 'W3-02 FAIL: unassessed AML domain leaked a rating for entity A';
  END IF;

  -- W3-03 "no assessment" is never presented as low risk
  IF (ji->'summary'->>'domains_assessed')::int <> 0
     OR ji->'summary'->>'highest_material_risk' IS NOT NULL THEN
    RAISE EXCEPTION 'W3-03 FAIL: entity I with no assessment must not carry a risk position';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(ji->'domains') e
             WHERE e->>'residual_rating' IS NOT NULL) THEN
    RAISE EXCEPTION 'W3-03 FAIL: entity I shows a residual rating without an assessment';
  END IF;

  -- W3-04 the rating is explained by the assessment that drives the risk state
  SELECT e INTO dom FROM jsonb_array_elements(jb->'domains') e WHERE e->>'domain_code'='AML_CFT';
  IF dom->'driving_assessment' IS NULL OR dom->'driving_assessment' = 'null'::jsonb THEN
    RAISE EXCEPTION 'W3-04 FAIL: no driving assessment exposed for entity B AML';
  END IF;
  IF (dom->'driving_assessment'->>'is_driving_risk_state')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'W3-04 FAIL: driving assessment not flagged as driving the risk state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs
                  WHERE rs.entity_id = (SELECT v FROM w3 WHERE k='entity_b')
                    AND rs.domain_code = 'AML_CFT'
                    AND rs.driving_assessment_id = (dom->'driving_assessment'->>'id')::uuid) THEN
    RAISE EXCEPTION 'W3-04 FAIL: exposed driving assessment is not the risk state provenance';
  END IF;
  IF dom->'driving_assessment'->'methodology'->>'code' IS NULL THEN
    RAISE EXCEPTION 'W3-04 FAIL: methodology provenance missing from the driving assessment';
  END IF;
  IF jsonb_array_length(dom->'material_dimensions') = 0 THEN
    RAISE EXCEPTION 'W3-04 FAIL: material dimension evidence missing for a HIGH rating';
  END IF;

  -- W3-05 what has changed: prior rating and trend come from approved movement history
  IF dom->>'prior_rating' IS DISTINCT FROM 'MEDIUM' THEN
    RAISE EXCEPTION 'W3-05 FAIL: prior rating not read from risk movement history (got %)',
      dom->>'prior_rating';
  END IF;
  IF dom->>'trend' IS DISTINCT FROM 'DETERIORATING' THEN
    RAISE EXCEPTION 'W3-05 FAIL: trend not read from risk movement history (got %)', dom->>'trend';
  END IF;

  -- W3-06 cross-domain risk is a judgment, never an arithmetic average
  IF (jd->'summary'->>'cross_domain_concern_present')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'W3-06 FAIL: two elevated domains did not raise a cross-domain concern';
  END IF;
  IF jd->'summary'->>'highest_material_risk' <> 'MEDIUM_HIGH'
     AND jd->'summary'->>'highest_material_risk' <> 'HIGH' THEN
    RAISE EXCEPTION 'W3-06 FAIL: cross-domain summary lost the highest material domain rating';
  END IF;
  SELECT e INTO dom FROM jsonb_array_elements(jd->'domains') e WHERE e->>'domain_code'='CROSS_DOMAIN';
  IF (dom->>'is_assessed')::boolean THEN
    RAISE EXCEPTION 'W3-06 FAIL: a cross-domain rating was synthesised without an assessment';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(jd->'domains') e
       WHERE e->>'residual_rating' IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'W3-06 FAIL: per-domain assessments were merged instead of preserved';
  END IF;

  -- W3-07 findings and remediation reconcile with the canonical records
  SELECT e INTO dom FROM jsonb_array_elements(je->'domains') e WHERE e->>'domain_code'='PRUDENTIAL';
  IF (dom->>'open_findings')::int <> 1 OR (dom->>'high_findings')::int <> 1 THEN
    RAISE EXCEPTION 'W3-07 FAIL: prudential finding counts do not reconcile (%)', dom;
  END IF;
  IF (dom->>'overdue_remediation')::int <> 1
     OR jsonb_array_length(dom->'overdue_remediation_items') <> 1 THEN
    RAISE EXCEPTION 'W3-07 FAIL: overdue remediation not surfaced for entity E';
  END IF;
  IF (je->'summary'->>'open_findings')::int <>
     (SELECT count(*) FROM public.supervisory_finding f
       WHERE f.entity_id = (SELECT v FROM w3 WHERE k='entity_e')
         AND upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')) THEN
    RAISE EXCEPTION 'W3-07 FAIL: summary finding count does not reconcile with the record';
  END IF;

  -- W3-08 enforcement is exposed with its supervisory provenance
  SELECT e INTO dom FROM jsonb_array_elements(jf->'domains') e WHERE e->>'domain_code'='PRUDENTIAL';
  IF jsonb_array_length(dom->'active_enforcement') <> 1 THEN
    RAISE EXCEPTION 'W3-08 FAIL: linked enforcement not shown in its supervisory domain';
  END IF;
  IF dom->'active_enforcement'->0->>'supervisory_finding_id' IS NULL THEN
    RAISE EXCEPTION 'W3-08 FAIL: enforcement shown without finding provenance';
  END IF;
  IF (jf->'summary'->>'critical_findings')::int <> 1 THEN
    RAISE EXCEPTION 'W3-08 FAIL: critical finding not counted in the summary';
  END IF;

  -- W3-09 an outstanding reassessment requirement is visible
  SELECT e INTO dom FROM jsonb_array_elements(jg->'domains') e WHERE e->>'domain_code'='AML_CFT';
  IF (dom->>'reassessment_required')::boolean IS NOT TRUE
     OR jsonb_array_length(dom->'reassessment') = 0 THEN
    RAISE EXCEPTION 'W3-09 FAIL: required reassessment not surfaced for entity G';
  END IF;
  IF (jg->'summary'->>'reassessment_required')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'W3-09 FAIL: reassessment requirement missing from the entity summary';
  END IF;

  -- W3-10 the next action is the canonical work item, with a stated reason
  IF jf->'next_action' IS NULL OR jf->'next_action' = 'null'::jsonb THEN
    RAISE EXCEPTION 'W3-10 FAIL: no next supervisory action derived for entity F';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_work_item w
                  WHERE w.work_key = jf->'next_action'->>'work_key'
                    AND w.entity_id = (SELECT v FROM w3 WHERE k='entity_f')) THEN
    RAISE EXCEPTION 'W3-10 FAIL: next action is not a canonical work item';
  END IF;
  IF COALESCE(jf->'next_action'->>'reason','') = '' THEN
    RAISE EXCEPTION 'W3-10 FAIL: next action is not explainable (no reason)';
  END IF;
  IF ji->'next_action' IS NOT NULL AND ji->'next_action' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'W3-10 FAIL: an entity with no activity must have no next action';
  END IF;

  -- W3-11 every drill-through target is a real application route family
  SELECT count(*) INTO n
    FROM w3j x, jsonb_array_elements(x.j->'domains') d,
         LATERAL (SELECT jsonb_path_query_array(d, '$.**.route') r) q,
         jsonb_array_elements_text(q.r) route
   WHERE route NOT LIKE '/prudential/%' AND route NOT LIKE '/conduct/%'
     AND route NOT LIKE '/supervision/%' AND route NOT LIKE '/enforcement/%'
     AND route NOT LIKE '/entities/%' AND route NOT LIKE '/complaints%'
     AND route NOT LIKE '/licensing/%' AND route NOT LIKE '/admin/%'
     AND route <> '/my-work';
  IF n > 0 THEN
    RAISE EXCEPTION 'W3-11 FAIL: % drill-through route(s) point outside the known route families', n;
  END IF;

  -- W3-12 restricted-matter signalling is present without disclosing content
  IF jf->'summary'->>'restricted_matter_present' IS NULL THEN
    RAISE EXCEPTION 'W3-12 FAIL: restricted matter signal missing from the summary';
  END IF;

  -- W3-13 domain isolation: prudential work does not bleed into other domains
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(je->'domains') e
              WHERE e->>'domain_code' <> 'PRUDENTIAL' AND (e->>'open_findings')::int > 0) THEN
    RAISE EXCEPTION 'W3-13 FAIL: prudential findings counted against another domain';
  END IF;

  -- W3-14 a clean entity shows no outstanding work but keeps its rating
  SELECT e INTO dom FROM jsonb_array_elements(jh->'domains') e WHERE e->>'domain_code'='PRUDENTIAL';
  IF dom->>'residual_rating' IS DISTINCT FROM 'LOW' THEN
    RAISE EXCEPTION 'W3-14 FAIL: approved LOW rating not preserved for entity H';
  END IF;
  IF (jh->'summary'->>'open_findings')::int <> 0
     OR (jh->'summary'->>'overdue_remediation')::int <> 0 THEN
    RAISE EXCEPTION 'W3-14 FAIL: entity H should have nothing outstanding';
  END IF;

  -- W3-15 conduct participates on the same contract as the other domains
  SELECT e INTO dom FROM jsonb_array_elements(jc->'domains') e
   WHERE e->>'domain_code'='MARKET_CONDUCT';
  IF (dom->>'is_assessed')::boolean IS NOT TRUE
     OR dom->'driving_assessment'->>'reference' <> 'CERT-W3-C-CON' THEN
    RAISE EXCEPTION 'W3-15 FAIL: market conduct does not use the canonical assessment contract';
  END IF;

  RAISE NOTICE 'W3 read-model gates 01-15 PASS';
END $$;

-- W3-16 the legacy AML block is retired: the section read model returns no rows
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', :'SUPERVISOR', true);
DO $$
DECLARE r jsonb;
BEGIN
  r := public.entity360_section((SELECT v FROM w3 WHERE k='entity_b'), 'aml');
  IF jsonb_array_length(COALESCE(r->'rows','[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'W3-16 FAIL: the legacy Entity 360 AML block still returns rows';
  END IF;
  RAISE NOTICE 'W3-16 PASS: legacy AML block retired';
END $$;

-- W3-17 the read model refuses non-internal callers
SELECT set_config('request.jwt.claims', :'ENTITYUSER', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.entity_supervisory_360((SELECT v FROM w3 WHERE k='entity_a'));
    RAISE EXCEPTION 'W3-17 FAIL: a licensee user was able to read the supervisory read model';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'W3-17 PASS: external user denied';
  END;
END $$;
RESET ROLE;

-- W3-18 the read model is SECURITY INVOKER (it must not bypass RLS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='entity_supervisory_360' AND p.prosecdef) THEN
    RAISE EXCEPTION 'W3-18 FAIL: entity_supervisory_360 must be SECURITY INVOKER';
  END IF;
  RAISE NOTICE 'W3-18 PASS: read model runs under caller privileges';
END $$;

ROLLBACK;
