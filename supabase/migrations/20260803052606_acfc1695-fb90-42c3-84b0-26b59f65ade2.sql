-- =========================================================
-- Notification template & event configuration foundations
-- =========================================================

-- 1. notification_templates: identity, lifecycle, versioning
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS template_code text,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS severity notification_severity NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_templates_status_chk'
  ) THEN
    ALTER TABLE public.notification_templates
      ADD CONSTRAINT notification_templates_status_chk
      CHECK (status IN ('draft','active','archived'));
  END IF;
END $$;

-- backfill lifecycle + identity from legacy columns
UPDATE public.notification_templates
   SET status = CASE WHEN is_active THEN 'active' ELSE 'draft' END
 WHERE status = 'draft' AND is_active IS TRUE;

UPDATE public.notification_templates
   SET event_key = COALESCE(event_key, event_type)
 WHERE event_key IS NULL;

UPDATE public.notification_templates
   SET module = COALESCE(module, NULLIF(split_part(COALESCE(event_type,''), '.', 1), ''))
 WHERE module IS NULL;

UPDATE public.notification_templates t
   SET template_code = upper(
         regexp_replace(COALESCE(t.event_type, 'TPL'), '[^a-zA-Z0-9]+', '_', 'g')
       ) || '_' || upper(COALESCE(t.channel, 'ALL')) || '_' || substr(replace(t.id::text, '-', ''), 1, 6)
 WHERE t.template_code IS NULL;

UPDATE public.notification_templates
   SET published_version = version
 WHERE status = 'active' AND published_version IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_code_uidx
  ON public.notification_templates (template_code);
CREATE INDEX IF NOT EXISTS notification_templates_event_channel_idx
  ON public.notification_templates (event_key, channel, status);

-- 2. Immutable published version snapshots
CREATE TABLE IF NOT EXISTS public.notification_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.notification_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  template_code text,
  name text,
  module text,
  event_key text,
  channel text,
  severity notification_severity,
  subject text,
  body text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

GRANT SELECT ON public.notification_template_versions TO authenticated;
GRANT ALL ON public.notification_template_versions TO service_role;
ALTER TABLE public.notification_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read template versions" ON public.notification_template_versions;
CREATE POLICY "Staff can read template versions"
  ON public.notification_template_versions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'notification_management', 'view'));

CREATE OR REPLACE FUNCTION public.notification_template_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'template_version_immutable: published notification template versions cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_template_versions_immutable ON public.notification_template_versions;
CREATE TRIGGER trg_notification_template_versions_immutable
  BEFORE UPDATE OR DELETE ON public.notification_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.notification_template_versions_immutable();

-- 3. Per-channel template bindings for events
CREATE TABLE IF NOT EXISTS public.notification_event_channel_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_config_id uuid NOT NULL REFERENCES public.notification_event_configs(id) ON DELETE CASCADE,
  channel text NOT NULL,
  template_id uuid NOT NULL REFERENCES public.notification_templates(id) ON DELETE RESTRICT,
  template_version integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_config_id, channel),
  CHECK (channel IN ('in_app','email','sms'))
);

GRANT SELECT ON public.notification_event_channel_templates TO authenticated;
GRANT ALL ON public.notification_event_channel_templates TO service_role;
ALTER TABLE public.notification_event_channel_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read event channel templates" ON public.notification_event_channel_templates;
CREATE POLICY "Staff can read event channel templates"
  ON public.notification_event_channel_templates FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'notification_management', 'view'));

CREATE OR REPLACE FUNCTION public.touch_notification_event_channel_templates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_event_channel_templates ON public.notification_event_channel_templates;
CREATE TRIGGER trg_touch_event_channel_templates
  BEFORE UPDATE ON public.notification_event_channel_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_notification_event_channel_templates();

-- 4. Event configuration behaviour columns
ALTER TABLE public.notification_event_configs
  ADD COLUMN IF NOT EXISTS category notification_category,
  ADD COLUMN IF NOT EXISTS action_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_frequency text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS failure_escalation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS module text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_event_configs_freq_chk'
  ) THEN
    ALTER TABLE public.notification_event_configs
      ADD CONSTRAINT notification_event_configs_freq_chk
      CHECK (delivery_frequency IN ('immediate','hourly','daily'));
  END IF;
END $$;

UPDATE public.notification_event_configs
   SET module = COALESCE(module, NULLIF(split_part(COALESCE(event_key,''), '.', 1), ''))
 WHERE module IS NULL;

UPDATE public.notification_event_configs
   SET category = CASE
     WHEN severity IN ('critical','high') THEN 'alert'::notification_category
     WHEN system_required THEN 'system'::notification_category
     ELSE 'info'::notification_category END
 WHERE category IS NULL;

-- 5. RBAC actions for notification administration
INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system, audience)
SELECT m.id, v.key, v.label, v.description, v.sort_order, false, 'internal'
FROM public.permission_modules m
CROSS JOIN (VALUES
  ('manage_templates', 'Manage Notification Templates', 'Create, edit, publish and archive notification templates', 30),
  ('manage_events',    'Manage Notification Events',    'Configure notification event keys, channels and recipient rules', 40),
  ('test_send',        'Send Test Notification',        'Send a preview notification to yourself only', 50)
) AS v(key, label, description, sort_order)
WHERE m.key = 'notification_management'
  AND NOT EXISTS (
    SELECT 1 FROM public.permission_actions a
     WHERE a.module_id = m.id AND a.key = v.key
  );