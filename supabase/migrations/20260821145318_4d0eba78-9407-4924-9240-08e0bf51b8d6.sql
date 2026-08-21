-- =====================================================================
-- P04 A.4 / A.5 / A.7 / A.8
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.license_lifecycle_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_kind text NOT NULL DEFAULT 'renewal'
    CHECK (matter_kind IN ('renewal','variation','reinstatement','surrender','expiry')),
  regulator_id uuid,
  sector_id uuid,
  sub_sector_id uuid,
  category_id uuid,
  license_type text,
  renewal_cycle text NOT NULL DEFAULT 'annual' CHECK (renewal_cycle IN ('annual','periodic','perpetual')),
  period_days integer NOT NULL DEFAULT 365 CHECK (period_days > 0),
  renewal_window_days integer NOT NULL DEFAULT 90 CHECK (renewal_window_days >= 0),
  grace_period_days integer NOT NULL DEFAULT 30 CHECK (grace_period_days >= 0),
  reminder_days jsonb NOT NULL DEFAULT '[60,30,7]'::jsonb,
  required_form_package_id uuid,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_required boolean NOT NULL DEFAULT true,
  verification_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  fp_required boolean NOT NULL DEFAULT false,
  fee_required boolean NOT NULL DEFAULT false,
  fee_type_code text,
  payment_verification_required boolean NOT NULL DEFAULT false,
  decision_authority text,
  late_renewal_treatment text NOT NULL DEFAULT 'grace_then_lapse'
    CHECK (late_renewal_treatment IN ('grace_then_lapse','grace_with_late_fee','no_grace','discretionary')),
  expiry_behavior text NOT NULL DEFAULT 'officer_confirmed'
    CHECK (expiry_behavior IN ('automatic','officer_confirmed')),
  breach_consequence text NOT NULL DEFAULT 'supervisory_followup'
    CHECK (breach_consequence IN ('supervisory_followup','lifecycle_matter','enforcement_referral','additional_condition','suspension_review')),
  workflow_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llc_scope ON public.license_lifecycle_configs(matter_kind, is_active);

GRANT SELECT ON public.license_lifecycle_configs TO authenticated;
GRANT ALL ON public.license_lifecycle_configs TO service_role;
ALTER TABLE public.license_lifecycle_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "llc_read" ON public.license_lifecycle_configs;
CREATE POLICY "llc_read" ON public.license_lifecycle_configs
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "llc_admin_write" ON public.license_lifecycle_configs;
CREATE POLICY "llc_admin_write" ON public.license_lifecycle_configs
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_llc_touch ON public.license_lifecycle_configs;
CREATE TRIGGER trg_llc_touch BEFORE UPDATE ON public.license_lifecycle_configs
FOR EACH ROW EXECUTE FUNCTION public.tg_llm_touch();

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
      'required_form_package_id', NULL);
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
    'workflow_id', c.workflow_id);
END $$;

GRANT EXECUTE ON FUNCTION public.license_lifecycle_config_resolve(uuid, text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.license_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  term_number integer NOT NULL,
  term_kind text NOT NULL CHECK (term_kind IN ('original','renewal','variation','reinstatement')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  source_decision text,
  source_application_id uuid,
  renewal_id uuid REFERENCES public.license_renewals(id) ON DELETE SET NULL,
  matter_id uuid REFERENCES public.license_lifecycle_matters(id) ON DELETE SET NULL,
  decision_actor uuid,
  decision_at timestamptz,
  conditions_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_current boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES public.license_terms(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_id, term_number)
);

CREATE INDEX IF NOT EXISTS idx_license_terms_license ON public.license_terms(license_id, term_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_license_terms_current
  ON public.license_terms(license_id) WHERE is_current;

GRANT SELECT ON public.license_terms TO authenticated;
GRANT ALL ON public.license_terms TO service_role;
ALTER TABLE public.license_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "license_terms_read" ON public.license_terms;
CREATE POLICY "license_terms_read" ON public.license_terms
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(),'license_management','view')
  OR EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = license_id AND l.holder_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.tg_license_terms_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LICENSE_TERM_IMMUTABLE' USING ERRCODE='22023',
      DETAIL = 'Licence terms are append-only; historical validity periods cannot be deleted.';
  END IF;
  IF NEW.license_id IS DISTINCT FROM OLD.license_id
     OR NEW.term_number IS DISTINCT FROM OLD.term_number
     OR NEW.term_kind IS DISTINCT FROM OLD.term_kind
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR (OLD.is_current = false AND NEW.effective_until IS DISTINCT FROM OLD.effective_until)
     OR NEW.source_decision IS DISTINCT FROM OLD.source_decision
     OR NEW.decision_actor IS DISTINCT FROM OLD.decision_actor
     OR NEW.decision_at IS DISTINCT FROM OLD.decision_at THEN
    RAISE EXCEPTION 'LICENSE_TERM_IMMUTABLE' USING ERRCODE='22023',
      DETAIL = 'Only supersession bookkeeping may be updated on a licence term.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_license_terms_append_only ON public.license_terms;
CREATE TRIGGER trg_license_terms_append_only
BEFORE UPDATE OR DELETE ON public.license_terms
FOR EACH ROW EXECUTE FUNCTION public.tg_license_terms_append_only();

INSERT INTO public.license_terms (
  license_id, term_number, term_kind, effective_from, effective_until,
  source_decision, source_application_id, decision_at, is_current, metadata)
SELECT l.id, 1, 'original',
       COALESCE(l.valid_from, l.issued_at, l.created_at), l.valid_until,
       'ORIGINAL_ISSUE', l.application_id, l.issued_at, true,
       jsonb_build_object('backfilled', true)
FROM public.licenses l
WHERE NOT EXISTS (SELECT 1 FROM public.license_terms t WHERE t.license_id = l.id);

DO $$
DECLARE r record; v_prev uuid; v_no int; v_new uuid;
BEGIN
  FOR r IN
    SELECT rn.* FROM public.license_renewals rn
     WHERE rn.status = 'approved' AND rn.new_valid_until IS NOT NULL
     ORDER BY rn.license_id, rn.reviewed_at NULLS LAST, rn.created_at
  LOOP
    IF EXISTS (SELECT 1 FROM public.license_terms t WHERE t.renewal_id = r.id) THEN CONTINUE; END IF;
    SELECT id, term_number INTO v_prev, v_no FROM public.license_terms
      WHERE license_id = r.license_id AND is_current LIMIT 1;
    IF v_prev IS NULL THEN CONTINUE; END IF;
    UPDATE public.license_terms SET is_current = false WHERE id = v_prev;
    INSERT INTO public.license_terms(license_id, term_number, term_kind, effective_from, effective_until,
      source_decision, renewal_id, decision_actor, decision_at, is_current, metadata)
    VALUES (r.license_id, v_no + 1, 'renewal',
            COALESCE(r.previous_valid_until, r.reviewed_at, r.created_at), r.new_valid_until,
            'APPROVE_RENEWAL', r.id, r.reviewed_by, COALESCE(r.reviewed_at, r.updated_at), true,
            jsonb_build_object('backfilled', true))
    RETURNING id INTO v_new;
    UPDATE public.license_terms SET superseded_by = v_new, superseded_at = COALESCE(r.reviewed_at, now())
      WHERE id = v_prev;
  END LOOP;
END $$;

ALTER TABLE public.license_conditions
  ADD COLUMN IF NOT EXISTS condition_reference text,
  ADD COLUMN IF NOT EXISTS source_decision text,
  ADD COLUMN IF NOT EXISTS source_matter_id uuid,
  ADD COLUMN IF NOT EXISTS requirement_ref text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS owner_team text,
  ADD COLUMN IF NOT EXISTS evidence_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS last_evidence_at timestamptz,
  ADD COLUMN IF NOT EXISTS waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS waived_by uuid,
  ADD COLUMN IF NOT EXISTS waiver_reason text,
  ADD COLUMN IF NOT EXISTS varied_at timestamptz,
  ADD COLUMN IF NOT EXISTS varied_by uuid,
  ADD COLUMN IF NOT EXISTS variation_reason text,
  ADD COLUMN IF NOT EXISTS breached_at timestamptz,
  ADD COLUMN IF NOT EXISTS breached_by uuid,
  ADD COLUMN IF NOT EXISTS breach_reason text,
  ADD COLUMN IF NOT EXISTS breach_consequence text,
  ADD COLUMN IF NOT EXISTS breach_matter_id uuid;

DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT con.conname FROM pg_constraint con
            JOIN pg_class cl ON cl.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = cl.relnamespace
           WHERE cl.relname = 'license_conditions' AND n.nspname = 'public' AND con.contype = 'c'
             AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.license_conditions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

UPDATE public.license_conditions SET status = 'open' WHERE status IS NULL;

ALTER TABLE public.license_conditions
  ADD CONSTRAINT license_conditions_status_check CHECK (status IN
    ('open','in_progress','evidence_due','under_review','satisfied','waived','varied','breached','closed'));

ALTER TABLE public.license_conditions
  DROP CONSTRAINT IF EXISTS license_conditions_review_state_check;
ALTER TABLE public.license_conditions
  ADD CONSTRAINT license_conditions_review_state_check CHECK (review_state IN
    ('not_submitted','submitted','under_review','accepted','rejected','waived'));

CREATE TABLE IF NOT EXISTS public.license_condition_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id uuid NOT NULL REFERENCES public.license_conditions(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  summary text,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_state text NOT NULL DEFAULT 'submitted'
    CHECK (review_state IN ('submitted','under_review','accepted','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lce_condition ON public.license_condition_evidence(condition_id, submitted_at DESC);

GRANT SELECT ON public.license_condition_evidence TO authenticated;
GRANT ALL ON public.license_condition_evidence TO service_role;
ALTER TABLE public.license_condition_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lce_read" ON public.license_condition_evidence;
CREATE POLICY "lce_read" ON public.license_condition_evidence
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(),'license_management','view')
  OR EXISTS (SELECT 1 FROM public.licenses l WHERE l.id = license_id AND l.holder_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.license_condition_submit_evidence(_condition_id uuid, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); c record; l record; v_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.license_conditions WHERE id = _condition_id FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'CONDITION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO l FROM public.licenses WHERE id = c.license_id;

  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid,'license_management','view')
          OR l.holder_id = uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF c.status IN ('satisfied','waived','closed') THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
      DETAIL = 'Condition is already concluded.';
  END IF;
  IF COALESCE(length(btrim(_payload->>'summary')),0) < 5 THEN
    RAISE EXCEPTION 'EVIDENCE_SUMMARY_REQUIRED' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.license_condition_evidence(condition_id, license_id, submitted_by, summary, document_ids, file_paths, metadata)
  VALUES (_condition_id, c.license_id, uid, _payload->>'summary',
          COALESCE(_payload->'document_ids','[]'::jsonb), COALESCE(_payload->'file_paths','[]'::jsonb),
          COALESCE(_payload->'metadata','{}'::jsonb))
  RETURNING id INTO v_id;

  UPDATE public.license_conditions
     SET status = 'under_review', review_state = 'submitted',
         last_evidence_at = now(), updated_at = now()
   WHERE id = _condition_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (uid, 'license.condition.evidence_submitted', 'license_condition', _condition_id,
          jsonb_build_object('evidence_id', v_id, 'license_id', c.license_id));

  RETURN jsonb_build_object('evidence_id', v_id, 'condition_status', 'under_review', 'review_state', 'submitted');
END $$;

REVOKE ALL ON FUNCTION public.license_condition_submit_evidence(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_condition_submit_evidence(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.license_condition_review(_condition_id uuid, _decision text, _reason text DEFAULT NULL, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); c record; cfg jsonb;
  v_status text; v_review text; v_consequence text; v_matter_id uuid; v_new_condition uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM public.enforce_permission('license_management','manage_conditions');

  SELECT * INTO c FROM public.license_conditions WHERE id = _condition_id FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'CONDITION_NOT_FOUND' USING ERRCODE='22023'; END IF;

  IF _decision NOT IN ('SATISFY','WAIVE','VARY','BREACH','RETURN_FOR_EVIDENCE') THEN
    RAISE EXCEPTION 'UNKNOWN_ACTION' USING ERRCODE='22023';
  END IF;
  IF c.status IN ('satisfied','waived','closed') THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023';
  END IF;
  IF _decision IN ('WAIVE','VARY','BREACH','RETURN_FOR_EVIDENCE')
     AND COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF _decision = 'SATISFY' AND c.evidence_required
     AND NOT EXISTS (SELECT 1 FROM public.license_condition_evidence e WHERE e.condition_id = c.id) THEN
    RAISE EXCEPTION 'BLOCKED' USING ERRCODE='22023',
      DETAIL = 'No evidence has been submitted for this condition.';
  END IF;

  cfg := public.license_lifecycle_config_resolve(c.license_id, 'renewal');

  IF _decision = 'SATISFY' THEN
    v_status := 'satisfied'; v_review := 'accepted';
    UPDATE public.license_conditions
       SET status = v_status, review_state = v_review, satisfied_at = now(), satisfied_by = uid, updated_at = now()
     WHERE id = c.id;
    UPDATE public.license_condition_evidence
       SET review_state = 'accepted', reviewed_by = uid, reviewed_at = now(), review_note = _reason
     WHERE condition_id = c.id AND review_state IN ('submitted','under_review');
  ELSIF _decision = 'WAIVE' THEN
    v_status := 'waived'; v_review := 'waived';
    UPDATE public.license_conditions
       SET status = v_status, review_state = v_review, waived_at = now(), waived_by = uid,
           waiver_reason = _reason, updated_at = now()
     WHERE id = c.id;
  ELSIF _decision = 'VARY' THEN
    v_status := 'varied'; v_review := 'under_review';
    UPDATE public.license_conditions
       SET status = v_status, review_state = v_review, varied_at = now(), varied_by = uid,
           variation_reason = _reason,
           description = COALESCE(NULLIF(_payload->>'description',''), description),
           due_date = COALESCE((_payload->>'due_date')::date, due_date),
           updated_at = now()
     WHERE id = c.id;
  ELSIF _decision = 'RETURN_FOR_EVIDENCE' THEN
    v_status := 'evidence_due'; v_review := 'rejected';
    UPDATE public.license_conditions
       SET status = v_status, review_state = v_review,
           due_date = COALESCE((_payload->>'due_date')::date, due_date), updated_at = now()
     WHERE id = c.id;
    UPDATE public.license_condition_evidence
       SET review_state = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = _reason
     WHERE condition_id = c.id AND review_state IN ('submitted','under_review');
  ELSE
    v_status := 'breached'; v_review := 'rejected';
    v_consequence := COALESCE(NULLIF(_payload->>'consequence',''), cfg->>'breach_consequence', 'supervisory_followup');

    IF v_consequence IN ('lifecycle_matter','suspension_review') THEN
      INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, opened_by, waiting_on, metadata)
      VALUES (c.license_id,
              CASE WHEN v_consequence = 'suspension_review' THEN 'suspension' ELSE 'condition_review' END,
              'Condition breach follow-up', _reason, uid, 'regulator',
              jsonb_build_object('source','license_condition','condition_id', c.id, 'consequence', v_consequence))
      RETURNING id INTO v_matter_id;
    ELSIF v_consequence = 'additional_condition' THEN
      INSERT INTO public.license_conditions(license_id, category, description, due_date, status,
        source_decision, requirement_ref, effective_date, owner_team, evidence_required, created_by)
      VALUES (c.license_id, COALESCE(c.category,'remediation'),
              COALESCE(NULLIF(_payload->>'description',''), 'Remediation of breached condition ' || COALESCE(c.condition_reference, c.id::text)),
              COALESCE((_payload->>'due_date')::date, (current_date + 30)), 'open',
              'CONDITION_BREACH', c.requirement_ref, current_date, c.owner_team, true, uid)
      RETURNING id INTO v_new_condition;
    END IF;

    UPDATE public.license_conditions
       SET status = v_status, review_state = v_review, breached_at = now(), breached_by = uid,
           breach_reason = _reason, breach_consequence = v_consequence,
           breach_matter_id = v_matter_id, updated_at = now()
     WHERE id = c.id;
  END IF;

  INSERT INTO public.license_actions(license_id, action_type, actor_id, reason, old_status, new_status, metadata)
  VALUES (c.license_id, 'condition_' || lower(_decision), uid, _reason, c.status, v_status,
          jsonb_build_object('condition_id', c.id, 'consequence', v_consequence,
                             'matter_id', v_matter_id, 'new_condition_id', v_new_condition));

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (uid, 'license.condition.' || lower(_decision), 'license_condition', c.id,
          jsonb_build_object('license_id', c.license_id, 'from', c.status, 'to', v_status,
                             'reason', _reason, 'consequence', v_consequence));

  RETURN jsonb_build_object('condition_id', c.id, 'status', v_status, 'review_state', v_review,
                            'consequence', v_consequence, 'matter_id', v_matter_id,
                            'new_condition_id', v_new_condition);
END $$;

REVOKE ALL ON FUNCTION public.license_condition_review(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_condition_review(uuid, text, text, jsonb) TO authenticated, service_role;