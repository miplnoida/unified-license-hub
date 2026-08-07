-- Phase 6 hardening: new tables inherit broad default privileges for anon and
-- authenticated. These records are append-only/server-written, so revoke the
-- inherited write access and remove anon access entirely.

REVOKE ALL ON public.application_acknowledgements FROM anon, authenticated;
REVOKE ALL ON public.sufficiency_determinations FROM anon, authenticated;
REVOKE ALL ON public.application_legal_referrals FROM anon, authenticated;

GRANT SELECT ON public.application_acknowledgements TO authenticated;
GRANT SELECT ON public.sufficiency_determinations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.application_legal_referrals TO authenticated;

GRANT ALL ON public.application_acknowledgements TO service_role;
GRANT ALL ON public.sufficiency_determinations TO service_role;
GRANT ALL ON public.application_legal_referrals TO service_role;