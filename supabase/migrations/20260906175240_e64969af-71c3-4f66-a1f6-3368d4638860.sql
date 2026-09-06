-- OS-02F1 follow-up: audit trail must be writable from governed triggers.
ALTER FUNCTION public.supervisory_assurance_policy_governance_chk() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.supervisory_assurance_policy_governance_chk() FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.supervisory_signal_review TO service_role;
GRANT ALL ON public.supervisory_assurance_policy TO service_role;