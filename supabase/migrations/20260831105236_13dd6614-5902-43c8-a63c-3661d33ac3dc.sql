CREATE OR REPLACE FUNCTION public.entity_registry_entity_dto(_entity_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'source', 'LOCAL',
    'entity_id', l.id,
    'legal_name', COALESCE(o.legal_name, l.name),
    'display_name', COALESCE(o.display_name, l.name),
    'lifecycle', ls.key,
    'lifecycle_label', ls.label,
    'identity_status', ist.key,
    'identity_status_label', ist.label,
    'merged_into_entity_id', l.merged_into_entity_id,
    'sector_id', l.sector_id,
    'sector_name', sec.name,
    'sector_code', sec.code,
    'assigned_supervisor_id', l.assigned_supervisor_id,
    'identifiers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', t.key, 'label', t.label, 'value', ei.identifier_value,
        'normalized_value', ei.normalized_value,
        'verification_status', ei.verification_status,
        'is_primary', ei.is_primary) ORDER BY t.sort_order)
      FROM public.entity_identifiers ei
      JOIN public.entity_identifier_types t ON t.id = ei.identifier_type_id
      WHERE ei.entity_id = l.id AND (ei.effective_to IS NULL OR ei.effective_to > now())
    ), '[]'::jsonb),
    'licences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'license_id', lic.id, 'license_number', lic.license_number,
        'license_type', lic.license_type, 'status', lic.status,
        'valid_until', lic.valid_until, 'is_primary', el.is_primary,
        'effective_from', el.effective_from) ORDER BY el.effective_from DESC)
      FROM public.entity_licenses el
      JOIN public.licenses lic ON lic.id = el.license_id
      WHERE el.entity_id = l.id
    ), '[]'::jsonb),
    'external_references', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'external_entity_id', x.external_entity_id,
        'verification_status', x.verification_status,
        'is_authoritative', x.is_authoritative,
        'last_verified_at', x.last_verified_at))
      FROM public.entity_external_references x
      WHERE x.entity_id = l.id AND (x.effective_to IS NULL OR x.effective_to > now())
    ), '[]'::jsonb)
  )
  FROM public.licensees l
  LEFT JOIN public.organizations o ON o.party_id = l.party_id
  LEFT JOIN public.lifecycle_stages ls ON ls.id = l.lifecycle_stage_id
  LEFT JOIN public.entity_identity_statuses ist ON ist.id = l.identity_status_id
  LEFT JOIN public.sectors sec ON sec.id = l.sector_id
  WHERE l.id = _entity_id;
$function$;