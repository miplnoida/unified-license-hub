
-- 1. Add new enum value for Legal/Compliance
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'legal_compliance';

-- 2. Dedupe + canonicalize Legal/Compliance Reviewer role
DO $$
DECLARE
  v_canonical_id uuid;
BEGIN
  -- Pick the canonical row (prefer the no-space name), or create one.
  SELECT id INTO v_canonical_id
  FROM public.roles
  WHERE name = 'Legal/Compliance Reviewer'
  LIMIT 1;

  IF v_canonical_id IS NULL THEN
    SELECT id INTO v_canonical_id
    FROM public.roles
    WHERE name = 'Legal / Compliance Reviewer'
    LIMIT 1;
  END IF;

  IF v_canonical_id IS NULL THEN
    INSERT INTO public.roles (name, description, system_role, is_system, role_type)
    VALUES ('Legal/Compliance Reviewer',
            'Reviews applications for legal and regulatory compliance.',
            'legal_compliance', true, 'internal')
    RETURNING id INTO v_canonical_id;
  ELSE
    UPDATE public.roles
       SET name = 'Legal/Compliance Reviewer',
           system_role = 'legal_compliance',
           is_system = true,
           role_type = 'internal',
           updated_at = now()
     WHERE id = v_canonical_id;
  END IF;

  -- Repoint any references from duplicate rows to the canonical id.
  UPDATE public.user_dynamic_roles udr
     SET role_id = v_canonical_id
   WHERE role_id IN (
     SELECT id FROM public.roles
      WHERE id <> v_canonical_id
        AND name IN ('Legal/Compliance Reviewer','Legal / Compliance Reviewer')
   );

  UPDATE public.approval_steps s
     SET approver_role_id = v_canonical_id
   WHERE approver_role_id IN (
     SELECT id FROM public.roles
      WHERE id <> v_canonical_id
        AND name IN ('Legal/Compliance Reviewer','Legal / Compliance Reviewer')
   );

  -- Clean up role_permissions for duplicates before delete.
  DELETE FROM public.role_permissions
   WHERE role_id IN (
     SELECT id FROM public.roles
      WHERE id <> v_canonical_id
        AND name IN ('Legal/Compliance Reviewer','Legal / Compliance Reviewer')
   );

  DELETE FROM public.roles
   WHERE id <> v_canonical_id
     AND name IN ('Legal/Compliance Reviewer','Legal / Compliance Reviewer');
END $$;

-- 3. Update is_legal_compliance_user to match by system_role (robust to renames)
CREATE OR REPLACE FUNCTION public.is_legal_compliance_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id
    WHERE udr.user_id = _user_id
      AND (r.system_role = 'legal_compliance'
           OR r.name IN ('Legal/Compliance Reviewer','Legal / Compliance Reviewer'))
  )
$function$;
