DROP POLICY IF EXISTS return_threshold_breaches_read_canonical ON public.return_threshold_breaches;
CREATE POLICY return_threshold_breaches_read_canonical
  ON public.return_threshold_breaches
  FOR SELECT TO authenticated
  USING (public.can_read_prudential_entity(auth.uid(), entity_id));