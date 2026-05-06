
-- 1) Fix roles.system_role default + make it nullable.
ALTER TABLE public.roles ALTER COLUMN system_role DROP DEFAULT;
ALTER TABLE public.roles ALTER COLUMN system_role DROP NOT NULL;

-- 2) Clean custom roles that inherited the bad 'analyst' default.
UPDATE public.roles SET system_role = NULL
 WHERE is_system = false AND system_role = 'analyst';

-- 3) Re-map known built-in roles by name (safe no-op when already correct).
UPDATE public.roles SET system_role='super_admin'       WHERE is_system=true AND lower(name)='super admin';
UPDATE public.roles SET system_role='admin'             WHERE is_system=true AND lower(name)='admin';
UPDATE public.roles SET system_role='supervisor'        WHERE is_system=true AND lower(name)='supervisor';
UPDATE public.roles SET system_role='licensing_officer' WHERE is_system=true AND lower(name) IN ('licensing officer','licensing_officer');
UPDATE public.roles SET system_role='analyst'           WHERE is_system=true AND lower(name)='analyst';
UPDATE public.roles SET system_role='developer'         WHERE is_system=true AND lower(name)='developer';

-- 4) Backfill approval_steps.approver_role_id where a UNIQUE built-in role
--    matches the legacy approver_role enum. Steps with the leaked 'analyst'
--    static role and NO real Analyst role mapping remain NULL → admin must fix.
UPDATE public.approval_steps s
   SET approver_role_id = r.id
  FROM public.roles r
 WHERE s.approver_role_id IS NULL
   AND r.system_role = s.approver_role::text
   AND r.is_system = true
   AND (
     SELECT count(*) FROM public.roles r2
      WHERE r2.system_role = s.approver_role::text
        AND r2.is_system = true
   ) = 1;

-- 5) Validation trigger: new/updated steps MUST carry approver_role_id.
--    Legacy rows with approver_role_id IS NULL stay readable but cannot be re-saved without one.
CREATE OR REPLACE FUNCTION public.validate_approval_step_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role record;
BEGIN
  IF NEW.approver_role_id IS NULL THEN
    RAISE EXCEPTION 'APPROVER_ROLE_ID_REQUIRED: approval steps must reference a configured role (roles.id)'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, name, is_system, system_role INTO v_role
    FROM public.roles WHERE id = NEW.approver_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVER_ROLE_NOT_FOUND: roles.id=% does not exist', NEW.approver_role_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Block the historical leak: a non-system role tagged analyst.
  IF v_role.system_role = 'analyst' AND NOT (v_role.is_system AND lower(v_role.name) = 'analyst') THEN
    RAISE EXCEPTION 'INVALID_ROLE_MAPPING: role "%" has system_role=analyst but is not the built-in Analyst role', v_role.name
      USING ERRCODE = 'check_violation';
  END IF;

  -- Keep legacy approver_role column populated for backward compat.
  IF v_role.system_role IS NOT NULL THEN
    NEW.approver_role := v_role.system_role::public.app_role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_approval_step_role ON public.approval_steps;
CREATE TRIGGER trg_validate_approval_step_role
BEFORE INSERT OR UPDATE ON public.approval_steps
FOR EACH ROW EXECUTE FUNCTION public.validate_approval_step_role();

-- 6) Diagnostic view: list any step still relying on legacy static role.
CREATE OR REPLACE VIEW public.workflow_steps_legacy_role_report AS
SELECT
  w.name           AS workflow_name,
  s.name           AS step_name,
  s.step_order,
  s.approver_role::text AS legacy_approver_role,
  s.approver_role_id,
  r.name           AS resolved_role_name,
  CASE WHEN s.approver_role_id IS NULL THEN 'NEEDS_FIX' ELSE 'OK' END AS status
FROM public.approval_steps s
JOIN public.approval_workflows w ON w.id = s.workflow_id
LEFT JOIN public.roles r ON r.id = s.approver_role_id
ORDER BY status DESC, w.name, s.step_order;
