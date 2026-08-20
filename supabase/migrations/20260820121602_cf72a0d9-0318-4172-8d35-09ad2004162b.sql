DO $mig$
DECLARE
  src text;
  old_block text;
  new_block text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'cert_verify_dataset_v1' AND pronamespace = 'public'::regnamespace;

  -- 1. repair nested aggregate in the ownership overlap check
  old_block := $old$SELECT jsonb_agg(jsonb_build_object('check', 'ownership_no_temporal_overlap',
             'detail', 'overlapping direct holdings: ' || count(*)::text))
    FROM public.ownership_interests a
    JOIN public.ownership_interests b
      ON b.owned_entity_id = a.owned_entity_id
     AND b.owner_party_id = a.owner_party_id
     AND b.id <> a.id AND b.is_direct AND a.is_direct
     AND a.effective_from < coalesce(b.effective_to, 'infinity'::timestamptz)
     AND b.effective_from < coalesce(a.effective_to, 'infinity'::timestamptz)
    WHERE a.owned_entity_id = ANY(v_cert_entities)
    HAVING count(*) > 0$old$;

  new_block := $new$SELECT jsonb_agg(jsonb_build_object('check', 'ownership_no_temporal_overlap',
             'detail', 'overlapping direct holdings: ' || t.n::text))
    FROM (
      SELECT count(*) AS n
      FROM public.ownership_interests a
      JOIN public.ownership_interests b
        ON b.owned_entity_id = a.owned_entity_id
       AND b.owner_party_id = a.owner_party_id
       AND b.id <> a.id AND b.is_direct AND a.is_direct
       AND a.effective_from < coalesce(b.effective_to, 'infinity'::timestamptz)
       AND b.effective_from < coalesce(a.effective_to, 'infinity'::timestamptz)
      WHERE a.owned_entity_id = ANY(v_cert_entities)
    ) t
    WHERE t.n > 0$new$;

  IF position(old_block in src) = 0 THEN
    RAISE EXCEPTION 'cert_verify_dataset_v1: overlap block not found';
  END IF;
  src := replace(src, old_block, new_block);

  -- 2. add Wave D supervisory telemetry to the counts object
  old_block := $old$    'filing_status_distribution', ($old$;
  new_block := $new$    'supervision_assignments', (SELECT count(*) FROM public.entity_supervision_assignments WHERE entity_id = ANY(v_cert_entities)),
    'supervision_assignments_active', (SELECT count(*) FROM public.entity_supervision_assignments WHERE entity_id = ANY(v_cert_entities) AND status = 'active'),
    'risk_assessments', (SELECT count(*) FROM public.risk_ratings WHERE entity_id = ANY(v_cert_entities)),
    'risk_scores_current', (SELECT count(*) FROM public.entity_risk_scores WHERE entity_id = ANY(v_cert_entities) AND is_current),
    'supervisory_plans', (SELECT count(*) FROM public.supervisory_plans WHERE entity_id = ANY(v_cert_entities)),
    'prudential_assessments', (SELECT count(*) FROM public.prudential_assessments WHERE entity_id = ANY(v_cert_entities)),
    'market_conduct_cases', (SELECT count(*) FROM public.complaints WHERE licensee_id = ANY(v_cert_entities)),
    'aml_assessments', (SELECT count(*) FROM public.aml_assessments WHERE entity_id = ANY(v_cert_entities)),
    'aml_findings', (SELECT count(*) FROM public.aml_findings WHERE entity_id = ANY(v_cert_entities)),
    'resilience_arrangements', (SELECT count(*) FROM public.resilience_arrangements WHERE entity_id = ANY(v_cert_entities)),
    'resilience_incidents', (SELECT count(*) FROM public.resilience_incidents WHERE entity_id = ANY(v_cert_entities)),
    'examinations', (SELECT count(*) FROM public.examinations WHERE entity_id = ANY(v_cert_entities)),
    'examination_findings', (SELECT count(*) FROM public.examination_findings ef
       WHERE EXISTS (SELECT 1 FROM public.examinations e WHERE e.id = ef.examination_id AND e.entity_id = ANY(v_cert_entities))),
    'enforcement_cases', (SELECT count(*) FROM public.enforcement_actions WHERE entity_id = ANY(v_cert_entities)),
    'correspondence_threads', (SELECT count(*) FROM public.correspondence_threads WHERE licensee_id = ANY(v_cert_entities)),
    'entity_documents', (SELECT count(*) FROM public.documents WHERE entity_id = ANY(v_cert_entities)),
    'filing_status_distribution', ($new$;
  src := replace(src, old_block, new_block);

  -- 3. add Wave D integrity checks before the return value
  old_block := $old$  RETURN jsonb_build_object(
    'generated_at', now(),$old$;
  new_block := $new$  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'applicant_has_no_supervision', 'entity', m.scenario_key,
             'detail', 'applicant-stage entity carries post-authorisation supervisory activity'))
    FROM public.certification_seed_manifest m
    WHERE m.scenario_key IN ('E18', 'E20')
      AND (EXISTS (SELECT 1 FROM public.entity_supervision_assignments s WHERE s.entity_id = m.entity_id)
        OR EXISTS (SELECT 1 FROM public.examinations e WHERE e.entity_id = m.entity_id)
        OR EXISTS (SELECT 1 FROM public.enforcement_actions e WHERE e.entity_id = m.entity_id)
        OR EXISTS (SELECT 1 FROM public.aml_assessments a WHERE a.entity_id = m.entity_id))
  ), '[]'::jsonb);

  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'supervisory_records_outside_cohort',
             'detail', t.source || ' rows outside certification cohort = ' || t.n::text))
    FROM (
      SELECT 'entity_supervision_assignments' AS source, count(*) AS n FROM public.entity_supervision_assignments WHERE NOT (entity_id = ANY(v_cert_entities))
      UNION ALL SELECT 'aml_assessments', count(*) FROM public.aml_assessments WHERE NOT (entity_id = ANY(v_cert_entities))
      UNION ALL SELECT 'resilience_arrangements', count(*) FROM public.resilience_arrangements WHERE NOT (entity_id = ANY(v_cert_entities))
      UNION ALL SELECT 'examinations', count(*) FROM public.examinations WHERE entity_id IS NOT NULL AND NOT (entity_id = ANY(v_cert_entities))
      UNION ALL SELECT 'enforcement_actions', count(*) FROM public.enforcement_actions WHERE entity_id IS NOT NULL AND NOT (entity_id = ANY(v_cert_entities))
      UNION ALL SELECT 'risk_ratings', count(*) FROM public.risk_ratings WHERE entity_id IS NOT NULL AND NOT (entity_id = ANY(v_cert_entities))
    ) t
    WHERE t.n > 0
  ), '[]'::jsonb);

  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'aml_finding_has_assessment', 'detail', f.reference))
    FROM public.aml_findings f
    WHERE NOT EXISTS (SELECT 1 FROM public.aml_assessments a WHERE a.id = f.aml_assessment_id)
  ), '[]'::jsonb);

  RETURN jsonb_build_object(
    'generated_at', now(),$new$;
  src := replace(src, old_block, new_block);

  EXECUTE src;
END $mig$;

REVOKE ALL ON FUNCTION public.cert_verify_dataset_v1() FROM PUBLIC, anon, authenticated;