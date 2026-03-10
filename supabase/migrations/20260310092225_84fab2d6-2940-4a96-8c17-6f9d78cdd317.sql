
-- Fee configuration table
CREATE TABLE public.fee_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  sub_sector_id UUID REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  fee_type TEXT NOT NULL DEFAULT 'application', -- application, processing, license, renewal, service
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fees" ON public.fee_configurations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage fees" ON public.fee_configurations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

-- Payment records table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  fee_configuration_id UUID REFERENCES public.fee_configurations(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  payment_method TEXT,
  transaction_ref TEXT,
  receipt_number TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own payments" ON public.payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update payments" ON public.payments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

-- Licenses table (issued licenses)
CREATE TABLE public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  holder_id UUID NOT NULL,
  license_number TEXT NOT NULL UNIQUE,
  license_type TEXT NOT NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  sub_sector_id UUID REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, suspended, revoked, expired, cancelled
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  conditions TEXT,
  compliance_requirements JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS license_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_license_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE seq_val bigint;
BEGIN
  SELECT nextval('license_number_seq') INTO seq_val;
  RETURN 'LIC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::text, 6, '0');
END;
$$;

ALTER TABLE public.licenses ALTER COLUMN license_number SET DEFAULT generate_license_number();
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Holders read own licenses" ON public.licenses FOR SELECT TO authenticated
  USING (auth.uid() = holder_id OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'licensing_officer'));
CREATE POLICY "Admins manage licenses" ON public.licenses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'licensing_officer'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'licensing_officer'));

-- License actions (renewal, modification, suspension, etc.)
CREATE TABLE public.license_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES public.licenses(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL, -- renewal, modification, suspension, cancellation, reinstatement
  actor_id UUID NOT NULL,
  reason TEXT,
  old_status TEXT,
  new_status TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.license_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read license actions" ON public.license_actions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'licensing_officer'));
CREATE POLICY "Insert license actions" ON public.license_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- Compliance return configurations
CREATE TABLE public.return_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  form_id UUID,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  sub_sector_id UUID REFERENCES public.sub_sectors(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, yearly
  due_day INTEGER NOT NULL DEFAULT 15, -- day of month/quarter/year the return is due
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.return_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads return configs" ON public.return_configurations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage return configs" ON public.return_configurations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

-- Compliance return submissions
CREATE TABLE public.compliance_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_config_id UUID REFERENCES public.return_configurations(id) ON DELETE SET NULL,
  license_id UUID REFERENCES public.licenses(id) ON DELETE CASCADE,
  submitter_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, draft, submitted, accepted, rejected, overdue
  form_data JSONB DEFAULT '{}',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewer_id UUID,
  reviewer_comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submitters read own returns" ON public.compliance_returns FOR SELECT TO authenticated
  USING (auth.uid() = submitter_id OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst'));
CREATE POLICY "Submitters insert returns" ON public.compliance_returns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = submitter_id);
CREATE POLICY "Submitters update draft returns" ON public.compliance_returns FOR UPDATE TO authenticated
  USING ((auth.uid() = submitter_id AND status IN ('pending', 'draft')) OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (true);

-- Add more granular application status stages
-- Update the application_status comment to document new stages
COMMENT ON COLUMN public.applications.status IS 'draft, submitted, scrutiny, query_raised, resubmitted, technical_review, pending_approval, approved, rejected, license_issued';
