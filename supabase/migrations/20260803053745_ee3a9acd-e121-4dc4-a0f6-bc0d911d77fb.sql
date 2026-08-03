-- Expand the workflow notification recipient vocabulary so the workflow
-- designer can only offer recipient rules the dispatcher can actually execute.
-- The dispatcher already resolves these rule types; this makes them selectable
-- on approval_action_notifications (which uses the enum).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'workflow_notification_recipient' AND e.enumlabel = 'assigned_officer') THEN
    ALTER TYPE public.workflow_notification_recipient ADD VALUE 'assigned_officer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'workflow_notification_recipient' AND e.enumlabel = 'next_step_role') THEN
    ALTER TYPE public.workflow_notification_recipient ADD VALUE 'next_step_role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'workflow_notification_recipient' AND e.enumlabel = 'supervisor') THEN
    ALTER TYPE public.workflow_notification_recipient ADD VALUE 'supervisor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'workflow_notification_recipient' AND e.enumlabel = 'named_user') THEN
    ALTER TYPE public.workflow_notification_recipient ADD VALUE 'named_user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'workflow_notification_recipient' AND e.enumlabel = 'entity_primary_users') THEN
    ALTER TYPE public.workflow_notification_recipient ADD VALUE 'entity_primary_users';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'workflow_notification_recipient' AND e.enumlabel = 'entity_secondary_users') THEN
    ALTER TYPE public.workflow_notification_recipient ADD VALUE 'entity_secondary_users';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'workflow_notification_recipient' AND e.enumlabel = 'regulator_team') THEN
    ALTER TYPE public.workflow_notification_recipient ADD VALUE 'regulator_team';
  END IF;
END $$;