DROP POLICY IF EXISTS external_returns_filed_select_capability_gate ON public.returns_filed;

CREATE POLICY external_returns_filed_select_capability_gate
  ON public.returns_filed
  FOR SELECT
  USING (
    (NOT public.has_external_role(auth.uid()))
    OR public.external_can_access_return_filed_values(
         auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_view_status'
       )
    OR public.external_can_access_return_filed_values(
         auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns'
       )
  );