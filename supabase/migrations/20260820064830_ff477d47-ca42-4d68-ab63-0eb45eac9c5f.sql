
-- Phase 2A · read-only diagnostics + least-privilege on new trigger functions.

REVOKE EXECUTE ON FUNCTION public.party_subtype_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.licensee_entity_domain_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.entity_identifier_normalize() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rdm_entity_foundation_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.rdm_can_read() THEN
    RAISE EXCEPTION 'permission denied: settings.view' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'parties_total', (SELECT count(*) FROM public.parties),
    'organization_parties', (SELECT count(*) FROM public.parties WHERE party_kind = 'ORGANIZATION'),
    'person_parties', (SELECT count(*) FROM public.parties WHERE party_kind = 'PERSON'),
    'regulated_entities_total', (SELECT count(*) FROM public.licensees),
    'entities_without_party_binding', (SELECT count(*) FROM public.licensees WHERE party_id IS NULL),
    'organization_parties_without_entity',
      (SELECT count(*) FROM public.organizations o
        WHERE NOT EXISTS (SELECT 1 FROM public.licensees e WHERE e.party_id = o.party_id)),
    'duplicate_organization_candidates',
      (SELECT count(*) FROM (
         SELECT lower(btrim(legal_name)) FROM public.organizations
         GROUP BY 1 HAVING count(*) > 1) d),
    'entities_without_lifecycle_stage', (SELECT count(*) FROM public.licensees WHERE lifecycle_stage_id IS NULL),
    'entities_without_identity_status', (SELECT count(*) FROM public.licensees WHERE identity_status_id IS NULL),
    'entity_licenses_rows', (SELECT count(*) FROM public.entity_licenses),
    'entities_with_zero_licenses',
      (SELECT count(*) FROM public.licensees e
        WHERE NOT EXISTS (SELECT 1 FROM public.entity_licenses el WHERE el.entity_id = e.id)),
    'entities_with_one_license',
      (SELECT count(*) FROM (SELECT entity_id FROM public.entity_licenses GROUP BY 1 HAVING count(*) = 1) x),
    'entities_with_multiple_licenses',
      (SELECT count(*) FROM (SELECT entity_id FROM public.entity_licenses GROUP BY 1 HAVING count(*) > 1) x),
    'licenses_without_entity_relationship',
      (SELECT count(*) FROM public.licenses l
        WHERE NOT EXISTS (SELECT 1 FROM public.entity_licenses el WHERE el.license_id = l.id)),
    'legacy_license_links_not_represented',
      (SELECT count(*) FROM public.licensees e
        WHERE e.license_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.entity_licenses el
                          WHERE el.entity_id = e.id AND el.license_id = e.license_id)),
    'identifiers_total', (SELECT count(*) FROM public.entity_identifiers),
    'identifiers_by_type',
      COALESCE((SELECT jsonb_object_agg(t.key, c.n) FROM (
          SELECT identifier_type_id, count(*) n FROM public.entity_identifiers GROUP BY 1) c
        JOIN public.entity_identifier_types t ON t.id = c.identifier_type_id), '{}'::jsonb),
    'identifier_scope_conflicts',
      (SELECT count(*) FROM (
         SELECT identifier_type_id, uniqueness_scope, jurisdiction_id, issuer_key, regulator_id, normalized_value
         FROM public.entity_identifiers
         WHERE effective_to IS NULL AND uniqueness_scope <> 'NONE'
         GROUP BY 1,2,3,4,5,6 HAVING count(DISTINCT entity_id) > 1) c),
    'identifiers_missing_required_scope',
      (SELECT count(*) FROM public.entity_identifiers
        WHERE (uniqueness_scope = 'JURISDICTION' AND jurisdiction_id IS NULL)
           OR (uniqueness_scope = 'ISSUER' AND NULLIF(btrim(COALESCE(issuer_key,'')),'') IS NULL)
           OR (uniqueness_scope = 'REGULATOR' AND regulator_id IS NULL)),
    'licenses_without_regulator_scope_identifier',
      (SELECT count(*) FROM public.licenses WHERE regulator_id IS NULL),
    'applications_total', (SELECT count(*) FROM public.applications),
    'applications_mapped_to_entity', (SELECT count(*) FROM public.applications WHERE entity_id IS NOT NULL),
    'applications_ambiguous_entity_mapping', (SELECT count(*) FROM public.applications WHERE entity_id IS NULL),
    'applications_without_pinned_form_version',
      (SELECT count(*) FROM public.applications WHERE form_version_id IS NULL)
  ) INTO v;

  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.rdm_entity_foundation_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rdm_entity_foundation_report() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rdm_diag_duplicate_organizations()
RETURNS TABLE (normalised_name text, org_count integer, party_ids uuid[], legal_names text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.rdm_can_read() THEN
    RAISE EXCEPTION 'permission denied: settings.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT lower(btrim(o.legal_name))::text,
         count(*)::int,
         array_agg(o.party_id ORDER BY o.party_id),
         array_agg(o.legal_name ORDER BY o.party_id)
  FROM public.organizations o
  GROUP BY 1
  HAVING count(*) > 1
  ORDER BY 2 DESC, 1;
END $$;

REVOKE EXECUTE ON FUNCTION public.rdm_diag_duplicate_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rdm_diag_duplicate_organizations() TO authenticated, service_role;
