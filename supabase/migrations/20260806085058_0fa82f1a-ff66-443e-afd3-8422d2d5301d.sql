CREATE OR REPLACE FUNCTION public.can_manage_conduct_investigation(_investigation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conduct_investigations ci
    WHERE ci.id = _investigation_id
      AND (
        -- Backend/service context (edge functions, scheduled jobs, tests).
        (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
        OR public.is_super_admin(auth.uid())
        OR public.has_scoped_permission(auth.uid(),'market_conduct_investigation','access_investigation_workspace', ci.id, ci.licensee_id,
             (SELECT l.sector_id FROM public.licensees l WHERE l.id = ci.licensee_id), NULL::uuid)
      )
  )
$$;