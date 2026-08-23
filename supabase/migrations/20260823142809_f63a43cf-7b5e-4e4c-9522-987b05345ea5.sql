-- Thematic review, finding, action, letter and status-history visibility also
-- moves off the legacy app_role enum onto the governed conduct permissions.
DROP POLICY IF EXISTS "Internal read thematic_reviews" ON public.thematic_reviews;
DROP POLICY IF EXISTS "Internal write thematic_reviews" ON public.thematic_reviews;
CREATE POLICY "Internal read thematic_reviews" ON public.thematic_reviews
FOR SELECT TO authenticated
USING (NOT public.has_external_role(auth.uid())
       AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view')));

DO $$
DECLARE t text; pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['thematic_review_findings','thematic_review_actions','thematic_review_letters','thematic_review_status_history','thematic_review_products']
  LOOP
    FOR pol IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (NOT public.has_external_role(auth.uid())
             AND (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'market_conduct','view')))
    $f$, t || '_internal_read', t);
    IF t IN ('thematic_review_products') THEN
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING (public.can_manage_thematic_review(review_id))
        WITH CHECK (public.can_manage_thematic_review(review_id))
      $f$, t || '_internal_write', t);
    END IF;
  END LOOP;
END $$;