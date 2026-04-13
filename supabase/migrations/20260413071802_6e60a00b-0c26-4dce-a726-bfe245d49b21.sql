
-- Sequence for registration references
CREATE SEQUENCE IF NOT EXISTS registration_reference_seq START WITH 1;

-- Function to generate registration reference
CREATE OR REPLACE FUNCTION public.generate_registration_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE seq_val bigint;
BEGIN
  SELECT nextval('registration_reference_seq') INTO seq_val;
  RETURN 'REG-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::text, 6, '0');
END;
$$;

-- Add new columns to registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS registration_reference text UNIQUE DEFAULT generate_registration_reference(),
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS entity_specific_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS documents_metadata jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted boolean DEFAULT false;

-- OTP verifications table
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  verified_at timestamp with time zone,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- Service role full access for edge functions
CREATE POLICY "Service role manages OTP" ON public.otp_verifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon/authenticated can read their own (by email)
CREATE POLICY "Users read own OTP records" ON public.otp_verifications
  FOR SELECT TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Public insert for pre-registration OTP (before user exists)
CREATE POLICY "Public insert OTP" ON public.otp_verifications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
