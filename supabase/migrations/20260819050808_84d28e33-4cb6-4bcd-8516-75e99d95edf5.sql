ALTER TABLE public.registration_form_configs
ADD COLUMN IF NOT EXISTS email_verification_step_id text;

COMMENT ON COLUMN public.registration_form_configs.email_verification_step_id IS
'Stable registration step id where email OTP verification is shown. Reserved value ''before_submission'' (or NULL) keeps the legacy final-stage placement.';