-- SYSTEM RUNTIME INTEGRITY GATE — realtime contract repair.
--
-- `src/pages/applications/ApplicationDetail.tsx` subscribes to
-- postgres_changes on public.approval_workflows (workflow activation) and
-- public.site_settings (review settings). Neither table was a member of the
-- supabase_realtime publication, so those subscriptions could never fire —
-- a silent runtime contract defect (no error surfaced, the screen simply
-- never refreshed). Registering both tables makes the existing frontend
-- contract real. REPLICA IDENTITY FULL is required for the payloads to carry
-- the filtered columns.

ALTER TABLE public.approval_workflows REPLICA IDENTITY FULL;
ALTER TABLE public.site_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'approval_workflows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_workflows;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'site_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;
  END IF;
END
$$;