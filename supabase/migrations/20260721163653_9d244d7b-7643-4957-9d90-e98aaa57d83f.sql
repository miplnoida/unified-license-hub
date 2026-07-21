-- Business-friendly metadata for the Roles module.
-- Purely additive: no existing column, policy, trigger, or permission is changed.

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS role_category text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS access_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scope_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Constrain status to a small allow-list; category is free-form suggestion.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roles_status_check'
  ) THEN
    ALTER TABLE public.roles
      ADD CONSTRAINT roles_status_check
      CHECK (status IN ('active', 'inactive'));
  END IF;
END$$;

-- Migration audit log (super_admin visibility only)
CREATE TABLE IF NOT EXISTS public.role_migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  classified_category text,
  matched_template text,
  is_custom boolean NOT NULL DEFAULT false,
  custom_reason text,
  per_module_levels jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensitive_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.role_migration_log TO authenticated;
GRANT ALL ON public.role_migration_log TO service_role;

ALTER TABLE public.role_migration_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_migration_log_super_admin_read" ON public.role_migration_log;
CREATE POLICY "role_migration_log_super_admin_read"
  ON public.role_migration_log
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "role_migration_log_super_admin_write" ON public.role_migration_log;
CREATE POLICY "role_migration_log_super_admin_write"
  ON public.role_migration_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Backfill: default every existing role to active. Categories are filled by
-- the UI classification job (super_admin only).
UPDATE public.roles SET status = 'active' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_roles_role_category ON public.roles(role_category);
CREATE INDEX IF NOT EXISTS idx_role_migration_log_role ON public.role_migration_log(role_id);