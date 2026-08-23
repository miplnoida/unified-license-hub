-- WAVE 3B.5 — Authorization convergence & residual gap closure

-- 1. GAP-3A-002 HARDENING: external entity read authority must come only from
--    governed entity-user authority models (access grants, memberships/PPOC).
--    The legacy profiles.licensee_id self-declared fallback is removed.
CREATE OR REPLACE FUNCTION public.entity_external_read_access(_user_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _entity_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.entity_user_access ea
      WHERE ea.user_id = _user_id
        AND ea.entity_id = _entity_id
        AND ea.is_active = true
        AND (ea.end_date IS NULL OR ea.end_date >= CURRENT_DATE)
    )
    OR public.entity_membership_capability(_user_id, _entity_id, 'returns.view')
  );
$function$;

-- 2. GAP-3B-002: complaint authorisation must resolve from the canonical sec_*
--    permission model, not the legacy user_dynamic_roles projection.
CREATE OR REPLACE FUNCTION public.has_complaint_perm(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH aliased AS (
    SELECT CASE
             WHEN _action = 'view_all' THEN ARRAY['view']
             WHEN _action = 'triage'   THEN ARRAY['assign','edit','investigate']
             ELSE ARRAY[_action]
           END AS actions
  )
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM aliased a, unnest(a.actions) AS act(action_key)
      WHERE public.sec_has_permission(_user_id, 'complaint_management', act.action_key)
    )
  );
$function$;

-- 3. GAP-3A-004 / GAP-3B-00x OPERABILITY: the canonical returns / prudential
--    read models are invoker-rights (security_invoker views) so row scoping
--    still comes from the hardened returns + prudential RLS graph. They were
--    unreachable through the Data API because no Data-API role held SELECT.
GRANT SELECT ON public.v_return_filing_workflow_state TO authenticated;
GRANT SELECT ON public.v_return_metric_facts_current TO authenticated;
GRANT SELECT ON public.v_prudential_current_breaches TO authenticated;
GRANT SELECT ON public.v_prudential_early_warnings TO authenticated;
GRANT SELECT ON public.audit_timeline TO authenticated;
GRANT SELECT ON public.report_runs TO authenticated;

GRANT SELECT ON public.v_return_filing_workflow_state TO service_role;
GRANT SELECT ON public.v_return_metric_facts_current TO service_role;
GRANT SELECT ON public.v_prudential_current_breaches TO service_role;
GRANT SELECT ON public.v_prudential_early_warnings TO service_role;
GRANT SELECT ON public.audit_timeline TO service_role;
GRANT SELECT ON public.report_runs TO service_role;