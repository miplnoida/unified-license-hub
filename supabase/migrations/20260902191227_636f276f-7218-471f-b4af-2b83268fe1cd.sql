-- ============================================================
-- EPIC 2 — CANONICAL ENTERPRISE SUPERVISORY SPINE (schema)
-- Additive + idempotent. Existing populations preserved.
-- ============================================================

-- ---------- 0. domain vocabulary helper ----------
CREATE OR REPLACE FUNCTION public.supervisory_domain_valid(_domain text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _domain IN ('PRUDENTIAL','AML_CFT','MARKET_CONDUCT','OPERATIONAL_RESILIENCE',
                     'GOVERNANCE','CYBER','CROSS_DOMAIN')
$$;
REVOKE ALL ON FUNCTION public.supervisory_domain_valid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_valid(text) TO authenticated, service_role;

-- ---------- 1. canonical renames (conduct -> domain neutral) ----------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('conduct_attention_items','supervisory_attention'),
      ('conduct_attention_events','supervisory_attention_event'),
      ('conduct_attention_priority_calcs','supervisory_attention_priority_calc'),
      ('conduct_attention_reassessments','supervisory_attention_reassessment'),
      ('conduct_supervisory_plans','supervisory_plan'),
      ('conduct_plan_events','supervisory_plan_event'),
      ('conduct_plan_milestones','supervisory_plan_item'),
      ('conduct_interventions','supervisory_intervention'),
      ('conduct_intervention_events','supervisory_intervention_event'),
      ('conduct_intervention_types','supervisory_intervention_type'),
      ('supervisory_plans','legacy_supervisory_plans'),
      ('supervisory_plan_actions','legacy_supervisory_plan_actions')
    ) AS v(old_name, new_name)
  LOOP
    IF to_regclass('public.'||r.new_name) IS NULL
       AND to_regclass('public.'||r.old_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;

-- ---------- 2. compatibility views under the legacy names ----------
-- security_invoker keeps base-table RLS authoritative.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('conduct_attention_items','supervisory_attention'),
      ('conduct_attention_events','supervisory_attention_event'),
      ('conduct_attention_priority_calcs','supervisory_attention_priority_calc'),
      ('conduct_attention_reassessments','supervisory_attention_reassessment'),
      ('conduct_supervisory_plans','supervisory_plan'),
      ('conduct_plan_events','supervisory_plan_event'),
      ('conduct_plan_milestones','supervisory_plan_item'),
      ('conduct_interventions','supervisory_intervention'),
      ('conduct_intervention_events','supervisory_intervention_event'),
      ('conduct_intervention_types','supervisory_intervention_type'),
      ('supervisory_plans','legacy_supervisory_plans'),
      ('supervisory_plan_actions','legacy_supervisory_plan_actions')
    ) AS v(view_name, base_name)
  LOOP
    IF to_regclass('public.'||r.view_name) IS NULL THEN
      EXECUTE format(
        'CREATE VIEW public.%I WITH (security_invoker = true) AS SELECT * FROM public.%I',
        r.view_name, r.base_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.view_name);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', r.view_name);
      EXECUTE format('COMMENT ON VIEW public.%I IS %L', r.view_name,
        'EPIC 2 compatibility view over public.'||r.base_name||'. Canonical writes should target the base relation.');
    END IF;
  END LOOP;
END $$;

-- ---------- 3. generalise attention / plan / intervention ----------
ALTER TABLE public.supervisory_attention
  ADD COLUMN IF NOT EXISTS domain_code text NOT NULL DEFAULT 'MARKET_CONDUCT',
  ADD COLUMN IF NOT EXISTS origin_kind text;
ALTER TABLE public.supervisory_attention
  DROP CONSTRAINT IF EXISTS supervisory_attention_domain_chk;
ALTER TABLE public.supervisory_attention
  ADD CONSTRAINT supervisory_attention_domain_chk CHECK (public.supervisory_domain_valid(domain_code));
ALTER TABLE public.supervisory_attention
  DROP CONSTRAINT IF EXISTS supervisory_attention_origin_kind_chk;
ALTER TABLE public.supervisory_attention
  ADD CONSTRAINT supervisory_attention_origin_kind_chk CHECK (
    origin_kind IS NULL OR origin_kind IN (
      'SUPERVISORY_ASSESSMENT','RETURN_BREACH','EWI_SIGNAL','AML_RISK','CONDUCT_SIGNAL',
      'COMPLAINT_PATTERN','MATERIAL_CHANGE','RESILIENCE_INCIDENT','FIT_AND_PROPER_CONCERN',
      'FINDING','UNRESOLVED_REMEDIATION','ENFORCEMENT_OUTCOME','CROSS_ENTITY_THEME',
      'OTHER_GOVERNED_SOURCE'));

ALTER TABLE public.supervisory_plan
  ADD COLUMN IF NOT EXISTS domain_code text NOT NULL DEFAULT 'MARKET_CONDUCT';
ALTER TABLE public.supervisory_plan
  DROP CONSTRAINT IF EXISTS supervisory_plan_domain_chk;
ALTER TABLE public.supervisory_plan
  ADD CONSTRAINT supervisory_plan_domain_chk CHECK (public.supervisory_domain_valid(domain_code));

ALTER TABLE public.supervisory_plan_item
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'MILESTONE',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS team_id uuid,
  ADD COLUMN IF NOT EXISTS depends_on_item_id uuid REFERENCES public.supervisory_plan_item(id),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PLAN';

ALTER TABLE public.supervisory_intervention
  ADD COLUMN IF NOT EXISTS domain_code text NOT NULL DEFAULT 'MARKET_CONDUCT',
  ADD COLUMN IF NOT EXISTS examination_id uuid REFERENCES public.examinations(id),
  ADD COLUMN IF NOT EXISTS thematic_review_id uuid REFERENCES public.thematic_reviews(id),
  ADD COLUMN IF NOT EXISTS investigation_id uuid REFERENCES public.conduct_investigations(id);
ALTER TABLE public.supervisory_intervention
  DROP CONSTRAINT IF EXISTS supervisory_intervention_domain_chk;
ALTER TABLE public.supervisory_intervention
  ADD CONSTRAINT supervisory_intervention_domain_chk CHECK (public.supervisory_domain_valid(domain_code));
-- exactly one canonical activity FK at most; canonical_module/route remain derived metadata only
ALTER TABLE public.supervisory_intervention
  DROP CONSTRAINT IF EXISTS supervisory_intervention_activity_single_chk;
ALTER TABLE public.supervisory_intervention
  ADD CONSTRAINT supervisory_intervention_activity_single_chk CHECK (
    (CASE WHEN examination_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN thematic_review_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN investigation_id IS NOT NULL THEN 1 ELSE 0 END) <= 1);
-- enterprise intervention type vocabulary
ALTER TABLE public.supervisory_intervention
  DROP CONSTRAINT IF EXISTS conduct_interventions_type_chk;
ALTER TABLE public.supervisory_intervention
  ADD CONSTRAINT supervisory_intervention_type_chk CHECK (intervention_type IN (
    'DESK_REVIEW','SUPERVISORY_MEETING','SUPERVISORY_ENGAGEMENT','INFORMATION_REQUEST',
    'ONSITE_EXAMINATION','OFFSITE_REVIEW','TARGETED_EXAMINATION','FULL_SCOPE_EXAMINATION',
    'FOLLOW_UP_REVIEW','THEMATIC_REVIEW','INVESTIGATION','FORMAL_INVESTIGATION',
    'ENHANCED_MONITORING','REMEDIATION_FOLLOWUP','FORMAL_FINDING','ESCALATION_REFERRAL',
    'ENFORCEMENT_REFERRAL'));

ALTER TABLE public.supervisory_intervention_type
  ADD COLUMN IF NOT EXISTS domains text[] NOT NULL DEFAULT ARRAY['MARKET_CONDUCT'],
  ADD COLUMN IF NOT EXISTS canonical_activity_kind text;

-- ---------- 4. methodology configuration ----------
CREATE TABLE IF NOT EXISTS public.supervisory_methodology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  domain_code text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  sector_id uuid REFERENCES public.sectors(id),
  regulator_id uuid,
  effective_from date,
  effective_to date,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_methodology_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT supervisory_methodology_status_chk CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')),
  CONSTRAINT supervisory_methodology_code_version_uniq UNIQUE (code, version)
);
GRANT SELECT ON public.supervisory_methodology TO authenticated;
GRANT INSERT, UPDATE ON public.supervisory_methodology TO authenticated;
GRANT ALL ON public.supervisory_methodology TO service_role;
ALTER TABLE public.supervisory_methodology ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supervisory_methodology_dimension (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  dimension_code text NOT NULL,
  dimension_group text NOT NULL,
  label text NOT NULL,
  description text,
  weight numeric,
  evidence_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_methodology_dimension_group_chk
    CHECK (dimension_group IN ('INHERENT_RISK','CONTROL_EFFECTIVENESS','COMPOSITE','OTHER')),
  CONSTRAINT supervisory_methodology_dimension_uniq UNIQUE (methodology_id, dimension_code)
);
GRANT SELECT, INSERT, UPDATE ON public.supervisory_methodology_dimension TO authenticated;
GRANT ALL ON public.supervisory_methodology_dimension TO service_role;
ALTER TABLE public.supervisory_methodology_dimension ENABLE ROW LEVEL SECURITY;

-- ---------- 5. canonical assessment envelope ----------
CREATE SEQUENCE IF NOT EXISTS public.supervisory_assessment_ref_seq;

CREATE TABLE IF NOT EXISTS public.supervisory_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  entity_id uuid NOT NULL REFERENCES public.licensees(id),
  domain_code text NOT NULL,
  assessment_type text NOT NULL DEFAULT 'PERIODIC',
  methodology_id uuid REFERENCES public.supervisory_methodology(id),
  methodology_version text,
  period_start date,
  period_end date,
  trigger_type text NOT NULL DEFAULT 'PERIODIC',
  trigger_reference text,
  trigger_signal_id uuid,
  owner_id uuid REFERENCES auth.users(id),
  team_id uuid,
  regulator_id uuid,
  sector_id uuid REFERENCES public.sectors(id),
  status text NOT NULL DEFAULT 'draft',
  inherent_rating text,
  control_rating text,
  residual_rating text,
  overall_rating text,
  summary text,
  confidentiality text NOT NULL DEFAULT 'STANDARD',
  assessment_date date,
  next_review_date date,
  supersedes_id uuid REFERENCES public.supervisory_assessment(id),
  is_current boolean NOT NULL DEFAULT true,
  origin_provenance text NOT NULL DEFAULT 'GOVERNED',
  created_by uuid REFERENCES auth.users(id),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT supervisory_assessment_status_chk CHECK (status IN
    ('draft','submitted','reviewed','returned_for_revision','approved','closed','superseded')),
  CONSTRAINT supervisory_assessment_trigger_chk CHECK (trigger_type IN
    ('PERIODIC','EVENT_DRIVEN','THEMATIC','REASSESSMENT','FOLLOW_UP','LEGACY_UNKNOWN')),
  CONSTRAINT supervisory_assessment_confidentiality_chk CHECK (confidentiality IN ('STANDARD','CONFIDENTIAL')),
  CONSTRAINT supervisory_assessment_origin_chk CHECK (origin_provenance IN ('GOVERNED','BACKFILL_DETERMINISTIC','LEGACY_UNKNOWN')),
  CONSTRAINT supervisory_assessment_period_chk CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS supervisory_assessment_entity_domain_idx
  ON public.supervisory_assessment (entity_id, domain_code, is_current);
GRANT SELECT, INSERT, UPDATE ON public.supervisory_assessment TO authenticated;
GRANT ALL ON public.supervisory_assessment TO service_role;
ALTER TABLE public.supervisory_assessment ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supervisory_assessment_dimension (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  methodology_dimension_id uuid REFERENCES public.supervisory_methodology_dimension(id),
  dimension_code text NOT NULL,
  dimension_group text NOT NULL DEFAULT 'OTHER',
  weight numeric,
  inherent_rating text,
  control_rating text,
  residual_rating text,
  score numeric,
  rationale text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_dimension_uniq UNIQUE (assessment_id, dimension_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisory_assessment_dimension TO authenticated;
GRANT ALL ON public.supervisory_assessment_dimension TO service_role;
ALTER TABLE public.supervisory_assessment_dimension ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supervisory_assessment_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  rationale text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.supervisory_assessment_event TO authenticated;
GRANT ALL ON public.supervisory_assessment_event TO service_role;
ALTER TABLE public.supervisory_assessment_event ENABLE ROW LEVEL SECURITY;

-- domain extensions attach to the canonical identity by real FK
ALTER TABLE public.prudential_assessments
  ADD COLUMN IF NOT EXISTS supervisory_assessment_id uuid REFERENCES public.supervisory_assessment(id);
CREATE UNIQUE INDEX IF NOT EXISTS prudential_assessments_supervisory_assessment_uniq
  ON public.prudential_assessments (supervisory_assessment_id)
  WHERE supervisory_assessment_id IS NOT NULL;
ALTER TABLE public.aml_assessments
  ADD COLUMN IF NOT EXISTS supervisory_assessment_id uuid REFERENCES public.supervisory_assessment(id);
CREATE UNIQUE INDEX IF NOT EXISTS aml_assessments_supervisory_assessment_uniq
  ON public.aml_assessments (supervisory_assessment_id)
  WHERE supervisory_assessment_id IS NOT NULL;

-- ---------- 6. supervisory fact / signal base ----------
CREATE TABLE IF NOT EXISTS public.supervisory_signal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.licensees(id),
  domain_code text NOT NULL,
  source_kind text NOT NULL,
  severity text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  period_start date,
  period_end date,
  summary text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  prudential_ewi_alert_id uuid REFERENCES public.prudential_ewi_alerts(id),
  complaint_id uuid REFERENCES public.complaints(id),
  conduct_signal_id uuid REFERENCES public.conduct_signals(id),
  fp_assessment_id uuid REFERENCES public.fp_assessments(id),
  examination_id uuid REFERENCES public.examinations(id),
  external_reference text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_signal_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT supervisory_signal_source_chk CHECK (source_kind IN
    ('EWI_SIGNAL','RETURN_BREACH','COMPLAINT_PATTERN','CONDUCT_SIGNAL','AML_RISK',
     'FIT_AND_PROPER_CONCERN','RESILIENCE_INCIDENT','EXAMINATION_OUTCOME','MATERIAL_CHANGE',
     'OTHER_GOVERNED_SOURCE')),
  CONSTRAINT supervisory_signal_provenance_chk CHECK (
    prudential_ewi_alert_id IS NOT NULL OR complaint_id IS NOT NULL
    OR conduct_signal_id IS NOT NULL OR fp_assessment_id IS NOT NULL
    OR examination_id IS NOT NULL
    OR (source_kind = 'OTHER_GOVERNED_SOURCE' AND external_reference IS NOT NULL))
);
GRANT SELECT, INSERT ON public.supervisory_signal TO authenticated;
GRANT ALL ON public.supervisory_signal TO service_role;
ALTER TABLE public.supervisory_signal ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supervisory_assessment
  DROP CONSTRAINT IF EXISTS supervisory_assessment_trigger_signal_fkey;
ALTER TABLE public.supervisory_assessment
  ADD CONSTRAINT supervisory_assessment_trigger_signal_fkey
  FOREIGN KEY (trigger_signal_id) REFERENCES public.supervisory_signal(id);

CREATE TABLE IF NOT EXISTS public.supervisory_assessment_signal (
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES public.supervisory_signal(id) ON DELETE CASCADE,
  relevance text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, signal_id)
);
GRANT SELECT, INSERT, DELETE ON public.supervisory_assessment_signal TO authenticated;
GRANT ALL ON public.supervisory_assessment_signal TO service_role;
ALTER TABLE public.supervisory_assessment_signal ENABLE ROW LEVEL SECURITY;

-- ---------- 7. attention / plan provenance link tables ----------
CREATE TABLE IF NOT EXISTS public.supervisory_attention_origin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attention_id uuid NOT NULL REFERENCES public.supervisory_attention(id) ON DELETE CASCADE,
  origin_kind text NOT NULL,
  assessment_id uuid REFERENCES public.supervisory_assessment(id),
  assessment_dimension_id uuid REFERENCES public.supervisory_assessment_dimension(id),
  signal_id uuid REFERENCES public.supervisory_signal(id),
  examination_id uuid REFERENCES public.examinations(id),
  complaint_id uuid REFERENCES public.complaints(id),
  external_reference text,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_attention_origin_kind_chk CHECK (origin_kind IN (
    'SUPERVISORY_ASSESSMENT','RETURN_BREACH','EWI_SIGNAL','AML_RISK','CONDUCT_SIGNAL',
    'COMPLAINT_PATTERN','MATERIAL_CHANGE','RESILIENCE_INCIDENT','FIT_AND_PROPER_CONCERN',
    'FINDING','UNRESOLVED_REMEDIATION','ENFORCEMENT_OUTCOME','CROSS_ENTITY_THEME',
    'OTHER_GOVERNED_SOURCE')),
  CONSTRAINT supervisory_attention_origin_provenance_chk CHECK (
    assessment_id IS NOT NULL OR assessment_dimension_id IS NOT NULL OR signal_id IS NOT NULL
    OR examination_id IS NOT NULL OR complaint_id IS NOT NULL
    OR (origin_kind IN ('CROSS_ENTITY_THEME','OTHER_GOVERNED_SOURCE') AND external_reference IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS supervisory_attention_origin_attention_idx
  ON public.supervisory_attention_origin (attention_id);
GRANT SELECT, INSERT, DELETE ON public.supervisory_attention_origin TO authenticated;
GRANT ALL ON public.supervisory_attention_origin TO service_role;
ALTER TABLE public.supervisory_attention_origin ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supervisory_plan_assessment (
  plan_id uuid NOT NULL REFERENCES public.supervisory_plan(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  justification text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, assessment_id)
);
GRANT SELECT, INSERT, DELETE ON public.supervisory_plan_assessment TO authenticated;
GRANT ALL ON public.supervisory_plan_assessment TO service_role;
ALTER TABLE public.supervisory_plan_assessment ENABLE ROW LEVEL SECURITY;

-- ---------- 8. canonical examination engine generalisation ----------
ALTER TABLE public.examinations
  ADD COLUMN IF NOT EXISTS domain_code text,
  ADD COLUMN IF NOT EXISTS engagement_type text,
  ADD COLUMN IF NOT EXISTS intervention_id uuid REFERENCES public.supervisory_intervention(id),
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.supervisory_plan(id),
  ADD COLUMN IF NOT EXISTS methodology_id uuid REFERENCES public.supervisory_methodology(id),
  ADD COLUMN IF NOT EXISTS trigger_type text,
  ADD COLUMN IF NOT EXISTS origin_provenance text NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN IF NOT EXISTS reassessment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reassessment_rationale text;
ALTER TABLE public.examinations
  DROP CONSTRAINT IF EXISTS examinations_domain_chk;
ALTER TABLE public.examinations
  ADD CONSTRAINT examinations_domain_chk
  CHECK (domain_code IS NULL OR public.supervisory_domain_valid(domain_code));
ALTER TABLE public.examinations
  DROP CONSTRAINT IF EXISTS examinations_engagement_type_chk;
ALTER TABLE public.examinations
  ADD CONSTRAINT examinations_engagement_type_chk CHECK (engagement_type IS NULL OR engagement_type IN (
    'FULL_SCOPE_ONSITE','TARGETED_ONSITE','OFFSITE_REVIEW','FOLLOW_UP_REVIEW',
    'JOINT_EXAMINATION','THEMATIC_EXAMINATION'));
ALTER TABLE public.examinations
  DROP CONSTRAINT IF EXISTS examinations_origin_provenance_chk;
ALTER TABLE public.examinations
  ADD CONSTRAINT examinations_origin_provenance_chk
  CHECK (origin_provenance IN ('GOVERNED','BACKFILL_DETERMINISTIC','LEGACY_UNKNOWN'));
-- engagement type is never a lifecycle stage
ALTER TABLE public.examinations
  DROP CONSTRAINT IF EXISTS examinations_stage_not_engagement_chk;
ALTER TABLE public.examinations
  ADD CONSTRAINT examinations_stage_not_engagement_chk CHECK (
    upper(COALESCE(stage,'')) NOT IN ('OFFSITE_REVIEW','FULL_SCOPE_ONSITE','TARGETED_ONSITE',
      'FOLLOW_UP_REVIEW','JOINT_EXAMINATION','THEMATIC_EXAMINATION'));

CREATE TABLE IF NOT EXISTS public.examination_origin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id uuid NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES public.supervisory_assessment(id),
  assessment_dimension_id uuid REFERENCES public.supervisory_assessment_dimension(id),
  attention_id uuid REFERENCES public.supervisory_attention(id),
  signal_id uuid REFERENCES public.supervisory_signal(id),
  origin_role text NOT NULL DEFAULT 'DRIVING_ASSESSMENT',
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT examination_origin_role_chk CHECK (origin_role IN
    ('DRIVING_ASSESSMENT','RISK_FOCUS','SUPPORTING_SIGNAL','ATTENTION')),
  CONSTRAINT examination_origin_provenance_chk CHECK (
    assessment_id IS NOT NULL OR assessment_dimension_id IS NOT NULL
    OR attention_id IS NOT NULL OR signal_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS examination_origin_assessment_uniq
  ON public.examination_origin (examination_id, assessment_id, origin_role)
  WHERE assessment_id IS NOT NULL;
GRANT SELECT, INSERT, DELETE ON public.examination_origin TO authenticated;
GRANT ALL ON public.examination_origin TO service_role;
ALTER TABLE public.examination_origin ENABLE ROW LEVEL SECURITY;

-- examination scope items may bind to an assessment dimension
ALTER TABLE public.examination_scoping
  ADD COLUMN IF NOT EXISTS assessment_dimension_id uuid REFERENCES public.supervisory_assessment_dimension(id);

-- ---------- 9. authoritative entity risk state (single writer) ----------
CREATE TABLE IF NOT EXISTS public.entity_risk_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id),
  domain_code text NOT NULL,
  residual_rating text,
  inherent_rating text,
  control_rating text,
  driving_assessment_id uuid REFERENCES public.supervisory_assessment(id),
  effective_from timestamptz NOT NULL DEFAULT now(),
  last_review_date date,
  next_review_date date,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_risk_state_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT entity_risk_state_uniq UNIQUE (entity_id, domain_code)
);
GRANT SELECT ON public.entity_risk_state TO authenticated;
GRANT ALL ON public.entity_risk_state TO service_role;
ALTER TABLE public.entity_risk_state ENABLE ROW LEVEL SECURITY;

-- I-03: only an approved human assessment transition may write risk state.
CREATE OR REPLACE FUNCTION public.entity_risk_state_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.supervisory_risk_state_writer', true) IS DISTINCT FROM 'assessment_transition' THEN
    RAISE EXCEPTION 'entity_risk_state is written only by an approved supervisory assessment transition'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS entity_risk_state_guard_trg ON public.entity_risk_state;
CREATE TRIGGER entity_risk_state_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.entity_risk_state
  FOR EACH ROW EXECUTE FUNCTION public.entity_risk_state_guard();

-- ---------- 10. legacy inspections: read-only for new supervisory work ----------
COMMENT ON TABLE public.inspections IS
  'LEGACY (EPIC 2): superseded by public.examinations. Reads retained; new rows blocked.';
CREATE OR REPLACE FUNCTION public.inspections_legacy_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'legacy_path_retired: new supervisory activity must be created as an examination (public.examinations)'
    USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS inspections_legacy_write_guard_trg ON public.inspections;
CREATE TRIGGER inspections_legacy_write_guard_trg
  BEFORE INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspections_legacy_write_guard();

COMMENT ON TABLE public.legacy_supervisory_plans IS
  'LEGACY (EPIC 2): transitional simple plan store. Canonical planning is public.supervisory_plan.';

-- ---------- 11. RLS policies for the new canonical tables ----------
DO $$
DECLARE t text;
  read_perms text := $q$ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.run_conduct_analytics','aml_supervision.view']$q$;
  write_perms text := $q$ARRAY['supervisory_spine.create','supervisory_spine.edit','prudential_supervision.record_camels_assessment','market_conduct.run_conduct_analytics']$q$;
BEGIN
  FOREACH t IN ARRAY ARRAY['supervisory_methodology','supervisory_methodology_dimension',
      'supervisory_assessment','supervisory_assessment_dimension','supervisory_assessment_signal',
      'supervisory_signal','supervisory_attention_origin','supervisory_plan_assessment',
      'examination_origin','entity_risk_state','supervisory_assessment_event']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_read', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), %s))$p$,
      t||'_read', t, read_perms);
    IF t NOT IN ('entity_risk_state') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
      EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), %s))$p$,
        t||'_write', t, write_perms);
    END IF;
    IF t IN ('supervisory_methodology','supervisory_methodology_dimension','supervisory_assessment',
             'supervisory_assessment_dimension') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
      EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), %s))
        WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), %s))$p$,
        t||'_update', t, write_perms, write_perms);
    END IF;
  END LOOP;
END $$;

-- append-only history: no update/delete policy is created for event tables.

-- ---------- 12. updated_at triggers ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supervisory_methodology','supervisory_methodology_dimension',
      'supervisory_assessment','supervisory_assessment_dimension','entity_risk_state']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t||'_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      t||'_touch', t);
  END LOOP;
END $$;