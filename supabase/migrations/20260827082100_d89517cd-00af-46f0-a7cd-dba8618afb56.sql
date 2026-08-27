INSERT INTO public.entity_identifiers (
  entity_id,
  identifier_type_id,
  identifier_value,
  normalized_value,
  uniqueness_scope,
  regulator_id,
  is_primary,
  verification_status,
  effective_from,
  source_type,
  source_reference
)
SELECT
  l.id,
  t.id,
  'REN-' || upper(substr(replace(l.id::text, '-', ''), 1, 8)),
  upper(regexp_replace('REN' || upper(substr(replace(l.id::text, '-', ''), 1, 8)), '[^A-Z0-9]', '', 'g')),
  'REGULATOR',
  COALESCE(l.lead_regulator_id, 'ca6e0616-55a9-48e7-8652-2b19536afb8a'::uuid),
  true,
  CASE st.label
    WHEN 'Verified' THEN 'VERIFIED'
    WHEN 'Provisional' THEN 'PROVISIONAL'
    WHEN 'Disputed' THEN 'DISPUTED'
    ELSE 'UNVERIFIED'
  END,
  now(),
  'LEGACY_BACKFILL',
  'RDM-IDENTIFIER-BACKFILL-2026-08-27'
FROM public.licensees l
CROSS JOIN (
  SELECT id FROM public.entity_identifier_types WHERE key = 'regulatory_entity_number'
) t
LEFT JOIN public.entity_identity_statuses st ON st.id = l.identity_status_id
WHERE l.merged_into_entity_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.entity_identifiers i WHERE i.entity_id = l.id
  );