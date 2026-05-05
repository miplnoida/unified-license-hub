ALTER TABLE public.otp_verifications
ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'registration';

UPDATE public.otp_verifications
SET purpose = 'registration'
WHERE purpose IS NULL OR btrim(purpose) = '';

CREATE INDEX IF NOT EXISTS idx_otp_verifications_lookup
ON public.otp_verifications (user_email, channel, purpose, created_at DESC)
WHERE verified_at IS NULL;