-- Helper: list of licensee IDs an active PPOC user is mapped to
CREATE OR REPLACE FUNCTION public.ppoc_mapped_licensee_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT licensee_id FROM public.ppoc_entity_mappings
  WHERE ppoc_user_id = _user_id AND is_active = true
$$;

-- Helper: list of license IDs reachable via the PPOC's mapped licensees
-- (license.holder_id -> profile.id -> profile.licensee_id -> licensees.id)
CREATE OR REPLACE FUNCTION public.ppoc_accessible_license_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.licenses l
  JOIN public.profiles p ON p.id = l.holder_id
  WHERE p.licensee_id IN (
    SELECT licensee_id FROM public.ppoc_entity_mappings
    WHERE ppoc_user_id = _user_id AND is_active = true
  )
$$;

DROP POLICY IF EXISTS "PPOC read mapped licensee returns" ON public.compliance_returns;
CREATE POLICY "PPOC read mapped licensee returns"
ON public.compliance_returns
FOR SELECT
TO authenticated
USING (
  license_id IN (SELECT public.ppoc_accessible_license_ids(auth.uid()))
);

DROP POLICY IF EXISTS "PPOC insert returns for mapped licensee" ON public.compliance_returns;
CREATE POLICY "PPOC insert returns for mapped licensee"
ON public.compliance_returns
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = submitter_id
  AND license_id IN (SELECT public.ppoc_accessible_license_ids(auth.uid()))
);

DROP POLICY IF EXISTS "PPOC update own draft returns" ON public.compliance_returns;
CREATE POLICY "PPOC update own draft returns"
ON public.compliance_returns
FOR UPDATE
TO authenticated
USING (
  auth.uid() = submitter_id
  AND status IN ('draft','resubmission_requested','rejected')
  AND license_id IN (SELECT public.ppoc_accessible_license_ids(auth.uid()))
)
WITH CHECK (auth.uid() = submitter_id);