-- Allow licensees (holders and mapped licensee users) to read action history for their own licenses
DROP POLICY IF EXISTS "Licensees read own license actions" ON public.license_actions;

CREATE POLICY "Licensees read own license actions"
ON public.license_actions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.licenses lic
    WHERE lic.id = license_actions.license_id
      AND (
        lic.holder_id = auth.uid()
        OR (
          public.user_licensee_id(auth.uid()) IS NOT NULL
          AND (
            lic.id IN (SELECT public.license_ids_for_licensee(public.user_licensee_id(auth.uid())))
            OR lic.holder_id = public.user_licensee_id(auth.uid())
          )
        )
        OR lic.id IN (SELECT public.ppoc_accessible_license_ids(auth.uid()))
      )
  )
);