CREATE OR REPLACE FUNCTION public.entity_self_profile(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  -- Only an approved, in-force member of this entity (or a super admin) may read it.
  IF NOT public.is_super_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
     WHERE m.user_id = auth.uid() AND m.entity_id = _entity_id AND m.status = 'APPROVED'
       AND (m.effective_to IS NULL OR m.effective_to > now())
  ) THEN
    RAISE EXCEPTION 'Not a member of this entity' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'entity', (SELECT jsonb_build_object(
        'id', l.id, 'name', l.name, 'status', l.status, 'created_at', l.created_at,
        'sector', s.name, 'sub_sector', ss.name, 'lead_regulator', r.name)
      FROM public.licensees l
      LEFT JOIN public.sectors s ON s.id = l.sector_id
      LEFT JOIN public.sub_sectors ss ON ss.id = l.sub_sector_id
      LEFT JOIN public.regulators r ON r.id = l.lead_regulator_id
      WHERE l.id = _entity_id),
    'licences', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', li.id, 'license_number', li.license_number, 'license_type', li.license_type,
        'status', li.status, 'issued_at', li.issued_at, 'valid_from', li.valid_from,
        'valid_until', li.valid_until) ORDER BY li.issued_at DESC NULLS LAST)
      FROM public.licenses li
      WHERE li.id = (SELECT license_id FROM public.licensees WHERE id = _entity_id)
         OR li.holder_id = _entity_id), '[]'::jsonb),
    'appointments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'person', p.display_name, 'role', rt.label,
        'is_executive', a.is_executive, 'status', a.status,
        'approval_status', a.regulatory_approval_status,
        'effective_from', a.effective_from) ORDER BY rt.sort_order, p.display_name)
      FROM public.entity_appointments a
      JOIN public.parties p ON p.id = a.person_party_id
      LEFT JOIN public.role_types rt ON rt.id = a.role_type_id
      WHERE a.entity_id = _entity_id AND a.superseded_at IS NULL
        AND (a.effective_to IS NULL OR a.effective_to > now())), '[]'::jsonb),
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'full_name', pr.full_name, 'email', pr.email,
        'role', mr.label, 'is_primary', mr.is_primary_representative,
        'status', m.status, 'approved_at', m.approved_at) ORDER BY mr.is_primary_representative DESC, pr.full_name)
      FROM public.entity_user_memberships m
      LEFT JOIN public.profiles pr ON pr.id = m.user_id
      LEFT JOIN public.entity_membership_roles mr ON mr.id = m.membership_role_id
      WHERE m.entity_id = _entity_id AND m.status IN ('APPROVED','PENDING','VERIFIED')
        AND (m.effective_to IS NULL OR m.effective_to > now())), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.entity_self_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_self_profile(uuid) TO authenticated, service_role;