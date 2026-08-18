-- 1. CAPTCHA configuration -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.captcha_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('recaptcha_v2','recaptcha_v3','turnstile','hcaptcha')),
  site_key text NOT NULL,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox','production')),
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS captcha_configurations_single_active
  ON public.captcha_configurations ((is_active)) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.captcha_configurations TO authenticated;
GRANT ALL ON public.captcha_configurations TO service_role;
ALTER TABLE public.captcha_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage captcha configurations" ON public.captcha_configurations;
CREATE POLICY "Admins manage captcha configurations"
  ON public.captcha_configurations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role));

DROP TRIGGER IF EXISTS trg_captcha_configurations_updated_at ON public.captcha_configurations;
CREATE TRIGGER trg_captcha_configurations_updated_at
  BEFORE UPDATE ON public.captcha_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Secrets (service role only) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.captcha_secrets (
  configuration_id uuid PRIMARY KEY REFERENCES public.captcha_configurations(id) ON DELETE CASCADE,
  secret_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.captcha_secrets FROM authenticated, anon;
GRANT ALL ON public.captcha_secrets TO service_role;
ALTER TABLE public.captcha_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No client access to captcha secrets" ON public.captcha_secrets;
CREATE POLICY "No client access to captcha secrets"
  ON public.captcha_secrets FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 3. Public read of the active configuration (no secret) --------------------
CREATE OR REPLACE FUNCTION public.get_active_captcha()
RETURNS TABLE (id uuid, provider text, site_key text, environment text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.provider, c.site_key, c.environment
  FROM public.captcha_configurations c
  WHERE c.is_active
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_active_captcha() TO anon, authenticated, service_role;

-- 4. Atomic activation ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_captcha_configuration(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to manage CAPTCHA configurations';
  END IF;

  SELECT id INTO _prev FROM public.captcha_configurations WHERE is_active AND id <> _id FOR UPDATE;

  UPDATE public.captcha_configurations
     SET is_active = false, updated_by = auth.uid(), updated_at = now()
   WHERE is_active AND id <> _id;

  UPDATE public.captcha_configurations
     SET is_active = true, updated_by = auth.uid(), updated_at = now()
   WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAPTCHA configuration not found';
  END IF;

  RETURN jsonb_build_object('activated_id', _id, 'deactivated_id', _prev);
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_captcha_configuration(uuid) TO authenticated, service_role;

-- 5. Global enable flag -----------------------------------------------------
INSERT INTO public.site_settings (key, value)
VALUES ('captcha_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;