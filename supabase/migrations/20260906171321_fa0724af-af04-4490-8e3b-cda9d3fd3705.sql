-- OS-02F — Supervisory Management Assurance & Control: foundations.

CREATE TABLE public.supervisory_signal_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.supervisory_signal(id) ON DELETE CASCADE,
  entity_id uuid,
  domain_code text NOT NULL,
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  review_note text,
  occurrence_count_at_review integer,
  last_detected_at_at_review timestamptz,
  disposition text,
  disposition_rationale text,
  disposition_by uuid,
  disposition_at timestamptz,
  linked_module text,
  linked_record_id uuid,
  linked_reference text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_signal_review_disposition_chk CHECK (
    disposition IS NULL OR disposition IN (
      'ACTION_OPENED','REASSESSMENT_REQUIRED','COVERED_BY_EXISTING_ACTION',
      'REFERRED','NO_ACTION_REQUIRED')),
  CONSTRAINT supervisory_signal_review_accountable_chk CHECK (
    disposition IS NULL
    OR (disposition_by IS NOT NULL AND disposition_at IS NOT NULL)),
  CONSTRAINT supervisory_signal_review_no_action_reason_chk CHECK (
    disposition IS DISTINCT FROM 'NO_ACTION_REQUIRED'
    OR (disposition_rationale IS NOT NULL
        AND length(btrim(disposition_rationale)) >= 10)),
  CONSTRAINT supervisory_signal_review_link_chk CHECK (
    disposition NOT IN ('ACTION_OPENED','REASSESSMENT_REQUIRED','COVERED_BY_EXISTING_ACTION')
    OR (linked_module IS NOT NULL AND linked_record_id IS NOT NULL)
  )
);

CREATE INDEX ix_supervisory_signal_review_signal
  ON public.supervisory_signal_review (signal_id, reviewed_at DESC);
CREATE INDEX ix_supervisory_signal_review_entity_domain
  ON public.supervisory_signal_review (entity_id, domain_code);

GRANT SELECT, INSERT, UPDATE ON public.supervisory_signal_review TO authenticated;
GRANT ALL ON public.supervisory_signal_review TO service_role;
ALTER TABLE public.supervisory_signal_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY supervisory_signal_review_read
  ON public.supervisory_signal_review FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_any_permission(auth.uid(), ARRAY[
        'supervisory_spine.view','prudential_supervision.view',
        'market_conduct.run_conduct_analytics','aml_supervision.view'])
  );

CREATE POLICY supervisory_signal_review_insert
  ON public.supervisory_signal_review FOR INSERT TO authenticated
  WITH CHECK (
    reviewed_by = auth.uid()
    AND (public.is_super_admin(auth.uid())
         OR public.has_any_permission(auth.uid(), ARRAY[
             'supervisory_spine.view','prudential_supervision.view',
             'market_conduct.run_conduct_analytics','aml_supervision.view']))
  );

CREATE POLICY supervisory_signal_review_update_own
  ON public.supervisory_signal_review FOR UPDATE TO authenticated
  USING (reviewed_by = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (reviewed_by = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_supervisory_signal_review_updated_at
  BEFORE UPDATE ON public.supervisory_signal_review
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Governed assurance tolerances (used only where no canonical deadline exists)
-- ---------------------------------------------------------------------------
CREATE TABLE public.supervisory_assurance_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  domain_code text,
  config_owner text NOT NULL,
  awaiting_review_tolerance_days integer NOT NULL,
  stale_activity_tolerance_days integer NOT NULL,
  repeat_occurrence_threshold integer NOT NULL,
  repeat_distinct_day_threshold integer NOT NULL DEFAULT 2,
  material_severities text[] NOT NULL DEFAULT ARRAY['critical','high'],
  version integer NOT NULL DEFAULT 1,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assurance_policy_version_uq UNIQUE (code, version),
  CONSTRAINT supervisory_assurance_policy_days_chk CHECK (
    awaiting_review_tolerance_days > 0 AND stale_activity_tolerance_days > 0
    AND repeat_occurrence_threshold >= 2 AND repeat_distinct_day_threshold >= 1)
);

CREATE INDEX ix_supervisory_assurance_policy_domain
  ON public.supervisory_assurance_policy (domain_code, is_active, effective_from DESC);

GRANT SELECT ON public.supervisory_assurance_policy TO authenticated;
GRANT ALL ON public.supervisory_assurance_policy TO service_role;
ALTER TABLE public.supervisory_assurance_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY supervisory_assurance_policy_read
  ON public.supervisory_assurance_policy FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_any_permission(auth.uid(), ARRAY[
        'supervisory_spine.view','prudential_supervision.view',
        'market_conduct.run_conduct_analytics','aml_supervision.view',
        'system_configuration.view','system_configuration.edit'])
  );

CREATE POLICY supervisory_assurance_policy_write
  ON public.supervisory_assurance_policy FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_any_permission(auth.uid(), ARRAY['system_configuration.edit']))
  WITH CHECK (public.is_super_admin(auth.uid())
         OR public.has_any_permission(auth.uid(), ARRAY['system_configuration.edit']));

CREATE TRIGGER trg_supervisory_assurance_policy_updated_at
  BEFORE UPDATE ON public.supervisory_assurance_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.supervisory_signal_review IS
  'OS-02F: accountable supervisory review/disposition of a canonical detected condition (supervisory_signal). Not a management case object; it records a supervisory decision only.';
COMMENT ON TABLE public.supervisory_assurance_policy IS
  'OS-02F: owned, versioned, effective-dated assurance tolerances applied only where no canonical deadline exists.';