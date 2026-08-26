-- ============================================================================
-- MC-10 — Supervisory Planning, Prioritisation & Intervention Management
-- (Slice 1: deterministic prioritisation + governed intervention register)
--
-- Principles carried forward from MC-05..MC-09:
--   * Deterministic facts are authoritative. Prioritisation is arithmetic over
--     recorded complaints / signals / patterns / confirmed emerging risks with a
--     stated weighting configuration and a stated method. No AI, no estimation.
--   * Sector scope is recalculated server-side and fails closed.
--   * No direct DML: every write goes through a governed SECURITY DEFINER RPC.
--   * Human authority is explicit: maker (propose) and checker (endorse/reject)
--     must be different people.
--   * Decision history is append-only.
-- ============================================================================

-- Canonical market-conduct authority helper (single normalization contract).
CREATE OR REPLACE FUNCTION public.market_conduct_require(_actions text[])
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _a text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;
  FOREACH _a IN ARRAY _actions LOOP
    IF public.has_permission(_uid, 'market_conduct', _a) THEN RETURN _uid; END IF;
  END LOOP;
  RAISE EXCEPTION 'not_authorized: market_conduct.%', _actions[1] USING ERRCODE = '42501';
END $$;

-- ---------------------------------------------------------------- weighting
CREATE TABLE IF NOT EXISTS public.conduct_priority_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  complaint_weight numeric NOT NULL DEFAULT 1.0,
  signal_weight numeric NOT NULL DEFAULT 2.0,
  pattern_weight numeric NOT NULL DEFAULT 4.0,
  emerging_risk_weight numeric NOT NULL DEFAULT 6.0,
  window_days integer NOT NULL DEFAULT 180,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_priority_configs_window_chk CHECK (window_days BETWEEN 1 AND 1095)
);

GRANT SELECT ON public.conduct_priority_configs TO authenticated;
GRANT ALL ON public.conduct_priority_configs TO service_role;
ALTER TABLE public.conduct_priority_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conduct_priority_configs_read ON public.conduct_priority_configs;
CREATE POLICY conduct_priority_configs_read ON public.conduct_priority_configs
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid())
       OR public.has_permission(auth.uid(), 'market_conduct', 'view'));

INSERT INTO public.conduct_priority_configs(code, name, description)
VALUES ('MC_DEFAULT', 'Default conduct prioritisation weighting',
        'Recorded complaints, conduct signals, detected patterns and confirmed emerging risks over the stated window.')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- runs
CREATE TABLE IF NOT EXISTS public.conduct_priority_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.conduct_priority_configs(id),
  regulator_id uuid,
  sector_id uuid,
  sectors_in_view uuid[] NOT NULL DEFAULT '{}'::uuid[],
  all_sectors boolean NOT NULL DEFAULT false,
  window_start date NOT NULL,
  window_end date NOT NULL,
  window_days integer NOT NULL,
  entity_count integer NOT NULL DEFAULT 0,
  method text NOT NULL,
  computed_by uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conduct_priority_runs_computed_idx
  ON public.conduct_priority_runs (computed_at DESC);

GRANT SELECT ON public.conduct_priority_runs TO authenticated;
GRANT ALL ON public.conduct_priority_runs TO service_role;
ALTER TABLE public.conduct_priority_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conduct_priority_runs_read ON public.conduct_priority_runs;
CREATE POLICY conduct_priority_runs_read ON public.conduct_priority_runs
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid())
       OR (public.has_permission(auth.uid(), 'market_conduct', 'view')
           AND (computed_by = auth.uid()
                OR sector_id IS NULL
                OR public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
                     regulator_id, sector_id, NULL, NULL, auth.uid()))));

-- ---------------------------------------------------------------- scores
CREATE TABLE IF NOT EXISTS public.conduct_priority_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.conduct_priority_runs(id) ON DELETE CASCADE,
  licensee_id uuid,
  licensee_name text,
  sector_id uuid,
  complaint_count integer NOT NULL DEFAULT 0,
  signal_count integer NOT NULL DEFAULT 0,
  pattern_count integer NOT NULL DEFAULT 0,
  emerging_risk_count integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  rank integer NOT NULL DEFAULT 0,
  drivers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conduct_priority_scores_run_idx
  ON public.conduct_priority_scores (run_id, rank);

GRANT SELECT ON public.conduct_priority_scores TO authenticated;
GRANT ALL ON public.conduct_priority_scores TO service_role;
ALTER TABLE public.conduct_priority_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conduct_priority_scores_read ON public.conduct_priority_scores;
CREATE POLICY conduct_priority_scores_read ON public.conduct_priority_scores
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_priority_runs r WHERE r.id = conduct_priority_scores.run_id)
       AND (public.is_super_admin(auth.uid())
            OR sector_id IS NULL
            OR public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
                 NULL, sector_id, NULL, NULL, auth.uid())));

-- ---------------------------------------------------------------- interventions
CREATE SEQUENCE IF NOT EXISTS public.conduct_intervention_ref_seq;

CREATE TABLE IF NOT EXISTS public.conduct_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  regulator_id uuid,
  sector_id uuid,
  licensee_id uuid,
  theme text,
  emerging_risk_id uuid REFERENCES public.conduct_emerging_risks(id),
  priority_score_id uuid REFERENCES public.conduct_priority_scores(id),
  intervention_type text NOT NULL,
  title text NOT NULL,
  basis text NOT NULL,
  expected_outcome text,
  planned_start date,
  planned_end date,
  owner_id uuid,
  status text NOT NULL DEFAULT 'PROPOSED',
  proposed_by uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_rationale text,
  activated_at timestamptz,
  completed_at timestamptz,
  outcome_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_interventions_type_chk CHECK (intervention_type IN
    ('SUPERVISORY_ENGAGEMENT','INFORMATION_REQUEST','ENHANCED_MONITORING',
     'THEMATIC_REVIEW','ONSITE_EXAMINATION','FORMAL_INVESTIGATION','ENFORCEMENT_REFERRAL')),
  CONSTRAINT conduct_interventions_status_chk CHECK (status IN
    ('PROPOSED','ENDORSED','REJECTED','ACTIVE','COMPLETED','CANCELLED')),
  CONSTRAINT conduct_interventions_subject_chk CHECK (
    licensee_id IS NOT NULL OR emerging_risk_id IS NOT NULL OR nullif(btrim(coalesce(theme,'')),'') IS NOT NULL),
  CONSTRAINT conduct_interventions_basis_chk CHECK (length(btrim(basis)) >= 20),
  CONSTRAINT conduct_interventions_dates_chk CHECK (
    planned_start IS NULL OR planned_end IS NULL OR planned_end >= planned_start)
);

CREATE INDEX IF NOT EXISTS conduct_interventions_status_idx
  ON public.conduct_interventions (status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS conduct_interventions_licensee_idx
  ON public.conduct_interventions (licensee_id);

GRANT SELECT ON public.conduct_interventions TO authenticated;
GRANT ALL ON public.conduct_interventions TO service_role;
ALTER TABLE public.conduct_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conduct_interventions_read ON public.conduct_interventions;
CREATE POLICY conduct_interventions_read ON public.conduct_interventions
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid())
       OR (public.has_permission(auth.uid(), 'market_conduct', 'view')
           AND public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
                 regulator_id, sector_id, NULL, NULL, auth.uid())));

CREATE TABLE IF NOT EXISTS public.conduct_intervention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id uuid NOT NULL REFERENCES public.conduct_interventions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  rationale text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conduct_intervention_events_idx
  ON public.conduct_intervention_events (intervention_id, created_at);

GRANT SELECT ON public.conduct_intervention_events TO authenticated;
GRANT ALL ON public.conduct_intervention_events TO service_role;
ALTER TABLE public.conduct_intervention_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conduct_intervention_events_read ON public.conduct_intervention_events;
CREATE POLICY conduct_intervention_events_read ON public.conduct_intervention_events
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_interventions i
                WHERE i.id = conduct_intervention_events.intervention_id));

-- History is append-only: no edits, no deletes, ever.
CREATE OR REPLACE FUNCTION public.tg_conduct_intervention_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'conduct_intervention_events is append-only' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS conduct_intervention_events_append_only ON public.conduct_intervention_events;
CREATE TRIGGER conduct_intervention_events_append_only
BEFORE UPDATE OR DELETE ON public.conduct_intervention_events
FOR EACH ROW EXECUTE FUNCTION public.tg_conduct_intervention_events_append_only();
