-- AML-CLOSE-08E: least privilege on SLA runtime history. Writes come only from
-- the service-role sweep and governed SECURITY DEFINER commands; RLS already
-- refused client writes, these grants were unnecessary.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sla_escalation_dispatches FROM anon, authenticated;
REVOKE ALL ON public.sla_escalation_dispatches FROM anon;
REVOKE ALL ON public.sla_stage_instances FROM anon;
REVOKE ALL ON public.sla_stage_events FROM anon;
GRANT SELECT ON public.sla_escalation_dispatches TO authenticated;
GRANT ALL ON public.sla_escalation_dispatches TO service_role;