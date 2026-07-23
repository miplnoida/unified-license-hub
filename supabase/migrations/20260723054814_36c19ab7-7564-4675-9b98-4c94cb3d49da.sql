
INSERT INTO public.rbac_module_scopes (module, scope, label)
SELECT DISTINCT lower(regexp_replace(p.module,'\s+','_','g')) AS mkey,
       'all',
       'All records'
FROM public.permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM public.rbac_module_scopes s
  WHERE s.module = lower(regexp_replace(p.module,'\s+','_','g'))
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_module_scope_all()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mkey text := lower(regexp_replace(NEW.module,'\s+','_','g'));
BEGIN
  INSERT INTO public.rbac_module_scopes (module, scope, label)
  VALUES (mkey, 'all', 'All records')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permissions_ensure_module_scope ON public.permissions;
CREATE TRIGGER trg_permissions_ensure_module_scope
AFTER INSERT ON public.permissions
FOR EACH ROW EXECUTE FUNCTION public.ensure_module_scope_all();
