-- Allow licensee-side viewers (PPOC mapped users + primary user of the licensee)
-- to read submitted return form values, matching the read access already granted
-- on the parent returns_filed row.

DROP POLICY IF EXISTS "Licensee viewers read return_form_data" ON public.return_form_data;

CREATE POLICY "Licensee viewers read return_form_data"
ON public.return_form_data
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = return_form_data.return_id
      AND (
        r.created_by = auth.uid()
        OR has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'supervisor'::app_role)
        OR has_role(auth.uid(), 'analyst'::app_role)
        OR has_role(auth.uid(), 'licensing_officer'::app_role)
        -- Primary user of the licensee that owns the return
        OR (p.licensee_id IS NOT NULL AND p.licensee_id IN (r.entity_id, r.on_behalf_of_licensee_id))
        -- PPOC user mapped to the licensee
        OR r.entity_id IN (SELECT ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT ppoc_mapped_licensee_ids(auth.uid()))
      )
  )
);