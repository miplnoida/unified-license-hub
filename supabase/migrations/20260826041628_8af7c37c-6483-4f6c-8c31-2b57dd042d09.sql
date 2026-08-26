CREATE OR REPLACE FUNCTION public.entity_structure_overview(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (
    public.has_permission(v_uid, 'entity_membership', 'view')
    OR public.has_permission(v_uid, 'license_management', 'view')
    OR EXISTS (SELECT 1 FROM public.entity_user_memberships m
                WHERE m.user_id = v_uid AND m.entity_id = _entity_id AND m.status = 'APPROVED')
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'entity_id', l.id,
    'name', l.name,
    'party_id', l.party_id,
    'sector_id', l.sector_id,
    'sub_sector_id', l.sub_sector_id,
    'category_id', l.category_id,
    'status', l.status,
    'lifecycle_stage_id', l.lifecycle_stage_id,
    'identity_status_id', l.identity_status_id,
    'merged_into_entity_id', l.merged_into_entity_id,
    'structure_version', l.structure_version,
    'publication_policy_id', l.publication_policy_id,
    'publication_policy', (SELECT p.key FROM public.registry_publication_policies p WHERE p.id = l.publication_policy_id),
    'publication_policy_label', (SELECT p.label FROM public.registry_publication_policies p WHERE p.id = l.publication_policy_id),
    'licences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('license_id', el.license_id, 'is_primary', el.is_primary,
                                          'effective_from', el.effective_from, 'effective_to', el.effective_to)
             ORDER BY el.effective_from DESC)
      FROM public.entity_licenses el WHERE el.entity_id = l.id), '[]'::jsonb),
    'ownership_count', (SELECT count(*) FROM public.ownership_interests o WHERE o.owned_entity_id = l.id AND o.effective_to IS NULL),
    'controller_count', (SELECT count(*) FROM public.ownership_interests o WHERE o.owned_entity_id = l.id AND o.effective_to IS NULL AND o.is_controller),
    'ubo_count', (SELECT count(*) FROM public.ownership_interests o WHERE o.owned_entity_id = l.id AND o.effective_to IS NULL AND o.is_ubo),
    'relationship_count', (SELECT count(*) FROM public.party_relationships r WHERE r.entity_id = l.id AND r.effective_to IS NULL),
    'board_count', (SELECT count(*) FROM public.entity_appointments a JOIN public.role_types rt ON rt.id = a.role_type_id
                     WHERE a.entity_id = l.id AND a.effective_to IS NULL AND rt.is_governance),
    'key_function_count', (SELECT count(*) FROM public.entity_appointments a JOIN public.role_types rt ON rt.id = a.role_type_id
                     WHERE a.entity_id = l.id AND a.effective_to IS NULL AND NOT rt.is_governance),
    'open_requests', (SELECT count(*) FROM public.regulatory_requests r WHERE r.entity_id = l.id AND r.status NOT IN ('CLOSED','REJECTED','WITHDRAWN')),
    'pending_change_sets', (SELECT count(*) FROM public.entity_change_sets cs WHERE cs.entity_id = l.id AND cs.status NOT IN ('APPLIED','REJECTED','WITHDRAWN')),
    'names', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', n.name, 'name_type', n.name_type, 'is_current', n.is_current,
                                          'effective_from', n.effective_from, 'effective_to', n.effective_to)
             ORDER BY n.effective_from DESC)
      FROM public.organization_names n WHERE n.party_id = l.party_id), '[]'::jsonb)
  ) INTO v_out
  FROM public.licensees l
  WHERE l.id = _entity_id;

  IF v_out IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;
  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.entity_structure_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_structure_overview(uuid) TO authenticated;