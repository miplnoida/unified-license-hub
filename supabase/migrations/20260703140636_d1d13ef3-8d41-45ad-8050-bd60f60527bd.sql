
-- === Sufficiency Rules Catalog ===
CREATE TABLE IF NOT EXISTS public.sufficiency_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'form_submitted','document_uploaded','field_present','fee_paid',
    'declaration_answered','risk_flag_present','ai_flag_review','regulator_clearance'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'blocker' CHECK (severity IN ('blocker','warning','info')),
  auto_rfi BOOLEAN NOT NULL DEFAULT false,
  rfi_prompt_template TEXT,
  rfi_question_type TEXT DEFAULT 'text' CHECK (rfi_question_type IN ('text','document','both')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sufficiency_rules TO authenticated;
GRANT ALL ON public.sufficiency_rules TO service_role;
ALTER TABLE public.sufficiency_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal can read sufficiency rules" ON public.sufficiency_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage sufficiency rules" ON public.sufficiency_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- === Rule Sets scoped to application/license taxonomy ===
CREATE TABLE IF NOT EXISTS public.sufficiency_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  application_type TEXT,
  license_type TEXT,
  sector_id UUID,
  sub_sector_id UUID,
  category_id UUID,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sufficiency_rule_sets TO authenticated;
GRANT ALL ON public.sufficiency_rule_sets TO service_role;
ALTER TABLE public.sufficiency_rule_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal can read rule sets" ON public.sufficiency_rule_sets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rule sets" ON public.sufficiency_rule_sets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.sufficiency_rule_set_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES public.sufficiency_rule_sets(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.sufficiency_rules(id) ON DELETE CASCADE,
  severity_override TEXT CHECK (severity_override IN ('blocker','warning','info')),
  ordinal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rule_set_id, rule_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sufficiency_rule_set_items TO authenticated;
GRANT ALL ON public.sufficiency_rule_set_items TO service_role;
ALTER TABLE public.sufficiency_rule_set_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read set items" ON public.sufficiency_rule_set_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage set items" ON public.sufficiency_rule_set_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- === Evaluations & results ===
CREATE TABLE IF NOT EXISTS public.sufficiency_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  rule_set_id UUID REFERENCES public.sufficiency_rule_sets(id) ON DELETE SET NULL,
  triggered_by TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual','submit','workflow','rfi_response','system')),
  evaluated_by UUID,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall_status TEXT NOT NULL CHECK (overall_status IN ('sufficient','insufficient','warning')),
  blocker_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suf_eval_app ON public.sufficiency_evaluations(application_id, evaluated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sufficiency_evaluations TO authenticated;
GRANT ALL ON public.sufficiency_evaluations TO service_role;
ALTER TABLE public.sufficiency_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read evaluations" ON public.sufficiency_evaluations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal insert evaluations" ON public.sufficiency_evaluations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.sufficiency_evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.sufficiency_evaluations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.sufficiency_rules(id) ON DELETE SET NULL,
  rule_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass','fail','warning','na')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_rfi_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suf_result_eval ON public.sufficiency_evaluation_results(evaluation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sufficiency_evaluation_results TO authenticated;
GRANT ALL ON public.sufficiency_evaluation_results TO service_role;
ALTER TABLE public.sufficiency_evaluation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read results" ON public.sufficiency_evaluation_results
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal insert results" ON public.sufficiency_evaluation_results
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.sufficiency_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_result_id UUID NOT NULL REFERENCES public.sufficiency_evaluation_results(id) ON DELETE CASCADE,
  overridden_by UUID NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(reason) >= 10)
);
GRANT SELECT, INSERT ON public.sufficiency_overrides TO authenticated;
GRANT ALL ON public.sufficiency_overrides TO service_role;
ALTER TABLE public.sufficiency_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read overrides" ON public.sufficiency_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal insert overrides" ON public.sufficiency_overrides
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = overridden_by);

-- === Decision Options + Rationale Templates ===
CREATE TABLE IF NOT EXISTS public.decision_rationale_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  outcome TEXT,
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_rationale_templates TO authenticated;
GRANT ALL ON public.decision_rationale_templates TO service_role;
ALTER TABLE public.decision_rationale_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read rationale templates" ON public.decision_rationale_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rationale templates" ON public.decision_rationale_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.decision_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('approve','reject','return','defer','conditional_approve','withdraw','escalate','info_request')),
  color TEXT DEFAULT 'default',
  icon TEXT,
  requires_conditions BOOLEAN NOT NULL DEFAULT false,
  requires_reason BOOLEAN NOT NULL DEFAULT true,
  min_reason_length INTEGER NOT NULL DEFAULT 10,
  rationale_template_id UUID REFERENCES public.decision_rationale_templates(id) ON DELETE SET NULL,
  applies_to JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_options TO authenticated;
GRANT ALL ON public.decision_options TO service_role;
ALTER TABLE public.decision_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read decision options" ON public.decision_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage decision options" ON public.decision_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- === Column extensions ===
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS sufficiency_status TEXT,
  ADD COLUMN IF NOT EXISTS last_sufficiency_evaluation_id UUID REFERENCES public.sufficiency_evaluations(id) ON DELETE SET NULL;

ALTER TABLE public.application_rfis
  ADD COLUMN IF NOT EXISTS sufficiency_evaluation_id UUID REFERENCES public.sufficiency_evaluations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pauses_sla BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.workflow_instances
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_pause_seconds INTEGER NOT NULL DEFAULT 0;

-- === updated_at triggers ===
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_suf_rules_upd') THEN
    CREATE TRIGGER trg_suf_rules_upd BEFORE UPDATE ON public.sufficiency_rules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_suf_sets_upd') THEN
    CREATE TRIGGER trg_suf_sets_upd BEFORE UPDATE ON public.sufficiency_rule_sets
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_dec_opts_upd') THEN
    CREATE TRIGGER trg_dec_opts_upd BEFORE UPDATE ON public.decision_options
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_dec_rat_upd') THEN
    CREATE TRIGGER trg_dec_rat_upd BEFORE UPDATE ON public.decision_rationale_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- === SLA pause/resume triggers on application_rfis ===
CREATE OR REPLACE FUNCTION public.rfi_pause_sla() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_paused_secs INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pauses_sla AND NEW.status IN ('open') THEN
      UPDATE public.workflow_instances
        SET paused_at = COALESCE(paused_at, now()),
            paused_reason = COALESCE(paused_reason, 'RFI ' || NEW.id::text),
            resumed_at = NULL
        WHERE entity_type = 'application' AND entity_id = NEW.application_id AND status = 'active';
      INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value, metadata)
        VALUES (auth.uid(), 'workflow.sla.paused', 'application', NEW.application_id,
                jsonb_build_object('rfi_id', NEW.id),
                jsonb_build_object('trigger','rfi_open'));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.pauses_sla AND OLD.status = 'open' AND NEW.status IN ('responded','closed','cancelled') THEN
      UPDATE public.workflow_instances w
        SET resumed_at = now(),
            total_pause_seconds = w.total_pause_seconds + GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(w.paused_at, now())))::int),
            paused_at = NULL,
            paused_reason = NULL
        WHERE w.entity_type='application' AND w.entity_id = NEW.application_id AND w.status='active';
      INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value, metadata)
        VALUES (auth.uid(), 'workflow.sla.resumed', 'application', NEW.application_id,
                jsonb_build_object('rfi_id', NEW.id, 'new_status', NEW.status),
                jsonb_build_object('trigger','rfi_'||NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_rfi_pause_sla_ins ON public.application_rfis;
CREATE TRIGGER trg_rfi_pause_sla_ins AFTER INSERT ON public.application_rfis
  FOR EACH ROW EXECUTE FUNCTION public.rfi_pause_sla();
DROP TRIGGER IF EXISTS trg_rfi_pause_sla_upd ON public.application_rfis;
CREATE TRIGGER trg_rfi_pause_sla_upd AFTER UPDATE OF status ON public.application_rfis
  FOR EACH ROW EXECUTE FUNCTION public.rfi_pause_sla();
