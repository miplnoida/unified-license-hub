-- ─────────────────────────────────────────────────────────────────────────────
-- is_fp_staff() gates every RLS policy across the Fit & Proper module (fp_
-- individuals, fp_individual_roles, fp_assessments, fp_determinations, etc.),
-- but never included the 'developer' role — unlike the frontend's ALL_INTERNAL
-- role set (INTERNAL_ROLES) used to gate the /fpa/* nav and routes, and unlike
-- the general-purpose is_internal_staff_user() helper elsewhere in the app,
-- which both already treat 'developer' as internal staff.
--
-- Result: a developer-role user could reach e.g. /fpa/individuals/:id and see
-- the "Add Role" action, but any INSERT/UPDATE into fp_* tables was rejected
-- with "new row violates row-level security policy" because is_fp_staff()
-- returned false for them.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_fp_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'super_admin'::app_role)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'supervisor'::app_role)
    OR public.has_role(_user_id, 'licensing_officer'::app_role)
    OR public.has_role(_user_id, 'analyst'::app_role)
    OR public.has_role(_user_id, 'legal_compliance'::app_role)
    OR public.has_role(_user_id, 'developer'::app_role);
$$;
