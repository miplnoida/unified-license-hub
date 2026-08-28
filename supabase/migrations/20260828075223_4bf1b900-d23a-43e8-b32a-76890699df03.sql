-- ============================================================================
-- F1-B2 — DEF-F1-C-01: governed-table privilege posture
-- ============================================================================
-- service_config_expectations and config_change_log are internal operator
-- surfaces. They must not be reachable by `anon` at all, and signed-in users
-- must be read-only: every write goes through the governed writers
-- (config_save / config_retire / config_delete / decision_authority_*).
-- RLS stays enabled and no policy is changed.

REVOKE ALL ON public.service_config_expectations FROM anon;
REVOKE ALL ON public.config_change_log FROM anon;
REVOKE ALL ON public.service_configuration_completeness FROM anon;

REVOKE ALL ON public.service_config_expectations FROM authenticated;
REVOKE ALL ON public.config_change_log FROM authenticated;
REVOKE ALL ON public.service_configuration_completeness FROM authenticated;

-- Minimum needed by the operator screens. The completeness view runs with
-- security_invoker = on, so the caller needs SELECT on the base table too;
-- the existing internal-staff SELECT policies remain the row-level gate.
GRANT SELECT ON public.service_config_expectations TO authenticated;
GRANT SELECT ON public.config_change_log TO authenticated;
GRANT SELECT ON public.service_configuration_completeness TO authenticated;

-- Privileged backend paths retain full access.
GRANT ALL ON public.service_config_expectations TO service_role;
GRANT ALL ON public.config_change_log TO service_role;
GRANT ALL ON public.service_configuration_completeness TO service_role;

-- ============================================================================
-- F1-B2 — DEF-F1-C-02: Decision Authority status vocabulary
-- ============================================================================
-- Census result: the RPC (decision_authority_rule_set_status), the hook
-- (useDecisionAuthority.ts), the operator screen (DecisionAuthorityManager.tsx)
-- and the resolver all speak 'active' / 'retired'. Only the original CREATE
-- TABLE check constraint said 'inactive', which made retirement impossible.
-- Canonical vocabulary: 'active' / 'retired'.

UPDATE public.decision_authority_rules
   SET status = 'retired'
 WHERE status = 'inactive';

ALTER TABLE public.decision_authority_rules
  DROP CONSTRAINT IF EXISTS decision_authority_rules_status_chk;

ALTER TABLE public.decision_authority_rules
  ADD CONSTRAINT decision_authority_rules_status_chk
  CHECK (status IN ('active', 'retired'));