
CREATE POLICY "Internal staff read licensees"
ON public.licensees FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'licensing_officer'::app_role)
  OR has_role(auth.uid(), 'analyst'::app_role)
  OR has_role(auth.uid(), 'legal_compliance'::app_role)
);
