-- Slice 1: Unified permission-dependency source
--
-- Replaces the hard-coded IN (...) list inside public.permission_has_dependency
-- with a table-driven lookup. TypeScript and SQL now share one authoritative
-- source. A `sync` script (scripts/sync-permission-dependencies.ts) rewrites
-- the TS fallback constant from this table.

CREATE TABLE IF NOT EXISTS public.permission_dependent_actions (
  action      text PRIMARY KEY,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.permission_dependent_actions TO anon, authenticated;
GRANT ALL    ON public.permission_dependent_actions TO service_role;

ALTER TABLE public.permission_dependent_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pda_read_all"    ON public.permission_dependent_actions;
DROP POLICY IF EXISTS "pda_service_all" ON public.permission_dependent_actions;

CREATE POLICY "pda_read_all"
  ON public.permission_dependent_actions
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "pda_service_all"
  ON public.permission_dependent_actions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed the canonical list. `edit / update / create / delete / approve / reject
-- / export / download / upload / import / publish / archive / restore / assign
-- / reassign / bulk / bulk_update / bulk_delete / configure / status_change /
-- workflow_action / dispatch / execute / close / reopen / resolve / escalate /
-- issue / revoke / suspend / renew`.
INSERT INTO public.permission_dependent_actions (action) VALUES
  ('edit'), ('update'), ('create'), ('delete'),
  ('approve'), ('reject'),
  ('export'), ('download'), ('upload'), ('import'),
  ('publish'), ('archive'), ('restore'),
  ('assign'), ('reassign'),
  ('bulk'), ('bulk_update'), ('bulk_delete'),
  ('configure'), ('status_change'), ('workflow_action'),
  ('dispatch'), ('execute'),
  ('close'), ('reopen'), ('resolve'), ('escalate'),
  ('issue'), ('revoke'), ('suspend'), ('renew')
ON CONFLICT (action) DO NOTHING;

-- Rewrite permission_has_dependency to consult the table.
CREATE OR REPLACE FUNCTION public.permission_has_dependency(_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.permission_dependent_actions
    WHERE action = lower(coalesce(_action, ''))
  );
$$;

GRANT EXECUTE ON FUNCTION public.permission_has_dependency(text)
  TO anon, authenticated, service_role;

-- Keep-in-sync helper: exposes the current list to app code that needs it
-- without joining the table directly.
CREATE OR REPLACE FUNCTION public.list_permission_dependent_actions()
RETURNS SETOF text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT action FROM public.permission_dependent_actions ORDER BY action;
$$;

GRANT EXECUTE ON FUNCTION public.list_permission_dependent_actions()
  TO anon, authenticated, service_role;

-- Timestamp trigger.
CREATE OR REPLACE FUNCTION public.tg_pda_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pda_touch_updated_at ON public.permission_dependent_actions;
CREATE TRIGGER pda_touch_updated_at
  BEFORE UPDATE ON public.permission_dependent_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_pda_touch_updated_at();

-- ROLLBACK plan (manual):
--   DROP FUNCTION IF EXISTS public.list_permission_dependent_actions();
--   DROP TABLE  IF EXISTS public.permission_dependent_actions;
--   Then re-run 20260721080127_*.sql section (2) to restore the inline
--   `IN (...)` version of permission_has_dependency.