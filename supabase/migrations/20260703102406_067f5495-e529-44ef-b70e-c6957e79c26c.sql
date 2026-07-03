
-- ============================================================
-- Phase 9: Thematic Reviews, Conduct Action Ledger, Monitoring
-- ============================================================

-- Helper: reuse existing touch_updated_at() if present, otherwise create
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------- 1. thematic_reviews ----------
CREATE TABLE public.thematic_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  title text NOT NULL,
  description text,
  regulator_id uuid,
  lead_officer_id uuid,
  risk_category_id uuid REFERENCES public.conduct_risk_categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  scope_start date,
  scope_end date,
  methodology jsonb NOT NULL DEFAULT '{}'::jsonb,
  hypothesis text,
  closure_summary text,
  created_by uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_reviews TO authenticated;
GRANT ALL ON public.thematic_reviews TO service_role;
ALTER TABLE public.thematic_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read thematic_reviews" ON public.thematic_reviews FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write thematic_reviews" ON public.thematic_reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_thematic_reviews_touch BEFORE UPDATE ON public.thematic_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- auto code TR-YYYY-####
CREATE OR REPLACE FUNCTION public.thematic_reviews_code_default()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE seq int;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    SELECT COALESCE(MAX((regexp_replace(code,'^TR-\d{4}-','','g'))::int),0)+1
      INTO seq FROM public.thematic_reviews
      WHERE code LIKE 'TR-'||to_char(now(),'YYYY')||'-%';
    NEW.code := 'TR-'||to_char(now(),'YYYY')||'-'||lpad(seq::text,4,'0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_thematic_reviews_code BEFORE INSERT ON public.thematic_reviews
  FOR EACH ROW EXECUTE FUNCTION public.thematic_reviews_code_default();

-- ---------- 2. thematic_review_status_history ----------
CREATE TABLE public.thematic_review_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  override_id uuid REFERENCES public.rule_overrides(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT ON public.thematic_review_status_history TO authenticated;
GRANT ALL ON public.thematic_review_status_history TO service_role;
ALTER TABLE public.thematic_review_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read status history" ON public.thematic_review_status_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal insert status history" ON public.thematic_review_status_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));

-- lifecycle validation trigger
CREATE OR REPLACE FUNCTION public.thematic_reviews_status_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed text[] := ARRAY['draft','scoped','evidence_collection','analysis','findings_issued','actions_required','monitoring','closed'];
  fwd jsonb := '{
    "draft":["scoped"],
    "scoped":["evidence_collection"],
    "evidence_collection":["analysis"],
    "analysis":["findings_issued"],
    "findings_issued":["actions_required"],
    "actions_required":["monitoring"],
    "monitoring":["closed"]
  }'::jsonb;
  ok_forward boolean;
  has_override boolean;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid thematic review status: %', NEW.status;
  END IF;
  ok_forward := (fwd -> OLD.status) ? NEW.status;
  IF NOT ok_forward THEN
    -- backward or skip; require override recorded in status history within same tx
    SELECT EXISTS(SELECT 1 FROM public.thematic_review_status_history
                    WHERE review_id = NEW.id
                      AND to_status = NEW.status
                      AND override_id IS NOT NULL
                      AND changed_at > now() - interval '30 seconds')
      INTO has_override;
    IF NOT has_override THEN
      RAISE EXCEPTION 'Backward/skip transition % -> % requires an override entry', OLD.status, NEW.status
        USING HINT='Insert into thematic_review_status_history with override_id first.';
    END IF;
  END IF;
  -- log if not already logged in same tx
  INSERT INTO public.thematic_review_status_history(review_id, from_status, to_status, changed_by, reason)
    SELECT NEW.id, OLD.status, NEW.status, auth.uid(), NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM public.thematic_review_status_history
       WHERE review_id = NEW.id AND to_status = NEW.status
         AND changed_at > now() - interval '30 seconds'
    );
  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN NEW.closed_at := now(); END IF;
  IF OLD.status = 'draft' AND NEW.status = 'scoped' AND NEW.opened_at IS NULL THEN NEW.opened_at := now(); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_thematic_reviews_status_guard BEFORE UPDATE OF status ON public.thematic_reviews
  FOR EACH ROW EXECUTE FUNCTION public.thematic_reviews_status_guard();

-- ---------- 3. thematic_review_entities ----------
CREATE TABLE public.thematic_review_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  inclusion_reason text,
  sample_weight numeric DEFAULT 1,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, licensee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_review_entities TO authenticated;
GRANT ALL ON public.thematic_review_entities TO service_role;
ALTER TABLE public.thematic_review_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read tre" ON public.thematic_review_entities FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write tre" ON public.thematic_review_entities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));

-- ---------- 4. thematic_review_products ----------
CREATE TABLE public.thematic_review_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.conduct_products(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.conduct_channels(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, product_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_review_products TO authenticated;
GRANT ALL ON public.thematic_review_products TO service_role;
ALTER TABLE public.thematic_review_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read trp" ON public.thematic_review_products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write trp" ON public.thematic_review_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));

-- ---------- 5. thematic_review_findings ----------
CREATE TABLE public.thematic_review_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  detail text,
  root_cause text,
  evidence_summary text,
  status text NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  issued_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_review_findings TO authenticated;
GRANT ALL ON public.thematic_review_findings TO service_role;
ALTER TABLE public.thematic_review_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read trf" ON public.thematic_review_findings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write trf" ON public.thematic_review_findings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_trf_touch BEFORE UPDATE ON public.thematic_review_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 6. thematic_review_evidence ----------
CREATE TABLE public.thematic_review_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.thematic_review_findings(id) ON DELETE SET NULL,
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'external',
  source_ref text,
  notes text,
  collected_by uuid,
  collected_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_review_evidence TO authenticated;
GRANT ALL ON public.thematic_review_evidence TO service_role;
ALTER TABLE public.thematic_review_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read tre_ev" ON public.thematic_review_evidence FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write tre_ev" ON public.thematic_review_evidence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));

-- ---------- 7. thematic_review_actions ----------
CREATE TABLE public.thematic_review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.thematic_reviews(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.thematic_review_findings(id) ON DELETE SET NULL,
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  action_type text NOT NULL DEFAULT 'remediation',
  title text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  assigned_team text,
  completed_at timestamptz,
  evidence_of_completion text,
  waiver_override_id uuid REFERENCES public.rule_overrides(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thematic_review_actions TO authenticated;
GRANT ALL ON public.thematic_review_actions TO service_role;
ALTER TABLE public.thematic_review_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read tra" ON public.thematic_review_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write tra" ON public.thematic_review_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_tra_touch BEFORE UPDATE ON public.thematic_review_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 8. conduct_actions (cross-module ledger) ----------
CREATE TABLE public.conduct_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_module text NOT NULL,
  source_id uuid,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.conduct_products(id) ON DELETE SET NULL,
  action_type text NOT NULL DEFAULT 'remediation',
  title text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  assigned_team text,
  enforcement_action_id uuid REFERENCES public.enforcement_actions(id) ON DELETE SET NULL,
  thematic_action_id uuid REFERENCES public.thematic_review_actions(id) ON DELETE CASCADE,
  waiver_override_id uuid REFERENCES public.rule_overrides(id) ON DELETE SET NULL,
  created_by uuid,
  closed_by uuid,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thematic_action_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_actions TO authenticated;
GRANT ALL ON public.conduct_actions TO service_role;
ALTER TABLE public.conduct_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read ca" ON public.conduct_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write ca" ON public.conduct_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER trg_ca_touch BEFORE UPDATE ON public.conduct_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- mirror thematic_review_actions -> conduct_actions
CREATE OR REPLACE FUNCTION public.thematic_action_sync_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tr_regulator uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.conduct_actions(
      source_module, source_id, entity_id, action_type, title, description,
      due_date, status, assigned_to, assigned_team, thematic_action_id,
      waiver_override_id, created_by
    ) VALUES (
      'thematic_review', NEW.review_id, NEW.licensee_id, NEW.action_type, NEW.title, NEW.description,
      NEW.due_date, NEW.status, NEW.assigned_to, NEW.assigned_team, NEW.id,
      NEW.waiver_override_id, NEW.created_by
    );
  ELSIF TG_OP='UPDATE' THEN
    UPDATE public.conduct_actions SET
      entity_id = NEW.licensee_id,
      action_type = NEW.action_type,
      title = NEW.title,
      description = NEW.description,
      due_date = NEW.due_date,
      status = NEW.status,
      assigned_to = NEW.assigned_to,
      assigned_team = NEW.assigned_team,
      waiver_override_id = NEW.waiver_override_id,
      closed_at = CASE WHEN NEW.status IN ('completed','waived') AND OLD.status NOT IN ('completed','waived') THEN now() ELSE closed_at END,
      updated_at = now()
    WHERE thematic_action_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_tra_ledger_sync AFTER INSERT OR UPDATE ON public.thematic_review_actions
  FOR EACH ROW EXECUTE FUNCTION public.thematic_action_sync_ledger();

-- overdue alert trigger (uses existing conduct_alerts; dedupe key = 'action_overdue:'||id)
CREATE OR REPLACE FUNCTION public.conduct_action_overdue_alert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  is_overdue boolean;
  dkey text;
BEGIN
  is_overdue := NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE
                AND NEW.status NOT IN ('completed','waived','closed','cancelled');
  IF is_overdue THEN
    IF NEW.status <> 'overdue' THEN NEW.status := 'overdue'; END IF;
    dkey := encode(sha1(('action_overdue:'||NEW.id::text)::bytea),'hex');
    -- attempt insert; ignore conflicts with existing open alert (partial index)
    BEGIN
      INSERT INTO public.conduct_alerts(
        licensee_id, kind, severity, title, detail, dedupe_key, status, source, generated_by
      ) VALUES (
        NEW.entity_id, 'action_overdue', 'high',
        'Conduct action overdue: '||NEW.title,
        jsonb_build_object('conduct_action_id', NEW.id, 'source_module', NEW.source_module, 'due_date', NEW.due_date),
        dkey, 'open', 'system', 'overdue_trigger'
      );
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_ca_overdue BEFORE INSERT OR UPDATE OF due_date, status ON public.conduct_actions
  FOR EACH ROW EXECUTE FUNCTION public.conduct_action_overdue_alert();

-- ---------- 9. conduct_monitoring_rules ----------
CREATE TABLE public.conduct_monitoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'entity',
  rule_type text NOT NULL DEFAULT 'metric_threshold',
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  frequency text NOT NULL DEFAULT 'daily',
  risk_delta numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_monitoring_rules TO authenticated;
GRANT ALL ON public.conduct_monitoring_rules TO service_role;
ALTER TABLE public.conduct_monitoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read cmr" ON public.conduct_monitoring_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write cmr" ON public.conduct_monitoring_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_cmr_touch BEFORE UPDATE ON public.conduct_monitoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 10. conduct_monitoring_results ----------
CREATE TABLE public.conduct_monitoring_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.conduct_monitoring_rules(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.conduct_products(id) ON DELETE SET NULL,
  thematic_review_id uuid REFERENCES public.thematic_reviews(id) ON DELETE SET NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  matched boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  alert_id uuid REFERENCES public.conduct_alerts(id) ON DELETE SET NULL,
  risk_delta_applied numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_monitoring_results TO authenticated;
GRANT ALL ON public.conduct_monitoring_results TO service_role;
ALTER TABLE public.conduct_monitoring_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal read cmres" ON public.conduct_monitoring_results FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'analyst')
      OR public.has_role(auth.uid(),'legal_compliance'));
CREATE POLICY "Internal write cmres" ON public.conduct_monitoring_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor'));

-- feedback into entity_risk_scores
CREATE OR REPLACE FUNCTION public.monitoring_result_risk_feedback()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  period text := to_char(now(),'YYYY-MM');
  cur record;
  new_components jsonb;
  new_score numeric;
  new_band text;
BEGIN
  IF NOT NEW.matched OR NEW.entity_id IS NULL OR NEW.risk_delta_applied = 0 THEN RETURN NEW; END IF;

  SELECT * INTO cur FROM public.entity_risk_scores
    WHERE entity_id = NEW.entity_id AND period_key = period
    ORDER BY computed_at DESC LIMIT 1;

  IF cur.id IS NULL THEN
    new_components := jsonb_build_object('monitoring', NEW.risk_delta_applied);
    new_score := GREATEST(0, LEAST(100, NEW.risk_delta_applied));
    new_band := CASE WHEN new_score >= 75 THEN 'critical'
                     WHEN new_score >= 50 THEN 'high'
                     WHEN new_score >= 25 THEN 'medium' ELSE 'low' END;
    UPDATE public.entity_risk_scores SET is_current = false WHERE entity_id = NEW.entity_id;
    INSERT INTO public.entity_risk_scores(entity_id, period_key, score, band, components, weights, is_current)
      VALUES (NEW.entity_id, period, new_score, new_band, new_components, '{}'::jsonb, true);
  ELSE
    new_components := cur.components || jsonb_build_object(
      'monitoring', COALESCE((cur.components->>'monitoring')::numeric,0) + NEW.risk_delta_applied
    );
    new_score := GREATEST(0, LEAST(100, cur.score + NEW.risk_delta_applied));
    new_band := CASE WHEN new_score >= 75 THEN 'critical'
                     WHEN new_score >= 50 THEN 'high'
                     WHEN new_score >= 25 THEN 'medium' ELSE 'low' END;
    UPDATE public.entity_risk_scores
      SET components = new_components, score = new_score, band = new_band,
          computed_at = now(), is_current = true
      WHERE id = cur.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_cmres_risk_feedback AFTER INSERT ON public.conduct_monitoring_results
  FOR EACH ROW EXECUTE FUNCTION public.monitoring_result_risk_feedback();
