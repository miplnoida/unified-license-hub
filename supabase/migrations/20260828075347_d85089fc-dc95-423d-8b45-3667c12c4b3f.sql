-- F1-B2 residual: license_fee_process_settings is internal staff configuration
-- (only an internal-staff SELECT policy exists, and no public surface reads it),
-- so it must not carry anonymous privileges. Signed-in reads and the governed
-- writer path are unchanged; RLS and policies are untouched.
REVOKE ALL ON public.license_fee_process_settings FROM anon;

GRANT SELECT ON public.license_fee_process_settings TO authenticated;
GRANT ALL ON public.license_fee_process_settings TO service_role;