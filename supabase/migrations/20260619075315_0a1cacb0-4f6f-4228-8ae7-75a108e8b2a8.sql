
-- ============================================================
-- 1) license_certificates
-- ============================================================
CREATE TABLE public.license_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signatory_name text,
  signatory_title text,
  signature_fingerprint text,
  is_signed boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.license_certificates TO authenticated;
GRANT ALL ON public.license_certificates TO service_role;
ALTER TABLE public.license_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal staff read certificates"
ON public.license_certificates FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.licenses l
    JOIN public.licensees lic ON lic.license_id = l.id
    JOIN public.entity_user_access eua ON eua.entity_id = lic.id
    WHERE l.id = license_certificates.license_id
      AND eua.user_id = auth.uid()
      AND eua.is_active = true
  )
);

CREATE INDEX idx_license_certificates_license ON public.license_certificates(license_id);

-- ============================================================
-- 2) license_renewals
-- ============================================================
CREATE TABLE public.license_renewals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  previous_valid_until timestamptz,
  new_valid_until timestamptz NOT NULL,
  notes text,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.license_renewals TO authenticated;
GRANT ALL ON public.license_renewals TO service_role;
ALTER TABLE public.license_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "renewals readable by stakeholders"
ON public.license_renewals FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR initiated_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.licenses l
    JOIN public.licensees lic ON lic.license_id = l.id
    JOIN public.entity_user_access eua ON eua.entity_id = lic.id
    WHERE l.id = license_renewals.license_id
      AND eua.user_id = auth.uid()
      AND eua.is_active = true
  )
);

CREATE POLICY "renewals insertable by stakeholders"
ON public.license_renewals FOR INSERT TO authenticated
WITH CHECK (
  initiated_by = auth.uid()
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.licenses l
      JOIN public.licensees lic ON lic.license_id = l.id
      JOIN public.entity_user_access eua ON eua.entity_id = lic.id
      WHERE l.id = license_renewals.license_id
        AND eua.user_id = auth.uid()
        AND eua.is_active = true
    )
  )
);

CREATE POLICY "renewals updatable by officers"
ON public.license_renewals FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE INDEX idx_license_renewals_license ON public.license_renewals(license_id);
CREATE INDEX idx_license_renewals_status ON public.license_renewals(status);

-- ============================================================
-- 3) supervisory_plans
-- ============================================================
CREATE TABLE public.supervisory_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  risk_rating_id uuid REFERENCES public.risk_ratings(id) ON DELETE SET NULL,
  created_from text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.supervisory_plans TO authenticated;
GRANT ALL ON public.supervisory_plans TO service_role;
ALTER TABLE public.supervisory_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supervisory plans admin manage"
ON public.supervisory_plans FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "supervisory plans entity read"
ON public.supervisory_plans FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.entity_user_access eua
    WHERE eua.entity_id = supervisory_plans.entity_id
      AND eua.user_id = auth.uid()
      AND eua.is_active = true
  )
);

CREATE POLICY "external users denied supervisory plans"
ON public.supervisory_plans AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT has_external_role(auth.uid()))
WITH CHECK (NOT has_external_role(auth.uid()));

CREATE INDEX idx_supervisory_plans_entity ON public.supervisory_plans(entity_id);

-- ============================================================
-- 4) supervisory_plan_actions
-- ============================================================
CREATE TABLE public.supervisory_plan_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.supervisory_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  owner_role text,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  completed_by uuid,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisory_plan_actions TO authenticated;
GRANT ALL ON public.supervisory_plan_actions TO service_role;
ALTER TABLE public.supervisory_plan_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supervisory actions admin manage"
ON public.supervisory_plan_actions FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "supervisory actions entity read"
ON public.supervisory_plan_actions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.supervisory_plans p
    JOIN public.entity_user_access eua ON eua.entity_id = p.entity_id
    WHERE p.id = supervisory_plan_actions.plan_id
      AND eua.user_id = auth.uid()
      AND eua.is_active = true
  )
);

CREATE POLICY "external users denied supervisory actions"
ON public.supervisory_plan_actions AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT has_external_role(auth.uid()))
WITH CHECK (NOT has_external_role(auth.uid()));

CREATE INDEX idx_supervisory_actions_plan ON public.supervisory_plan_actions(plan_id);
CREATE INDEX idx_supervisory_actions_due ON public.supervisory_plan_actions(due_date) WHERE status <> 'completed';

-- ============================================================
-- 5) updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER tg_license_certificates_updated BEFORE UPDATE ON public.license_certificates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER tg_license_renewals_updated BEFORE UPDATE ON public.license_renewals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER tg_supervisory_plans_updated BEFORE UPDATE ON public.supervisory_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER tg_supervisory_actions_updated BEFORE UPDATE ON public.supervisory_plan_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 6) bootstrap_supervisory_profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.bootstrap_supervisory_profile(_license_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id uuid;
  v_rating_id uuid;
  v_plan_id uuid;
  v_app_no text;
BEGIN
  SELECT lic.id, COALESCE(a.application_number, '')
    INTO v_entity_id, v_app_no
  FROM public.licensees lic
  LEFT JOIN public.licenses l ON l.id = lic.license_id
  LEFT JOIN public.applications a ON a.id = l.application_id
  WHERE lic.license_id = _license_id
  LIMIT 1;

  IF v_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Skip if a plan already exists
  IF EXISTS (SELECT 1 FROM public.supervisory_plans WHERE entity_id = v_entity_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.risk_ratings (entity_id, overall_rating, risk_score, risk_factors, notes)
  VALUES (
    v_entity_id, 'medium', 50,
    '[{"factor":"new_licensee","weight":1.0}]'::jsonb,
    'Auto-generated from licensing findings' || CASE WHEN v_app_no <> '' THEN ' (application ' || v_app_no || ')' ELSE '' END
  )
  RETURNING id INTO v_rating_id;

  INSERT INTO public.supervisory_plans (entity_id, license_id, risk_rating_id, created_from, status, notes)
  VALUES (v_entity_id, _license_id, v_rating_id, 'licensing', 'active',
    'Initial supervisory plan auto-generated upon licensing.')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.supervisory_plan_actions (plan_id, title, description, owner_role, due_date, source)
  VALUES
    (v_plan_id, 'Initial onboarding meeting', 'Conduct kickoff meeting with newly licensed entity to review obligations.', 'supervisor', (CURRENT_DATE + INTERVAL '30 days')::date, 'auto'),
    (v_plan_id, 'Submit baseline compliance return', 'Entity must file its first baseline compliance return.', 'licensee', (CURRENT_DATE + INTERVAL '60 days')::date, 'auto'),
    (v_plan_id, 'First desk / on-site review', 'Officer reviews initial filings and onboarding documentation.', 'supervisor', (CURRENT_DATE + INTERVAL '90 days')::date, 'auto'),
    (v_plan_id, 'Risk reassessment', 'Re-evaluate baseline risk rating after first quarter of operation.', 'supervisor', (CURRENT_DATE + INTERVAL '180 days')::date, 'auto');

  RETURN v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_supervisory_profile(uuid) TO authenticated, service_role;

-- ============================================================
-- 7) Seed notification templates + event configs (idempotent)
-- ============================================================
INSERT INTO public.notification_templates (name, event_type, channel, subject, body, variables, is_active)
SELECT * FROM (VALUES
  ('License Expiring (Officer)', 'license.expiring_soon_officer', 'email',
   'License {{license_number}} expiring in {{days_until_expiry}} days',
   E'Dear Officer,\n\nLicense {{license_number}} ({{license_type}}) for {{entity_name}} is expiring on {{valid_until}} ({{days_until_expiry}} days remaining).\n\nPlease coordinate renewal proceedings if applicable.\n\nRegards,\n{{app_name}}',
   '["license_number","license_type","entity_name","valid_until","days_until_expiry","app_name"]'::jsonb, true),
  ('License Expiring (Officer In-App)', 'license.expiring_soon_officer', 'in_app',
   'License {{license_number}} expiring soon',
   'License {{license_number}} for {{entity_name}} expires in {{days_until_expiry}} days.',
   '["license_number","entity_name","days_until_expiry"]'::jsonb, true),
  ('License Renewal Requested', 'license.renewal_requested', 'email',
   'Renewal requested: License {{license_number}}',
   E'A renewal request has been submitted for license {{license_number}} ({{license_type}}) by {{initiated_by_name}}.\n\nNew proposed validity: {{new_valid_until}}.\n\nNotes: {{notes}}\n\nPlease review in the portal.',
   '["license_number","license_type","initiated_by_name","new_valid_until","notes"]'::jsonb, true),
  ('License Renewal Requested (In-App)', 'license.renewal_requested', 'in_app',
   'Renewal requested for {{license_number}}',
   '{{initiated_by_name}} requested renewal of {{license_number}} until {{new_valid_until}}.',
   '["license_number","initiated_by_name","new_valid_until"]'::jsonb, true),
  ('License Renewal Approved', 'license.renewal_approved', 'email',
   'License {{license_number}} renewed',
   E'Your license {{license_number}} has been renewed.\n\nNew validity: {{new_valid_until}}.\n\nA fresh signed certificate is available in the portal.',
   '["license_number","new_valid_until"]'::jsonb, true),
  ('License Revoked (Detailed)', 'license.revoked', 'email',
   'License {{license_number}} revoked',
   E'License {{license_number}} ({{license_type}}) has been revoked.\n\nJustification: {{reason}}\n\nEffective immediately.',
   '["license_number","license_type","reason"]'::jsonb, true)
) AS v(name, event_type, channel, subject, body, variables, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates t
  WHERE t.event_type = v.event_type AND t.name = v.name
);

INSERT INTO public.notification_event_configs (event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, recipient_rules, notification_type)
SELECT * FROM (VALUES
  ('license.expiring_soon_officer', 'Officer alert for upcoming license expiry',
   'License {{license_number}} expiring',
   'License {{license_number}} for {{entity_name}} expires in {{days_until_expiry}} days.',
   'License {{license_number}} expiring in {{days_until_expiry}} days',
   E'License {{license_number}} ({{license_type}}) for {{entity_name}} expires on {{valid_until}}.',
   ARRAY['in_app','email'],
   '[{"type":"sector_regulators"},{"type":"role","role":"supervisor"}]'::jsonb,
   'warning'),
  ('license.renewal_requested', 'A licensee/officer initiated a license renewal',
   'Renewal requested: {{license_number}}',
   'Renewal requested for {{license_number}} until {{new_valid_until}}.',
   'Renewal requested: License {{license_number}}',
   E'A renewal request has been submitted for license {{license_number}}.\nProposed validity: {{new_valid_until}}.',
   ARRAY['in_app','email'],
   '[{"type":"sector_regulators"},{"type":"role","role":"supervisor"},{"type":"role","role":"admin"}]'::jsonb,
   'info'),
  ('license.renewal_approved', 'License renewal approved',
   'License {{license_number}} renewed',
   'License {{license_number}} renewed until {{new_valid_until}}.',
   'License {{license_number}} renewed',
   E'License {{license_number}} renewed until {{new_valid_until}}.',
   ARRAY['in_app','email'],
   '[{"type":"entity_primary_users"},{"type":"sector_regulators"}]'::jsonb,
   'success')
) AS v(event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, recipient_rules, notification_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_event_configs c WHERE c.event_key = v.event_key
);
