
CREATE TABLE IF NOT EXISTS public.rule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  rule_key text NOT NULL,
  original_value jsonb,
  overridden_value jsonb,
  reason text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_overrides_entity ON public.rule_overrides(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_rule_overrides_module ON public.rule_overrides(module);
CREATE INDEX IF NOT EXISTS idx_rule_overrides_rule ON public.rule_overrides(rule_key);
CREATE INDEX IF NOT EXISTS idx_rule_overrides_user ON public.rule_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_rule_overrides_created ON public.rule_overrides(created_at DESC);

GRANT SELECT, INSERT ON public.rule_overrides TO authenticated;
GRANT ALL ON public.rule_overrides TO service_role;

ALTER TABLE public.rule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own rule overrides" ON public.rule_overrides;
CREATE POLICY "Users can insert their own rule overrides"
  ON public.rule_overrides FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins and supervisors can read rule overrides" ON public.rule_overrides;
CREATE POLICY "Admins and supervisors can read rule overrides"
  ON public.rule_overrides FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE OR REPLACE FUNCTION public.tg_prevent_rule_override_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rule_overrides is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_rule_override_no_mutation ON public.rule_overrides;
CREATE TRIGGER trg_rule_override_no_mutation
  BEFORE UPDATE OR DELETE ON public.rule_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_rule_override_mutation();

CREATE OR REPLACE FUNCTION public.log_rule_override(
  _module text,
  _entity_type text,
  _entity_id text,
  _rule_key text,
  _original_value jsonb,
  _overridden_value jsonb,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _module IS NULL OR length(btrim(_module)) = 0
     OR _entity_type IS NULL OR length(btrim(_entity_type)) = 0
     OR _entity_id IS NULL OR length(btrim(_entity_id)) = 0
     OR _rule_key IS NULL OR length(btrim(_rule_key)) = 0 THEN
    RAISE EXCEPTION 'module, entity_type, entity_id and rule_key are required';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'override reason must be at least 10 characters';
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user
  ORDER BY
    CASE role::text
      WHEN 'super_admin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'supervisor' THEN 3
      ELSE 9
    END
  LIMIT 1;

  INSERT INTO public.rule_overrides(
    module, entity_type, entity_id, rule_key,
    original_value, overridden_value, reason,
    user_id, user_role, metadata
  ) VALUES (
    btrim(_module), btrim(_entity_type), btrim(_entity_id), btrim(_rule_key),
    _original_value, _overridden_value, btrim(_reason),
    v_user, v_role, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(
    user_id, user_role, action, entity_type, entity_id,
    old_value, new_value, metadata
  ) VALUES (
    v_user, v_role, 'RULE_OVERRIDE', btrim(_entity_type), btrim(_entity_id),
    _original_value, _overridden_value,
    jsonb_build_object(
      'module', btrim(_module),
      'rule_key', btrim(_rule_key),
      'reason', btrim(_reason),
      'override_id', v_id
    ) || COALESCE(_metadata, '{}'::jsonb)
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_rule_override(text,text,text,text,jsonb,jsonb,text,jsonb) TO authenticated;
