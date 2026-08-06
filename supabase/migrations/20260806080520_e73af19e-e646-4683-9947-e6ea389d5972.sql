-- ============================================================
-- PRU-PAY-001 Payment Systems Oversight (Operator Register & PFMI)
-- ============================================================

-- ---------- permission helpers ----------
CREATE OR REPLACE FUNCTION public.can_read_payment_oversight(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_permission(_user_id, 'prudential_supervision', 'view')
      OR public.has_permission(_user_id, 'prudential_supervision', 'view_all_entities')
      OR public.has_permission(_user_id, 'prudential_supervision', 'manage_payment_oversight');
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_payment_oversight(_user_id uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_permission(_user_id, 'prudential_supervision', _action)
      OR public.has_permission(_user_id, 'prudential_supervision', 'manage_payment_oversight');
$$;

REVOKE ALL ON FUNCTION public.can_read_payment_oversight(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_act_on_payment_oversight(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_payment_oversight(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_payment_oversight(uuid,text) TO authenticated, service_role;

-- ---------- configuration ----------
CREATE TABLE public.payment_oversight_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  incident_notification_hours numeric NOT NULL DEFAULT 2,
  pfmi_assessment_frequency_months int NOT NULL DEFAULT 12,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payment_oversight_config TO authenticated;
GRANT ALL ON public.payment_oversight_config TO service_role;
ALTER TABLE public.payment_oversight_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY pay_cfg_read ON public.payment_oversight_config FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));
CREATE POLICY pay_cfg_write ON public.payment_oversight_config FOR ALL TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'edit'))
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'edit'));
INSERT INTO public.payment_oversight_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------- operator register ----------
CREATE TABLE public.payment_system_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  operator_name text NOT NULL,
  operator_type text NOT NULL DEFAULT 'ach',
  entity_id uuid,
  regulator_id uuid,
  licence_number text,
  license_status text NOT NULL DEFAULT 'active',
  designation_date date,
  systemically_important boolean NOT NULL DEFAULT false,
  active_agents_count int,
  aml_compliance_status text,
  contact_name text,
  contact_email text,
  contact_phone text,
  last_pfmi_assessment_date date,
  pfmi_compliance_level text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pso_type ON public.payment_system_operators(operator_type);
CREATE INDEX idx_pso_entity ON public.payment_system_operators(entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_system_operators TO authenticated;
GRANT ALL ON public.payment_system_operators TO service_role;
ALTER TABLE public.payment_system_operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY pso_read ON public.payment_system_operators FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));
CREATE POLICY pso_insert ON public.payment_system_operators FOR INSERT TO authenticated
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'create'));
CREATE POLICY pso_update ON public.payment_system_operators FOR UPDATE TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'edit'))
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'edit'));
CREATE POLICY pso_delete ON public.payment_system_operators FOR DELETE TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'delete'));

CREATE OR REPLACE FUNCTION public.payment_operator_set_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seq int;
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    SELECT COALESCE(MAX((regexp_replace(reference, '^PSO-\d{4}-', ''))::int), 0) + 1
      INTO seq FROM public.payment_system_operators
     WHERE reference LIKE 'PSO-' || to_char(now(), 'YYYY') || '-%';
    NEW.reference := 'PSO-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pso_reference BEFORE INSERT ON public.payment_system_operators
FOR EACH ROW EXECUTE FUNCTION public.payment_operator_set_reference();

-- ---------- PFMI principle catalogue ----------
CREATE TABLE public.pfmi_principles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principle_number int NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pfmi_principles TO authenticated;
GRANT ALL ON public.pfmi_principles TO service_role;
ALTER TABLE public.pfmi_principles ENABLE ROW LEVEL SECURITY;
CREATE POLICY pfmi_principles_read ON public.pfmi_principles FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));

CREATE TABLE public.pfmi_principle_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_type text NOT NULL,
  principle_number int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_type, principle_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pfmi_principle_applicability TO authenticated;
GRANT ALL ON public.pfmi_principle_applicability TO service_role;
ALTER TABLE public.pfmi_principle_applicability ENABLE ROW LEVEL SECURITY;
CREATE POLICY pfmi_appl_read ON public.pfmi_principle_applicability FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));
CREATE POLICY pfmi_appl_write ON public.pfmi_principle_applicability FOR ALL TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'edit'))
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'edit'));

-- ---------- assessments ----------
CREATE TABLE public.pfmi_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  operator_id uuid NOT NULL REFERENCES public.payment_system_operators(id) ON DELETE CASCADE,
  assessment_year int NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  overall_rating text,
  summary text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pfmi_assess_operator ON public.pfmi_assessments(operator_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pfmi_assessments TO authenticated;
GRANT ALL ON public.pfmi_assessments TO service_role;
ALTER TABLE public.pfmi_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pfmi_assess_read ON public.pfmi_assessments FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));
CREATE POLICY pfmi_assess_write ON public.pfmi_assessments FOR ALL TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'edit'))
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'edit'));

CREATE TABLE public.pfmi_assessment_principles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.pfmi_assessments(id) ON DELETE CASCADE,
  principle_number int NOT NULL,
  self_score text,
  regulatory_score text,
  narrative text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  assessed_by uuid,
  assessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, principle_number)
);
CREATE INDEX idx_pfmi_ap_assessment ON public.pfmi_assessment_principles(assessment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pfmi_assessment_principles TO authenticated;
GRANT ALL ON public.pfmi_assessment_principles TO service_role;
ALTER TABLE public.pfmi_assessment_principles ENABLE ROW LEVEL SECURITY;
CREATE POLICY pfmi_ap_read ON public.pfmi_assessment_principles FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));
CREATE POLICY pfmi_ap_write ON public.pfmi_assessment_principles FOR ALL TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'edit'))
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'edit'));

-- ---------- incidents ----------
CREATE TABLE public.payment_system_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  operator_id uuid NOT NULL REFERENCES public.payment_system_operators(id) ON DELETE CASCADE,
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL,
  notification_received_at timestamptz,
  affected_transactions bigint,
  affected_value numeric,
  resolution_status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolution_notes text,
  notification_delay_minutes numeric,
  sla_breached boolean NOT NULL DEFAULT false,
  linked_action_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_psi_operator ON public.payment_system_incidents(operator_id);
CREATE INDEX idx_psi_status ON public.payment_system_incidents(resolution_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_system_incidents TO authenticated;
GRANT ALL ON public.payment_system_incidents TO service_role;
ALTER TABLE public.payment_system_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY psi_read ON public.payment_system_incidents FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));
CREATE POLICY psi_write ON public.payment_system_incidents FOR ALL TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'edit'))
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'edit'));

CREATE OR REPLACE FUNCTION public.payment_incident_set_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seq int;
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    SELECT COALESCE(MAX((regexp_replace(reference, '^PSI-\d{4}-', ''))::int), 0) + 1
      INTO seq FROM public.payment_system_incidents
     WHERE reference LIKE 'PSI-' || to_char(now(), 'YYYY') || '-%';
    NEW.reference := 'PSI-' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_psi_reference BEFORE INSERT ON public.payment_system_incidents
FOR EACH ROW EXECUTE FUNCTION public.payment_incident_set_reference();

-- ---------- retail payments data ----------
CREATE TABLE public.payment_retail_volumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.payment_system_operators(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  payment_type text NOT NULL,
  transaction_count bigint NOT NULL DEFAULT 0,
  transaction_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'JMD',
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, period_start, period_end, payment_type)
);
CREATE INDEX idx_prv_period ON public.payment_retail_volumes(period_start, period_end);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_retail_volumes TO authenticated;
GRANT ALL ON public.payment_retail_volumes TO service_role;
ALTER TABLE public.payment_retail_volumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY prv_read ON public.payment_retail_volumes FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));
CREATE POLICY prv_write ON public.payment_retail_volumes FOR ALL TO authenticated
USING (public.can_act_on_payment_oversight(auth.uid(), 'edit'))
WITH CHECK (public.can_act_on_payment_oversight(auth.uid(), 'edit'));

-- ---------- audit events ----------
CREATE TABLE public.payment_oversight_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.payment_system_operators(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES public.pfmi_assessments(id) ON DELETE CASCADE,
  incident_id uuid REFERENCES public.payment_system_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poe_operator ON public.payment_oversight_events(operator_id);
GRANT SELECT ON public.payment_oversight_events TO authenticated;
GRANT ALL ON public.payment_oversight_events TO service_role;
ALTER TABLE public.payment_oversight_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY poe_read ON public.payment_oversight_events FOR SELECT TO authenticated
USING (public.can_read_payment_oversight(auth.uid()));

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_pay_cfg_updated BEFORE UPDATE ON public.payment_oversight_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pso_updated BEFORE UPDATE ON public.payment_system_operators
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pfmi_assess_updated BEFORE UPDATE ON public.pfmi_assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pfmi_ap_updated BEFORE UPDATE ON public.pfmi_assessment_principles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_psi_updated BEFORE UPDATE ON public.payment_system_incidents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prv_updated BEFORE UPDATE ON public.payment_retail_volumes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- seed: 24 PFMI principles ----------
INSERT INTO public.pfmi_principles (principle_number, title, category) VALUES
 (1,  'Legal basis', 'General organisation'),
 (2,  'Governance', 'General organisation'),
 (3,  'Framework for the comprehensive management of risks', 'General organisation'),
 (4,  'Credit risk', 'Credit and liquidity risk management'),
 (5,  'Collateral', 'Credit and liquidity risk management'),
 (6,  'Margin', 'Credit and liquidity risk management'),
 (7,  'Liquidity risk', 'Credit and liquidity risk management'),
 (8,  'Settlement finality', 'Settlement'),
 (9,  'Money settlements', 'Settlement'),
 (10, 'Physical deliveries', 'Settlement'),
 (11, 'Central securities depositories', 'CSDs and exchange-of-value systems'),
 (12, 'Exchange-of-value settlement systems', 'CSDs and exchange-of-value systems'),
 (13, 'Participant-default rules and procedures', 'Default management'),
 (14, 'Segregation and portability', 'Default management'),
 (15, 'General business risk', 'General business and operational risk'),
 (16, 'Custody and investment risks', 'General business and operational risk'),
 (17, 'Operational risk', 'General business and operational risk'),
 (18, 'Access and participation requirements', 'Access'),
 (19, 'Tiered participation arrangements', 'Access'),
 (20, 'FMI links', 'Access'),
 (21, 'Efficiency and effectiveness', 'Efficiency'),
 (22, 'Communication procedures and standards', 'Efficiency'),
 (23, 'Disclosure of rules, key procedures and market data', 'Transparency'),
 (24, 'Disclosure of market data by trade repositories', 'Transparency')
ON CONFLICT (principle_number) DO NOTHING;

-- ---------- seed: applicability by operator type ----------
INSERT INTO public.pfmi_principle_applicability (operator_type, principle_number)
SELECT t.op, p.n FROM
 (VALUES ('rtgs'), ('ach'), ('card_network'), ('e_money'), ('cbdc'), ('msb'), ('securities_settlement'), ('other')) AS t(op),
 generate_series(1, 24) AS p(n)
WHERE
  (t.op = 'rtgs'                  AND p.n IN (1,2,3,4,5,7,8,9,13,15,16,17,18,19,20,21,22,23))
  OR (t.op = 'ach'                AND p.n IN (1,2,3,4,5,7,8,9,13,15,16,17,18,19,21,22,23))
  OR (t.op = 'card_network'       AND p.n IN (1,2,3,4,7,8,9,13,15,16,17,18,19,21,22,23))
  OR (t.op = 'e_money'            AND p.n IN (1,2,3,9,15,16,17,18,21,22,23))
  OR (t.op = 'cbdc'               AND p.n IN (1,2,3,8,9,15,16,17,18,19,21,22,23))
  OR (t.op = 'msb'                AND p.n IN (1,2,3,9,15,16,17,18,21,22,23))
  OR (t.op = 'securities_settlement' AND p.n IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23))
  OR (t.op = 'other'              AND p.n IN (1,2,3,15,16,17,18,21,22,23))
ON CONFLICT DO NOTHING;

-- ---------- RPC: start assessment ----------
CREATE OR REPLACE FUNCTION public.pfmi_start_assessment(_operator_id uuid, _year int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_op public.payment_system_operators;
  v_year int := COALESCE(_year, EXTRACT(YEAR FROM now())::int);
  v_id uuid;
  v_ref text;
  v_seq int;
  v_count int;
BEGIN
  IF NOT (public.can_act_on_payment_oversight(auth.uid(), 'create')
          OR public.can_act_on_payment_oversight(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_for_payment_oversight';
  END IF;

  SELECT * INTO v_op FROM public.payment_system_operators WHERE id = _operator_id;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'operator_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.pfmi_assessments
              WHERE operator_id = _operator_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'assessment_already_in_progress';
  END IF;

  SELECT COALESCE(MAX((regexp_replace(reference, '^PFMI-\d{4}-', ''))::int), 0) + 1
    INTO v_seq FROM public.pfmi_assessments
   WHERE reference LIKE 'PFMI-' || v_year::text || '-%';
  v_ref := 'PFMI-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.pfmi_assessments (reference, operator_id, assessment_year, started_by)
  VALUES (v_ref, _operator_id, v_year, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.pfmi_assessment_principles (assessment_id, principle_number)
  SELECT v_id, a.principle_number
    FROM public.pfmi_principle_applicability a
   WHERE a.operator_type = v_op.operator_type;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    INSERT INTO public.pfmi_assessment_principles (assessment_id, principle_number)
    SELECT v_id, p.principle_number FROM public.pfmi_principles p;
  END IF;

  INSERT INTO public.payment_oversight_events (operator_id, assessment_id, event_type, actor_id, metadata)
  VALUES (_operator_id, v_id, 'PFMI_ASSESSMENT_INITIATED', auth.uid(),
          jsonb_build_object('reference', v_ref, 'year', v_year));

  RETURN jsonb_build_object('ok', true, 'assessment_id', v_id, 'reference', v_ref);
END $$;
REVOKE ALL ON FUNCTION public.pfmi_start_assessment(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pfmi_start_assessment(uuid,int) TO authenticated, service_role;

-- ---------- RPC: save principle ----------
CREATE OR REPLACE FUNCTION public.pfmi_save_principle(
  _assessment_id uuid, _principle_number int,
  _self_score text DEFAULT NULL, _regulatory_score text DEFAULT NULL,
  _narrative text DEFAULT NULL, _evidence jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.can_act_on_payment_oversight(auth.uid(), 'edit') THEN
    RAISE EXCEPTION 'not_authorised_for_payment_oversight';
  END IF;
  SELECT status INTO v_status FROM public.pfmi_assessments WHERE id = _assessment_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'assessment_not_found'; END IF;
  IF v_status <> 'in_progress' THEN RAISE EXCEPTION 'assessment_not_editable'; END IF;

  IF _regulatory_score IS NOT NULL AND _regulatory_score NOT IN
     ('observed','broadly_observed','partly_observed','not_observed','not_applicable') THEN
    RAISE EXCEPTION 'invalid_regulatory_score';
  END IF;

  UPDATE public.pfmi_assessment_principles
     SET self_score = COALESCE(_self_score, self_score),
         regulatory_score = COALESCE(_regulatory_score, regulatory_score),
         narrative = COALESCE(_narrative, narrative),
         evidence = COALESCE(_evidence, evidence),
         assessed_by = auth.uid(), assessed_at = now(), updated_at = now()
   WHERE assessment_id = _assessment_id AND principle_number = _principle_number;

  IF NOT FOUND THEN RAISE EXCEPTION 'principle_not_in_assessment'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.pfmi_save_principle(uuid,int,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pfmi_save_principle(uuid,int,text,text,text,jsonb) TO authenticated, service_role;

-- ---------- RPC: complete assessment ----------
CREATE OR REPLACE FUNCTION public.pfmi_complete_assessment(_assessment_id uuid, _summary text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_a public.pfmi_assessments;
  v_missing int;
  v_overall text;
  v_op public.payment_system_operators;
BEGIN
  IF NOT (public.can_act_on_payment_oversight(auth.uid(), 'edit')
          OR public.can_act_on_payment_oversight(auth.uid(), 'workflow_action')) THEN
    RAISE EXCEPTION 'not_authorised_for_payment_oversight';
  END IF;

  SELECT * INTO v_a FROM public.pfmi_assessments WHERE id = _assessment_id;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'assessment_not_found'; END IF;
  IF v_a.status = 'completed' THEN RAISE EXCEPTION 'assessment_already_completed'; END IF;

  SELECT count(*) INTO v_missing FROM public.pfmi_assessment_principles
   WHERE assessment_id = _assessment_id AND regulatory_score IS NULL;
  IF v_missing > 0 THEN RAISE EXCEPTION 'principles_not_assessed: %', v_missing; END IF;

  SELECT CASE
      WHEN bool_or(regulatory_score = 'not_observed') THEN 'not_observed'
      WHEN bool_or(regulatory_score = 'partly_observed') THEN 'partly_observed'
      WHEN bool_or(regulatory_score = 'broadly_observed') THEN 'broadly_observed'
      ELSE 'observed' END
    INTO v_overall
    FROM public.pfmi_assessment_principles
   WHERE assessment_id = _assessment_id AND regulatory_score <> 'not_applicable';

  UPDATE public.pfmi_assessments
     SET status = 'completed', completed_at = now(), completed_by = auth.uid(),
         overall_rating = v_overall, summary = COALESCE(_summary, summary), updated_at = now()
   WHERE id = _assessment_id;

  UPDATE public.payment_system_operators
     SET last_pfmi_assessment_date = current_date,
         pfmi_compliance_level = v_overall, updated_at = now()
   WHERE id = v_a.operator_id
  RETURNING * INTO v_op;

  INSERT INTO public.payment_oversight_events (operator_id, assessment_id, event_type, actor_id, metadata)
  VALUES (v_a.operator_id, _assessment_id, 'PFMI_ASSESSMENT_COMPLETED', auth.uid(),
          jsonb_build_object('overall_rating', v_overall, 'reference', v_a.reference));

  IF v_overall IN ('partly_observed', 'not_observed') THEN
    PERFORM public.notification_enqueue_event(
      'prudential.pfmi_non_observance', 'pfmi_assessment', _assessment_id,
      jsonb_build_object(
        'assessment_id', _assessment_id, 'reference', v_a.reference,
        'operator_id', v_a.operator_id, 'operator_name', v_op.operator_name,
        'entity_id', v_op.entity_id, 'overall_rating', v_overall,
        'cta_url', '/prudential/payment-systems/assessments/' || _assessment_id,
        'cta_label', 'Open assessment'),
      v_overall);
  END IF;

  RETURN jsonb_build_object('ok', true, 'overall_rating', v_overall);
END $$;
REVOKE ALL ON FUNCTION public.pfmi_complete_assessment(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pfmi_complete_assessment(uuid,text) TO authenticated, service_role;

-- ---------- RPC: record incident ----------
CREATE OR REPLACE FUNCTION public.payment_incident_record(
  _operator_id uuid, _incident_type text, _title text, _occurred_at timestamptz,
  _notification_received_at timestamptz DEFAULT NULL, _severity text DEFAULT 'medium',
  _description text DEFAULT NULL, _affected_transactions bigint DEFAULT NULL,
  _affected_value numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hours numeric;
  v_delay numeric;
  v_breach boolean := false;
  v_id uuid;
  v_ref text;
  v_op public.payment_system_operators;
BEGIN
  IF NOT (public.can_act_on_payment_oversight(auth.uid(), 'create')
          OR public.can_act_on_payment_oversight(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_for_payment_oversight';
  END IF;

  SELECT * INTO v_op FROM public.payment_system_operators WHERE id = _operator_id;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'operator_not_found'; END IF;

  SELECT incident_notification_hours INTO v_hours FROM public.payment_oversight_config WHERE id = 1;
  v_hours := COALESCE(v_hours, 2);

  IF _notification_received_at IS NOT NULL THEN
    v_delay := EXTRACT(EPOCH FROM (_notification_received_at - _occurred_at)) / 60.0;
    v_breach := v_delay > (v_hours * 60);
  END IF;

  INSERT INTO public.payment_system_incidents (
    operator_id, incident_type, title, description, severity, occurred_at,
    notification_received_at, affected_transactions, affected_value,
    notification_delay_minutes, sla_breached, created_by)
  VALUES (_operator_id, _incident_type, _title, _description, COALESCE(_severity,'medium'),
          _occurred_at, _notification_received_at, _affected_transactions, _affected_value,
          v_delay, v_breach, auth.uid())
  RETURNING id, reference INTO v_id, v_ref;

  INSERT INTO public.payment_oversight_events (operator_id, incident_id, event_type, actor_id, metadata)
  VALUES (_operator_id, v_id, 'INCIDENT_RECORDED', auth.uid(),
          jsonb_build_object('reference', v_ref, 'severity', _severity, 'sla_breached', v_breach));

  IF v_breach THEN
    INSERT INTO public.payment_oversight_events (operator_id, incident_id, event_type, actor_id, metadata)
    VALUES (_operator_id, v_id, 'INCIDENT_NOTIFICATION_SLA_BREACH', auth.uid(),
            jsonb_build_object('delay_minutes', round(v_delay), 'window_hours', v_hours));

    PERFORM public.notification_enqueue_event(
      'prudential.payment_incident_late_notification', 'payment_incident', v_id,
      jsonb_build_object('incident_id', v_id, 'reference', v_ref,
        'operator_id', _operator_id, 'operator_name', v_op.operator_name,
        'entity_id', v_op.entity_id, 'delay_minutes', round(v_delay),
        'window_hours', v_hours, 'severity', COALESCE(_severity,'medium'),
        'cta_url', '/prudential/payment-systems?tab=incidents',
        'cta_label', 'Open incident register'),
      'late');
  END IF;

  RETURN jsonb_build_object('ok', true, 'incident_id', v_id, 'reference', v_ref, 'sla_breached', v_breach);
END $$;
REVOKE ALL ON FUNCTION public.payment_incident_record(uuid,text,text,timestamptz,timestamptz,text,text,bigint,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_incident_record(uuid,text,text,timestamptz,timestamptz,text,text,bigint,numeric) TO authenticated, service_role;

-- ---------- RPC: resolve incident ----------
CREATE OR REPLACE FUNCTION public.payment_incident_resolve(_incident_id uuid, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_i public.payment_system_incidents;
BEGIN
  IF NOT (public.can_act_on_payment_oversight(auth.uid(), 'edit')
          OR public.can_act_on_payment_oversight(auth.uid(), 'workflow_action')) THEN
    RAISE EXCEPTION 'not_authorised_for_payment_oversight';
  END IF;
  SELECT * INTO v_i FROM public.payment_system_incidents WHERE id = _incident_id;
  IF v_i.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  IF v_i.resolution_status = 'resolved' THEN RAISE EXCEPTION 'incident_already_resolved'; END IF;

  UPDATE public.payment_system_incidents
     SET resolution_status = 'resolved', resolved_at = now(),
         resolution_notes = COALESCE(_notes, resolution_notes), updated_at = now()
   WHERE id = _incident_id;

  INSERT INTO public.payment_oversight_events (operator_id, incident_id, event_type, actor_id, notes)
  VALUES (v_i.operator_id, _incident_id, 'INCIDENT_RESOLVED', auth.uid(), _notes);

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.payment_incident_resolve(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_incident_resolve(uuid,text) TO authenticated, service_role;

-- ---------- permissions registry ----------
INSERT INTO public.permissions (module, name, description)
SELECT 'prudential_supervision', v.name, v.descr
FROM (VALUES
  ('manage_payment_oversight', 'Manage payment system operators, PFMI assessments and incidents')
) AS v(name, descr)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p
   WHERE p.module = 'prudential_supervision' AND p.name = v.name);

-- ---------- notification event configs ----------
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template,
   email_subject_template, email_body_template, channels, recipient_rules,
   notification_type, severity, category, module, action_required)
SELECT * FROM (VALUES
 ('prudential.pfmi_non_observance',
  'PFMI assessment completed with partly/not observed principles',
  'PFMI non-observance: {{operator_name}}',
  'PFMI assessment {{reference}} for {{operator_name}} concluded as {{overall_rating}}. A supervisory action is recommended.',
  'PFMI non-observance recorded for {{operator_name}}',
  'PFMI assessment {{reference}} for {{operator_name}} concluded as {{overall_rating}}. Please review the assessment and consider a supervisory action.',
  ARRAY['in_app','email']::text[],
  '[{"type":"role","role":"supervisor"}]'::jsonb,
  'warning', 'high'::notification_severity, 'action_required'::notification_category, 'prudential', true),
 ('prudential.payment_incident_late_notification',
  'Payment system incident notified outside the configured window',
  'Late incident notification: {{operator_name}}',
  'Incident {{reference}} from {{operator_name}} was notified {{delay_minutes}} minutes after occurrence (window: {{window_hours}}h).',
  'Late payment incident notification — {{operator_name}}',
  'Incident {{reference}} from {{operator_name}} was notified {{delay_minutes}} minutes after it occurred, breaching the {{window_hours}}-hour notification window.',
  ARRAY['in_app','email']::text[],
  '[{"type":"role","role":"supervisor"}]'::jsonb,
  'warning', 'high'::notification_severity, 'alert'::notification_category, 'prudential', true)
) AS v(event_key, description, title_template, message_template, email_subject_template,
       email_body_template, channels, recipient_rules, notification_type, severity, category, module, action_required)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_event_configs c WHERE c.event_key = v.event_key);