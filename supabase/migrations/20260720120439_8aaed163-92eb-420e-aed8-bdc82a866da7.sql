DROP POLICY IF EXISTS external_returns_filed_select_capability_gate ON public.returns_filed;

CREATE POLICY external_returns_filed_select_capability_gate
ON public.returns_filed
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_external_role(auth.uid())
  AND (
    external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_view_status')
    OR external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns')
  )
);