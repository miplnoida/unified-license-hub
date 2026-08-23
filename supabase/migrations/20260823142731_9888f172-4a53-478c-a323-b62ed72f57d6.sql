-- Thematic review authority converges on the governed catalogue
-- (market_conduct.initiate_thematic_review) instead of the legacy app_role enum.
CREATE OR REPLACE FUNCTION public.can_manage_thematic_review(_review_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin'))
      OR public.is_super_admin(auth.uid())
      OR (
        NOT public.has_external_role(auth.uid())
        AND public.has_permission(auth.uid(), 'market_conduct', 'initiate_thematic_review')
      )
$function$;

-- Child-table policies: read for internal conduct staff, write for the
-- thematic-review authority. External users have no access.
DROP POLICY IF EXISTS "Internal read tre" ON public.thematic_review_entities;
DROP POLICY IF EXISTS "Internal write tre" ON public.thematic_review_entities;
CREATE POLICY "Internal read tre" ON public.thematic_review_entities
FOR SELECT TO authenticated
USING (NOT public.has_external_role(auth.uid())
       AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view')));
CREATE POLICY "Internal write tre" ON public.thematic_review_entities
FOR ALL TO authenticated
USING (public.can_manage_thematic_review(review_id))
WITH CHECK (public.can_manage_thematic_review(review_id));

DROP POLICY IF EXISTS "Internal read tre_ev" ON public.thematic_review_evidence;
DROP POLICY IF EXISTS "Internal write tre_ev" ON public.thematic_review_evidence;
CREATE POLICY "Internal read tre_ev" ON public.thematic_review_evidence
FOR SELECT TO authenticated
USING (NOT public.has_external_role(auth.uid())
       AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view')));
CREATE POLICY "Internal write tre_ev" ON public.thematic_review_evidence
FOR ALL TO authenticated
USING (public.can_manage_thematic_review(review_id))
WITH CHECK (public.can_manage_thematic_review(review_id));

DROP POLICY IF EXISTS "Internal read trr" ON public.thematic_review_reports;
DROP POLICY IF EXISTS "Internal write trr" ON public.thematic_review_reports;
CREATE POLICY "Internal read trr" ON public.thematic_review_reports
FOR SELECT TO authenticated
USING (NOT public.has_external_role(auth.uid())
       AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view')));
CREATE POLICY "Internal write trr" ON public.thematic_review_reports
FOR ALL TO authenticated
USING (public.can_manage_thematic_review(review_id))
WITH CHECK (public.can_manage_thematic_review(review_id));