
ALTER TABLE public.coordination_cases
  ADD COLUMN IF NOT EXISTS closure_rationale text,
  ADD COLUMN IF NOT EXISTS closed_by uuid;

CREATE OR REPLACE FUNCTION public.enforce_coordination_case_closure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE open_esc int; open_flags int;
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    IF NEW.closure_rationale IS NULL OR length(trim(NEW.closure_rationale)) < 10 THEN
      RAISE EXCEPTION 'Closure rationale (min 10 chars) is required to close a coordination case' USING ERRCODE='check_violation';
    END IF;
    SELECT count(*) INTO open_esc FROM coordination_escalations WHERE case_id=NEW.id AND status IN ('open','in_review');
    IF open_esc > 0 THEN RAISE EXCEPTION 'Cannot close case: % open/in-review escalation(s) remain', open_esc USING ERRCODE='check_violation'; END IF;
    SELECT count(*) INTO open_flags FROM coordination_flags WHERE case_id=NEW.id AND status='open' AND flag_type IN ('blocker','interdependency','concurrent_review');
    IF open_flags > 0 THEN RAISE EXCEPTION 'Cannot close case: % open blocker flag(s) remain', open_flags USING ERRCODE='check_violation'; END IF;
    IF NEW.closed_by IS NULL THEN NEW.closed_by := auth.uid(); END IF;
    IF NEW.closed_at IS NULL THEN NEW.closed_at := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_coord_case_closure ON public.coordination_cases;
CREATE TRIGGER trg_coord_case_closure BEFORE UPDATE ON public.coordination_cases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_coordination_case_closure();

CREATE OR REPLACE FUNCTION public.check_coordination_gates(_subject_type text, _subject_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE blockers jsonb := '[]'::jsonb; r record;
BEGIN
  IF _subject_id IS NULL THEN RETURN blockers; END IF;
  FOR r IN SELECT cc.id, cc.status, cc.title FROM coordination_cases cc
           WHERE cc.subject_type=_subject_type AND cc.subject_id=_subject_id AND cc.status<>'closed'
  LOOP
    IF EXISTS (SELECT 1 FROM coordination_escalations WHERE case_id=r.id AND status IN ('open','in_review')) THEN
      blockers := blockers || jsonb_build_object('kind','coordination_escalation','case_id',r.id,'title',r.title);
    END IF;
    IF EXISTS (SELECT 1 FROM coordination_flags WHERE case_id=r.id AND status='open' AND flag_type IN ('blocker','interdependency','concurrent_review')) THEN
      blockers := blockers || jsonb_build_object('kind','coordination_flag','case_id',r.id,'title',r.title);
    END IF;
    IF EXISTS (SELECT 1 FROM coordination_participants WHERE case_id=r.id AND coalesce(clearance_status,'pending') NOT IN ('cleared','not_required','waived')) THEN
      blockers := blockers || jsonb_build_object('kind','pending_clearance','case_id',r.id,'title',r.title);
    END IF;
  END LOOP;
  RETURN blockers;
END; $$;

CREATE OR REPLACE FUNCTION public.has_decision_gate_override(_entity_type text, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM rule_overrides
    WHERE rule_key='decision.gate.override' AND entity_type=_entity_type AND entity_id::text=_entity_id::text);
$$;

CREATE OR REPLACE FUNCTION public.enforce_fp_determination_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE blockers jsonb;
BEGIN
  IF NEW.is_current=true AND NEW.outcome IN ('approved','conditional','rejected','deferred')
     AND (TG_OP='INSERT' OR OLD.is_current IS DISTINCT FROM true OR OLD.outcome IS DISTINCT FROM NEW.outcome) THEN
    IF public.has_decision_gate_override('fp_determination', NEW.id) THEN RETURN NEW; END IF;
    blockers := public.check_coordination_gates('fp_assessment', NEW.assessment_id);
    IF jsonb_array_length(blockers) > 0 THEN
      RAISE EXCEPTION 'Determination blocked by unresolved coordination: %', blockers::text USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fp_determination_gate ON public.fp_determinations;
CREATE TRIGGER trg_fp_determination_gate BEFORE INSERT OR UPDATE ON public.fp_determinations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fp_determination_gate();

CREATE OR REPLACE FUNCTION public.enforce_complaint_closure_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE blockers jsonb;
BEGIN
  IF NEW.status IN ('closed','resolved') AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF public.has_decision_gate_override('complaint', NEW.id) THEN RETURN NEW; END IF;
    blockers := public.check_coordination_gates('complaint', NEW.id);
    IF jsonb_array_length(blockers) > 0 THEN
      RAISE EXCEPTION 'Complaint closure blocked by unresolved coordination: %', blockers::text USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_complaint_closure_gate ON public.complaints;
CREATE TRIGGER trg_complaint_closure_gate BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complaint_closure_gate();

CREATE OR REPLACE FUNCTION public.enforce_enforcement_closure_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE blockers jsonb;
BEGIN
  IF NEW.status IN ('closed','resolved') AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF public.has_decision_gate_override('enforcement_action', NEW.id) THEN RETURN NEW; END IF;
    blockers := public.check_coordination_gates('enforcement_action', NEW.id);
    IF jsonb_array_length(blockers) > 0 THEN
      RAISE EXCEPTION 'Enforcement closure blocked by unresolved coordination: %', blockers::text USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforcement_closure_gate ON public.enforcement_actions;
CREATE TRIGGER trg_enforcement_closure_gate BEFORE UPDATE ON public.enforcement_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_enforcement_closure_gate();
