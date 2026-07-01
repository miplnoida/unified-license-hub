DROP POLICY IF EXISTS "Licensee submitters write return form data" ON public.return_form_data;
CREATE POLICY "Licensee submitters write return form data"
ON public.return_form_data
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = return_form_data.return_id
      AND (
        ((p.licensee_id IS NOT NULL) AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id))
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
      )
  )
);

DROP POLICY IF EXISTS "Licensee submitters update return form data" ON public.return_form_data;
CREATE POLICY "Licensee submitters update return form data"
ON public.return_form_data
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = return_form_data.return_id
      AND (
        ((p.licensee_id IS NOT NULL) AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id))
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = return_form_data.return_id
      AND (
        ((p.licensee_id IS NOT NULL) AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id))
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
      )
  )
);

DROP POLICY IF EXISTS "Licensee submitters update editable returns" ON public.returns_filed;
CREATE POLICY "Licensee submitters update editable returns"
ON public.returns_filed
FOR UPDATE
TO authenticated
USING (
  workflow_status IN ('TEMP', 'WIP', 'TBR')
  AND (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.licensee_id IS NOT NULL
        AND (p.licensee_id = returns_filed.entity_id OR p.licensee_id = returns_filed.on_behalf_of_licensee_id)
    )
    OR returns_filed.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
    OR returns_filed.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
    OR public.external_can_access_return_filed(auth.uid(), returns_filed.id, 'can_submit_returns')
  )
)
WITH CHECK (
  workflow_status IN ('WIP', 'SUB', 'TBR')
  AND (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.licensee_id IS NOT NULL
        AND (p.licensee_id = returns_filed.entity_id OR p.licensee_id = returns_filed.on_behalf_of_licensee_id)
    )
    OR returns_filed.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
    OR returns_filed.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
    OR public.external_can_access_return_filed(auth.uid(), returns_filed.id, 'can_submit_returns')
  )
);

DROP POLICY IF EXISTS "Licensee submitters insert return audit log" ON public.return_audit_log;
CREATE POLICY "Licensee submitters insert return audit log"
ON public.return_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.returns_filed r
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = return_audit_log.return_id
      AND (
        ((p.licensee_id IS NOT NULL) AND (p.licensee_id = r.entity_id OR p.licensee_id = r.on_behalf_of_licensee_id))
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
      )
  )
);