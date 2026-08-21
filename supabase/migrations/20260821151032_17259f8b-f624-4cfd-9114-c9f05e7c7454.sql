-- P04 A.9–A.13 — adverse licence lifecycle schema
ALTER TABLE public.license_lifecycle_matters
  DROP CONSTRAINT IF EXISTS license_lifecycle_matters_matter_kind_check;
ALTER TABLE public.license_lifecycle_matters
  ADD CONSTRAINT license_lifecycle_matters_matter_kind_check
  CHECK (matter_kind IN ('renewal','variation','condition_review','suspension',
                         'revocation','reinstatement','surrender','expiry'));

ALTER TABLE public.license_lifecycle_matters
  ADD COLUMN IF NOT EXISTS matter_reference text,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS team text,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS related_matter_id uuid,
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS workflow_version text,
  ADD COLUMN IF NOT EXISTS config_id uuid,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS decision_id uuid;

ALTER TABLE public.license_lifecycle_matters
  DROP CONSTRAINT IF EXISTS license_lifecycle_matters_stage_check;
ALTER TABLE public.license_lifecycle_matters
  ADD CONSTRAINT license_lifecycle_matters_stage_check
  CHECK (stage IN ('OPEN','NOTICE_OF_PROPOSED_ACTION','REPRESENTATION_WINDOW',
                   'EVIDENCE_REVIEW','VERIFICATION','SURRENDER_REVIEW',
                   'EXPIRY_REVIEW','DECISION_READY','DECIDED','CLOSED'));

ALTER TABLE public.license_lifecycle_matters
  DROP CONSTRAINT IF EXISTS license_lifecycle_matters_source_kind_check;
ALTER TABLE public.license_lifecycle_matters
  ADD CONSTRAINT license_lifecycle_matters_source_kind_check
  CHECK (source_kind IS NULL OR source_kind IN (
    'condition_breach','prudential_matter','examination_finding','conduct_matter',
    'enforcement_case','complaint','licensing_review','entity_request','time_based_expiry','manual_referral'));

ALTER TABLE public.license_lifecycle_matters
  DROP CONSTRAINT IF EXISTS license_lifecycle_matters_related_fk;
ALTER TABLE public.license_lifecycle_matters
  ADD CONSTRAINT license_lifecycle_matters_related_fk
  FOREIGN KEY (related_matter_id) REFERENCES public.license_lifecycle_matters(id) ON DELETE SET NULL;

CREATE SEQUENCE IF NOT EXISTS public.license_matter_reference_seq;

CREATE OR REPLACE FUNCTION public.tg_llm_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.matter_reference IS NULL THEN
    NEW.matter_reference := 'LM-' || to_char(now(),'YYYY') || '-' ||
      lpad(nextval('public.license_matter_reference_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_llm_reference ON public.license_lifecycle_matters;
CREATE TRIGGER trg_llm_reference BEFORE INSERT ON public.license_lifecycle_matters
FOR EACH ROW EXECUTE FUNCTION public.tg_llm_reference();

UPDATE public.license_lifecycle_matters
   SET matter_reference = 'LM-' || to_char(opened_at,'YYYY') || '-' ||
       lpad(nextval('public.license_matter_reference_seq')::text, 6, '0')
 WHERE matter_reference IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_llm_reference ON public.license_lifecycle_matters(matter_reference);
CREATE INDEX IF NOT EXISTS idx_llm_stage ON public.license_lifecycle_matters(status, stage);
CREATE INDEX IF NOT EXISTS idx_llm_source ON public.license_lifecycle_matters(source_kind, source_id);

CREATE TABLE IF NOT EXISTS public.license_matter_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES public.license_lifecycle_matters(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  notice_kind text NOT NULL DEFAULT 'proposed_action'
    CHECK (notice_kind IN ('proposed_action','decision','reminder','other')),
  notice_reference text,
  subject text,
  body text,
  legal_basis text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid,
  representation_deadline timestamptz,
  correspondence_thread_id uuid,
  delivery_channel text,
  delivery_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lmn_matter ON public.license_matter_notices(matter_id);
GRANT SELECT ON public.license_matter_notices TO authenticated;
GRANT ALL ON public.license_matter_notices TO service_role;
ALTER TABLE public.license_matter_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lmn_read" ON public.license_matter_notices;
CREATE POLICY "lmn_read" ON public.license_matter_notices
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(),'license_management','view')
  OR EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = license_id AND l.holder_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.license_matter_representations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES public.license_lifecycle_matters(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  notice_id uuid REFERENCES public.license_matter_notices(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_via text,
  submitter_name text,
  submitted_by uuid,
  summary text,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_late boolean NOT NULL DEFAULT false,
  is_waiver boolean NOT NULL DEFAULT false,
  waiver_reason text,
  recorded_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lmr_matter ON public.license_matter_representations(matter_id);
GRANT SELECT ON public.license_matter_representations TO authenticated;
GRANT ALL ON public.license_matter_representations TO service_role;
ALTER TABLE public.license_matter_representations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lmr_read" ON public.license_matter_representations;
CREATE POLICY "lmr_read" ON public.license_matter_representations
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(),'license_management','view')
  OR EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = license_id AND l.holder_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.license_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid REFERENCES public.license_lifecycle_matters(id) ON DELETE SET NULL,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  entity_id uuid,
  decision_reference text,
  decision_type text NOT NULL
    CHECK (decision_type IN ('suspension','revocation','reinstatement','surrender','expiry','renewal','variation')),
  decision text NOT NULL,
  authority text,
  actor_id uuid,
  maker_id uuid,
  checker_id uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  effective_date date,
  rationale text,
  legal_basis text,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  remediation jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_reference text,
  appealable boolean NOT NULL DEFAULT false,
  appeal_deadline timestamptz,
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ldec_license ON public.license_decisions(license_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_ldec_matter ON public.license_decisions(matter_id);

CREATE SEQUENCE IF NOT EXISTS public.license_decision_reference_seq;

CREATE OR REPLACE FUNCTION public.tg_license_decision_reference()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.decision_reference IS NULL THEN
    NEW.decision_reference := 'LD-' || to_char(now(),'YYYY') || '-' ||
      lpad(nextval('public.license_decision_reference_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_license_decision_reference ON public.license_decisions;
CREATE TRIGGER trg_license_decision_reference BEFORE INSERT ON public.license_decisions
FOR EACH ROW EXECUTE FUNCTION public.tg_license_decision_reference();

CREATE OR REPLACE FUNCTION public.tg_license_decisions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'LICENSE_DECISION_IMMUTABLE'
    USING ERRCODE='42501',
          DETAIL='Licence decisions are append-only; record a superseding decision instead.';
END $$;

DROP TRIGGER IF EXISTS trg_license_decisions_append_only ON public.license_decisions;
CREATE TRIGGER trg_license_decisions_append_only
BEFORE UPDATE OR DELETE ON public.license_decisions
FOR EACH ROW EXECUTE FUNCTION public.tg_license_decisions_append_only();

GRANT SELECT ON public.license_decisions TO authenticated;
GRANT ALL ON public.license_decisions TO service_role;
ALTER TABLE public.license_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ldec_read" ON public.license_decisions;
CREATE POLICY "ldec_read" ON public.license_decisions
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(),'license_management','view')
  OR EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = license_id AND l.holder_id = auth.uid())
);

ALTER TABLE public.license_lifecycle_matters
  DROP CONSTRAINT IF EXISTS license_lifecycle_matters_decision_fk;
ALTER TABLE public.license_lifecycle_matters
  ADD CONSTRAINT license_lifecycle_matters_decision_fk
  FOREIGN KEY (decision_id) REFERENCES public.license_decisions(id) ON DELETE SET NULL;

ALTER TABLE public.license_lifecycle_configs
  ADD COLUMN IF NOT EXISTS notice_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS representation_period_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS representation_waiver_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS late_representation_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evidence_review_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS maker_checker_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_basis_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appealable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appeal_window_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS reinstatement_prerequisites jsonb NOT NULL
    DEFAULT '["conditions_satisfied","evidence_approved","obligations_resolved"]'::jsonb,
  ADD COLUMN IF NOT EXISTS surrender_blockers jsonb NOT NULL
    DEFAULT '["OPEN_CONDITIONS","OPEN_ENFORCEMENT","UNRESOLVED_REPORTING"]'::jsonb;

ALTER TABLE public.license_lifecycle_configs
  DROP CONSTRAINT IF EXISTS license_lifecycle_configs_matter_kind_check;

CREATE OR REPLACE FUNCTION public.license_lifecycle_config_resolve(_license_id uuid, _matter_kind text DEFAULT 'renewal')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; pol jsonb; c record;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);

  SELECT * INTO c
    FROM public.license_lifecycle_configs x
   WHERE x.is_active
     AND x.matter_kind = COALESCE(_matter_kind,'renewal')
     AND (x.regulator_id IS NULL OR x.regulator_id = l.regulator_id)
     AND (x.sector_id IS NULL OR x.sector_id = l.sector_id)
     AND (x.sub_sector_id IS NULL OR x.sub_sector_id = l.sub_sector_id)
     AND (x.category_id IS NULL OR x.category_id = l.category_id)
     AND (x.license_type IS NULL OR x.license_type = l.license_type)
   ORDER BY (CASE WHEN x.category_id IS NOT NULL THEN 8 ELSE 0 END)
          + (CASE WHEN x.license_type IS NOT NULL THEN 4 ELSE 0 END)
          + (CASE WHEN x.sub_sector_id IS NOT NULL THEN 2 ELSE 0 END)
          + (CASE WHEN x.sector_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
          x.updated_at DESC
   LIMIT 1;

  IF c.id IS NULL THEN
    RETURN pol || jsonb_build_object(
      'config_id', NULL, 'matter_kind', COALESCE(_matter_kind,'renewal'), 'source', 'site_settings',
      'required_documents','[]'::jsonb, 'verification_required', true, 'verification_checklist','[]'::jsonb,
      'fp_required', false, 'fee_required', false, 'fee_type_code', NULL,
      'payment_verification_required', false, 'decision_authority', NULL,
      'late_renewal_treatment','grace_then_lapse', 'expiry_behavior','officer_confirmed',
      'breach_consequence','supervisory_followup', 'workflow_id', NULL,
      'required_form_package_id', NULL,
      'notice_required', true, 'representation_period_days', 14,
      'representation_waiver_allowed', true, 'late_representation_allowed', true,
      'evidence_review_required', true, 'maker_checker_required', false,
      'legal_basis_required', true, 'appealable', true, 'appeal_window_days', 30,
      'reinstatement_prerequisites','["conditions_satisfied","evidence_approved","obligations_resolved"]'::jsonb,
      'surrender_blockers','["OPEN_CONDITIONS","OPEN_ENFORCEMENT","UNRESOLVED_REPORTING"]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'config_id', c.id, 'matter_kind', c.matter_kind, 'source','license_lifecycle_configs',
    'cycle_type', c.renewal_cycle, 'renewal_cycle', c.renewal_cycle,
    'period_days', c.period_days, 'renewal_window_days', c.renewal_window_days,
    'grace_period_days', c.grace_period_days, 'reminder_days', c.reminder_days,
    'required_form_package_id', c.required_form_package_id,
    'required_documents', c.required_documents,
    'verification_required', c.verification_required,
    'verification_checklist', c.verification_checklist,
    'fp_required', c.fp_required,
    'fee_required', c.fee_required, 'fee_type_code', c.fee_type_code,
    'payment_verification_required', c.payment_verification_required,
    'decision_authority', c.decision_authority,
    'late_renewal_treatment', c.late_renewal_treatment,
    'expiry_behavior', c.expiry_behavior,
    'breach_consequence', c.breach_consequence,
    'workflow_id', c.workflow_id,
    'notice_required', c.notice_required,
    'representation_period_days', c.representation_period_days,
    'representation_waiver_allowed', c.representation_waiver_allowed,
    'late_representation_allowed', c.late_representation_allowed,
    'evidence_review_required', c.evidence_review_required,
    'maker_checker_required', c.maker_checker_required,
    'legal_basis_required', c.legal_basis_required,
    'appealable', c.appealable,
    'appeal_window_days', c.appeal_window_days,
    'reinstatement_prerequisites', c.reinstatement_prerequisites,
    'surrender_blockers', c.surrender_blockers);
END $$;

GRANT EXECUTE ON FUNCTION public.license_lifecycle_config_resolve(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.license_matter_prerequisites(_matter_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; l record; cfg jsonb; ent uuid;
  out_b jsonb := '[]'::jsonb;
  v_notice record; v_reps int; v_late int;
  v_open_conditions int; v_overdue_conditions int; v_under_review int;
  v_href text; v_prereq text; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO m FROM public.license_lifecycle_matters WHERE id = _matter_id;
  IF m IS NULL THEN RETURN out_b; END IF;
  SELECT * INTO l FROM public.licenses WHERE id = m.license_id;
  cfg := public.license_lifecycle_config_resolve(m.license_id, m.matter_kind);
  SELECT id INTO ent FROM public.licensees WHERE license_id = l.id LIMIT 1;
  v_href := '/licenses/' || l.id || '?tab=adverse';

  SELECT count(*) FILTER (WHERE status IN ('open','in_progress','evidence_due')),
         count(*) FILTER (WHERE status IN ('open','in_progress','evidence_due') AND due_date < current_date),
         count(*) FILTER (WHERE status = 'under_review')
    INTO v_open_conditions, v_overdue_conditions, v_under_review
    FROM public.license_conditions WHERE license_id = l.id;

  SELECT * INTO v_notice FROM public.license_matter_notices
   WHERE matter_id = m.id AND notice_kind = 'proposed_action'
   ORDER BY issued_at DESC LIMIT 1;

  SELECT count(*), count(*) FILTER (WHERE is_late) INTO v_reps, v_late
    FROM public.license_matter_representations WHERE matter_id = m.id;

  IF m.matter_kind IN ('suspension','revocation') THEN
    IF COALESCE((cfg->>'notice_required')::boolean, true) AND v_notice.id IS NULL THEN
      out_b := out_b || jsonb_build_object('key','NOTICE_NOT_ISSUED',
        'label','Notice of proposed action has not been issued','href',v_href);
    END IF;
    IF COALESCE((cfg->>'notice_required')::boolean, true)
       AND v_notice.id IS NOT NULL
       AND COALESCE((cfg->>'representation_period_days')::int, 0) > 0
       AND m.stage IN ('NOTICE_OF_PROPOSED_ACTION','REPRESENTATION_WINDOW') THEN
      out_b := out_b || jsonb_build_object('key','REPRESENTATION_WINDOW_OPEN',
        'label','Representation period is still running (closes ' ||
                COALESCE(to_char(v_notice.representation_deadline,'DD Mon YYYY'),'n/a') || ')',
        'href',v_href);
    END IF;
    IF COALESCE((cfg->>'evidence_review_required')::boolean, true)
       AND m.stage NOT IN ('DECISION_READY','DECIDED','CLOSED') THEN
      out_b := out_b || jsonb_build_object('key','EVIDENCE_REVIEW_INCOMPLETE',
        'label','Evidence review has not been concluded','href',v_href);
    END IF;
  END IF;

  IF m.matter_kind = 'reinstatement' THEN
    IF m.stage NOT IN ('DECISION_READY','DECIDED','CLOSED') THEN
      out_b := out_b || jsonb_build_object('key','VERIFICATION_INCOMPLETE',
        'label','Reinstatement verification has not been completed','href',v_href);
    END IF;
    FOR v_prereq IN SELECT jsonb_array_elements_text(COALESCE(cfg->'reinstatement_prerequisites','[]'::jsonb)) LOOP
      IF v_prereq = 'conditions_satisfied' AND v_overdue_conditions > 0 THEN
        out_b := out_b || jsonb_build_object('key','CONDITIONS_NOT_SATISFIED',
          'label', v_overdue_conditions || ' overdue licence condition(s) outstanding',
          'href','/licenses/' || l.id || '?tab=conditions');
      ELSIF v_prereq = 'evidence_approved' AND v_under_review > 0 THEN
        out_b := out_b || jsonb_build_object('key','EVIDENCE_NOT_APPROVED',
          'label', v_under_review || ' condition(s) awaiting evidence review',
          'href','/licenses/' || l.id || '?tab=conditions');
      ELSIF v_prereq = 'obligations_resolved' AND ent IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.return_filings rf
                     WHERE rf.entity_id = ent AND rf.status IN ('DRAFT','CORRECTION_REQUESTED')) THEN
        out_b := out_b || jsonb_build_object('key','UNRESOLVED_REPORTING',
          'label','Outstanding regulatory returns must be resolved','href','/returns/filings');
      ELSIF v_prereq = 'fee_settled' AND l.application_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.payments p
                     WHERE p.application_id = l.application_id
                       AND COALESCE(p.status,'pending') NOT IN ('paid','completed','verified','waived')) THEN
        out_b := out_b || jsonb_build_object('key','OUTSTANDING_FEE',
          'label','Outstanding fee must be settled','href','/licenses/' || l.id);
      END IF;
    END LOOP;
  END IF;

  IF m.matter_kind = 'surrender' THEN
    IF m.stage NOT IN ('DECISION_READY','DECIDED','CLOSED') THEN
      out_b := out_b || jsonb_build_object('key','SURRENDER_REVIEW_INCOMPLETE',
        'label','Surrender review has not been concluded','href',v_href);
    END IF;
    FOR v_prereq IN SELECT jsonb_array_elements_text(COALESCE(cfg->'surrender_blockers','[]'::jsonb)) LOOP
      IF v_prereq = 'OPEN_CONDITIONS' AND v_open_conditions > 0 THEN
        out_b := out_b || jsonb_build_object('key','OPEN_CONDITIONS',
          'label', v_open_conditions || ' open condition(s) must be satisfied or waived',
          'href','/licenses/' || l.id || '?tab=conditions');
      ELSIF v_prereq = 'OPEN_ENFORCEMENT' AND ent IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.enforcement_actions e
                     WHERE e.entity_id = ent AND COALESCE(e.status,'open') NOT IN ('closed','withdrawn')) THEN
        out_b := out_b || jsonb_build_object('key','OPEN_ENFORCEMENT',
          'label','Open enforcement case must be concluded','href','/enforcement/queue');
      ELSIF v_prereq = 'UNRESOLVED_REPORTING' AND ent IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.return_filings rf
                     WHERE rf.entity_id = ent AND rf.status IN ('DRAFT','CORRECTION_REQUESTED')) THEN
        out_b := out_b || jsonb_build_object('key','UNRESOLVED_REPORTING',
          'label','Outstanding regulatory returns must be resolved','href','/returns/filings');
      ELSIF v_prereq = 'OUTSTANDING_FEE' AND l.application_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.payments p
                     WHERE p.application_id = l.application_id
                       AND COALESCE(p.status,'pending') NOT IN ('paid','completed','verified','waived')) THEN
        out_b := out_b || jsonb_build_object('key','OUTSTANDING_FEE',
          'label','Outstanding fee must be settled','href','/licenses/' || l.id);
      END IF;
    END LOOP;
  END IF;

  IF m.matter_kind IN ('suspension','revocation','reinstatement','surrender','expiry') THEN
    IF NULLIF(cfg->>'decision_authority','') IS NOT NULL
       AND NOT public.is_super_admin(v_uid)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = v_uid AND ur.role::text = cfg->>'decision_authority') THEN
      out_b := out_b || jsonb_build_object('key','DECISION_AUTHORITY',
        'label','Decision authority required: ' || (cfg->>'decision_authority'),'href',v_href);
    END IF;
    IF COALESCE((cfg->>'maker_checker_required')::boolean,false)
       AND m.opened_by IS NOT NULL AND m.opened_by = v_uid AND NOT public.is_super_admin(v_uid) THEN
      out_b := out_b || jsonb_build_object('key','MAKER_CHECKER',
        'label','A second officer must take the decision (maker/checker)','href',v_href);
    END IF;
    IF COALESCE((cfg->>'legal_basis_required')::boolean,true)
       AND btrim(COALESCE(m.legal_basis, v_notice.legal_basis, '')) = '' THEN
      out_b := out_b || jsonb_build_object('key','LEGAL_BASIS',
        'label','Legal basis must be recorded for this decision','href',v_href);
    END IF;
  END IF;

  RETURN out_b;
END $$;

REVOKE ALL ON FUNCTION public.license_matter_prerequisites(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_matter_prerequisites(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.license_adverse_matters(_license_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; res jsonb;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'license_management','view')
          OR l.holder_id = auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'opened_at' DESC), '[]'::jsonb) INTO res
  FROM (
    SELECT jsonb_build_object(
      'matter_id', m.id, 'matter_reference', m.matter_reference, 'matter_kind', m.matter_kind,
      'stage', m.stage, 'status', m.status, 'title', m.title, 'reason', m.reason,
      'legal_basis', m.legal_basis, 'source_kind', m.source_kind, 'source_id', m.source_id,
      'source_reference', m.source_reference, 'related_matter_id', m.related_matter_id,
      'waiting_on', m.waiting_on, 'owner_user_id', m.owner_user_id, 'team', m.team,
      'sla_due_at', COALESCE(m.sla_due_at, m.due_at), 'opened_at', m.opened_at, 'opened_by', m.opened_by,
      'closed_at', m.closed_at, 'decision', m.decision, 'effective_date', m.effective_date,
      'prerequisites', public.license_matter_prerequisites(m.id),
      'notices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', n.id, 'notice_kind', n.notice_kind, 'notice_reference', n.notice_reference,
          'subject', n.subject, 'body', n.body, 'legal_basis', n.legal_basis, 'issued_at', n.issued_at,
          'issued_by', n.issued_by, 'representation_deadline', n.representation_deadline,
          'delivery_channel', n.delivery_channel, 'delivery_evidence', n.delivery_evidence,
          'delivery_confirmed_at', n.delivery_confirmed_at,
          'correspondence_thread_id', n.correspondence_thread_id) ORDER BY n.issued_at DESC)
        FROM public.license_matter_notices n WHERE n.matter_id = m.id), '[]'::jsonb),
      'representations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'received_at', r.received_at, 'received_via', r.received_via,
          'submitter_name', r.submitter_name, 'summary', r.summary, 'documents', r.documents,
          'is_late', r.is_late, 'is_waiver', r.is_waiver, 'waiver_reason', r.waiver_reason)
          ORDER BY r.received_at DESC)
        FROM public.license_matter_representations r WHERE r.matter_id = m.id), '[]'::jsonb),
      'decision_record', (
        SELECT jsonb_build_object(
          'decision_id', d.id, 'decision_reference', d.decision_reference,
          'decision_type', d.decision_type, 'decision', d.decision, 'authority', d.authority,
          'actor_id', d.actor_id, 'decided_at', d.decided_at, 'effective_date', d.effective_date,
          'rationale', d.rationale, 'legal_basis', d.legal_basis,
          'artifact_reference', d.artifact_reference, 'appealable', d.appealable,
          'appeal_deadline', d.appeal_deadline, 'matter_id', d.matter_id)
        FROM public.license_decisions d WHERE d.matter_id = m.id
        ORDER BY d.decided_at DESC LIMIT 1)
    ) AS x
    FROM public.license_lifecycle_matters m
    WHERE m.license_id = l.id
      AND m.matter_kind IN ('suspension','revocation','reinstatement','surrender','expiry')
  ) s;

  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.license_adverse_matters(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_adverse_matters(uuid) TO authenticated, service_role;