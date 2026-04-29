-- 1) Fix the schema cache error: add on_behalf_of_licensee_id to returns_filed
ALTER TABLE public.returns_filed
ADD COLUMN IF NOT EXISTS on_behalf_of_licensee_id UUID REFERENCES public.licensees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_returns_filed_on_behalf_of
ON public.returns_filed(on_behalf_of_licensee_id);

-- 2) Allow PPOC users to insert/select/update returns_filed for their mapped licensees.
--    These mirror the existing compliance_returns policies and do not change current
--    licensee/admin behavior (existing "Users manage own returns" policy stays in place).
DROP POLICY IF EXISTS "PPOC read mapped returns_filed" ON public.returns_filed;
CREATE POLICY "PPOC read mapped returns_filed"
ON public.returns_filed FOR SELECT
TO authenticated
USING (
  on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
  OR entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
);

DROP POLICY IF EXISTS "PPOC insert returns_filed for mapped licensee" ON public.returns_filed;
CREATE POLICY "PPOC insert returns_filed for mapped licensee"
ON public.returns_filed FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    (on_behalf_of_licensee_id IS NOT NULL
       AND on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid())))
    OR (entity_id IS NOT NULL
       AND entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid())))
  )
);

DROP POLICY IF EXISTS "PPOC update mapped returns_filed" ON public.returns_filed;
CREATE POLICY "PPOC update mapped returns_filed"
ON public.returns_filed FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  AND (
    on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
    OR entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
  )
);

-- 3) Tag form_templates with a Return Type (dynamic, from return_types master table)
ALTER TABLE public.form_templates
ADD COLUMN IF NOT EXISTS return_type_id UUID REFERENCES public.return_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_templates_return_type
ON public.form_templates(return_type_id);