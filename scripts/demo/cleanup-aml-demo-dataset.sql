-- =============================================================================
-- AML/CFT DEMONSTRATION / QA DATASET — CLEANUP
--
-- Removes everything created by scripts/demo/seed-aml-demo-dataset.sql:
-- all governed supervisory content, the perimeter determinations, the
-- supervision assignments and the 24 demo entities themselves.
--
-- Two records are immutable by platform design and therefore survive:
--   * supervisory_intervention_event rows are append-only, so the demo
--     interventions cannot be deleted — they are CANCELLED, detached and
--     retitled 'SUPERSEDED …' so they never appear in an active queue.
--   * compliance_audit_logs / audit_logs entries are append-only evidence of
--     the operations that were executed. They are never removed.
--
-- Non-production only.
--
-- Run:  psql "$SUPABASE_DB_URL" -X -q -f scripts/demo/cleanup-aml-demo-dataset.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO AML cleanup refused: production environment';
  END IF;
END $$;

DO $$
DECLARE ents uuid[]; asmts uuid[]; exams uuid[]; finds uuid[]; atts uuid[]; plans uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO ents
    FROM public.licensees WHERE name LIKE 'DEMO AML %';
  IF array_length(ents,1) IS NULL THEN
    RAISE NOTICE 'no DEMO AML dataset present';
    RETURN;
  END IF;

  SELECT coalesce(array_agg(id),'{}') INTO asmts
    FROM public.supervisory_assessment WHERE entity_id = ANY(ents);
  SELECT coalesce(array_agg(id),'{}') INTO exams
    FROM public.examinations WHERE entity_id = ANY(ents);
  SELECT coalesce(array_agg(id),'{}') INTO finds
    FROM public.supervisory_finding WHERE entity_id = ANY(ents);
  SELECT coalesce(array_agg(id),'{}') INTO plans
    FROM public.supervisory_plan
    WHERE title LIKE 'DEMO AML %'
       OR id IN (SELECT plan_id FROM public.supervisory_plan_assessment WHERE assessment_id = ANY(asmts));
  SELECT coalesce(array_agg(a.id),'{}') INTO atts
    FROM public.supervisory_attention a
   WHERE a.title LIKE 'DEMO AML %'
      OR a.id IN (SELECT escalated_attention_id FROM public.supervisory_remediation_action
                   WHERE finding_id = ANY(finds) AND escalated_attention_id IS NOT NULL)
      OR a.id IN (SELECT attention_id FROM public.supervisory_attention_origin
                   WHERE assessment_id = ANY(asmts) OR examination_id = ANY(exams));

  PERFORM set_config('app.supervisory_risk_state_writer','assessment_transition', true);
  DELETE FROM public.entity_risk_state_movement           WHERE entity_id = ANY(ents);
  DELETE FROM public.supervisory_reassessment_requirement WHERE entity_id = ANY(ents);
  DELETE FROM public.entity_risk_state                    WHERE entity_id = ANY(ents);
  DELETE FROM public.enforcement_actions                  WHERE entity_id = ANY(ents);
  DELETE FROM public.supervisory_finding                  WHERE id = ANY(finds);
  DELETE FROM public.supervisory_attention_origin
   WHERE attention_id = ANY(atts) OR examination_id = ANY(exams) OR assessment_id = ANY(asmts);
  DELETE FROM public.examination_origin
   WHERE examination_id = ANY(exams) OR attention_id = ANY(atts) OR assessment_id = ANY(asmts);
  DELETE FROM public.supervisory_attention                WHERE id = ANY(atts);
  UPDATE public.supervisory_intervention SET examination_id = NULL
   WHERE licensee_id = ANY(ents) AND examination_id IS NOT NULL;
  DELETE FROM public.examinations                         WHERE id = ANY(exams);
  UPDATE public.supervisory_intervention
     SET status = 'CANCELLED', attention_id = NULL, plan_id = NULL,
         title = CASE WHEN title LIKE 'SUPERSEDED %' THEN title ELSE 'SUPERSEDED ' || title END
   WHERE licensee_id = ANY(ents) AND status <> 'CANCELLED';
  DELETE FROM public.supervisory_plan       WHERE id = ANY(plans);
  DELETE FROM public.supervisory_assessment WHERE id = ANY(asmts);
  DELETE FROM public.supervisory_domain_perimeter WHERE entity_id = ANY(ents);
  PERFORM set_config('app.supervisory_risk_state_writer','', true);

  DELETE FROM public.entity_supervision_assignments WHERE entity_id = ANY(ents);

  -- canonical licence attachments and the demo licences themselves
  -- (license_terms / certificates cascade from public.licenses)
  DELETE FROM public.entity_licenses WHERE entity_id = ANY(ents);
  DELETE FROM public.licenses WHERE license_number LIKE 'FSRA-DEMO-AML-%' OR holder_id = ANY(ents);

  DELETE FROM public.licensees WHERE id = ANY(ents);
  DELETE FROM public.organizations o
   WHERE o.party_id IN (SELECT id FROM public.parties WHERE display_name LIKE 'DEMO AML %');
  DELETE FROM public.parties p
   WHERE p.display_name LIKE 'DEMO AML %'
     AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.party_id = p.id);

  RAISE NOTICE 'DEMO AML dataset removed (% entities)', array_length(ents,1);
END $$;

COMMIT;
