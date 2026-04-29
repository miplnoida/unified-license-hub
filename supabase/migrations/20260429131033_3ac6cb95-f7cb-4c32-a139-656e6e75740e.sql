ALTER TABLE public.compliance_returns DROP CONSTRAINT IF EXISTS compliance_returns_on_behalf_of_licensee_id_fkey;

WITH license_to_licensee AS (
  SELECT l.id AS license_id, p.licensee_id
  FROM public.licenses l
  JOIN public.profiles p ON p.id = l.holder_id
  WHERE p.licensee_id IS NOT NULL
)
UPDATE public.compliance_returns cr
SET on_behalf_of_licensee_id = ll.licensee_id
FROM license_to_licensee ll
WHERE cr.on_behalf_of_licensee_id = ll.license_id;

ALTER TABLE public.compliance_returns
  ADD CONSTRAINT compliance_returns_on_behalf_of_licensee_id_fkey
  FOREIGN KEY (on_behalf_of_licensee_id)
  REFERENCES public.licensees(id)
  ON DELETE SET NULL;

DROP POLICY IF EXISTS "PPOC read mapped licensee returns" ON public.compliance_returns;
CREATE POLICY "PPOC read mapped licensee returns"
ON public.compliance_returns
FOR SELECT
TO authenticated
USING (
  (
    on_behalf_of_licensee_id IN (
      SELECT public.ppoc_mapped_licensee_ids(auth.uid())
    )
  )
  OR (
    license_id IN (
      SELECT public.ppoc_accessible_license_ids(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "PPOC insert returns for mapped licensee" ON public.compliance_returns;
CREATE POLICY "PPOC insert returns for mapped licensee"
ON public.compliance_returns
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = submitter_id
  AND license_id IN (
    SELECT public.ppoc_accessible_license_ids(auth.uid())
  )
  AND on_behalf_of_licensee_id IN (
    SELECT public.ppoc_mapped_licensee_ids(auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.licenses l
    JOIN public.profiles p ON p.id = l.holder_id
    WHERE l.id = compliance_returns.license_id
      AND p.licensee_id = compliance_returns.on_behalf_of_licensee_id
  )
);

DROP POLICY IF EXISTS "PPOC update own draft returns" ON public.compliance_returns;
CREATE POLICY "PPOC update own draft returns"
ON public.compliance_returns
FOR UPDATE
TO authenticated
USING (
  auth.uid() = submitter_id
  AND status IN ('draft','resubmission_requested','rejected')
  AND (
    on_behalf_of_licensee_id IN (
      SELECT public.ppoc_mapped_licensee_ids(auth.uid())
    )
    OR license_id IN (
      SELECT public.ppoc_accessible_license_ids(auth.uid())
    )
  )
)
WITH CHECK (
  auth.uid() = submitter_id
  AND (
    on_behalf_of_licensee_id IS NULL
    OR on_behalf_of_licensee_id IN (
      SELECT public.ppoc_mapped_licensee_ids(auth.uid())
    )
  )
  AND (
    license_id IS NULL
    OR license_id IN (
      SELECT public.ppoc_accessible_license_ids(auth.uid())
    )
  )
  AND (
    on_behalf_of_licensee_id IS NULL
    OR license_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.licenses l
      JOIN public.profiles p ON p.id = l.holder_id
      WHERE l.id = compliance_returns.license_id
        AND p.licensee_id = compliance_returns.on_behalf_of_licensee_id
    )
  )
);