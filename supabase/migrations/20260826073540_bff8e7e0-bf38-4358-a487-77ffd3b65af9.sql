
-- ============ MC-03: investigation plans ============
CREATE TABLE IF NOT EXISTS public.complaint_investigation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  regulator_id uuid,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','SUPERSEDED')),
  is_current boolean NOT NULL DEFAULT true,
  objective text,
  jurisdiction_scope text,
  in_scope_summary text,
  out_of_scope_summary text,
  approach text,
  evidence_required text,
  information_sources text,
  parties_to_contact text,
  milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  planned_completion_date date,
  dependencies text,
  risks_constraints text,
  lead_investigator_id uuid,
  review_officer_id uuid,
  policy_reference text,
  revision_reason text,
  superseded_by_id uuid REFERENCES public.complaint_investigation_plans(id) ON DELETE SET NULL,
  submitted_at timestamptz, submitted_by uuid,
  approved_at timestamptz, approved_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complaint_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS complaint_investigation_plans_current_uq
  ON public.complaint_investigation_plans(complaint_id) WHERE is_current;

GRANT SELECT ON public.complaint_investigation_plans TO authenticated;
GRANT ALL ON public.complaint_investigation_plans TO service_role;
ALTER TABLE public.complaint_investigation_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY cip_staff_read ON public.complaint_investigation_plans FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));

-- ============ MC-03: allegations ============
CREATE TABLE IF NOT EXISTS public.complaint_allegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  regulator_id uuid,
  allegation_number integer NOT NULL,
  respondent_id uuid REFERENCES public.complaint_respondents(id) ON DELETE SET NULL,
  product_service text,
  issue_category_id uuid REFERENCES public.conduct_risk_categories(id) ON DELETE SET NULL,
  issue_category_label text,
  title text NOT NULL,
  statement text,
  incident_from date,
  incident_to date,
  financial_amount numeric(18,2),
  currency text,
  affected_party text,
  source text,
  jurisdiction_scope text NOT NULL DEFAULT 'IN_SCOPE'
    CHECK (jurisdiction_scope IN ('IN_SCOPE','OUT_OF_SCOPE','UNDETERMINED')),
  jurisdiction_rationale text,
  investigation_status text NOT NULL DEFAULT 'UNASSESSED'
    CHECK (investigation_status IN ('UNASSESSED','EVIDENCE_GATHERING','ASSESSMENT_IN_PROGRESS','ASSESSED','REOPENED')),
  assessment_outcome text
    CHECK (assessment_outcome IS NULL OR assessment_outcome IN
      ('SUBSTANTIATED','PARTIALLY_SUBSTANTIATED','NOT_SUBSTANTIATED','UNABLE_TO_DETERMINE')),
  assessment_rationale text,
  assessed_by uuid, assessed_at timestamptz,
  officer_analysis text,
  row_version integer NOT NULL DEFAULT 1,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complaint_id, allegation_number)
);
GRANT SELECT ON public.complaint_allegations TO authenticated;
GRANT ALL ON public.complaint_allegations TO service_role;
ALTER TABLE public.complaint_allegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_staff_read ON public.complaint_allegations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));

CREATE TABLE IF NOT EXISTS public.complaint_allegation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allegation_id uuid NOT NULL REFERENCES public.complaint_allegations(id) ON DELETE CASCADE,
  complaint_id uuid NOT NULL,
  event_type text NOT NULL,
  from_state jsonb, to_state jsonb,
  rationale text,
  actor_id uuid, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cah_allegation_idx ON public.complaint_allegation_history(allegation_id, occurred_at);
GRANT SELECT ON public.complaint_allegation_history TO authenticated;
GRANT ALL ON public.complaint_allegation_history TO service_role;
ALTER TABLE public.complaint_allegation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY cah_staff_read ON public.complaint_allegation_history FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));

-- ============ MC-03: evidence extensions (canonical table reused) ============
ALTER TABLE public.complaint_evidence
  ADD COLUMN IF NOT EXISTS evidence_reference text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_party text,
  ADD COLUMN IF NOT EXISTS source_record_type text,
  ADD COLUMN IF NOT EXISTS source_record_id uuid,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_from text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'INTERNAL'
    CHECK (confidentiality IN ('PUBLIC','ENTITY_SHAREABLE','INTERNAL','RESTRICTED')),
  ADD COLUMN IF NOT EXISTS privileged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_data boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reliability text NOT NULL DEFAULT 'NOT_ASSESSED'
    CHECK (reliability IN ('NOT_ASSESSED','LOW','MODERATE','HIGH')),
  ADD COLUMN IF NOT EXISTS relevance text NOT NULL DEFAULT 'NOT_ASSESSED'
    CHECK (relevance IN ('NOT_ASSESSED','CONTEXTUAL','RELEVANT','MATERIAL')),
  ADD COLUMN IF NOT EXISTS assessment_rationale text,
  ADD COLUMN IF NOT EXISTS assessed_by uuid,
  ADD COLUMN IF NOT EXISTS assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS custodian_id uuid,
  ADD COLUMN IF NOT EXISTS acquisition_method text,
  ADD COLUMN IF NOT EXISTS custody_state text NOT NULL DEFAULT 'HELD'
    CHECK (custody_state IN ('HELD','SUPERSEDED','WITHDRAWN','RELEASED')),
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_evidence_id uuid REFERENCES public.complaint_evidence(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_evidence_id uuid REFERENCES public.complaint_evidence(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supersession_reason text,
  ADD COLUMN IF NOT EXISTS ai_extraction_state text NOT NULL DEFAULT 'NOT_ATTEMPTED',
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ============ MC-03: evidence <-> allegation linkage ============
CREATE TABLE IF NOT EXISTS public.complaint_evidence_allegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.complaint_evidence(id) ON DELETE CASCADE,
  allegation_id uuid NOT NULL REFERENCES public.complaint_allegations(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'SUPPORTS'
    CHECK (relationship_type IN ('SUPPORTS','CONTRADICTS','CONTEXT','UNDETERMINED')),
  relevance_note text,
  linked_by uuid, linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id, allegation_id)
);
GRANT SELECT ON public.complaint_evidence_allegations TO authenticated;
GRANT ALL ON public.complaint_evidence_allegations TO service_role;
ALTER TABLE public.complaint_evidence_allegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cea_staff_read ON public.complaint_evidence_allegations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));

-- ============ MC-03: formal representations ============
CREATE TABLE IF NOT EXISTS public.complaint_representations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  regulator_id uuid,
  respondent_id uuid REFERENCES public.complaint_respondents(id) ON DELETE SET NULL,
  licensee_id uuid,
  representing_party text,
  representation_type text NOT NULL DEFAULT 'ALLEGATION_RESPONSE',
  invitation_reference text,
  invitation_summary text,
  invited_at timestamptz,
  window_opens_at timestamptz,
  due_at timestamptz,
  extended_due_at timestamptz,
  extension_reason text,
  submitted_at timestamptz,
  submitted_by uuid,
  narrative text,
  confidentiality_claim text,
  status text NOT NULL DEFAULT 'DRAFT_INVITATION'
    CHECK (status IN ('DRAFT_INVITATION','OPEN','SUBMITTED','UNDER_REVIEW',
                      'ACCEPTED_FOR_CONSIDERATION','LATE_REVIEW_REQUIRED','CLOSED','WITHDRAWN')),
  is_late boolean NOT NULL DEFAULT false,
  late_decision text,
  late_decision_reason text,
  accepted_for_consideration boolean NOT NULL DEFAULT false,
  reviewer_id uuid, reviewed_at timestamptz, review_note text,
  closed_at timestamptz, closed_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.complaint_representations TO authenticated;
GRANT ALL ON public.complaint_representations TO service_role;
ALTER TABLE public.complaint_representations ENABLE ROW LEVEL SECURITY;
CREATE POLICY crep_staff_read ON public.complaint_representations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));
CREATE POLICY crep_entity_read ON public.complaint_representations FOR SELECT TO authenticated
  USING (status <> 'DRAFT_INVITATION' AND licensee_id IS NOT NULL
         AND public.can_current_user_access_licensee(licensee_id, NULL::uuid));

CREATE TABLE IF NOT EXISTS public.complaint_representation_allegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representation_id uuid NOT NULL REFERENCES public.complaint_representations(id) ON DELETE CASCADE,
  allegation_id uuid NOT NULL REFERENCES public.complaint_allegations(id) ON DELETE CASCADE,
  UNIQUE (representation_id, allegation_id)
);
GRANT SELECT ON public.complaint_representation_allegations TO authenticated;
GRANT ALL ON public.complaint_representation_allegations TO service_role;
ALTER TABLE public.complaint_representation_allegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY crepa_read ON public.complaint_representation_allegations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));

CREATE TABLE IF NOT EXISTS public.complaint_representation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representation_id uuid NOT NULL REFERENCES public.complaint_representations(id) ON DELETE CASCADE,
  complaint_id uuid NOT NULL,
  event_type text NOT NULL,
  detail jsonb,
  narrative_snapshot text,
  actor_id uuid, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crepe_idx ON public.complaint_representation_events(representation_id, occurred_at);
GRANT SELECT ON public.complaint_representation_events TO authenticated;
GRANT ALL ON public.complaint_representation_events TO service_role;
ALTER TABLE public.complaint_representation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY crepe_read ON public.complaint_representation_events FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));

-- ============ MC-03: task + RFI convergence columns ============
ALTER TABLE public.complaint_investigation_tasks
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.complaint_investigation_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allegation_id uuid REFERENCES public.complaint_allegations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rfi_id uuid REFERENCES public.complaint_rfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS representation_id uuid REFERENCES public.complaint_representations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.complaint_rfis
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.complaint_investigation_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS evidence_requirement text,
  ADD COLUMN IF NOT EXISTS respondent_id uuid REFERENCES public.complaint_respondents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completeness_review text,
  ADD COLUMN IF NOT EXISTS investigator_disposition text,
  ADD COLUMN IF NOT EXISTS evidence_finalized_at timestamptz;

CREATE TABLE IF NOT EXISTS public.complaint_rfi_allegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_id uuid NOT NULL REFERENCES public.complaint_rfis(id) ON DELETE CASCADE,
  allegation_id uuid NOT NULL REFERENCES public.complaint_allegations(id) ON DELETE CASCADE,
  UNIQUE (rfi_id, allegation_id)
);
GRANT SELECT ON public.complaint_rfi_allegations TO authenticated;
GRANT ALL ON public.complaint_rfi_allegations TO service_role;
ALTER TABLE public.complaint_rfi_allegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY crfia_read ON public.complaint_rfi_allegations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(),'view'));
