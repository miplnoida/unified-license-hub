
-- Add penalty fee type and exemption support to fee_configurations
ALTER TABLE public.fee_configurations ADD COLUMN IF NOT EXISTS calculation_type text NOT NULL DEFAULT 'fixed';
ALTER TABLE public.fee_configurations ADD COLUMN IF NOT EXISTS calculation_expression text;
ALTER TABLE public.fee_configurations ADD COLUMN IF NOT EXISTS min_amount numeric DEFAULT 0;
ALTER TABLE public.fee_configurations ADD COLUMN IF NOT EXISTS max_amount numeric;

-- Fee rules for dynamic calculation and exemptions
CREATE TABLE public.fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_configuration_id uuid REFERENCES public.fee_configurations(id) ON DELETE CASCADE NOT NULL,
  rule_type text NOT NULL DEFAULT 'calculation', -- calculation, exemption, discount
  name text NOT NULL,
  description text,
  condition jsonb NOT NULL DEFAULT '{}',
  expression text, -- e.g. "{turnover} * 0.01"
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fee rules" ON public.fee_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone reads fee rules" ON public.fee_rules FOR SELECT TO authenticated
  USING (true);

-- Payment receipts with auto-generated receipt numbers
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE seq_val bigint;
BEGIN
  SELECT nextval('receipt_number_seq') INTO seq_val;
  RETURN 'RCT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::text, 6, '0');
END;
$$;

CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
  receipt_number text NOT NULL DEFAULT generate_receipt_number(),
  issued_to_name text NOT NULL,
  issued_to_email text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  fee_breakdown jsonb NOT NULL DEFAULT '[]',
  issued_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage receipts" ON public.payment_receipts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own receipts" ON public.payment_receipts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payments p WHERE p.id = payment_id AND p.user_id = auth.uid()
  ));

-- Refunds table
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, processed, rejected
  requested_by uuid NOT NULL,
  approved_by uuid,
  processed_at timestamptz,
  refund_method text,
  refund_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage refunds" ON public.refunds FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own refunds" ON public.refunds FOR SELECT TO authenticated
  USING (auth.uid() = requested_by);

CREATE POLICY "Users request refunds" ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by);
