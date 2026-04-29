CREATE POLICY "PPOC read mapped licensees"
ON public.licensees FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT licensee_id FROM public.ppoc_entity_mappings
    WHERE ppoc_user_id = auth.uid() AND is_active = true
  )
);