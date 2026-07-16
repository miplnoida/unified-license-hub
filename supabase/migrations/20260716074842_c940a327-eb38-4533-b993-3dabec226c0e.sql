
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.complaint_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL, label text NOT NULL, description text,
  criterion text NOT NULL CHECK (criterion IN ('harm','age','risk_rating','volume','recurrence')),
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_tier text NOT NULL DEFAULT 'supervisor',
  notify jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true, priority int NOT NULL DEFAULT 100,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_escalation_rules TO authenticated;
GRANT ALL ON public.complaint_escalation_rules TO service_role;
ALTER TABLE public.complaint_escalation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "esc_rules_read" ON public.complaint_escalation_rules;
CREATE POLICY "esc_rules_read" ON public.complaint_escalation_rules FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage') OR public.has_complaint_perm(auth.uid(),'view_all'));
DROP POLICY IF EXISTS "esc_rules_write" ON public.complaint_escalation_rules;
CREATE POLICY "esc_rules_write" ON public.complaint_escalation_rules FOR ALL TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'escalate'))
  WITH CHECK (public.has_complaint_perm(auth.uid(),'escalate'));

CREATE TABLE IF NOT EXISTS public.complaint_escalation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.complaint_escalation_rules(id) ON DELETE SET NULL,
  rule_key text NOT NULL, rule_label text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  target_tier text NOT NULL DEFAULT 'supervisor',
  trigger_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','escalated','dismissed','snoozed','resolved')),
  assigned_to uuid,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz, decided_by uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complaint_id, rule_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_escalation_cases TO authenticated;
GRANT ALL ON public.complaint_escalation_cases TO service_role;
ALTER TABLE public.complaint_escalation_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "esc_cases_read" ON public.complaint_escalation_cases;
CREATE POLICY "esc_cases_read" ON public.complaint_escalation_cases FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage') OR public.has_complaint_perm(auth.uid(),'view_all') OR public.has_complaint_perm(auth.uid(),'escalate'));
DROP POLICY IF EXISTS "esc_cases_write" ON public.complaint_escalation_cases;
CREATE POLICY "esc_cases_write" ON public.complaint_escalation_cases FOR ALL TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'escalate'))
  WITH CHECK (public.has_complaint_perm(auth.uid(),'escalate'));

CREATE TABLE IF NOT EXISTS public.complaint_escalation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE CASCADE,
  rule_key text NOT NULL, rule_label text, severity text,
  outcome text NOT NULL DEFAULT 'pending', note text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.complaint_escalation_log TO authenticated;
GRANT ALL ON public.complaint_escalation_log TO service_role;
ALTER TABLE public.complaint_escalation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "esc_log_read" ON public.complaint_escalation_log;
CREATE POLICY "esc_log_read" ON public.complaint_escalation_log FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage') OR public.has_complaint_perm(auth.uid(),'view_all'));

INSERT INTO public.complaint_escalation_rules (key,label,description,criterion,thresholds,target_tier,notify,enabled,priority) VALUES
 ('consumer_harm','Consumer Harm','Escalate complaints marked as high or critical consumer harm.','harm',jsonb_build_object('minSeverity','high'),'head_of_unit','["Head of Market Conduct","Assigned Supervisor"]'::jsonb,true,10),
 ('age','Complaint Age','Escalate when a complaint remains open beyond the configured age.','age',jsonb_build_object('maxAgeDays',14),'supervisor','["Assigned Officer","Supervisor"]'::jsonb,true,20),
 ('risk_rating','Institution Risk Rating','Escalate complaints against high-risk institutions.','risk_rating',jsonb_build_object('minRisk','high'),'executive','["Chief Risk Officer","Head of Market Conduct"]'::jsonb,true,30),
 ('volume','Volume Threshold','Escalate when an institution receives many complaints in a rolling window.','volume',jsonb_build_object('windowDays',30,'minCount',10),'executive','["Head of Market Conduct"]'::jsonb,true,40),
 ('recurrence','Complaint Recurrence','Escalate when the same complainant or issue recurs.','recurrence',jsonb_build_object('minRepeats',3),'supervisor','["Assigned Officer"]'::jsonb,false,50)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_complaint_escalation_sweep()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  r_rec public.complaint_escalation_rules%ROWTYPE;
  c_rec public.complaints%ROWTYPE;
  v_created int := 0; v_reason text; v_min_sev text;
  v_sev_rank int; v_min_rank int; v_age_days int; v_vol_count int;
BEGIN
  IF v_uid IS NOT NULL AND NOT (public.has_complaint_perm(v_uid,'escalate') OR public.has_complaint_perm(v_uid,'triage')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  FOR r_rec IN SELECT * FROM public.complaint_escalation_rules WHERE enabled = true ORDER BY priority LOOP
    FOR c_rec IN SELECT * FROM public.complaints WHERE status IN ('submitted','under_investigation') LOOP
      v_reason := NULL;
      IF r_rec.criterion = 'harm' THEN
        v_min_sev := r_rec.thresholds->>'minSeverity';
        v_sev_rank := CASE c_rec.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END;
        v_min_rank := CASE v_min_sev WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END;
        IF v_min_sev IS NOT NULL AND v_sev_rank >= v_min_rank THEN
          v_reason := 'Consumer harm marked ' || c_rec.severity;
        END IF;
      ELSIF r_rec.criterion = 'age' THEN
        v_age_days := floor(EXTRACT(EPOCH FROM (now() - c_rec.created_at))/86400)::int;
        IF (r_rec.thresholds->>'maxAgeDays') IS NOT NULL
           AND v_age_days >= (r_rec.thresholds->>'maxAgeDays')::int THEN
          v_reason := 'Open ' || v_age_days || ' days (threshold ' || (r_rec.thresholds->>'maxAgeDays') || ')';
        END IF;
      ELSIF r_rec.criterion = 'recurrence' THEN
        IF (r_rec.thresholds->>'minRepeats') IS NOT NULL
           AND COALESCE(c_rec.repeat_complaint_count,0) >= (r_rec.thresholds->>'minRepeats')::int THEN
          v_reason := 'Recurrence count ' || c_rec.repeat_complaint_count;
        END IF;
      ELSIF r_rec.criterion = 'volume' THEN
        IF c_rec.licensee_id IS NOT NULL
           AND (r_rec.thresholds->>'windowDays') IS NOT NULL
           AND (r_rec.thresholds->>'minCount') IS NOT NULL THEN
          SELECT count(*) INTO v_vol_count FROM public.complaints x
           WHERE x.licensee_id = c_rec.licensee_id
             AND x.created_at >= now() - make_interval(days => (r_rec.thresholds->>'windowDays')::int);
          IF v_vol_count >= (r_rec.thresholds->>'minCount')::int THEN
            v_reason := 'Institution: ' || v_vol_count || ' in ' || (r_rec.thresholds->>'windowDays') || 'd';
          END IF;
        END IF;
      END IF;
      IF v_reason IS NOT NULL THEN
        INSERT INTO public.complaint_escalation_cases (complaint_id, rule_id, rule_key, rule_label, severity, target_tier, trigger_reason, status)
        VALUES (c_rec.id, r_rec.id, r_rec.key, r_rec.label, c_rec.severity, r_rec.target_tier, v_reason, 'pending')
        ON CONFLICT (complaint_id, rule_key) DO NOTHING;
        IF FOUND THEN v_created := v_created + 1; END IF;
        INSERT INTO public.complaint_escalation_log (complaint_id, rule_key, rule_label, severity, outcome, note, snapshot)
        VALUES (c_rec.id, r_rec.key, r_rec.label, c_rec.severity, 'pending', v_reason,
                jsonb_build_object('complaint_number', c_rec.complaint_number, 'licensee_id', c_rec.licensee_id));
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('created_cases', v_created, 'ran_at', now());
END; $fn$;

CREATE OR REPLACE FUNCTION public.decide_escalation_case(_id uuid, _decision text, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_complaint_perm(v_uid,'escalate') THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501'; END IF;
  IF _decision NOT IN ('acknowledged','escalated','dismissed','snoozed','resolved') THEN
    RAISE EXCEPTION 'Invalid decision %', _decision USING ERRCODE = '22023';
  END IF;
  UPDATE public.complaint_escalation_cases
     SET status=_decision, decided_at=now(), decided_by=v_uid,
         notes=COALESCE(_notes,notes), updated_at=now()
   WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid,'complaint.escalation_decision','complaint_escalation_case',_id,
          jsonb_build_object('decision',_decision,'notes',_notes));
END; $$;

CREATE TABLE IF NOT EXISTS public.complaint_duplicate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL, description text,
  category text NOT NULL DEFAULT 'context', weight int NOT NULL DEFAULT 40,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_duplicate_rules TO authenticated;
GRANT ALL ON public.complaint_duplicate_rules TO service_role;
ALTER TABLE public.complaint_duplicate_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dup_rules_read" ON public.complaint_duplicate_rules;
CREATE POLICY "dup_rules_read" ON public.complaint_duplicate_rules FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage') OR public.has_complaint_perm(auth.uid(),'view_all'));
DROP POLICY IF EXISTS "dup_rules_write" ON public.complaint_duplicate_rules;
CREATE POLICY "dup_rules_write" ON public.complaint_duplicate_rules FOR ALL TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage'))
  WITH CHECK (public.has_complaint_perm(auth.uid(),'triage'));

CREATE TABLE IF NOT EXISTS public.complaint_duplicate_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  candidate_complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  similarity_score int NOT NULL DEFAULT 0,
  matched jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked','merged','dismissed','confirmed')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz, decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dup_pair_distinct CHECK (primary_complaint_id <> candidate_complaint_id),
  UNIQUE (primary_complaint_id, candidate_complaint_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_duplicate_pairs TO authenticated;
GRANT ALL ON public.complaint_duplicate_pairs TO service_role;
ALTER TABLE public.complaint_duplicate_pairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dup_pairs_read" ON public.complaint_duplicate_pairs;
CREATE POLICY "dup_pairs_read" ON public.complaint_duplicate_pairs FOR SELECT TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage') OR public.has_complaint_perm(auth.uid(),'view_all'));
DROP POLICY IF EXISTS "dup_pairs_write" ON public.complaint_duplicate_pairs;
CREATE POLICY "dup_pairs_write" ON public.complaint_duplicate_pairs FOR ALL TO authenticated
  USING (public.has_complaint_perm(auth.uid(),'triage'))
  WITH CHECK (public.has_complaint_perm(auth.uid(),'triage'));

INSERT INTO public.complaint_duplicate_rules (code,name,description,category,weight,enabled) VALUES
 ('exact_email','Exact email match','Same complainant email','identity',90,true),
 ('exact_phone','Exact phone match','Same complainant phone','identity',85,true),
 ('fuzzy_name','Fuzzy name match','Complainant name similarity','identity',60,true),
 ('same_institution_product','Same institution + product','Same regulated entity and product','context',55,true),
 ('same_intermediary','Same intermediary','Shared broker or agent reference','context',50,true),
 ('keyword_overlap','Description keyword overlap','Shared distinctive keywords','content',40,true),
 ('time_window','Time-window proximity','Filed within configured window','context',25,true),
 ('same_issue','Same issue category','Same complaint type','content',35,false)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.detect_complaint_duplicates(_complaint_id uuid DEFAULT NULL, _window_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_inserted int := 0; v_score int; v_matched jsonb;
  c1 public.complaints%ROWTYPE; c2 public.complaints%ROWTYPE;
BEGIN
  IF v_uid IS NOT NULL AND NOT (public.has_complaint_perm(v_uid,'triage') OR public.has_complaint_perm(v_uid,'view_all')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  FOR c1 IN SELECT * FROM public.complaints
     WHERE created_at >= now() - make_interval(days => _window_days)
       AND (_complaint_id IS NULL OR id = _complaint_id) LOOP
    FOR c2 IN SELECT * FROM public.complaints
       WHERE id <> c1.id
         AND created_at >= c1.created_at - make_interval(days => _window_days)
         AND created_at <= c1.created_at + make_interval(days => _window_days) LOOP
      v_score := 0; v_matched := '[]'::jsonb;
      IF c1.email IS NOT NULL AND LOWER(c1.email) = LOWER(COALESCE(c2.email,'')) THEN
        v_score := v_score + 40;
        v_matched := v_matched || jsonb_build_object('field','Email','detail','Exact match','strength','exact');
      END IF;
      IF c1.complainant_id IS NOT NULL AND c1.complainant_id = c2.complainant_id THEN
        v_score := v_score + 30;
        v_matched := v_matched || jsonb_build_object('field','Complainant','detail','Same account','strength','exact');
      END IF;
      IF c1.licensee_id IS NOT NULL AND c1.licensee_id = c2.licensee_id THEN
        v_score := v_score + 15;
        v_matched := v_matched || jsonb_build_object('field','Institution','detail','Exact match','strength','exact');
      END IF;
      IF c1.product_id IS NOT NULL AND c1.product_id = c2.product_id THEN
        v_score := v_score + 10;
        v_matched := v_matched || jsonb_build_object('field','Product','detail','Exact match','strength','exact');
      END IF;
      IF c1.complaint_type_id IS NOT NULL AND c1.complaint_type_id = c2.complaint_type_id THEN
        v_score := v_score + 5;
        v_matched := v_matched || jsonb_build_object('field','Issue','detail','Same complaint type','strength','partial');
      END IF;
      IF v_score >= 50 THEN
        INSERT INTO public.complaint_duplicate_pairs (primary_complaint_id, candidate_complaint_id, similarity_score, matched, recommendation, status)
        VALUES (c1.id, c2.id, LEAST(v_score,100), v_matched,
                CASE WHEN v_score >= 80 THEN 'merge' ELSE 'link' END, 'pending')
        ON CONFLICT (primary_complaint_id, candidate_complaint_id) DO NOTHING;
        IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('detected', v_inserted, 'ran_at', now());
END; $fn$;

CREATE OR REPLACE FUNCTION public.decide_duplicate_pair(_id uuid, _action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_complaint_perm(v_uid,'triage') THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501'; END IF;
  IF _action NOT IN ('linked','merged','dismissed','confirmed') THEN
    RAISE EXCEPTION 'Invalid action %', _action USING ERRCODE = '22023';
  END IF;
  UPDATE public.complaint_duplicate_pairs
     SET status=_action, decided_at=now(), decided_by=v_uid, updated_at=now()
   WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid,'complaint.duplicate_decision','complaint_duplicate_pair',_id, jsonb_build_object('action',_action));
END; $$;

DROP TRIGGER IF EXISTS trg_esc_rules_updated ON public.complaint_escalation_rules;
CREATE TRIGGER trg_esc_rules_updated BEFORE UPDATE ON public.complaint_escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_esc_cases_updated ON public.complaint_escalation_cases;
CREATE TRIGGER trg_esc_cases_updated BEFORE UPDATE ON public.complaint_escalation_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_dup_rules_updated ON public.complaint_duplicate_rules;
CREATE TRIGGER trg_dup_rules_updated BEFORE UPDATE ON public.complaint_duplicate_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_dup_pairs_updated ON public.complaint_duplicate_pairs;
CREATE TRIGGER trg_dup_pairs_updated BEFORE UPDATE ON public.complaint_duplicate_pairs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
