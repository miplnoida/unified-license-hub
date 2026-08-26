-- =====================================================================
-- MC-10 part 1 — Supervisory planning records.
-- Reuses: conduct_emerging_risks, conduct_interventions, regulatory_teams,
-- licensees/sectors, conduct_ai_insights, ai_governance_* control plane.
-- Creates ONLY the missing supervisory planning layer.
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.conduct_attention_ref_seq;
CREATE SEQUENCE IF NOT EXISTS public.conduct_plan_ref_seq;

-- ---------------------------------------------------------------- attention
CREATE TABLE public.conduct_attention_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  regulator_id uuid,
  sector_id uuid REFERENCES public.sectors(id),
  title text NOT NULL,
  source_type text NOT NULL,
  source_module text NOT NULL,
  source_id uuid,
  source_reference text,
  supervisory_basis text NOT NULL,
  entity_ids uuid[] NOT NULL DEFAULT '{}',
  sector_ids uuid[] NOT NULL DEFAULT '{}',
  theme text,
  emerging_risk_id uuid REFERENCES public.conduct_emerging_risks(id) ON DELETE SET NULL,
  linked_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  identified_on date NOT NULL DEFAULT current_date,
  materiality text NOT NULL DEFAULT 'medium',
  urgency text NOT NULL DEFAULT 'routine',
  breadth integer NOT NULL DEFAULT 0,
  recurrence integer NOT NULL DEFAULT 0,
  calculated_priority text,
  calculated_score numeric,
  calculated_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz,
  facts_signature text,
  confirmed_priority text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  confirmation_rationale text,
  priority_overridden boolean NOT NULL DEFAULT false,
  owner_id uuid,
  team_id uuid REFERENCES public.regulatory_teams(id) ON DELETE SET NULL,
  target_review_date date,
  status text NOT NULL DEFAULT 'OPEN',
  disposition text,
  disposition_rationale text,
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_attention_source_chk CHECK (source_type = ANY (ARRAY[
    'emerging_risk','cross_entity_theme','conduct_360','entity_signal',
    'complaint_pattern','finding','material_change','supervisory_assessment',
    'unresolved_remediation','other'])),
  CONSTRAINT conduct_attention_materiality_chk CHECK (materiality = ANY (ARRAY['low','medium','high','severe'])),
  CONSTRAINT conduct_attention_urgency_chk CHECK (urgency = ANY (ARRAY['routine','elevated','urgent'])),
  CONSTRAINT conduct_attention_status_chk CHECK (status = ANY (ARRAY['OPEN','PRIORITISED','PLANNED','IN_PROGRESS','MONITORING','CLOSED'])),
  CONSTRAINT conduct_attention_band_chk CHECK (
    (calculated_priority IS NULL OR calculated_priority = ANY (ARRAY['IMMEDIATE','HIGH','PLANNED','MONITOR']))
    AND (confirmed_priority IS NULL OR confirmed_priority = ANY (ARRAY['IMMEDIATE','HIGH','PLANNED','MONITOR']))),
  CONSTRAINT conduct_attention_basis_chk CHECK (length(btrim(supervisory_basis)) >= 20),
  CONSTRAINT conduct_attention_confirm_chk CHECK (
    confirmed_priority IS NULL
    OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
        AND COALESCE(btrim(confirmation_rationale),'') <> '')),
  CONSTRAINT conduct_attention_closed_chk CHECK (
    status <> 'CLOSED' OR (disposition IS NOT NULL AND COALESCE(btrim(disposition_rationale),'') <> ''))
);
CREATE INDEX conduct_attention_items_sector_idx ON public.conduct_attention_items(sector_id);
CREATE INDEX conduct_attention_items_risk_idx ON public.conduct_attention_items(emerging_risk_id);
CREATE INDEX conduct_attention_items_status_idx ON public.conduct_attention_items(status);

-- Append-only deterministic calculations. An earlier result is never replaced.
CREATE TABLE public.conduct_attention_priority_calcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attention_id uuid NOT NULL REFERENCES public.conduct_attention_items(id) ON DELETE CASCADE,
  method text NOT NULL,
  factors jsonb NOT NULL,
  score numeric NOT NULL,
  band text NOT NULL,
  facts_signature text NOT NULL,
  window_start date,
  window_end date,
  computed_by uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_attention_calc_band_chk CHECK (band = ANY (ARRAY['IMMEDIATE','HIGH','PLANNED','MONITOR']))
);
CREATE INDEX conduct_attention_priority_calcs_item_idx ON public.conduct_attention_priority_calcs(attention_id, computed_at DESC);

CREATE TABLE public.conduct_attention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attention_id uuid NOT NULL REFERENCES public.conduct_attention_items(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_state text,
  to_state text,
  rationale text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conduct_attention_events_item_idx ON public.conduct_attention_events(attention_id, created_at DESC);

CREATE TABLE public.conduct_attention_reassessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attention_id uuid NOT NULL REFERENCES public.conduct_attention_items(id) ON DELETE CASCADE,
  intervention_id uuid REFERENCES public.conduct_interventions(id) ON DELETE SET NULL,
  concern_state text NOT NULL,
  assessment text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_step text NOT NULL,
  next_review_date date,
  emerging_risk_id uuid REFERENCES public.conduct_emerging_risks(id) ON DELETE SET NULL,
  assessed_by uuid,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_reassess_state_chk CHECK (concern_state = ANY (ARRAY['unchanged','reduced','increased','resolved'])),
  CONSTRAINT conduct_reassess_next_chk CHECK (next_step = ANY (ARRAY['continue_monitoring','further_intervention','close','refer'])),
  CONSTRAINT conduct_reassess_text_chk CHECK (length(btrim(assessment)) >= 20)
);
CREATE INDEX conduct_attention_reassessments_item_idx ON public.conduct_attention_reassessments(attention_id, assessed_at DESC);

-- ------------------------------------------------------- intervention catalogue
CREATE TABLE public.conduct_intervention_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  purpose text NOT NULL,
  applicability text NOT NULL,
  authority_action text NOT NULL,
  canonical_module text,
  canonical_route text,
  requires_canonical_record boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.conduct_intervention_types
  (code, name, purpose, applicability, authority_action, canonical_module, canonical_route, requires_canonical_record, sort_order)
VALUES
  ('DESK_REVIEW','Desk-based review','Examine held records and returns without contacting the entity.','entity or theme','run_conduct_analytics',NULL,NULL,false,10),
  ('SUPERVISORY_MEETING','Supervisory meeting','Put supervisory concerns to the entity and record its response.','entity','run_conduct_analytics','conduct_interviews','/conduct/interviews',false,20),
  ('INFORMATION_REQUEST','Request for information','Obtain specified records or explanations from the entity.','entity','manage_complaints','correspondence_threads','/correspondence',false,30),
  ('THEMATIC_REVIEW','Thematic review','Examine a conduct theme across several entities.','theme or sector','initiate_thematic_review','thematic_reviews','/conduct/thematic-reviews',true,40),
  ('ONSITE_INSPECTION','Onsite inspection','Examine the entity''s conduct practices on its premises.','entity','initiate_investigation','examinations','/examinations',true,50),
  ('OFFSITE_REVIEW','Offsite review','Structured offsite examination of the entity''s conduct records.','entity','initiate_investigation','examinations','/examinations',true,60),
  ('INVESTIGATION','Investigation','Investigate suspected conduct failure with formal findings.','entity','initiate_investigation','conduct_investigations','/conduct/investigations',true,70),
  ('ENHANCED_MONITORING','Enhanced monitoring','Increase monitoring intensity for a defined period.','entity or theme','run_conduct_analytics','conduct_monitoring_reviews','/conduct/surveillance',false,80),
  ('REMEDIATION_FOLLOWUP','Remediation follow-up','Verify that required remedial action has been completed.','entity','manage_complaints','conduct_actions','/conduct/actions',false,90),
  ('FORMAL_FINDING','Formal finding','Record a formal supervisory finding against the entity.','entity','initiate_investigation','conduct_findings','/conduct/findings',true,100),
  ('ESCALATION_REFERRAL','Escalation or referral','Escalate internally or refer to another authority.','entity or theme','issue_enforcement_action','coordination_escalations','/coordination',false,110);

-- ---------------------------------------------------------- supervisory plans
CREATE TABLE public.conduct_supervisory_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  regulator_id uuid,
  sector_id uuid REFERENCES public.sectors(id),
  title text NOT NULL,
  objective text,
  objective_source text NOT NULL DEFAULT 'human',
  objective_ai_insight_id uuid,
  scope text,
  attention_id uuid REFERENCES public.conduct_attention_items(id) ON DELETE SET NULL,
  emerging_risk_id uuid REFERENCES public.conduct_emerging_risks(id) ON DELETE SET NULL,
  theme text,
  entity_ids uuid[] NOT NULL DEFAULT '{}',
  sector_ids uuid[] NOT NULL DEFAULT '{}',
  factual_basis text NOT NULL,
  priority text,
  planning_period text NOT NULL DEFAULT 'ad_hoc',
  period_label text,
  lead_officer_id uuid,
  team_id uuid REFERENCES public.regulatory_teams(id) ON DELETE SET NULL,
  start_date date,
  target_completion date,
  next_review_date date,
  status text NOT NULL DEFAULT 'DRAFT',
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  approval_rationale text,
  activated_at timestamptz,
  completed_at timestamptz,
  outcome_summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_plan_status_chk CHECK (status = ANY (ARRAY['DRAFT','SUBMITTED','APPROVED','ACTIVE','COMPLETED','CANCELLED'])),
  CONSTRAINT conduct_plan_period_chk CHECK (planning_period = ANY (ARRAY['annual','quarterly','thematic','ad_hoc','event_driven'])),
  CONSTRAINT conduct_plan_priority_chk CHECK (priority IS NULL OR priority = ANY (ARRAY['IMMEDIATE','HIGH','PLANNED','MONITOR'])),
  CONSTRAINT conduct_plan_objective_source_chk CHECK (objective_source = ANY (ARRAY['human','ai_assisted_reviewed'])),
  CONSTRAINT conduct_plan_basis_chk CHECK (length(btrim(factual_basis)) >= 20),
  CONSTRAINT conduct_plan_submitted_chk CHECK (status = 'DRAFT' OR COALESCE(btrim(objective),'') <> '')
);
CREATE INDEX conduct_supervisory_plans_attention_idx ON public.conduct_supervisory_plans(attention_id);
CREATE INDEX conduct_supervisory_plans_status_idx ON public.conduct_supervisory_plans(status);
CREATE INDEX conduct_supervisory_plans_sector_idx ON public.conduct_supervisory_plans(sector_id);

CREATE TABLE public.conduct_plan_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.conduct_supervisory_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text,
  due_date date,
  status text NOT NULL DEFAULT 'OPEN',
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conduct_plan_milestone_status_chk CHECK (status = ANY (ARRAY['OPEN','COMPLETED','CANCELLED']))
);
CREATE INDEX conduct_plan_milestones_plan_idx ON public.conduct_plan_milestones(plan_id);

CREATE TABLE public.conduct_plan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.conduct_supervisory_plans(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  rationale text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conduct_plan_events_plan_idx ON public.conduct_plan_events(plan_id, created_at DESC);

-- ------------------------------------- interventions: orchestration linkage
ALTER TABLE public.conduct_interventions
  ADD COLUMN IF NOT EXISTS attention_id uuid REFERENCES public.conduct_attention_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.conduct_supervisory_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalogue_code text REFERENCES public.conduct_intervention_types(code),
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.regulatory_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS actual_start date,
  ADD COLUMN IF NOT EXISTS actual_end date,
  ADD COLUMN IF NOT EXISTS canonical_module text,
  ADD COLUMN IF NOT EXISTS canonical_record_id uuid,
  ADD COLUMN IF NOT EXISTS canonical_reference text,
  ADD COLUMN IF NOT EXISTS canonical_route text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outcome_result text,
  ADD COLUMN IF NOT EXISTS outcome_rationale text,
  ADD COLUMN IF NOT EXISTS outcome_findings text,
  ADD COLUMN IF NOT EXISTS outstanding_actions text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_due_date date,
  ADD COLUMN IF NOT EXISTS followup_note text,
  ADD COLUMN IF NOT EXISTS followup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_insight_id uuid;

ALTER TABLE public.conduct_interventions
  DROP CONSTRAINT IF EXISTS conduct_interventions_outcome_chk;
ALTER TABLE public.conduct_interventions
  ADD CONSTRAINT conduct_interventions_outcome_chk CHECK (
    outcome_result IS NULL OR outcome_result = ANY (ARRAY[
      'no_further_action','continue_monitoring','information_required','remediation_required',
      'further_review_required','investigation_required','finding_raised','escalation_required']));

CREATE INDEX IF NOT EXISTS conduct_interventions_attention_idx ON public.conduct_interventions(attention_id);
CREATE INDEX IF NOT EXISTS conduct_interventions_plan_idx ON public.conduct_interventions(plan_id);

-- ------------------------------------------------------------------ grants
GRANT SELECT ON public.conduct_attention_items TO authenticated;
GRANT SELECT ON public.conduct_attention_priority_calcs TO authenticated;
GRANT SELECT ON public.conduct_attention_events TO authenticated;
GRANT SELECT ON public.conduct_attention_reassessments TO authenticated;
GRANT SELECT ON public.conduct_intervention_types TO authenticated;
GRANT SELECT ON public.conduct_supervisory_plans TO authenticated;
GRANT SELECT ON public.conduct_plan_milestones TO authenticated;
GRANT SELECT ON public.conduct_plan_events TO authenticated;
GRANT ALL ON public.conduct_attention_items TO service_role;
GRANT ALL ON public.conduct_attention_priority_calcs TO service_role;
GRANT ALL ON public.conduct_attention_events TO service_role;
GRANT ALL ON public.conduct_attention_reassessments TO service_role;
GRANT ALL ON public.conduct_intervention_types TO service_role;
GRANT ALL ON public.conduct_supervisory_plans TO service_role;
GRANT ALL ON public.conduct_plan_milestones TO service_role;
GRANT ALL ON public.conduct_plan_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.conduct_attention_ref_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.conduct_plan_ref_seq TO service_role;

-- --------------------------------------------------------------------- RLS
ALTER TABLE public.conduct_attention_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_attention_priority_calcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_attention_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_attention_reassessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_intervention_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_supervisory_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_plan_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conduct_plan_events ENABLE ROW LEVEL SECURITY;

-- Read-only policies only. Every mutation runs through a governed SECURITY
-- DEFINER operation, so the browser cannot bypass authority or history.
CREATE POLICY conduct_attention_items_read ON public.conduct_attention_items
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (NOT public.has_external_role(auth.uid())
      AND public.has_permission(auth.uid(), 'market_conduct', 'view')
      AND public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
            regulator_id, sector_id, NULL, NULL, auth.uid()))
);

CREATE POLICY conduct_attention_priority_calcs_read ON public.conduct_attention_priority_calcs
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_attention_items a WHERE a.id = attention_id));

CREATE POLICY conduct_attention_events_read ON public.conduct_attention_events
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_attention_items a WHERE a.id = attention_id));

CREATE POLICY conduct_attention_reassessments_read ON public.conduct_attention_reassessments
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_attention_items a WHERE a.id = attention_id));

CREATE POLICY conduct_intervention_types_read ON public.conduct_intervention_types
FOR SELECT TO authenticated
USING (NOT public.has_external_role(auth.uid()));

CREATE POLICY conduct_supervisory_plans_read ON public.conduct_supervisory_plans
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (NOT public.has_external_role(auth.uid())
      AND public.has_permission(auth.uid(), 'market_conduct', 'view')
      AND public.regulatory_scope_allows(auth.uid(), 'market_conduct', 'view',
            regulator_id, sector_id, NULL, NULL, auth.uid()))
);

CREATE POLICY conduct_plan_milestones_read ON public.conduct_plan_milestones
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_supervisory_plans p WHERE p.id = plan_id));

CREATE POLICY conduct_plan_events_read ON public.conduct_plan_events
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conduct_supervisory_plans p WHERE p.id = plan_id));

CREATE TRIGGER conduct_attention_items_touch BEFORE UPDATE ON public.conduct_attention_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER conduct_supervisory_plans_touch BEFORE UPDATE ON public.conduct_supervisory_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER conduct_plan_milestones_touch BEFORE UPDATE ON public.conduct_plan_milestones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER conduct_intervention_types_touch BEFORE UPDATE ON public.conduct_intervention_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------- MC-08 governance registration
-- conduct_ai_insights carries MC-10 advisory records too: widen the subject
-- contract, leaving every existing MC-07/MC-09 rule untouched.
ALTER TABLE public.conduct_ai_insights DROP CONSTRAINT IF EXISTS conduct_ai_insights_subject_chk;
ALTER TABLE public.conduct_ai_insights ADD CONSTRAINT conduct_ai_insights_subject_chk CHECK (
  subject_type = ANY (ARRAY['entity','sector_theme','emerging_risk','attention_item','supervisory_plan','intervention'])
  AND (subject_type <> 'entity' OR entity_id IS NOT NULL)
  AND (subject_type <> 'sector_theme' OR COALESCE(btrim(subject_key),'') <> '')
  AND (subject_type <> 'emerging_risk' OR emerging_risk_id IS NOT NULL)
  AND (subject_type NOT IN ('attention_item','supervisory_plan','intervention')
       OR COALESCE(btrim(subject_key),'') <> '')
);

INSERT INTO public.ai_governance_surfaces
  (code, label, owning_module, business_purpose, advisory_classification, production_status,
   lifecycle_state, approved_model_id, instruction_governance, human_review,
   authoritative_write_path, edge_function, approved_at)
VALUES (
  'SUPERVISORY_PLANNING_ASSISTANCE',
  'Supervisory planning assistance',
  'market_conduct',
  'Assists supervisors in interpreting recorded supervisory attention, identifying records to review, framing planning questions, considering interventions drawn only from the approved catalogue, drafting a plan for human adoption and framing follow-up considerations.',
  'ADVISORY_HUMAN_REVIEWED', 'IN_PRODUCTION', 'ACTIVE',
  (SELECT id FROM public.ai_governance_models WHERE model_key = 'gemini-2.5-pro' LIMIT 1),
  'Released instruction versions only, resolved server-side.',
  'Mandatory human review before any wording enters an operational record.',
  'NONE',
  'conduct-planning-ai-advise', now())
ON CONFLICT (code) DO NOTHING;

-- Released instruction versions, one per MC-10 capability.
INSERT INTO public.ai_governance_instructions
  (template_code, version, title, purpose, use_case_code, instruction_body, allowed_fact_scope,
   prohibited_behaviours, required_caveats, citation_expectation, confidence_expectation,
   lifecycle_state, effective_from, released_at)
VALUES
 ('MC10_ATTENTION_SUMMARY','v1','Supervisory attention summary','Explain, from the supplied facts only, why the recorded item may merit supervisory attention.','ATTENTION_SUMMARY',
  'You assist a financial services supervisor. Use ONLY the supplied supervisory facts. Explain what the record shows and why it may merit supervisory attention. Never state a priority, rating or score of your own; the deterministic factors and the human-confirmed priority are authoritative. Never assert a breach, finding, sanction or outcome. Cite a supplied reference for every material statement. State limitations and what is not evidenced.',
  'conduct_planning_snapshot',
  ARRAY['setting or implying an authoritative priority','asserting a breach or finding','recommending enforcement','inventing records, entities or figures','changing any record'],
  ARRAY['AI suggestion — requires human review','External data: none'],
  'Every material statement must cite a supplied reference.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC10_RECORDS_TO_REVIEW','v1','Records to review','Identify which supplied records the supervisor should inspect first.','PLANNING_RECORDS_TO_REVIEW',
  'You assist a financial services supervisor planning a review. From the supplied records ONLY, identify which records warrant inspection and say what each may show. Never invent a record. Never conclude on compliance. Cite each record you name.',
  'conduct_planning_snapshot',
  ARRAY['inventing records','concluding on compliance','setting priority','changing any record'],
  ARRAY['AI suggestion — requires human review','External data: none'],
  'Name only supplied references.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC10_PLANNING_QUESTIONS','v1','Supervisory planning questions','Suggest questions the supervisor may need answered while planning.','PLANNING_QUESTIONS',
  'You assist a financial services supervisor planning supervisory work. From the supplied facts ONLY, suggest questions that may need answering. Questions must be neutral and evidence-seeking, never accusatory and never presuming an outcome. Cite the facts that prompt each question.',
  'conduct_planning_snapshot',
  ARRAY['presuming an outcome','asserting a breach','setting priority','changing any record'],
  ARRAY['AI suggestion — requires human review','External data: none'],
  'Cite the supplied reference behind each question.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC10_INTERVENTION_OPTIONS','v1','Intervention options','Suggest possible interventions strictly from the approved catalogue supplied in context.','INTERVENTION_OPTIONS',
  'You assist a financial services supervisor choosing supervisory action. You may suggest ONLY intervention codes present in the approved catalogue supplied in the context. You must never invent, rename or imply any other regulatory power. For each option give the supplied code, why the supplied facts may support it, and what it would establish. The supervisor decides; nothing you suggest is authorised or initiated by your output.',
  'conduct_planning_snapshot',
  ARRAY['suggesting an intervention outside the supplied catalogue','inventing regulatory powers','initiating or authorising action','asserting a breach','setting priority'],
  ARRAY['AI suggestion — requires human review','External data: none'],
  'Cite supplied facts and use only supplied catalogue codes.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC10_PLAN_DRAFT','v1','Supervisory plan draft','Prepare a draft objective, scope, milestones and considerations for human adoption.','SUPERVISORY_PLAN_DRAFT',
  'You assist a financial services supervisor drafting a supervisory plan. From the supplied facts ONLY, prepare a draft objective, scope, suggested milestones and considerations. This is a draft for the supervisor to adopt, amend or discard; it is not a plan and creates nothing. Cite the facts behind each element.',
  'conduct_planning_snapshot',
  ARRAY['presenting the draft as an approved plan','creating or activating anything','asserting a breach','setting priority'],
  ARRAY['AI suggestion — requires human review','External data: none'],
  'Cite supplied references for each drafted element.','State confidence and uncertainty explicitly.','ACTIVE', now(), now()),
 ('MC10_FOLLOWUP_CONSIDERATIONS','v1','Follow-up considerations','Suggest matters the supervisor may wish to reassess after an intervention.','FOLLOWUP_CONSIDERATIONS',
  'You assist a financial services supervisor after a supervisory intervention. From the supplied facts and the recorded outcome ONLY, suggest matters that may warrant reassessment or follow-up. Never decide the outcome, never close the concern and never change the emerging-risk position. Cite the supplied records.',
  'conduct_planning_snapshot',
  ARRAY['selecting or changing an outcome','closing a concern','changing risk status','asserting a breach'],
  ARRAY['AI suggestion — requires human review','External data: none'],
  'Cite the supplied outcome and evidence references.','State confidence and uncertainty explicitly.','ACTIVE', now(), now())
ON CONFLICT DO NOTHING;

-- Use-case register entries, bound to the approved model and released instruction.
ALTER TABLE public.conduct_ai_use_cases DROP CONSTRAINT IF EXISTS conduct_ai_use_cases_code_chk;
ALTER TABLE public.conduct_ai_use_cases ADD CONSTRAINT conduct_ai_use_cases_code_chk CHECK (code = ANY (ARRAY[
  'SUPERVISORY_SUMMARY','MATERIAL_CHANGE_EXPLANATION','RECORDS_TO_REVIEW','SUPERVISORY_QUESTIONS',
  'RISK_HYPOTHESIS','CROSS_ENTITY_INTERPRETATION','THEME_MATERIAL_CHANGE','SECTOR_SUPERVISORY_QUESTIONS',
  'EMERGING_RISK_NARRATIVE','EMERGING_RISK_HYPOTHESIS',
  'ATTENTION_SUMMARY','PLANNING_RECORDS_TO_REVIEW','PLANNING_QUESTIONS','INTERVENTION_OPTIONS',
  'SUPERVISORY_PLAN_DRAFT','FOLLOWUP_CONSIDERATIONS']));
ALTER TABLE public.conduct_ai_use_cases DROP CONSTRAINT IF EXISTS conduct_ai_use_cases_source_chk;
ALTER TABLE public.conduct_ai_use_cases ADD CONSTRAINT conduct_ai_use_cases_source_chk CHECK (allowed_source = ANY (ARRAY[
  'conduct_360_snapshot','conduct_intelligence_snapshot','conduct_planning_snapshot']));

INSERT INTO public.conduct_ai_use_cases
  (code, label, purpose, governance_level, is_enabled, allowed_source, human_review_required,
   citations_required, workflow_mutation_allowed, allowed_output_classes, prohibited_output_classes,
   prompt_template_code, prompt_template_version, model_policy, confidence_policy, limitation_policy,
   lifecycle_state, owning_module, advisory_classification, risk_classification,
   approved_roles, required_permission_actions, approved_model_id, approved_instruction_id,
   governance_owner, use_case_version, effective_from, approved_at)
SELECT v.code, v.label, v.purpose, 'ADVISORY_HUMAN_REVIEWED', true, 'conduct_planning_snapshot', true, true, false,
  ARRAY['interpretation','narrative','suggestion'],
  ARRAY['decision','rating','priority','approval','enforcement'],
  v.tpl, 'v1',
  jsonb_build_object('allowed_providers', jsonb_build_array('lovable_ai_gateway'),
                     'allowed_models', jsonb_build_array('google/gemini-2.5-pro'),
                     'temperature_max', 0.2, 'external_data_allowed', false),
  jsonb_build_object('require_confidence', true, 'require_uncertainty', true),
  'Advisory only. Deterministic supervisory facts and the accountable supervisor govern every planning decision.',
  'ACTIVE', 'market_conduct', 'ADVISORY_ONLY', 'high',
  ARRAY['super_admin','admin','supervisor','analyst'],
  ARRAY['run_conduct_analytics'],
  (SELECT id FROM public.ai_governance_models WHERE model_key = 'gemini-2.5-pro' LIMIT 1),
  (SELECT i.id FROM public.ai_governance_instructions i WHERE i.template_code = v.tpl AND i.version = 'v1' LIMIT 1),
  'Market Conduct Supervision', 1, now(), now()
FROM (VALUES
  ('ATTENTION_SUMMARY','Supervisory attention summary','Explain the factual basis for why a recorded item may merit supervisory attention.','MC10_ATTENTION_SUMMARY'),
  ('PLANNING_RECORDS_TO_REVIEW','Planning records to review','Identify relevant records the supervisor should inspect during planning.','MC10_RECORDS_TO_REVIEW'),
  ('PLANNING_QUESTIONS','Supervisory planning questions','Suggest questions that may need answering during supervisory planning.','MC10_PLANNING_QUESTIONS'),
  ('INTERVENTION_OPTIONS','Intervention options','Suggest possible interventions strictly from the approved intervention catalogue.','MC10_INTERVENTION_OPTIONS'),
  ('SUPERVISORY_PLAN_DRAFT','Supervisory plan draft','Prepare a draft supervisory objective, scope and milestones for human adoption.','MC10_PLAN_DRAFT'),
  ('FOLLOWUP_CONSIDERATIONS','Follow-up considerations','Suggest matters the supervisor may wish to reassess after an intervention.','MC10_FOLLOWUP_CONSIDERATIONS')
) AS v(code, label, purpose, tpl)
ON CONFLICT (code) DO NOTHING;