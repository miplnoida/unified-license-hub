-- ============================================================
-- EPR-03 / P11 — Enforcement process rationalisation (schema)
-- ============================================================

-- ---------- 1. generic source model on the existing case table
ALTER TABLE public.enforcement_actions
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_reason text,
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'REFERRAL',
  ADD COLUMN IF NOT EXISTS notice_reference text,
  ADD COLUMN IF NOT EXISTS notice_recipient text,
  ADD COLUMN IF NOT EXISTS notice_dispatch_method text,
  ADD COLUMN IF NOT EXISTS representation_deadline date,
  ADD COLUMN IF NOT EXISTS representations_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_review_note text,
  ADD COLUMN IF NOT EXISTS decision_authority uuid,
  ADD COLUMN IF NOT EXISTS sanction_type text,
  ADD COLUMN IF NOT EXISTS sanction_detail text,
  ADD COLUMN IF NOT EXISTS sanction_imposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS directive_detail text,
  ADD COLUMN IF NOT EXISTS penalty_waived_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closure_rationale text,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_team text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'medium';

DO $$ BEGIN
  ALTER TABLE public.enforcement_actions
    ADD CONSTRAINT enforcement_actions_source_kind_chk CHECK (
      source_kind IS NULL OR source_kind IN (
        'COMPLAINT','CONDUCT_INVESTIGATION','THEMATIC_FINDING','PRUDENTIAL_BREACH',
        'PRUDENTIAL_ACTION','EXAMINATION_FINDING','LICENSING_VIOLATION','FP_MATTER','MANUAL_REFERRAL'
      ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.enforcement_actions
    ADD CONSTRAINT enforcement_actions_stage_chk CHECK (stage IN (
      'REFERRAL','ASSESSMENT','NOTICE','REPRESENTATIONS','DECISION','SANCTION',
      'REMEDIATION_MONITORING','APPEAL','CLOSED','WITHDRAWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.enforcement_actions
    ADD CONSTRAINT enforcement_actions_severity_chk CHECK (severity IN ('critical','high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_enforcement_actions_source ON public.enforcement_actions (source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_enforcement_actions_stage ON public.enforcement_actions (stage);
CREATE INDEX IF NOT EXISTS idx_enforcement_actions_assigned ON public.enforcement_actions (assigned_to);

-- ---------- 2. backfill provenance for existing cases (no meaning change)
UPDATE public.enforcement_actions ea
   SET source_kind = 'COMPLAINT',
       source_id = c.id,
       source_reference = c.complaint_number
  FROM public.complaints c
 WHERE c.enforcement_action_id = ea.id
   AND ea.source_kind IS NULL;

UPDATE public.enforcement_actions ea
   SET source_kind = CASE
         WHEN lower(coalesce(ea.source_type,'')) LIKE '%breach%' THEN 'PRUDENTIAL_BREACH'
         WHEN lower(coalesce(ea.source_type,'')) LIKE '%complaint%' THEN 'COMPLAINT'
         WHEN lower(coalesce(ea.source_type,'')) LIKE '%conduct%' THEN 'CONDUCT_INVESTIGATION'
         WHEN lower(coalesce(ea.source_type,'')) LIKE '%exam%' THEN 'EXAMINATION_FINDING'
         WHEN lower(coalesce(ea.source_type,'')) LIKE '%thematic%' THEN 'THEMATIC_FINDING'
         ELSE 'MANUAL_REFERRAL' END,
       source_id = coalesce(ea.source_reference_id, ea.source_id)
 WHERE ea.source_kind IS NULL;

UPDATE public.enforcement_actions
   SET referred_at = coalesce(referred_at, created_at),
       referred_by = coalesce(referred_by, opened_by),
       referral_reason = coalesce(referral_reason, nullif(btrim(coalesce(description,'')),''),
                                  'Historical enforcement case migrated to the enforcement process model.');

-- presentation stage backfill from existing business state
UPDATE public.enforcement_actions
   SET stage = CASE
     WHEN status = 'withdrawn' OR review_state = 'rejected' THEN 'WITHDRAWN'
     WHEN status IN ('closed','resolved') THEN 'CLOSED'
     WHEN status = 'appealed' THEN 'APPEAL'
     WHEN monitoring_state IN ('monitoring','non_compliant') AND notice_issued_at IS NOT NULL AND decision_at IS NOT NULL THEN 'REMEDIATION_MONITORING'
     WHEN decision_at IS NOT NULL AND (penalty_amount > 0 OR sanction_type IS NOT NULL) THEN 'SANCTION'
     WHEN decision_at IS NOT NULL THEN 'DECISION'
     WHEN response_received_at IS NOT NULL THEN 'REPRESENTATIONS'
     WHEN notice_issued_at IS NOT NULL THEN 'NOTICE'
     WHEN review_state IN ('pending_review','reviewed','under_review','approved') THEN 'ASSESSMENT'
     ELSE 'REFERRAL' END
 WHERE stage = 'REFERRAL';

-- ---------- 3. Enforcement workflow configuration (versioned, server-owned)
CREATE TABLE IF NOT EXISTS public.enforcement_workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  stage text NOT NULL,
  label text NOT NULL,
  seq integer NOT NULL,
  sla_days integer NOT NULL DEFAULT 14,
  due_soon_days integer NOT NULL DEFAULT 3,
  waiting_on text NOT NULL DEFAULT 'regulator',
  description text,
  is_terminal boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, stage)
);

CREATE TABLE IF NOT EXISTS public.enforcement_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  action_code text NOT NULL,
  label text NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  to_status text,
  seq integer NOT NULL DEFAULT 10,
  permission_action text NOT NULL DEFAULT 'workflow_action',
  requires_rationale boolean NOT NULL DEFAULT false,
  min_rationale_length integer NOT NULL DEFAULT 10,
  requires_evidence boolean NOT NULL DEFAULT false,
  requires_maker_checker boolean NOT NULL DEFAULT false,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, action_code, from_stage)
);

GRANT SELECT ON public.enforcement_workflow_stages TO authenticated;
GRANT SELECT ON public.enforcement_workflow_transitions TO authenticated;
GRANT ALL ON public.enforcement_workflow_stages TO service_role;
GRANT ALL ON public.enforcement_workflow_transitions TO service_role;

ALTER TABLE public.enforcement_workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enforcement_workflow_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ews_read ON public.enforcement_workflow_stages;
CREATE POLICY ews_read ON public.enforcement_workflow_stages FOR SELECT TO authenticated
  USING (public.can_act_on_enforcement(auth.uid(),'view') OR public.can_read_enforcement(auth.uid(), NULL));

DROP POLICY IF EXISTS ewt_read ON public.enforcement_workflow_transitions;
CREATE POLICY ewt_read ON public.enforcement_workflow_transitions FOR SELECT TO authenticated
  USING (public.can_act_on_enforcement(auth.uid(),'view') OR public.can_read_enforcement(auth.uid(), NULL));

-- ---------- 4. representations, appeals, payments (children of the SAME case)
CREATE TABLE IF NOT EXISTS public.enforcement_representations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.enforcement_actions(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_from text,
  channel text,
  summary text NOT NULL,
  attachment_reference text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enforcement_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.enforcement_actions(id) ON DELETE CASCADE,
  lodged_at timestamptz NOT NULL DEFAULT now(),
  appellant text,
  grounds text NOT NULL,
  review_body text,
  status text NOT NULL DEFAULT 'lodged',
  decision text,
  decision_rationale text,
  decision_at timestamptz,
  decided_by uuid,
  effect_on_action text,
  lodged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enforcement_penalty_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.enforcement_actions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  payment_reference text,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL DEFAULT 'payment',
  note text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enf_representations_case ON public.enforcement_representations(case_id);
CREATE INDEX IF NOT EXISTS idx_enf_appeals_case ON public.enforcement_appeals(case_id);
CREATE INDEX IF NOT EXISTS idx_enf_payments_case ON public.enforcement_penalty_payments(case_id);

GRANT SELECT ON public.enforcement_representations, public.enforcement_appeals, public.enforcement_penalty_payments TO authenticated;
GRANT ALL ON public.enforcement_representations, public.enforcement_appeals, public.enforcement_penalty_payments TO service_role;

ALTER TABLE public.enforcement_representations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enforcement_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enforcement_penalty_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enf_rep_read ON public.enforcement_representations;
CREATE POLICY enf_rep_read ON public.enforcement_representations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enforcement_actions ea
                  WHERE ea.id = case_id AND public.can_read_enforcement(auth.uid(), ea.entity_id)));

DROP POLICY IF EXISTS enf_appeal_read ON public.enforcement_appeals;
CREATE POLICY enf_appeal_read ON public.enforcement_appeals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enforcement_actions ea
                  WHERE ea.id = case_id AND public.can_read_enforcement(auth.uid(), ea.entity_id)));

DROP POLICY IF EXISTS enf_pay_read ON public.enforcement_penalty_payments;
CREATE POLICY enf_pay_read ON public.enforcement_penalty_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enforcement_actions ea
                  WHERE ea.id = case_id AND public.can_read_enforcement(auth.uid(), ea.entity_id)));
