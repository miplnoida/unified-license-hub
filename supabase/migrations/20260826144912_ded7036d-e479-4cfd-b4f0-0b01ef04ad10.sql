-- MC-08 certification defect: the AI Governance area is gated behind
-- ai_management rights, but the module only carried 'view' and 'execute'
-- permissions and almost no role held them. Without this, no supervisor could
-- reach the control plane and no governed transition could be approved.

DO $$
DECLARE _module uuid;
BEGIN
  SELECT id INTO _module FROM public.sec_modules WHERE key = 'ai_management';
  IF _module IS NULL THEN
    RAISE EXCEPTION 'ai_management module missing';
  END IF;

  INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
  VALUES
    (_module, 'create',  'Register AI configuration', 'Register AI use cases, models and instruction versions in draft.', 30, true, true, true, true),
    (_module, 'edit',    'Maintain AI configuration', 'Maintain draft AI use cases, models and instruction versions.',    40, true, true, true, true),
    (_module, 'approve', 'Approve and stop AI use',   'Approve AI configuration for production and operate stop controls.', 50, true, true, true, true),
    (_module, 'assure',  'Conduct AI assurance',      'Open and conclude supervisory assurance reviews of AI usage.',      60, true, true, true, true)
  ON CONFLICT DO NOTHING;
END $$;

-- Grant the rights to the roles that own AI governance in the operating model.
WITH matrix(role_key, perm_key) AS (
  VALUES
    ('system_administrator','view'),('system_administrator','execute'),('system_administrator','create'),
    ('system_administrator','edit'),('system_administrator','approve'),('system_administrator','assure'),
    ('executive_management','view'),('executive_management','assure'),
    ('conduct_supervisor','view'),('conduct_supervisor','execute'),('conduct_supervisor','create'),
    ('conduct_supervisor','edit'),('conduct_supervisor','approve'),
    ('prudential_supervisor','view'),('prudential_supervisor','execute'),('prudential_supervisor','create'),
    ('prudential_supervisor','edit'),('prudential_supervisor','approve'),
    ('complaints_supervisor','view'),('complaints_supervisor','execute'),
    ('enforcement_supervisor','view'),('enforcement_supervisor','execute'),
    ('conduct_analyst','view'),('conduct_analyst','execute'),
    ('prudential_analyst','view'),('prudential_analyst','execute'),
    ('regulatory_analyst','view'),('regulatory_analyst','execute'),
    ('complaints_officer','view'),('complaints_officer','execute'),
    ('inspector','view'),('inspector','execute'),
    ('legal_counsel','view'),
    ('security_administrator','view'),
    ('read_only','view'),
    ('auditor','view'),('auditor','assure')
)
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN public.sec_roles r ON r.key = m.role_key
JOIN public.sec_permissions p ON p.key = m.perm_key
JOIN public.sec_modules mo ON mo.id = p.module_id AND mo.key = 'ai_management'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sec_role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
);