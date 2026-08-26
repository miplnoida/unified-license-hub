-- ============================================================================
-- MC-11 — Supervisory Management Reporting, Regulatory MI & Evidence Packs
-- Part 1: registers (MI definitions, evidence packs + versions + exports,
--         release debt register)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Regulatory MI definition register
-- ---------------------------------------------------------------------------
CREATE TABLE public.conduct_mi_definitions (
  code                  text PRIMARY KEY,
  name                  text NOT NULL,
  business_meaning      text NOT NULL,
  metric_group          text NOT NULL,
  source_object         text NOT NULL,
  numerator             text NOT NULL,
  denominator           text,
  inclusion_criteria    text NOT NULL,
  exclusion_criteria    text,
  time_basis            text NOT NULL,
  grouping_dimensions   text[] NOT NULL DEFAULT '{}'::text[],
  calculation_note      text,
  calculation_version   integer NOT NULL DEFAULT 1,
  drilldown_supported   boolean NOT NULL DEFAULT true,
  effective_from        date NOT NULL DEFAULT current_date,
  retired_at            timestamptz,
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 100,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conduct_mi_definitions TO authenticated;
GRANT ALL ON public.conduct_mi_definitions TO service_role;
ALTER TABLE public.conduct_mi_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY conduct_mi_definitions_read ON public.conduct_mi_definitions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR ((NOT public.has_external_role(auth.uid()))
        AND public.has_permission(auth.uid(), 'market_conduct', 'view'))
  );

CREATE TRIGGER trg_conduct_mi_definitions_touch
  BEFORE UPDATE ON public.conduct_mi_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Evidence packs
-- ---------------------------------------------------------------------------
CREATE TABLE public.conduct_evidence_packs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         text NOT NULL UNIQUE,
  pack_type         text NOT NULL,
  subject_id        uuid,
  subject_key       text NOT NULL,
  subject_label     text NOT NULL,
  regulator_id      uuid,
  sector_id         uuid,
  sectors_in_view   uuid[] NOT NULL DEFAULT '{}'::uuid[],
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  current_version   integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'GENERATED',
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_evidence_packs_type_chk CHECK (pack_type IN
    ('entity','theme','emerging_risk','attention','plan','intervention','period_sector')),
  CONSTRAINT conduct_evidence_packs_status_chk CHECK (status IN ('GENERATED','SUPERSEDED','WITHDRAWN')),
  CONSTRAINT conduct_evidence_packs_period_chk CHECK (period_end >= period_start)
);

CREATE INDEX idx_cep_subject ON public.conduct_evidence_packs (pack_type, subject_id);
CREATE INDEX idx_cep_sector ON public.conduct_evidence_packs (sector_id);

GRANT SELECT ON public.conduct_evidence_packs TO authenticated;
GRANT ALL ON public.conduct_evidence_packs TO service_role;
ALTER TABLE public.conduct_evidence_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY conduct_evidence_packs_read ON public.conduct_evidence_packs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR ((NOT public.has_external_role(auth.uid()))
        AND public.has_permission(auth.uid(), 'market_conduct', 'view')
        AND public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
              regulator_id, sector_id, NULL::uuid, NULL::uuid, auth.uid()))
  );

CREATE TRIGGER trg_conduct_evidence_packs_touch
  BEFORE UPDATE ON public.conduct_evidence_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.conduct_evidence_pack_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id               uuid NOT NULL REFERENCES public.conduct_evidence_packs(id) ON DELETE CASCADE,
  version               integer NOT NULL,
  snapshot              jsonb NOT NULL,
  metric_package        jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_record_ids     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_assistance         jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts_signature       text NOT NULL,
  definition_version    text NOT NULL,
  regeneration_reason   text,
  generated_by          uuid,
  generated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_id, version)
);

GRANT SELECT ON public.conduct_evidence_pack_versions TO authenticated;
GRANT ALL ON public.conduct_evidence_pack_versions TO service_role;
ALTER TABLE public.conduct_evidence_pack_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY conduct_evidence_pack_versions_read ON public.conduct_evidence_pack_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conduct_evidence_packs p
     WHERE p.id = pack_id
       AND (public.is_super_admin(auth.uid())
            OR ((NOT public.has_external_role(auth.uid()))
                AND public.has_permission(auth.uid(), 'market_conduct', 'view')
                AND public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
                      p.regulator_id, p.sector_id, NULL::uuid, NULL::uuid, auth.uid())))
  ));

-- A generated pack version is historical evidence: never edited, never deleted.
CREATE OR REPLACE FUNCTION public.conduct_evidence_pack_version_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'evidence_pack_version_immutable: a generated evidence pack version cannot be % — generate a new version instead',
    lower(TG_OP) USING ERRCODE = '42501';
END $$;

CREATE TRIGGER trg_cepv_immutable
  BEFORE UPDATE OR DELETE ON public.conduct_evidence_pack_versions
  FOR EACH ROW EXECUTE FUNCTION public.conduct_evidence_pack_version_immutable();

CREATE TABLE public.conduct_evidence_pack_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id       uuid NOT NULL REFERENCES public.conduct_evidence_packs(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  format        text NOT NULL,
  scope         jsonb NOT NULL DEFAULT '{}'::jsonb,
  exported_by   uuid,
  exported_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cepx_format_chk CHECK (format IN ('pdf','html','csv','xlsx','json'))
);

GRANT SELECT ON public.conduct_evidence_pack_exports TO authenticated;
GRANT ALL ON public.conduct_evidence_pack_exports TO service_role;
ALTER TABLE public.conduct_evidence_pack_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY conduct_evidence_pack_exports_read ON public.conduct_evidence_pack_exports
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conduct_evidence_packs p
     WHERE p.id = pack_id
       AND (public.is_super_admin(auth.uid())
            OR ((NOT public.has_external_role(auth.uid()))
                AND public.has_permission(auth.uid(), 'market_conduct', 'view')
                AND public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
                      p.regulator_id, p.sector_id, NULL::uuid, NULL::uuid, auth.uid())))
  ));

-- ---------------------------------------------------------------------------
-- 3. Release debt register (carried-forward known failures)
-- ---------------------------------------------------------------------------
CREATE TABLE public.release_debt_register (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code               text NOT NULL UNIQUE,
  test_reference          text NOT NULL,
  assertion               text,
  title                   text NOT NULL,
  classification          text NOT NULL,
  description             text NOT NULL,
  security_blocking       boolean NOT NULL DEFAULT false,
  release_blocking        boolean NOT NULL DEFAULT true,
  status                  text NOT NULL DEFAULT 'OPEN',
  owner_role              text,
  raised_in_phase         text,
  target_phase            text NOT NULL DEFAULT 'MC-12',
  intended_verification   text NOT NULL,
  last_observed_at        timestamptz NOT NULL DEFAULT now(),
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rdr_status_chk CHECK (status IN ('OPEN','IN_PROGRESS','FIXED','ACCEPTED_RISK','ENVIRONMENT_BLOCKED')),
  CONSTRAINT rdr_class_chk CHECK (classification IN
    ('DATA_API_GRANT','PERMISSION_DEPENDENCY','RPC_HARDENING','STORAGE_POLICY','WORKFLOW_AUDIT','TEST_ENVIRONMENT'))
);

GRANT SELECT ON public.release_debt_register TO authenticated;
GRANT ALL ON public.release_debt_register TO service_role;
ALTER TABLE public.release_debt_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY release_debt_register_read ON public.release_debt_register
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR ((NOT public.has_external_role(auth.uid()))
        AND (public.has_permission(auth.uid(), 'audit', 'view')
             OR public.has_permission(auth.uid(), 'market_conduct', 'view')))
  );

CREATE TRIGGER trg_rdr_touch
  BEFORE UPDATE ON public.release_debt_register
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();