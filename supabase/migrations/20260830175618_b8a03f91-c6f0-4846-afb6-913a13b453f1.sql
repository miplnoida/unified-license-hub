-- F8A-B4 certification remediation: internal helpers and trigger routines must
-- not be directly callable by API roles (GAP-F0-08 / F0-B7 guards).

REVOKE ALL ON FUNCTION public.address_norm_text(text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.address_normalization_version() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.address_touch_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.address_usage_subject_guard() FROM anon, authenticated, PUBLIC;

-- F8A-B3 trigger routines exposed the same way; closed here as B4 regression evidence.
REVOKE ALL ON FUNCTION public.entity_appointment_autolink() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.entity_appointment_fp_bridge_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.fp_individual_autolink() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.fp_person_link_guard() FROM anon, authenticated, PUBLIC;