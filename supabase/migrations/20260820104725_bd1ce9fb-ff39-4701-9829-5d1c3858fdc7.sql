CREATE OR REPLACE FUNCTION public.cert_verify_dataset_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts jsonb;
  v_entities jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_cert_entities uuid[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'cert_verify_dataset_v1 requires super admin';
  END IF;

  SELECT array_agg(entity_id) INTO v_cert_entities
  FROM public.certification_seed_manifest
  WHERE record_kind = 'REGULATED_ENTITY';

  /* ---------------- actual counts ---------------- */
  SELECT jsonb_build_object(
    'regulated_entities', (SELECT count(*) FROM public.certification_seed_manifest WHERE record_kind = 'REGULATED_ENTITY'),
    'supporting_organizations', (SELECT count(*) FROM public.certification_seed_manifest WHERE record_kind <> 'REGULATED_ENTITY'),
    'persons', (SELECT count(*) FROM public.persons),
    'applications', (SELECT count(*) FROM public.applications WHERE entity_id = ANY(v_cert_entities)),
    'entity_license_links', (SELECT count(*) FROM public.entity_licenses WHERE entity_id = ANY(v_cert_entities)),
    'entity_license_links_current', (SELECT count(*) FROM public.entity_licenses WHERE entity_id = ANY(v_cert_entities) AND effective_to IS NULL),
    'distinct_licences', (SELECT count(DISTINCT license_id) FROM public.entity_licenses WHERE entity_id = ANY(v_cert_entities)),
    'ownership_rows', (SELECT count(*) FROM public.ownership_interests WHERE owned_entity_id = ANY(v_cert_entities)),
    'ownership_direct_current', (SELECT count(*) FROM public.ownership_interests WHERE owned_entity_id = ANY(v_cert_entities) AND is_direct AND effective_to IS NULL),
    'appointments', (SELECT count(*) FROM public.entity_appointments WHERE entity_id = ANY(v_cert_entities)),
    'appointments_current', (SELECT count(*) FROM public.entity_appointments WHERE entity_id = ANY(v_cert_entities) AND effective_to IS NULL),
    'party_relationships', (SELECT count(*) FROM public.party_relationships),
    'regulatory_requests', (SELECT count(*) FROM public.regulatory_requests),
    'change_sets', (SELECT count(*) FROM public.entity_change_sets),
    'return_definitions', (SELECT count(*) FROM public.return_definitions WHERE is_active),
    'obligation_rules', (SELECT count(*) FROM public.reporting_obligation_rules),
    'entity_obligations', (SELECT count(*) FROM public.entity_reporting_obligations WHERE entity_id = ANY(v_cert_entities)),
    'reporting_periods', (SELECT count(*) FROM public.reporting_periods p
       WHERE EXISTS (SELECT 1 FROM public.entity_reporting_obligations o
                     WHERE o.id = p.entity_reporting_obligation_id AND o.entity_id = ANY(v_cert_entities))),
    'return_filings', (SELECT count(*) FROM public.return_filings WHERE entity_id = ANY(v_cert_entities)),
    'filing_versions', (SELECT count(*) FROM public.return_filing_versions v
       WHERE EXISTS (SELECT 1 FROM public.return_filings f WHERE f.id = v.return_filing_id AND f.entity_id = ANY(v_cert_entities))),
    'regulatory_metrics', (SELECT count(*) FROM public.regulatory_metrics),
    'metric_values', (SELECT count(*) FROM public.return_metric_values),
    'filing_status_distribution', (
      SELECT coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
      FROM (SELECT status, count(*) c FROM public.return_filings
            WHERE entity_id = ANY(v_cert_entities) GROUP BY status) s)
  ) INTO v_counts;

  /* ---------------- per entity ---------------- */
  SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.scenario_key) INTO v_entities
  FROM (
    SELECT m.scenario_key,
           m.display_name,
           l.id AS entity_id,
           (SELECT count(*) FROM public.organizations o WHERE o.id = l.organization_id) AS organization_rows,
           (SELECT count(*) FROM public.entity_identifiers ei WHERE ei.entity_id = l.id) AS identifiers,
           (SELECT count(DISTINCT el.license_id) FROM public.entity_licenses el WHERE el.entity_id = l.id) AS licences,
           (SELECT count(*) FROM public.entity_licenses el WHERE el.entity_id = l.id AND el.effective_to IS NULL) AS licences_current,
           (SELECT count(*) FROM public.entity_appointments a WHERE a.entity_id = l.id) AS appointments,
           (SELECT count(*) FROM public.ownership_interests oi WHERE oi.owned_entity_id = l.id) AS ownership_rows,
           (SELECT coalesce(sum(oi.economic_interest_percentage), 0)
              FROM public.ownership_interests oi
             WHERE oi.owned_entity_id = l.id AND oi.is_direct AND oi.effective_to IS NULL) AS direct_ownership_pct,
           (SELECT count(*) FROM public.applications ap WHERE ap.entity_id = l.id) AS applications,
           (SELECT count(*) FROM public.entity_reporting_obligations o WHERE o.entity_id = l.id) AS obligations,
           (SELECT count(*) FROM public.return_filings f WHERE f.entity_id = l.id) AS filings
    FROM public.certification_seed_manifest m
    JOIN public.licensees l ON l.id = m.entity_id
    WHERE m.record_kind = 'REGULATED_ENTITY'
  ) x;

  /* ---------------- integrity failures ---------------- */
  -- direct ownership must reconcile to 100%
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'ownership_direct_sum_100', 'entity', m.scenario_key,
             'detail', 'direct current economic interest = ' || s.pct::text))
    FROM public.certification_seed_manifest m
    JOIN LATERAL (
      SELECT coalesce(sum(oi.economic_interest_percentage), 0) AS pct
      FROM public.ownership_interests oi
      WHERE oi.owned_entity_id = m.entity_id AND oi.is_direct AND oi.effective_to IS NULL
    ) s ON true
    WHERE m.record_kind = 'REGULATED_ENTITY' AND round(s.pct, 4) <> 100
  ), '[]'::jsonb);

  -- no temporal overlap for the same owner/entity/direct holding
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'ownership_no_temporal_overlap',
             'detail', 'overlapping direct holdings: ' || count(*)::text))
    FROM public.ownership_interests a
    JOIN public.ownership_interests b
      ON b.owned_entity_id = a.owned_entity_id
     AND b.owner_party_id = a.owner_party_id
     AND b.id <> a.id AND b.is_direct AND a.is_direct
     AND a.effective_from < coalesce(b.effective_to, 'infinity'::timestamptz)
     AND b.effective_from < coalesce(a.effective_to, 'infinity'::timestamptz)
    WHERE a.owned_entity_id = ANY(v_cert_entities)
    HAVING count(*) > 0
  ), '[]'::jsonb);

  -- a licence maps to exactly one entity
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'licence_single_entity', 'detail', el.license_id::text))
    FROM public.entity_licenses el
    GROUP BY el.license_id
    HAVING count(DISTINCT el.entity_id) > 1
  ), '[]'::jsonb);

  -- applicants must hold no licence
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'applicant_has_no_licence', 'entity', m.scenario_key,
             'detail', 'licence links = ' || (SELECT count(*) FROM public.entity_licenses el WHERE el.entity_id = m.entity_id)::text))
    FROM public.certification_seed_manifest m
    WHERE m.scenario_key IN ('E18', 'E20')
      AND EXISTS (SELECT 1 FROM public.entity_licenses el WHERE el.entity_id = m.entity_id)
  ), '[]'::jsonb);

  -- every certification application is entity-linked
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'application_entity_id_present',
             'detail', 'applications with null entity_id = ' || count(*)::text))
    FROM public.applications ap
    WHERE ap.entity_id IS NULL
      AND EXISTS (SELECT 1 FROM public.certification_seed_manifest m WHERE m.display_name = ap.entity_name)
    HAVING count(*) > 0
  ), '[]'::jsonb);

  -- seeded business emails on the certification domain
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'email_domain', 'entity', m.scenario_key, 'detail', m.entity_email))
    FROM public.certification_seed_manifest m
    WHERE m.entity_email IS NULL OR m.entity_email NOT LIKE '%@mishainfotech.com'
  ), '[]'::jsonb);

  -- every filing has at least one version
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'filing_has_version', 'detail', f.filing_reference))
    FROM public.return_filings f
    WHERE f.entity_id = ANY(v_cert_entities)
      AND NOT EXISTS (SELECT 1 FROM public.return_filing_versions v WHERE v.return_filing_id = f.id)
  ), '[]'::jsonb);

  -- each regulated entity is backed by an organization + party
  v_failures := v_failures || coalesce((
    SELECT jsonb_agg(jsonb_build_object('check', 'entity_identity_backbone', 'entity', m.scenario_key,
             'detail', 'missing organization or party'))
    FROM public.certification_seed_manifest m
    JOIN public.licensees l ON l.id = m.entity_id
    WHERE m.record_kind = 'REGULATED_ENTITY'
      AND NOT EXISTS (
        SELECT 1 FROM public.organizations o
        JOIN public.parties p ON p.id = o.party_id
        WHERE o.id = l.organization_id)
  ), '[]'::jsonb);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'counts', v_counts,
    'entities', coalesce(v_entities, '[]'::jsonb),
    'failures', v_failures,
    'failure_count', jsonb_array_length(v_failures)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cert_verify_dataset_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_verify_dataset_v1() TO authenticated, service_role;