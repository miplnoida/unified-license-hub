-- Offline payment support on the existing payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_channel text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS offline_method text,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_remarks text;

DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_channel_check
    CHECK (payment_channel IN ('online','offline'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_verification_status_check
    CHECK (verification_status IS NULL OR verification_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS payments_channel_verification_idx
  ON public.payments (payment_channel, verification_status);

-- Invoice fields on the existing receipts table
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS application_id uuid,
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_channel text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS issued_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_invoice_number_key
  ON public.payment_receipts (invoice_number) WHERE invoice_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_one_per_payment
  ON public.payment_receipts (payment_id);
CREATE INDEX IF NOT EXISTS payment_receipts_application_idx
  ON public.payment_receipts (application_id);

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'INV-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.invoice_number_seq')::text, 6, '0')
$$;