ALTER TABLE public.captcha_configurations
  ADD COLUMN IF NOT EXISTS score_threshold numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS expected_action text;

CREATE TABLE IF NOT EXISTS public.captcha_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  configuration_id uuid REFERENCES public.captcha_configurations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  score numeric,
  ip_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamp with time zone
);

GRANT ALL ON public.captcha_verifications TO service_role;
ALTER TABLE public.captcha_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "captcha_verifications_service_only" ON public.captcha_verifications;
CREATE POLICY "captcha_verifications_service_only"
  ON public.captcha_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS captcha_verifications_expiry_idx
  ON public.captcha_verifications (expires_at);

CREATE OR REPLACE FUNCTION public.audit_captcha_configuration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'captcha_configuration_created';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'captcha_configuration_deleted';
  ELSIF COALESCE(OLD.is_active,false) IS DISTINCT FROM COALESCE(NEW.is_active,false) THEN
    v_action := CASE WHEN NEW.is_active THEN 'captcha_configuration_activated'
                     ELSE 'captcha_configuration_deactivated' END;
  ELSE
    v_action := 'captcha_configuration_updated';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (
    auth.uid(),
    v_action,
    'captcha_configuration',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'name', OLD.name, 'provider', OLD.provider, 'environment', OLD.environment,
      'is_active', OLD.is_active, 'score_threshold', OLD.score_threshold) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'name', NEW.name, 'provider', NEW.provider, 'environment', NEW.environment,
      'is_active', NEW.is_active, 'score_threshold', NEW.score_threshold) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_captcha_configuration ON public.captcha_configurations;
CREATE TRIGGER trg_audit_captcha_configuration
  AFTER INSERT OR UPDATE OR DELETE ON public.captcha_configurations
  FOR EACH ROW EXECUTE FUNCTION public.audit_captcha_configuration();

DROP FUNCTION IF EXISTS public.get_active_captcha();
CREATE OR REPLACE FUNCTION public.get_active_captcha()
RETURNS TABLE(id uuid, provider text, site_key text, environment text, score_threshold numeric, expected_action text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.provider, c.site_key, c.environment, c.score_threshold, c.expected_action
  FROM public.captcha_configurations c
  WHERE c.is_active
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_active_captcha() TO anon, authenticated, service_role;
