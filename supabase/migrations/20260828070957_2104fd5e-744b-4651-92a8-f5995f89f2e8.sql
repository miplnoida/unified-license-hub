REVOKE ALL ON FUNCTION public.tg_approval_action_decision_authority() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_approval_action_decision_authority() TO service_role;