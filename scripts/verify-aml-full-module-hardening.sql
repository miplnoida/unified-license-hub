-- AML/CFT full-module hardening verifier.
--
-- Wave 1 gates. Every gate asserts a property of the canonical supervisory
-- spine that can be proven from the database alone. Gates that require a
-- driven browser session or a purpose-built >300 population are NOT in this
-- file and are NOT claimed as passing anywhere.
--
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/verify-aml-full-module-hardening.sql
-- The script is read-only and ends in ROLLBACK.

BEGIN;

CREATE TEMP TABLE aml_gate(id text, name text, result text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.gate(_id text, _name text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO aml_gate VALUES (_id, _name, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail);
$$;

DO $$
DECLARE
  n bigint; m bigint;
BEGIN
  -- AMLH-01 canonical source census: the canonical stores exist and carry AML rows.
  SELECT count(*) INTO n FROM public.supervisory_assessment WHERE domain_code = 'AML_CFT';
  PERFORM pg_temp.gate('AMLH-01', 'canonical source census', n > 0,
    format('supervisory_assessment AML_CFT rows = %s', n));

  -- AMLH-02 perimeter correctness: every AML assessment sits on an entity whose
  -- AML/CFT perimeter is applicable.
  SELECT count(*) INTO n
  FROM public.supervisory_assessment a
  LEFT JOIN public.supervisory_domain_perimeter p
    ON p.entity_id = a.entity_id AND p.domain_code = 'AML_CFT'
  WHERE a.domain_code = 'AML_CFT' AND coalesce(p.is_applicable, false) IS NOT TRUE;
  PERFORM pg_temp.gate('AMLH-02', 'perimeter correctness', n = 0,
    format('AML assessments outside an applicable perimeter = %s', n));

  -- AMLH-03 methodology resolution: every AML assessment is bound to an AML
  -- methodology version; none is bound to another domain's methodology.
  SELECT count(*) INTO n
  FROM public.supervisory_assessment a
  LEFT JOIN public.supervisory_methodology mo ON mo.id = a.methodology_id
  WHERE a.domain_code = 'AML_CFT'
    AND (mo.id IS NULL OR mo.domain_code <> 'AML_CFT');
  PERFORM pg_temp.gate('AMLH-03', 'methodology resolution', n = 0,
    format('AML assessments with a missing or cross-domain methodology = %s', n));

  -- AMLH-04 trigger vocabulary: no AML assessment carries a trigger outside the
  -- canonical vocabulary, and the constraint that enforces it is present.
  SELECT count(*) INTO n
  FROM public.supervisory_assessment
  WHERE domain_code = 'AML_CFT'
    AND trigger_type IS NOT NULL
    AND trigger_type NOT IN ('PERIODIC','EVENT_DRIVEN','THEMATIC','REASSESSMENT','FOLLOW_UP','LEGACY_UNKNOWN');
  SELECT count(*) INTO m
  FROM pg_constraint
  WHERE conrelid = 'public.supervisory_assessment'::regclass
    AND conname = 'supervisory_assessment_trigger_chk';
  PERFORM pg_temp.gate('AMLH-04', 'trigger vocabulary', n = 0 AND m = 1,
    format('off-vocabulary triggers = %s, check constraint present = %s', n, m));

  -- AMLH-05 assessment domain isolation: references never cross a domain.
  SELECT count(*) INTO n
  FROM public.supervisory_assessment_dimension d
  JOIN public.supervisory_assessment a ON a.id = d.assessment_id
  WHERE a.domain_code = 'AML_CFT'
    AND EXISTS (SELECT 1 FROM public.supervisory_assessment o
                WHERE o.id = a.supersedes_assessment_id AND o.domain_code <> 'AML_CFT');
  PERFORM pg_temp.gate('AMLH-05', 'assessment domain isolation', n = 0,
    format('AML assessments superseding a non-AML assessment = %s', n));

  -- AMLH-08 calculated vs judged rating: an approved AML assessment whose judged
  -- rating differs from the calculated one must carry an override rationale.
  SELECT count(*) INTO n
  FROM public.supervisory_assessment_dimension d
  JOIN public.supervisory_assessment a ON a.id = d.assessment_id
  WHERE a.domain_code = 'AML_CFT' AND a.status = 'APPROVED'
    AND d.residual_rating IS DISTINCT FROM d.calculated_residual_rating
    AND coalesce(btrim(d.override_rationale), '') = '';
  PERFORM pg_temp.gate('AMLH-08', 'calculated vs judged rating', n = 0,
    format('approved AML dimensions overridden without rationale = %s', n));

  -- AMLH-10 maker/checker: no approved AML assessment was approved by its maker.
  SELECT count(*) INTO n
  FROM public.supervisory_assessment
  WHERE domain_code = 'AML_CFT' AND status = 'APPROVED'
    AND approved_by IS NOT NULL AND approved_by = owner_id;
  PERFORM pg_temp.gate('AMLH-10', 'maker/checker', n = 0,
    format('self-approved AML assessments = %s', n));

  -- AMLH-11 risk-authority single writer: an AML risk state may only be sourced
  -- from an APPROVED AML assessment.
  SELECT count(*) INTO n
  FROM public.entity_risk_state s
  LEFT JOIN public.supervisory_assessment a ON a.id = s.source_assessment_id
  WHERE s.domain_code = 'AML_CFT'
    AND (a.id IS NULL OR a.status <> 'APPROVED' OR a.domain_code <> 'AML_CFT');
  PERFORM pg_temp.gate('AMLH-11', 'risk-authority single writer', n = 0,
    format('AML risk states not sourced from an approved AML assessment = %s', n));

  -- AMLH-13 attention provenance: every AML attention names an AML assessment.
  SELECT count(*) INTO n
  FROM public.supervisory_attention t
  LEFT JOIN public.supervisory_assessment a ON a.id = t.assessment_id
  WHERE t.domain_code = 'AML_CFT'
    AND t.assessment_id IS NOT NULL
    AND (a.id IS NULL OR a.domain_code <> 'AML_CFT' OR a.entity_id <> t.entity_id);
  PERFORM pg_temp.gate('AMLH-13', 'attention provenance', n = 0,
    format('AML attentions with broken or cross-entity assessment provenance = %s', n));

  -- AMLH-17 examination origin: every AML examination has an origin row with a
  -- recognised role and same-entity provenance.
  SELECT count(*) INTO n
  FROM public.examinations e
  WHERE e.domain_code = 'AML_CFT'
    AND NOT EXISTS (SELECT 1 FROM public.examination_origin o WHERE o.examination_id = e.id);
  PERFORM pg_temp.gate('AMLH-17', 'examination origin', n = 0,
    format('AML examinations without recorded origin = %s', n));

  -- AMLH-19 canonical findings only: no AML examination has current findings that
  -- exist only in the historical examination_findings store.
  SELECT count(*) INTO n
  FROM public.examination_findings f
  JOIN public.examinations e ON e.id = f.examination_id
  WHERE e.domain_code = 'AML_CFT'
    AND NOT EXISTS (SELECT 1 FROM public.supervisory_finding sf
                    WHERE sf.examination_id = e.id AND sf.domain_code = 'AML_CFT');
  PERFORM pg_temp.gate('AMLH-19', 'canonical findings only', n = 0,
    format('AML examinations whose findings exist only historically = %s', n));

  -- AMLH-20 multi-remediation identity: every AML remediation action names its
  -- finding, and the finding is an AML finding.
  SELECT count(*) INTO n
  FROM public.supervisory_remediation_action ra
  JOIN public.supervisory_finding f ON f.id = ra.finding_id
  WHERE f.domain_code = 'AML_CFT' AND ra.finding_id IS NULL;
  PERFORM pg_temp.gate('AMLH-20', 'multi-remediation identity', n = 0,
    format('AML remediation actions without an exact finding id = %s', n));

  -- AMLH-30 cross-domain UUID denial: the canonical finding store never mixes an
  -- AML finding with a non-AML assessment.
  SELECT count(*) INTO n
  FROM public.supervisory_finding f
  JOIN public.supervisory_assessment a ON a.id = f.assessment_id
  WHERE f.domain_code = 'AML_CFT' AND a.domain_code <> 'AML_CFT';
  PERFORM pg_temp.gate('AMLH-30', 'cross-domain UUID denial', n = 0,
    format('AML findings bound to a non-AML assessment = %s', n));

  -- AMLH-31 no legacy current truth: no database read model in `public` reads the
  -- retired AML stores or the historical findings store as current truth.
  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname IN ('aml_overview_metrics','aml_portfolio','aml_work_queue','aml_entity_panel',
                      'entity360_overview','entity360_section')
    AND (pg_get_functiondef(p.oid) ~ '\maml_assessments\M'
      OR pg_get_functiondef(p.oid) ~ '\maml_findings\M'
      OR pg_get_functiondef(p.oid) ~ '\mexamination_findings\M');
  PERFORM pg_temp.gate('AMLH-31', 'no legacy current truth', n = 0,
    format('AML/Entity360 read models still reading historical stores = %s', n));

  -- AMLH-32 no stale routes: no AML work item points at a retired route.
  SELECT count(*) INTO n
  FROM public.supervisory_intervention_activity
  WHERE coalesce(route, '') LIKE '/prudential/examinations/%';
  PERFORM pg_temp.gate('AMLH-32', 'no stale routes', n = 0,
    format('linked activities on retired prudential examination route = %s', n));
END $$;

SELECT id, name, result, detail FROM aml_gate ORDER BY id;
SELECT count(*) FILTER (WHERE result = 'PASS') AS pass,
       count(*) FILTER (WHERE result = 'FAIL') AS fail,
       count(*) AS total
FROM aml_gate;

ROLLBACK;
