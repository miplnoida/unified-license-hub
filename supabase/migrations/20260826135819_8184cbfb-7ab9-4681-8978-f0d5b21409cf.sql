-- =====================================================================
-- MC-08 (part 1) — AI Governance & Supervisory Assurance: canonical model
-- Extends the MC-07.x conduct AI layer; does not replace it.
-- =====================================================================

-- ---------------------------------------------------------------- states
DO $$ BEGIN
  CREATE TYPE public.ai_gov_lifecycle AS ENUM ('DRAFT','TESTING','ACTIVE','SUSPENDED','RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- models
CREATE TABLE IF NOT EXISTS public.ai_governance_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_key text NOT NULL,
  technical_identifier text NOT NULL,
  model_version text,
  display_name text NOT NULL,
  regulatory_purpose text NOT NULL,
  known_limitations text,
  data_handling_class text NOT NULL DEFAULT 'INTERNAL_REGULATORY_FACTS',
  external_data_capable boolean NOT NULL DEFAULT false,
  lifecycle_state public.ai_gov_lifecycle NOT NULL DEFAULT 'DRAFT',
  effective_from timestamptz,
  retired_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  suspended_at timestamptz,
  suspended_by uuid,
  suspension_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  model_version_key text GENERATED ALWAYS AS (COALESCE(model_version, '')) STORED,
  UNIQUE (provider, technical_identifier, model_version_key)
);

-- ------------------------------------------------- instruction versions
CREATE TABLE IF NOT EXISTS public.ai_governance_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  purpose text NOT NULL,
  use_case_code text,
  instruction_body text,
  allowed_fact_scope text NOT NULL DEFAULT 'conduct_360_snapshot',
  prohibited_behaviours text[] NOT NULL DEFAULT '{}',
  required_caveats text[] NOT NULL DEFAULT '{}',
  citation_expectation text NOT NULL DEFAULT 'Every material statement must cite a supplied source reference.',
  confidence_expectation text NOT NULL DEFAULT 'Confidence, uncertainty and limitations must be stated explicitly.',
  lifecycle_state public.ai_gov_lifecycle NOT NULL DEFAULT 'DRAFT',
  effective_from timestamptz,
  released_at timestamptz,
  released_by uuid,
  suspended_at timestamptz,
  suspended_by uuid,
  suspension_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_code, version)
);

-- ------------------------------------- use-case governance (extension)
ALTER TABLE public.conduct_ai_use_cases
  ADD COLUMN IF NOT EXISTS lifecycle_state public.ai_gov_lifecycle NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS owning_module text NOT NULL DEFAULT 'market_conduct',
  ADD COLUMN IF NOT EXISTS advisory_classification text NOT NULL DEFAULT 'ADVISORY_NARRATIVE',
  ADD COLUMN IF NOT EXISTS risk_classification text NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS approved_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_permission_actions text[] NOT NULL DEFAULT ARRAY['view'],
  ADD COLUMN IF NOT EXISTS approved_model_id uuid REFERENCES public.ai_governance_models(id),
  ADD COLUMN IF NOT EXISTS approved_instruction_id uuid REFERENCES public.ai_governance_instructions(id),
  ADD COLUMN IF NOT EXISTS governance_owner text,
  ADD COLUMN IF NOT EXISTS use_case_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- ------------------------------------------- append-only governance log
CREATE TABLE IF NOT EXISTS public.ai_governance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL,
  object_id uuid,
  object_code text,
  event_type text NOT NULL,
  from_state text,
  to_state text,
  actor_id uuid,
  actor_role text,
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_governance_events_object_idx ON public.ai_governance_events (object_type, object_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_governance_events_created_idx ON public.ai_governance_events (created_at DESC);

-- ------------------------- every governed execution attempt (fail-closed)
CREATE TABLE IF NOT EXISTS public.ai_governance_activity_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_code text,
  owning_module text NOT NULL DEFAULT 'market_conduct',
  entity_id uuid,
  requested_by uuid,
  requested_role text,
  outcome text NOT NULL,
  reason_code text,
  detail text,
  provider text,
  model text,
  model_version text,
  instruction_template_code text,
  instruction_version text,
  snapshot_fingerprint text,
  window_start date,
  window_end date,
  latency_ms integer,
  conduct_ai_insight_id uuid REFERENCES public.conduct_ai_insights(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_gov_attempts_created_idx ON public.ai_governance_activity_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_gov_attempts_outcome_idx ON public.ai_governance_activity_attempts (outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_gov_attempts_insight_idx ON public.ai_governance_activity_attempts (conduct_ai_insight_id);

-- ------------------------------------------------------ assurance review
CREATE TABLE IF NOT EXISTS public.ai_assurance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  conduct_ai_insight_id uuid NOT NULL REFERENCES public.conduct_ai_insights(id) ON DELETE RESTRICT,
  use_case_code text,
  reviewer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS',
  conclusion text,
  notes text,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  remediation_action text,
  remediation_owner uuid,
  remediation_due_date date,
  remediation_status text,
  closed_at timestamptz,
  closed_by uuid,
  closure_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_assurance_reviews_insight_idx ON public.ai_assurance_reviews (conduct_ai_insight_id);

CREATE TABLE IF NOT EXISTS public.ai_assurance_criteria_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.ai_assurance_reviews(id) ON DELETE CASCADE,
  criterion_code text NOT NULL,
  assessment text NOT NULL,
  comment text,
  assessed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, criterion_code)
);

-- ------------------------------------------- governance threshold config
CREATE TABLE IF NOT EXISTS public.ai_governance_thresholds (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  unreviewed_hours integer NOT NULL DEFAULT 72,
  low_confidence_below numeric NOT NULL DEFAULT 0.40,
  high_modification_rate numeric NOT NULL DEFAULT 0.50,
  high_rejection_rate numeric NOT NULL DEFAULT 0.30,
  min_volume_for_analysis integer NOT NULL DEFAULT 10,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_governance_thresholds (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------- prohibited actions
CREATE TABLE IF NOT EXISTS public.ai_prohibited_actions (
  code text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  enforcement text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.ai_prohibited_actions (code, label, description, enforcement, sort_order) VALUES
 ('AUTHORITATIVE_FINDING','Create an authoritative regulatory finding','AI may not create or amend a conduct finding.','The AI execution path holds no write grant on findings and calls no finding operation.',10),
 ('COMPLAINT_DECISION','Approve, reject or close a complaint','AI may not decide or close a complaint.','No complaint outcome or workflow operation is reachable from the AI execution path.',20),
 ('ALTER_EVIDENCE','Alter or delete regulatory evidence','AI may not modify or remove evidence records.','Evidence tables are never written by the advisory boundary.',30),
 ('ALTER_FACTS','Alter authoritative facts','AI receives a read-only fact snapshot only.','Context is produced by a read-only snapshot function.',40),
 ('ENTITY_STATUS','Change or deregister a regulated entity','AI may not change entity status or registration.','No entity mutation operation is reachable.',50),
 ('SANCTION_PENALTY','Issue a sanction or penalty','AI may not issue sanctions or penalties.','No enforcement operation is reachable.',60),
 ('ENFORCEMENT_DETERMINATION','Make a final enforcement determination','AI may not determine enforcement outcomes.','No enforcement operation is reachable.',70),
 ('LICENSING_APPROVAL','Approve a licensing decision','AI may not approve or refuse a licence.','No licensing operation is reachable.',80),
 ('RISK_RATING','Change an authoritative risk rating','AI may not set or change a risk rating.','Risk ratings are deterministic and never written by the advisory boundary.',90),
 ('BYPASS_MAKER_CHECKER','Bypass maker-checker','AI may not substitute for a second accountable human.','Human review states are written only by the governed review operation, acting as the signed-in reviewer.',100),
 ('IMPERSONATE_SUPERVISOR','Impersonate a supervisor','AI output is never recorded as a human decision.','Original AI output and human decisions are stored in separate immutable columns and events.',110),
 ('REGULATED_PARTY_COMMS','Send communications to a regulated party','AI may not dispatch correspondence.','No correspondence or notification dispatch operation is reachable.',120)
ON CONFLICT (code) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description, enforcement=EXCLUDED.enforcement, sort_order=EXCLUDED.sort_order;

-- --------------------------------------------------------------- grants
GRANT SELECT ON public.ai_governance_models TO authenticated;
GRANT SELECT ON public.ai_governance_instructions TO authenticated;
GRANT SELECT ON public.ai_governance_events TO authenticated;
GRANT SELECT ON public.ai_governance_activity_attempts TO authenticated;
GRANT SELECT ON public.ai_assurance_reviews TO authenticated;
GRANT SELECT ON public.ai_assurance_criteria_assessments TO authenticated;
GRANT SELECT ON public.ai_governance_thresholds TO authenticated;
GRANT SELECT ON public.ai_prohibited_actions TO authenticated;
GRANT ALL ON public.ai_governance_models TO service_role;
GRANT ALL ON public.ai_governance_instructions TO service_role;
GRANT ALL ON public.ai_governance_events TO service_role;
GRANT ALL ON public.ai_governance_activity_attempts TO service_role;
GRANT ALL ON public.ai_assurance_reviews TO service_role;
GRANT ALL ON public.ai_assurance_criteria_assessments TO service_role;
GRANT ALL ON public.ai_governance_thresholds TO service_role;
GRANT ALL ON public.ai_prohibited_actions TO service_role;

-- ------------------------------------------------------------------ RLS
ALTER TABLE public.ai_governance_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_governance_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_governance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_governance_activity_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assurance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assurance_criteria_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_governance_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prohibited_actions ENABLE ROW LEVEL SECURITY;

-- Read: AI governance viewers and auditors. All writes go through governed
-- SECURITY DEFINER operations, so no write policy exists for any client role.
CREATE OR REPLACE FUNCTION public.ai_gov_can_read(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_super_admin(_uid)
    OR public.has_permission(_uid, 'ai_management', 'view')
    OR public.has_permission(_uid, 'audit_management', 'view')
    OR public.has_permission(_uid, 'market_conduct', 'view')
  );
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_governance_models','ai_governance_instructions','ai_governance_events',
                           'ai_governance_activity_attempts','ai_assurance_reviews',
                           'ai_assurance_criteria_assessments','ai_governance_thresholds','ai_prohibited_actions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.ai_gov_can_read(auth.uid()))',
      t || '_read', t);
  END LOOP;
END $$;

-- ------------------------------------------------------- immutability
-- Governance events, review events and execution attempts are append-only.
CREATE OR REPLACE FUNCTION public.ai_gov_block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'append_only: % records cannot be updated or deleted', TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS ai_governance_events_append_only ON public.ai_governance_events;
CREATE TRIGGER ai_governance_events_append_only
  BEFORE UPDATE OR DELETE ON public.ai_governance_events
  FOR EACH ROW EXECUTE FUNCTION public.ai_gov_block_mutation();

DROP TRIGGER IF EXISTS conduct_ai_review_events_append_only ON public.conduct_ai_review_events;
CREATE TRIGGER conduct_ai_review_events_append_only
  BEFORE UPDATE OR DELETE ON public.conduct_ai_review_events
  FOR EACH ROW EXECUTE FUNCTION public.ai_gov_block_mutation();

-- Original AI evidence is immutable: the AI output, its provenance, its facts
-- signature and its window can never be rewritten, by anyone, including the
-- service role. Human review columns and freshness state remain updatable.
CREATE OR REPLACE FUNCTION public.conduct_ai_insight_protect_original()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ai_output IS DISTINCT FROM OLD.ai_output
     OR NEW.snapshot_fingerprint IS DISTINCT FROM OLD.snapshot_fingerprint
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.model_version IS DISTINCT FROM OLD.model_version
     OR NEW.prompt_template_code IS DISTINCT FROM OLD.prompt_template_code
     OR NEW.prompt_template_version IS DISTINCT FROM OLD.prompt_template_version
     OR NEW.source_references IS DISTINCT FROM OLD.source_references
     OR NEW.window_start IS DISTINCT FROM OLD.window_start
     OR NEW.window_end IS DISTINCT FROM OLD.window_end
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
     OR NEW.generated_by IS DISTINCT FROM OLD.generated_by
     OR NEW.use_case_code IS DISTINCT FROM OLD.use_case_code
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'immutable_ai_evidence: the original AI output and its provenance cannot be altered'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conduct_ai_insights_protect_original ON public.conduct_ai_insights;
CREATE TRIGGER conduct_ai_insights_protect_original
  BEFORE UPDATE ON public.conduct_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.conduct_ai_insight_protect_original();

CREATE OR REPLACE FUNCTION public.conduct_ai_insight_block_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'immutable_ai_evidence: AI activity records are retained permanently'
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS conduct_ai_insights_no_delete ON public.conduct_ai_insights;
CREATE TRIGGER conduct_ai_insights_no_delete
  BEFORE DELETE ON public.conduct_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.conduct_ai_insight_block_delete();

-- ------------------------------------------- ai_management permissions
INSERT INTO public.permission_actions (module_id, key, label, description, audience, sort_order, is_active, is_system)
SELECT m.id, v.key, v.label, v.description, 'internal', v.sort_order, true, true
  FROM public.permission_modules m
  CROSS JOIN (VALUES
    ('create','Create','Create AI governance configuration', 20),
    ('edit','Edit','Edit AI governance configuration', 30),
    ('approve','Approve','Approve, release or suspend governed AI capabilities', 40),
    ('assure','Assure','Perform AI assurance reviews', 60)
  ) AS v(key,label,description,sort_order)
 WHERE m.key = 'ai_management'
   AND NOT EXISTS (SELECT 1 FROM public.permission_actions pa WHERE pa.module_id = m.id AND pa.key = v.key);

INSERT INTO public.permissions (module, name, action_id, description, enforced, deprecated)
SELECT 'ai_management', pa.key, pa.id,
       'AI governance: ' || pa.label, true, false
  FROM public.permission_actions pa
  JOIN public.permission_modules m ON m.id = pa.module_id
 WHERE m.key = 'ai_management'
   AND pa.key IN ('create','edit','approve','assure')
   AND NOT EXISTS (
     SELECT 1 FROM public.permissions p WHERE p.module = 'ai_management' AND p.name = pa.key
   );