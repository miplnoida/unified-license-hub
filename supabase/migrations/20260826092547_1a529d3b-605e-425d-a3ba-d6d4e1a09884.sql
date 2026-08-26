-- ============================================================
-- MC-04 — OUTCOME, REDRESS, QA & RECONSIDERATION
-- ============================================================

-- ---------- 1. OUTCOME RECORD ----------
CREATE TABLE IF NOT EXISTS public.complaint_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  regulator_id uuid,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','SUPERSEDED')),
  overall_outcome text,
  outcome_rationale text,
  consumer_harm_summary text,
  harm_level text,
  redress_required boolean NOT NULL DEFAULT false,
  redress_rationale text,
  communication_required boolean NOT NULL DEFAULT true,
  communication_basis text,
  recommended_closure_route text,
  reviewer_id uuid,
  allegation_outcome_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_by uuid,
  submitted_at timestamptz,
  row_version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS complaint_outcomes_current_uq
  ON public.complaint_outcomes(complaint_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS complaint_outcomes_complaint_idx
  ON public.complaint_outcomes(complaint_id, version DESC);

GRANT SELECT ON public.complaint_outcomes TO authenticated;
GRANT ALL ON public.complaint_outcomes TO service_role;
ALTER TABLE public.complaint_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Complaint staff read outcomes" ON public.complaint_outcomes
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(),'view'));

-- ---------- 2. REDRESS TYPE CATALOGUE (business controlled) ----------
CREATE TABLE IF NOT EXISTS public.complaint_redress_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid,
  code text NOT NULL,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('MONETARY','NON_MONETARY')),
  description text,
  requires_amount boolean NOT NULL DEFAULT false,
  requires_due_date boolean NOT NULL DEFAULT false,
  requires_evidence boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS complaint_redress_types_code_uq
  ON public.complaint_redress_types(coalesce(regulator_id,'00000000-0000-0000-0000-000000000000'::uuid), code);

GRANT SELECT ON public.complaint_redress_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.complaint_redress_types TO authenticated;
GRANT ALL ON public.complaint_redress_types TO service_role;
ALTER TABLE public.complaint_redress_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Complaint staff read redress types" ON public.complaint_redress_types
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(),'view'));
CREATE POLICY "Complaint config manages redress types" ON public.complaint_redress_types
  FOR ALL TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'configure'))
  WITH CHECK (public.has_complaint_perm(auth.uid(),'configure'));

-- ---------- 3. INDIVIDUAL REDRESS ----------
CREATE TABLE IF NOT EXISTS public.complaint_redress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  outcome_id uuid REFERENCES public.complaint_outcomes(id) ON DELETE SET NULL,
  allegation_id uuid REFERENCES public.complaint_allegations(id) ON DELETE SET NULL,
  party_id uuid REFERENCES public.complaint_parties(id) ON DELETE SET NULL,
  affected_party_label text NOT NULL,
  redress_type_id uuid REFERENCES public.complaint_redress_types(id),
  amount numeric(18,2),
  currency text,
  action_required text NOT NULL,
  responsible_entity text,
  responsible_licensee_id uuid,
  due_date date,
  status text NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','VERIFIED','CANCELLED')),
  is_required boolean NOT NULL DEFAULT true,
  rationale text,
  completion_note text,
  completion_evidence_file_id uuid REFERENCES public.file_uploads(id) ON DELETE SET NULL,
  completed_by uuid,
  completed_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  cancelled_reason text,
  row_version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS complaint_redress_complaint_idx ON public.complaint_redress(complaint_id);

GRANT SELECT ON public.complaint_redress TO authenticated;
GRANT ALL ON public.complaint_redress TO service_role;
ALTER TABLE public.complaint_redress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Complaint staff read redress" ON public.complaint_redress
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(),'view'));

-- ---------- 4. QA POLICIES (risk based) ----------
CREATE TABLE IF NOT EXISTS public.complaint_qa_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid,
  code text NOT NULL,
  label text NOT NULL,
  policy_basis text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  qa_required boolean NOT NULL DEFAULT true,
  reviewer_role text,
  applies_when jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS complaint_qa_policies_code_uq
  ON public.complaint_qa_policies(coalesce(regulator_id,'00000000-0000-0000-0000-000000000000'::uuid), code);

GRANT SELECT ON public.complaint_qa_policies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.complaint_qa_policies TO authenticated;
GRANT ALL ON public.complaint_qa_policies TO service_role;
ALTER TABLE public.complaint_qa_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Complaint staff read qa policies" ON public.complaint_qa_policies
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(),'view'));
CREATE POLICY "Complaint config manages qa policies" ON public.complaint_qa_policies
  FOR ALL TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'configure'))
  WITH CHECK (public.has_complaint_perm(auth.uid(),'configure'));

-- ---------- 5. EXTEND CLOSURE REVIEWS (reuse, no new closure engine) ----------
ALTER TABLE public.complaint_closure_reviews
  ADD COLUMN IF NOT EXISTS qa_policy_id uuid REFERENCES public.complaint_qa_policies(id),
  ADD COLUMN IF NOT EXISTS qa_policy_basis text,
  ADD COLUMN IF NOT EXISTS qa_checklist jsonb,
  ADD COLUMN IF NOT EXISTS qa_findings text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS outcome_id uuid REFERENCES public.complaint_outcomes(id);

-- ---------- 6. RECONSIDERATION (post-closure child lifecycle) ----------
CREATE TABLE IF NOT EXISTS public.complaint_reconsiderations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  reference text,
  received_at timestamptz NOT NULL DEFAULT now(),
  requester_type text NOT NULL DEFAULT 'CONSUMER',
  requester_name text NOT NULL,
  requester_party_id uuid REFERENCES public.complaint_parties(id) ON DELETE SET NULL,
  requester_contact text,
  grounds text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','ADMISSIBILITY_REVIEW','NOT_ADMISSIBLE','ACCEPTED','UNDER_REVIEW','DECIDED','WITHDRAWN')),
  admissibility_decision text CHECK (admissibility_decision IN ('ADMISSIBLE','NOT_ADMISSIBLE')),
  admissibility_rationale text,
  admissibility_by uuid,
  admissibility_at timestamptz,
  reviewer_id uuid,
  reviewer_assigned_by uuid,
  reviewer_assigned_at timestamptz,
  decision text CHECK (decision IN ('UPHELD','VARIED','REOPENED')),
  decision_rationale text,
  decided_by uuid,
  decided_at timestamptz,
  original_outcome_id uuid REFERENCES public.complaint_outcomes(id),
  original_closure_review_id uuid REFERENCES public.complaint_closure_reviews(id),
  row_version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS complaint_reconsiderations_complaint_idx
  ON public.complaint_reconsiderations(complaint_id, received_at DESC);

GRANT SELECT ON public.complaint_reconsiderations TO authenticated;
GRANT ALL ON public.complaint_reconsiderations TO service_role;
ALTER TABLE public.complaint_reconsiderations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Complaint staff read reconsiderations" ON public.complaint_reconsiderations
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(),'view'));

-- updated_at triggers (reuse existing helper)
DROP TRIGGER IF EXISTS trg_mc04_outcomes_touch ON public.complaint_outcomes;
CREATE TRIGGER trg_mc04_outcomes_touch BEFORE UPDATE ON public.complaint_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mc04_redress_touch ON public.complaint_redress;
CREATE TRIGGER trg_mc04_redress_touch BEFORE UPDATE ON public.complaint_redress
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mc04_recon_touch ON public.complaint_reconsiderations;
CREATE TRIGGER trg_mc04_recon_touch BEFORE UPDATE ON public.complaint_reconsiderations
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();

-- ---------- 7. SEED BUSINESS CONFIGURATION ----------
INSERT INTO public.complaint_redress_types (code,label,category,description,requires_amount,requires_due_date,requires_evidence,sort_order)
VALUES
 ('REFUND','Refund of charges or fees','MONETARY','Return of amounts incorrectly charged to the consumer',true,true,true,10),
 ('COMPENSATION','Compensation for loss','MONETARY','Payment for financial loss suffered by the consumer',true,true,true,20),
 ('INTEREST_ADJUSTMENT','Interest or balance adjustment','MONETARY','Correction of interest, balance or account position',true,true,true,30),
 ('GOODWILL_PAYMENT','Goodwill payment','MONETARY','Discretionary payment offered by the regulated entity',true,false,true,40),
 ('RECORD_CORRECTION','Correction of records','NON_MONETARY','Correction of consumer records, including credit records',false,true,true,50),
 ('SERVICE_ACTION','Service action or reinstatement','NON_MONETARY','Delivery of the service or reinstatement of the arrangement',false,true,true,60),
 ('WRITTEN_APOLOGY','Written apology or explanation','NON_MONETARY','Written apology or clear explanation issued to the consumer',false,false,true,70),
 ('OTHER_NON_MONETARY','Other non-monetary remedy','NON_MONETARY','Any other individual remedy agreed for the consumer',false,false,true,80)
ON CONFLICT DO NOTHING;

INSERT INTO public.complaint_qa_policies (code,label,policy_basis,priority,qa_required,reviewer_role,applies_when,checklist)
VALUES
 ('QA_SERIOUS_CASE','Serious case quality review',
  'Complaints assessed as high or critical severity are quality reviewed before closure.',10,true,'supervisor',
  '{"severity_in":["high","critical"]}'::jsonb,
  '["Outcome is supported by the recorded evidence","Every allegation has a recorded determination","Consumer harm is described","Redress is proportionate to the harm","Communication to the consumer is clear"]'::jsonb),
 ('QA_VULNERABLE_CONSUMER','Vulnerable consumer quality review',
  'Complaints involving a consumer recorded as vulnerable are quality reviewed before closure.',20,true,'supervisor',
  '{"vulnerability_indicator":true}'::jsonb,
  '["Vulnerability was considered in the outcome","Communication is appropriate for the consumer","Redress addresses the identified harm"]'::jsonb),
 ('QA_MATERIAL_REDRESS','Material redress quality review',
  'Complaints with individual redress at or above the material threshold are quality reviewed before closure.',30,true,'supervisor',
  '{"min_total_redress":100000}'::jsonb,
  '["Redress calculation is documented","Responsible entity and due dates are recorded","Evidence of completion is on file"]'::jsonb),
 ('QA_UPHELD_CONDUCT','Upheld conduct outcome quality review',
  'Complaints upheld or partially upheld against a regulated entity are quality reviewed before closure.',40,true,'supervisor',
  '{"outcome_in":["UPHELD","PARTIALLY_UPHELD"]}'::jsonb,
  '["Determination language is defensible","Entity representations were considered","Redress decision is explained"]'::jsonb),
 ('QA_ROUTINE_NOT_REQUIRED','Routine case — no quality review required',
  'Routine low and medium severity complaints without vulnerability or material redress are closed by the case supervisor without a separate quality review.',900,false,NULL,
  '{}'::jsonb,'[]'::jsonb)
ON CONFLICT DO NOTHING;
