GRANT SELECT, INSERT, UPDATE, DELETE ON public.captcha_configurations TO authenticated;
GRANT ALL ON public.captcha_configurations TO service_role;
GRANT ALL ON public.captcha_secrets TO service_role;
GRANT ALL ON public.captcha_verifications TO service_role;
ALTER TABLE public.captcha_configurations ALTER COLUMN score_threshold DROP NOT NULL;