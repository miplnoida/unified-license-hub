
-- Helper: licensee ids linked to a license (bypasses RLS)
CREATE OR REPLACE FUNCTION public.licensee_ids_for_license(_license_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.licensees WHERE license_id = _license_id
$$;

-- Helper: license ids linked to a licensee entity (bypasses RLS)
CREATE OR REPLACE FUNCTION public.license_ids_for_licensee(_licensee_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT license_id FROM public.licensees WHERE id = _licensee_id AND license_id IS NOT NULL
$$;

-- Helper: application ids linked to a licensee entity via its licenses (bypasses RLS)
CREATE OR REPLACE FUNCTION public.application_ids_for_licensee(_licensee_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lic.application_id
  FROM public.licenses lic
  JOIN public.licensees l ON l.license_id = lic.id
  WHERE l.id = _licensee_id AND lic.application_id IS NOT NULL
$$;

-- Helper: profile.licensee_id for a user (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_licensee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT licensee_id FROM public.profiles WHERE id = _user_id
$$;

-- Replace recursive policies
DROP POLICY IF EXISTS "Licensee users read linked applications" ON public.applications;
CREATE POLICY "Licensee users read linked applications"
ON public.applications
FOR SELECT
USING (
  public.user_licensee_id(auth.uid()) IS NOT NULL
  AND (
    applications.applicant_id = auth.uid()
    OR applications.id IN (SELECT public.application_ids_for_licensee(public.user_licensee_id(auth.uid())))
  )
);

DROP POLICY IF EXISTS "Licensee users read linked licenses" ON public.licenses;
CREATE POLICY "Licensee users read linked licenses"
ON public.licenses
FOR SELECT
USING (
  auth.uid() = holder_id
  OR (
    public.user_licensee_id(auth.uid()) IS NOT NULL
    AND (
      licenses.id IN (SELECT public.license_ids_for_licensee(public.user_licensee_id(auth.uid())))
      OR licenses.holder_id = public.user_licensee_id(auth.uid())
    )
  )
  OR (id IN (SELECT public.ppoc_accessible_license_ids(auth.uid())))
);
