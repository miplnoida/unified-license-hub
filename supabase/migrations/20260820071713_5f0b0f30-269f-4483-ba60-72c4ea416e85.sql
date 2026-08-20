-- ============================================================
-- RDM-ENTITY-001 · PHASE 2B — External Entity Registry schema foundation
-- Schema only. No provider adapters, no HTTP, no runtime change.
-- Credentials live ONLY in Integration Manager (integration_credentials).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Registry bindings — reuse Integration Manager connections
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_registry_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE RESTRICT,
  integration_connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE RESTRICT,
  authority_mode text NOT NULL DEFAULT 'LOCAL_AUTHORITATIVE',
  resolution_policy_id uuid REFERENCES public.entity_resolution_policies(id) ON DELETE RESTRICT,
  failure_policy_id uuid REFERENCES public.entity_registry_failure_policies(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erb_authority_mode_chk CHECK (authority_mode = ANY (ARRAY['LOCAL_AUTHORITATIVE','EXTERNAL_AUTHORITATIVE','HYBRID_AUTHORITY'])),
  CONSTRAINT erb_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- An external/hybrid authority binding cannot exist without a governed failure policy.
  CONSTRAINT erb_external_requires_failure_policy CHECK (
    authority_mode = 'LOCAL_AUTHORITATIVE' OR failure_policy_id IS NOT NULL
  )
);

COMMENT ON TABLE public.entity_registry_bindings IS
  'Phase 2B: binds Entity Registry capability to an existing Integration Manager connection. Base URL, auth config, secrets and retry policy are NEVER duplicated here.';

-- exactly one current primary binding per scope (regulator, or deployment-wide)
CREATE UNIQUE INDEX IF NOT EXISTS ux_erb_current_primary_scope
  ON public.entity_registry_bindings ((COALESCE(regulator_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  WHERE is_primary AND is_active AND effective_to IS NULL;

CREATE INDEX IF NOT EXISTS ix_erb_connection ON public.entity_registry_bindings (integration_connection_id);

-- ------------------------------------------------------------
-- 2. External entity references — local UUID stays canonical
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_external_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  entity_registry_binding_id uuid NOT NULL REFERENCES public.entity_registry_bindings(id) ON DELETE RESTRICT,
  external_entity_id text NOT NULL,
  external_entity_type text,
  external_version text,
  external_etag text,
  is_primary_reference boolean NOT NULL DEFAULT false,
  is_authoritative boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  last_verified_at timestamptz,
  last_synchronized_at timestamptz,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eer_verification_chk CHECK (verification_status = ANY (ARRAY['UNVERIFIED','PROVISIONAL','VERIFIED','DISPUTED','STALE'])),
  CONSTRAINT eer_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT eer_external_id_not_blank CHECK (NULLIF(btrim(external_entity_id), '') IS NOT NULL)
);

COMMENT ON TABLE public.entity_external_references IS
  'Phase 2B: maps the permanent local regulatory entity UUID to external registry identities. An external id NEVER replaces entity_id in applications, licences, returns or supervisory records; replacing a provider adds a binding, it never rewrites FKs.';

-- one current mapping per (binding, external id); the same external identifier
-- may legitimately exist under a different provider/binding
CREATE UNIQUE INDEX IF NOT EXISTS ux_eer_current_binding_external
  ON public.entity_external_references (entity_registry_binding_id, external_entity_id)
  WHERE effective_to IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_eer_current_primary_per_entity
  ON public.entity_external_references (entity_id)
  WHERE is_primary_reference AND effective_to IS NULL;

CREATE INDEX IF NOT EXISTS ix_eer_entity ON public.entity_external_references (entity_id);

-- ------------------------------------------------------------
-- 3. Data authority rules (per data domain; concept registry is later)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_data_authority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE RESTRICT,
  data_domain_id uuid NOT NULL REFERENCES public.data_domains(id) ON DELETE RESTRICT,
  -- Concept-level authority is Phase 4+. No fake data_concepts table is created
  -- just to satisfy an FK; the future key is recorded as free text only.
  data_concept_key text,
  authority_source text NOT NULL,
  entity_registry_binding_id uuid REFERENCES public.entity_registry_bindings(id) ON DELETE RESTRICT,
  allow_local_override boolean NOT NULL DEFAULT false,
  requires_reconciliation boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edar_source_chk CHECK (authority_source = ANY (ARRAY['SUPTECH','EXTERNAL_REGISTRY','DEPLOYMENT_CONFIGURED'])),
  CONSTRAINT edar_period_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- an external-registry authority rule must name the binding it relies on
  CONSTRAINT edar_external_requires_binding CHECK (
    authority_source <> 'EXTERNAL_REGISTRY' OR entity_registry_binding_id IS NOT NULL
  ),
  -- a SupTech-authoritative domain must not point at an external binding
  CONSTRAINT edar_suptech_no_binding CHECK (
    authority_source <> 'SUPTECH' OR entity_registry_binding_id IS NULL
  )
);

COMMENT ON TABLE public.entity_data_authority_rules IS
  'Phase 2B: which source is authoritative per data domain. No last-write-wins: conflicts are recorded in entity_sync_conflicts.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_edar_current_scope_domain
  ON public.entity_data_authority_rules (
    (COALESCE(regulator_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    data_domain_id,
    (COALESCE(data_concept_key, ''))
  )
  WHERE is_active AND effective_to IS NULL;

-- ------------------------------------------------------------
-- 4. Identity snapshots — immutable, append-only
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_identity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  entity_registry_binding_id uuid REFERENCES public.entity_registry_bindings(id) ON DELETE RESTRICT,
  external_entity_id text,
  source_version text,
  source_timestamp timestamptz,
  snapshot_data jsonb NOT NULL,
  capture_reason text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  source_application_id uuid REFERENCES public.applications(id) ON DELETE RESTRICT,
  source_submission_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eis_capture_reason_chk CHECK (capture_reason = ANY (ARRAY[
    'APPLICATION_SUBMITTED','APPLICATION_DECIDED','LICENSE_ISSUED',
    'IDENTITY_VERIFIED','REGISTRY_RECONCILIATION','MANUAL_CAPTURE','MIGRATION'
  ]))
);

COMMENT ON TABLE public.entity_identity_snapshots IS
  'Phase 2B: append-only record of the identity data the regulator knew at a material point in time. Schema only — no workflow creates snapshots yet.';

CREATE INDEX IF NOT EXISTS ix_eis_entity_captured ON public.entity_identity_snapshots (entity_id, captured_at DESC);

CREATE OR REPLACE FUNCTION public.entity_identity_snapshot_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'entity_identity_snapshots is append-only: % is not permitted', TG_OP USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS trg_eis_append_only ON public.entity_identity_snapshots;
CREATE TRIGGER trg_eis_append_only
  BEFORE UPDATE OR DELETE ON public.entity_identity_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.entity_identity_snapshot_append_only();

-- ------------------------------------------------------------
-- 5. Domain sync state (not HTTP logging)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_registry_sync_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_registry_binding_id uuid NOT NULL UNIQUE REFERENCES public.entity_registry_bindings(id) ON DELETE RESTRICT,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_summary text,
  last_cursor text,
  sync_status text NOT NULL DEFAULT 'NEVER_RUN',
  records_processed integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erss_status_chk CHECK (sync_status = ANY (ARRAY['NEVER_RUN','RUNNING','SUCCEEDED','PARTIAL','FAILED','DISABLED']))
);

COMMENT ON TABLE public.entity_registry_sync_states IS
  'Phase 2B: domain-level synchronisation status per binding. Raw request/response observability stays in integration_logs.';

-- ------------------------------------------------------------
-- 6. Sync conflicts — recorded, never auto-resolved
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  data_domain_id uuid NOT NULL REFERENCES public.data_domains(id) ON DELETE RESTRICT,
  data_concept_key text,
  entity_registry_binding_id uuid NOT NULL REFERENCES public.entity_registry_bindings(id) ON DELETE RESTRICT,
  local_value jsonb,
  external_value jsonb,
  local_version text,
  external_version text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'OPEN',
  resolved_value jsonb,
  resolution_reason text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esc_status_chk CHECK (status = ANY (ARRAY['OPEN','UNDER_REVIEW','RESOLVED_LOCAL','RESOLVED_EXTERNAL','RESOLVED_MANUAL','DISMISSED'])),
  CONSTRAINT esc_resolution_provenance_chk CHECK (
    status IN ('OPEN','UNDER_REVIEW')
    OR (resolved_at IS NOT NULL AND NULLIF(btrim(COALESCE(resolution_reason, '')), '') IS NOT NULL)
  )
);

COMMENT ON TABLE public.entity_sync_conflicts IS
  'Phase 2B: data-authority discrepancies recorded without overwriting either side. No automatic resolution engine, no last-write-wins.';

CREATE INDEX IF NOT EXISTS ix_esc_open ON public.entity_sync_conflicts (status, detected_at DESC);

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_erb_touch ON public.entity_registry_bindings;
CREATE TRIGGER trg_erb_touch BEFORE UPDATE ON public.entity_registry_bindings
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_eer_touch ON public.entity_external_references;
CREATE TRIGGER trg_eer_touch BEFORE UPDATE ON public.entity_external_references
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_edar_touch ON public.entity_data_authority_rules;
CREATE TRIGGER trg_edar_touch BEFORE UPDATE ON public.entity_data_authority_rules
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_erss_touch ON public.entity_registry_sync_states;
CREATE TRIGGER trg_erss_touch BEFORE UPDATE ON public.entity_registry_sync_states
  FOR EACH ROW EXECUTE FUNCTION public.rdm_touch_updated_at();

-- ------------------------------------------------------------
-- Grants + RLS (read-only for app users; all writes are service_role)
-- ------------------------------------------------------------
GRANT SELECT ON public.entity_registry_bindings      TO authenticated;
GRANT SELECT ON public.entity_external_references    TO authenticated;
GRANT SELECT ON public.entity_data_authority_rules   TO authenticated;
GRANT SELECT ON public.entity_identity_snapshots     TO authenticated;
GRANT SELECT ON public.entity_registry_sync_states   TO authenticated;
GRANT SELECT ON public.entity_sync_conflicts         TO authenticated;

GRANT ALL ON public.entity_registry_bindings      TO service_role;
GRANT ALL ON public.entity_external_references    TO service_role;
GRANT ALL ON public.entity_data_authority_rules   TO service_role;
GRANT INSERT, SELECT ON public.entity_identity_snapshots TO service_role;
GRANT ALL ON public.entity_registry_sync_states   TO service_role;
GRANT ALL ON public.entity_sync_conflicts         TO service_role;

ALTER TABLE public.entity_registry_bindings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_external_references  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_data_authority_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_identity_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_registry_sync_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_sync_conflicts       ENABLE ROW LEVEL SECURITY;

-- Registry configuration: internal regulatory administrators only.
DROP POLICY IF EXISTS entity_registry_bindings_read ON public.entity_registry_bindings;
CREATE POLICY entity_registry_bindings_read ON public.entity_registry_bindings
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()) AND public.rdm_can_read());

DROP POLICY IF EXISTS entity_data_authority_rules_read ON public.entity_data_authority_rules;
CREATE POLICY entity_data_authority_rules_read ON public.entity_data_authority_rules
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()) AND public.rdm_can_read());

-- Sync state / conflicts: internal administrative & supervisory users only.
DROP POLICY IF EXISTS entity_registry_sync_states_read ON public.entity_registry_sync_states;
CREATE POLICY entity_registry_sync_states_read ON public.entity_registry_sync_states
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS entity_sync_conflicts_read ON public.entity_sync_conflicts;
CREATE POLICY entity_sync_conflicts_read ON public.entity_sync_conflicts
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

-- Entity-scoped identity data: only readers of that entity.
DROP POLICY IF EXISTS entity_external_references_read ON public.entity_external_references;
CREATE POLICY entity_external_references_read ON public.entity_external_references
  FOR SELECT TO authenticated
  USING (public.can_read_licensee(auth.uid(), entity_id));

DROP POLICY IF EXISTS entity_identity_snapshots_read ON public.entity_identity_snapshots;
CREATE POLICY entity_identity_snapshots_read ON public.entity_identity_snapshots
  FOR SELECT TO authenticated
  USING (public.can_read_licensee(auth.uid(), entity_id));

-- ------------------------------------------------------------
-- Diagnostics (read-only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rdm_entity_registry_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.rdm_can_read() THEN
    RAISE EXCEPTION 'permission denied: settings.view' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'bindings_total', (SELECT count(*) FROM public.entity_registry_bindings),
    'bindings_active', (SELECT count(*) FROM public.entity_registry_bindings WHERE is_active AND effective_to IS NULL),
    'bindings_external_authoritative', (SELECT count(*) FROM public.entity_registry_bindings WHERE authority_mode = 'EXTERNAL_AUTHORITATIVE'),
    'bindings_hybrid_authority', (SELECT count(*) FROM public.entity_registry_bindings WHERE authority_mode = 'HYBRID_AUTHORITY'),
    'bindings_local_authoritative', (SELECT count(*) FROM public.entity_registry_bindings WHERE authority_mode = 'LOCAL_AUTHORITATIVE'),
    'integration_connections_available', (SELECT count(*) FROM public.integration_connections),
    'entities_with_external_reference',
      (SELECT count(DISTINCT entity_id) FROM public.entity_external_references WHERE effective_to IS NULL),
    'entities_with_multiple_external_references',
      (SELECT count(*) FROM (
         SELECT entity_id FROM public.entity_external_references
          WHERE effective_to IS NULL GROUP BY 1 HAVING count(*) > 1) x),
    'duplicate_external_ids_within_binding',
      (SELECT count(*) FROM (
         SELECT entity_registry_binding_id, external_entity_id
           FROM public.entity_external_references WHERE effective_to IS NULL
          GROUP BY 1,2 HAVING count(DISTINCT entity_id) > 1) x),
    'external_references_unverified',
      (SELECT count(*) FROM public.entity_external_references
        WHERE effective_to IS NULL AND verification_status <> 'VERIFIED'),
    'external_references_stale',
      (SELECT count(*) FROM public.entity_external_references
        WHERE effective_to IS NULL
          AND (last_verified_at IS NULL OR last_verified_at < now() - interval '30 days')),
    'authority_rules_total', (SELECT count(*) FROM public.entity_data_authority_rules),
    'authority_rules_by_domain',
      COALESCE((SELECT jsonb_object_agg(d.key, c.n) FROM (
          SELECT data_domain_id, count(*) n FROM public.entity_data_authority_rules
           WHERE is_active AND effective_to IS NULL GROUP BY 1) c
        JOIN public.data_domains d ON d.id = c.data_domain_id), '{}'::jsonb),
    'identity_snapshots_total', (SELECT count(*) FROM public.entity_identity_snapshots),
    'identity_snapshots_last_captured_at', (SELECT max(captured_at) FROM public.entity_identity_snapshots),
    'sync_states_total', (SELECT count(*) FROM public.entity_registry_sync_states),
    'sync_status_counts',
      COALESCE((SELECT jsonb_object_agg(sync_status, n) FROM (
          SELECT sync_status, count(*) n FROM public.entity_registry_sync_states GROUP BY 1) s), '{}'::jsonb),
    'last_successful_sync_at', (SELECT max(last_success_at) FROM public.entity_registry_sync_states),
    'sync_conflicts_total', (SELECT count(*) FROM public.entity_sync_conflicts),
    'sync_conflicts_open', (SELECT count(*) FROM public.entity_sync_conflicts WHERE status IN ('OPEN','UNDER_REVIEW')),
    'licence_number_entity_identifiers',
      (SELECT count(*) FROM public.entity_identifiers i
        JOIN public.entity_identifier_types t ON t.id = i.identifier_type_id
        WHERE t.key = 'license_number'),
    'retired_identifier_types',
      (SELECT count(*) FROM public.entity_identifier_types WHERE NOT is_active),
    'normalization_strategies_in_use',
      COALESCE((SELECT jsonb_object_agg(normalization_strategy, n) FROM (
          SELECT normalization_strategy, count(*) n FROM public.entity_identifier_types
           WHERE is_active GROUP BY 1) s), '{}'::jsonb)
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.rdm_entity_registry_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rdm_entity_registry_report() TO authenticated, service_role;