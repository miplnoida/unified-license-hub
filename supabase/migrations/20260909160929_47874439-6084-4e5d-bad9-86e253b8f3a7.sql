-- AML-06 calculation policy: question and dimension weighting
CREATE TABLE public.supervisory_calculation_question_weight (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  question_code text NOT NULL,
  methodology_question_id uuid REFERENCES public.supervisory_methodology_question(id) ON DELETE SET NULL,
  participation text NOT NULL DEFAULT 'SCORED',
  weight numeric,
  is_critical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scqw_unique UNIQUE (config_id, question_code),
  CONSTRAINT scqw_participation CHECK (participation IN ('SCORED','EXCLUDED')),
  CONSTRAINT scqw_weight CHECK (weight IS NULL OR weight > 0)
);

CREATE TABLE public.supervisory_calculation_dimension_weight (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  dimension_code text NOT NULL,
  methodology_dimension_id uuid REFERENCES public.supervisory_methodology_dimension(id) ON DELETE SET NULL,
  contributes_to text NOT NULL,
  weight numeric,
  min_completeness_pct numeric,
  aggregation_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scdw_unique UNIQUE (config_id, dimension_code),
  CONSTRAINT scdw_side CHECK (contributes_to IN ('INHERENT','CONTROL','EXCLUDED')),
  CONSTRAINT scdw_weight CHECK (weight IS NULL OR weight > 0),
  CONSTRAINT scdw_completeness CHECK (min_completeness_pct IS NULL OR (min_completeness_pct >= 0 AND min_completeness_pct <= 100))
);

-- AML-06 calculation policy: typed fact transformation
CREATE TABLE public.supervisory_calculation_fact_rule (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  fact_code text NOT NULL,
  fact_requirement_id uuid REFERENCES public.supervisory_methodology_fact_requirement(id) ON DELETE SET NULL,
  data_type text NOT NULL,
  unit text,
  direction text NOT NULL,
  missing_handling text NOT NULL,
  requires_period boolean NOT NULL DEFAULT true,
  requires_ratio_provenance boolean NOT NULL DEFAULT false,
  target_dimension_code text,
  weight numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scfr_unique UNIQUE (config_id, fact_code),
  CONSTRAINT scfr_direction CHECK (direction IN ('HIGHER_IS_HIGHER_RISK','LOWER_IS_HIGHER_RISK')),
  CONSTRAINT scfr_missing CHECK (missing_handling IN ('NOT_CALCULABLE','EXCLUDE','TREAT_AS_HIGHEST_RISK')),
  CONSTRAINT scfr_type CHECK (data_type IN ('NUMERIC','PERCENTAGE','RATIO','COUNT','AMOUNT','BOOLEAN')),
  CONSTRAINT scfr_weight CHECK (weight IS NULL OR weight > 0)
);

CREATE TABLE public.supervisory_calculation_fact_threshold (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fact_rule_id uuid NOT NULL REFERENCES public.supervisory_calculation_fact_rule(id) ON DELETE CASCADE,
  band_code text NOT NULL,
  min_value numeric,
  max_value numeric,
  score numeric NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scft_unique UNIQUE (fact_rule_id, band_code),
  CONSTRAINT scft_range CHECK (min_value IS NULL OR max_value IS NULL OR max_value > min_value)
);

-- AML-06 calculation policy: materiality adjustment capability
CREATE TABLE public.supervisory_calculation_materiality_rule (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  parameter_code text NOT NULL,
  fact_code text,
  comparator text NOT NULL,
  threshold_value numeric NOT NULL,
  unit text,
  adjustment_kind text NOT NULL,
  adjustment_band text,
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scmr_unique UNIQUE (config_id, parameter_code),
  CONSTRAINT scmr_comparator CHECK (comparator IN ('GTE','GT','LTE','LT')),
  CONSTRAINT scmr_adjustment CHECK (adjustment_kind IN ('FLOOR_AT_BAND','NO_ADJUSTMENT')),
  CONSTRAINT scmr_rationale CHECK (length(btrim(rationale)) >= 10)
);

-- AML-06 immutable calculation runs
CREATE TABLE public.supervisory_assessment_calculation_run (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  run_seq integer NOT NULL,
  engine_version text NOT NULL,
  methodology_id uuid,
  methodology_version text,
  programme_id uuid,
  programme_version text,
  question_plan_version integer,
  config_id uuid,
  config_version integer,
  as_of date,
  status text NOT NULL,
  reason_code text,
  reason text,
  inherent_score numeric,
  inherent_band text,
  control_score numeric,
  control_band text,
  residual_rating text,
  recommended_rating text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_hash text NOT NULL,
  result_hash text NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculated_by uuid,
  event_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sacr_seq_unique UNIQUE (assessment_id, run_seq)
);

CREATE INDEX sacr_assessment_idx ON public.supervisory_assessment_calculation_run(assessment_id, run_seq DESC);

-- AML-06 governed supervisory override of a calculated result
CREATE TABLE public.supervisory_assessment_calculation_override (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.supervisory_assessment_calculation_run(id) ON DELETE RESTRICT,
  computed_residual_rating text,
  computed_recommended_rating text,
  computed_inherent_band text,
  computed_control_band text,
  computed_result_hash text NOT NULL,
  proposed_rating text NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_APPROVAL',
  proposed_by uuid,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saco_status CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT saco_rationale CHECK (length(btrim(rationale)) >= 10)
);

CREATE INDEX saco_assessment_idx ON public.supervisory_assessment_calculation_override(assessment_id, proposed_at DESC);

-- Grants: read-only for authenticated supervisory viewers; all writes go through
-- governed SECURITY DEFINER operations owned by the service role.
GRANT SELECT ON public.supervisory_calculation_question_weight TO authenticated;
GRANT SELECT ON public.supervisory_calculation_dimension_weight TO authenticated;
GRANT SELECT ON public.supervisory_calculation_fact_rule TO authenticated;
GRANT SELECT ON public.supervisory_calculation_fact_threshold TO authenticated;
GRANT SELECT ON public.supervisory_calculation_materiality_rule TO authenticated;
GRANT SELECT ON public.supervisory_assessment_calculation_run TO authenticated;
GRANT SELECT ON public.supervisory_assessment_calculation_override TO authenticated;
GRANT ALL ON public.supervisory_calculation_question_weight TO service_role;
GRANT ALL ON public.supervisory_calculation_dimension_weight TO service_role;
GRANT ALL ON public.supervisory_calculation_fact_rule TO service_role;
GRANT ALL ON public.supervisory_calculation_fact_threshold TO service_role;
GRANT ALL ON public.supervisory_calculation_materiality_rule TO service_role;
GRANT ALL ON public.supervisory_assessment_calculation_run TO service_role;
GRANT ALL ON public.supervisory_assessment_calculation_override TO service_role;

ALTER TABLE public.supervisory_calculation_question_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_calculation_dimension_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_calculation_fact_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_calculation_fact_threshold ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_calculation_materiality_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_calculation_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_calculation_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY scqw_read ON public.supervisory_calculation_question_weight FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','aml_supervision.view','prudential_supervision.view','supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));

CREATE POLICY scdw_read ON public.supervisory_calculation_dimension_weight FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','aml_supervision.view','prudential_supervision.view','supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));

CREATE POLICY scfr_read ON public.supervisory_calculation_fact_rule FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','aml_supervision.view','prudential_supervision.view','supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));

CREATE POLICY scft_read ON public.supervisory_calculation_fact_threshold FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','aml_supervision.view','prudential_supervision.view','supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));

CREATE POLICY scmr_read ON public.supervisory_calculation_materiality_rule FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','aml_supervision.view','prudential_supervision.view','supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));

CREATE POLICY sacr_read ON public.supervisory_assessment_calculation_run FOR SELECT TO authenticated
USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));

CREATE POLICY saco_read ON public.supervisory_assessment_calculation_override FOR SELECT TO authenticated
USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));

-- Calculation runs are append-only history: no update, no delete, ever.
CREATE OR REPLACE FUNCTION public.supervisory_calc_run_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'immutable: a recorded calculation run cannot be % — record a new run instead', lower(TG_OP)
    USING ERRCODE = '42501';
END $$;

CREATE TRIGGER supervisory_calc_run_no_update BEFORE UPDATE ON public.supervisory_assessment_calculation_run
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_run_immutable();

CREATE TRIGGER supervisory_calc_run_no_delete BEFORE DELETE ON public.supervisory_assessment_calculation_run
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_run_immutable();

CREATE OR REPLACE FUNCTION public.supervisory_calc_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER scqw_touch BEFORE UPDATE ON public.supervisory_calculation_question_weight
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_touch_updated_at();
CREATE TRIGGER scdw_touch BEFORE UPDATE ON public.supervisory_calculation_dimension_weight
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_touch_updated_at();
CREATE TRIGGER scfr_touch BEFORE UPDATE ON public.supervisory_calculation_fact_rule
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_touch_updated_at();
CREATE TRIGGER scft_touch BEFORE UPDATE ON public.supervisory_calculation_fact_threshold
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_touch_updated_at();
CREATE TRIGGER scmr_touch BEFORE UPDATE ON public.supervisory_calculation_materiality_rule
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_touch_updated_at();
CREATE TRIGGER saco_touch BEFORE UPDATE ON public.supervisory_assessment_calculation_override
FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_touch_updated_at();