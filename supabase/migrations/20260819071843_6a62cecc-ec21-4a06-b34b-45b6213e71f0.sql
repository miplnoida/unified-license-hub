ALTER TABLE public.registration_form_configs
  ADD COLUMN IF NOT EXISTS otp_visible_to_applicant boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS captcha_visible_to_applicant boolean NOT NULL DEFAULT true;