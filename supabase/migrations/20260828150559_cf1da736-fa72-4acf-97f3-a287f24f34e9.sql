-- F4-B2 privilege drift closure: restore F1 governed-configuration posture for
-- licensing_gate_configs and the F0-08 anonymous EXECUTE boundary for the two
-- F4 lookup helpers introduced during F4-B.

REVOKE INSERT, UPDATE, DELETE ON public.licensing_gate_configs FROM authenticated;
REVOKE ALL ON public.licensing_gate_configs FROM anon;
GRANT SELECT ON public.licensing_gate_configs TO authenticated;
GRANT ALL ON public.licensing_gate_configs TO service_role;

REVOKE EXECUTE ON FUNCTION public.fp_positive_outcomes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.application_status_vocabulary() FROM anon;
GRANT EXECUTE ON FUNCTION public.fp_positive_outcomes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.application_status_vocabulary() TO authenticated, service_role;