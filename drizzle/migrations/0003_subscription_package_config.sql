CREATE TABLE public.system_subscription_package (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  active_package text NOT NULL DEFAULT 'PACKAGE_C' CHECK (active_package IN ('PACKAGE_A','PACKAGE_B','PACKAGE_C')),
  module_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.system_subscription_package TO authenticated;
GRANT ALL ON public.system_subscription_package TO service_role;
ALTER TABLE public.system_subscription_package ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read package" ON public.system_subscription_package FOR SELECT TO authenticated USING (true);
INSERT INTO public.system_subscription_package (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.system_subscription_package_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_package text,
  new_package text NOT NULL,
  module_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_subscription_package_history TO authenticated;
GRANT ALL ON public.system_subscription_package_history TO service_role;
ALTER TABLE public.system_subscription_package_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin reads package history" ON public.system_subscription_package_history FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.system_subscription_package_set(_package text, _overrides jsonb, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a super administrator can change the subscription package' USING ERRCODE = '42501';
  END IF;
  IF _package NOT IN ('PACKAGE_A','PACKAGE_B','PACKAGE_C') THEN RAISE EXCEPTION 'Unknown package'; END IF;
  IF coalesce(length(trim(_reason)),0) < 5 THEN RAISE EXCEPTION 'A reason of at least 5 characters is required'; END IF;
  IF _overrides IS NULL OR jsonb_typeof(_overrides) <> 'object' THEN _overrides := '{}'::jsonb; END IF;
  SELECT active_package INTO v_prev FROM public.system_subscription_package WHERE id;
  UPDATE public.system_subscription_package
     SET active_package=_package, module_overrides=_overrides, updated_at=now(), updated_by=auth.uid()
   WHERE id;
  INSERT INTO public.system_subscription_package_history(previous_package,new_package,module_overrides,reason,changed_by)
  VALUES (v_prev,_package,_overrides,trim(_reason),auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.system_subscription_package_set(text,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.system_subscription_package_set(text,jsonb,text) TO authenticated;