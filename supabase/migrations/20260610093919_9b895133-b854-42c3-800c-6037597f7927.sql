CREATE TABLE IF NOT EXISTS public.approval_workflow_types (
  key text PRIMARY KEY,
  display_label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.approval_workflow_types TO authenticated;
GRANT ALL ON public.approval_workflow_types TO service_role;

ALTER TABLE public.approval_workflow_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users read workflow type config" ON public.approval_workflow_types;
CREATE POLICY "Internal users read workflow type config"
ON public.approval_workflow_types
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'licensing_officer')
  OR public.has_role(auth.uid(), 'analyst')
);

DROP POLICY IF EXISTS "Admins manage workflow type config" ON public.approval_workflow_types;
CREATE POLICY "Admins manage workflow type config"
ON public.approval_workflow_types
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

DROP TRIGGER IF EXISTS trg_approval_workflow_types_updated_at ON public.approval_workflow_types;
CREATE TRIGGER trg_approval_workflow_types_updated_at
BEFORE UPDATE ON public.approval_workflow_types
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.approval_workflow_types (key, display_label, description, is_active, sort_order)
VALUES
  ('registration', 'Registration', 'Approval workflow used for registration reviews.', true, 10),
  ('pre_application', 'Pre Application', 'Approval workflow used for pre-license applications.', true, 20),
  ('post_application', 'Post Application', 'Approval workflow used for post-license applications.', true, 30),
  ('complaint', 'Complaint', 'Approval workflow used for complaint handling.', true, 40),
  ('inspection', 'Inspection', 'Approval workflow used for inspection handling.', true, 50),
  ('return', 'Compliance Return', 'Approval workflow used for compliance returns.', true, 60)
ON CONFLICT (key) DO UPDATE
SET display_label = EXCLUDED.display_label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

UPDATE public.approval_workflows
SET entity_type = 'pre_application',
    updated_at = now()
WHERE entity_type = 'application';

ALTER TABLE public.approval_workflows
ALTER COLUMN entity_type DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'approval_workflows_entity_type_fkey'
      AND conrelid = 'public.approval_workflows'::regclass
  ) THEN
    ALTER TABLE public.approval_workflows
      ADD CONSTRAINT approval_workflows_entity_type_fkey
      FOREIGN KEY (entity_type)
      REFERENCES public.approval_workflow_types(key);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_approval_workflow_entity_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type record;
BEGIN
  SELECT key, is_active
    INTO v_type
    FROM public.approval_workflow_types
   WHERE key = NEW.entity_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown approval workflow type: %', NEW.entity_type
      USING ERRCODE = '23503';
  END IF;

  IF NEW.is_active AND NOT v_type.is_active THEN
    RAISE EXCEPTION 'Approval workflow type "%" is inactive and cannot be assigned to an active workflow', NEW.entity_type
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_approval_workflow_entity_type ON public.approval_workflows;
CREATE TRIGGER trg_validate_approval_workflow_entity_type
BEFORE INSERT OR UPDATE OF entity_type, is_active
ON public.approval_workflows
FOR EACH ROW EXECUTE FUNCTION public.validate_approval_workflow_entity_type();

DROP INDEX IF EXISTS public.approval_workflows_uniq_reg_sector_entity;
DROP INDEX IF EXISTS public.approval_workflows_unique_scope_used_for;
CREATE UNIQUE INDEX approval_workflows_unique_scope_used_for
ON public.approval_workflows (
  coalesce(regulator_id::text, '__global__'),
  coalesce(sector_id::text, '__all_sectors__'),
  entity_type
)
WHERE is_active = true;

COMMENT ON INDEX public.approval_workflows_unique_scope_used_for IS
  'Prevents duplicate active approval workflows for the same regulator scope, sector scope, and workflow type, including global and all-sector workflows.';