CREATE OR REPLACE FUNCTION public.cert_v2_repair_web_user_links()
RETURNS TABLE(repair text, rows_affected integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  UPDATE public.profiles p SET licensee_id = NULL, updated_at = now()
   WHERE p.licensee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = p.licensee_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'profiles.licensee_id cleared (entity missing)', v_n;

  UPDATE public.profiles p SET entity_name = '', updated_at = now()
   WHERE p.user_type IN ('primary','secondary')
     AND coalesce(btrim(p.entity_name),'') <> ''
     AND NOT EXISTS (SELECT 1 FROM public.licensees l
                      WHERE lower(btrim(l.name)) = lower(btrim(p.entity_name)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'profiles.entity_name cleared (unresolvable entity label)', v_n;

  UPDATE public.entity_user_access a SET is_active = false, updated_at = now()
   WHERE a.is_active
     AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = a.entity_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'entity_user_access deactivated (entity missing)', v_n;

  UPDATE public.entity_user_memberships m SET status = 'revoked', updated_at = now()
   WHERE m.status = 'active'
     AND (m.revoked_at IS NOT NULL
          OR NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = m.entity_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'entity_user_memberships revoked (revoked or entity missing)', v_n;

  UPDATE public.ppoc_entity_mappings pm SET is_active = false, updated_at = now()
   WHERE pm.is_active
     AND (NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = pm.licensee_id)
          OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pm.ppoc_user_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'ppoc_entity_mappings deactivated (invalid entity or user)', v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_repair_web_user_links() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cert_v2_repair_web_user_links() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cert_v2_repair_web_user_links() TO service_role;