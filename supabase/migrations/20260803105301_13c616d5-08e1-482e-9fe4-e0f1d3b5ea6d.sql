-- 1. Dispatch traceability -----------------------------------------------
ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS template_traceability_status text;

UPDATE public.notification_dispatch_log
   SET template_traceability_status = CASE
         WHEN template_id IS NOT NULL AND template_version IS NOT NULL THEN 'versioned'
         ELSE 'legacy_unversioned'
       END
 WHERE template_traceability_status IS NULL;

ALTER TABLE public.notification_dispatch_log
  ADD CONSTRAINT notification_dispatch_log_traceability_chk
  CHECK (template_traceability_status IN ('versioned', 'legacy_unversioned'));

CREATE OR REPLACE FUNCTION public.notification_dispatch_traceability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.template_traceability_status := CASE
    WHEN NEW.template_id IS NOT NULL AND NEW.template_version IS NOT NULL THEN 'versioned'
    ELSE 'legacy_unversioned'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_dispatch_traceability ON public.notification_dispatch_log;
CREATE TRIGGER trg_notification_dispatch_traceability
BEFORE INSERT OR UPDATE OF template_id, template_version
ON public.notification_dispatch_log
FOR EACH ROW EXECUTE FUNCTION public.notification_dispatch_traceability();

-- 2. Canonical source route resolver -------------------------------------
CREATE OR REPLACE FUNCTION public.notification_source_route(
  _entity_type text,
  _entity_id text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _entity_type IS NULL OR coalesce(_entity_id, '') = '' THEN NULL
    WHEN _entity_id !~ '^[A-Za-z0-9._-]+$' THEN NULL
    ELSE (
      SELECT CASE lower(_entity_type)
        WHEN 'application'            THEN '/applications/'   || _entity_id
        WHEN 'applications'           THEN '/applications/'   || _entity_id
        WHEN 'registration'           THEN '/admin/registrations/' || _entity_id
        WHEN 'license'                THEN '/licenses/'       || _entity_id
        WHEN 'licensee'               THEN '/admin/licensees/' || _entity_id
        WHEN 'license_appeal'         THEN '/admin/license-appeals?appeal=' || _entity_id
        WHEN 'return'                 THEN '/returns-mgmt/'   || _entity_id
        WHEN 'return_filed'           THEN '/returns-mgmt/'   || _entity_id
        WHEN 'returns_filed'          THEN '/returns-mgmt/'   || _entity_id
        WHEN 'compliance_return'      THEN '/compliance/'     || _entity_id
        WHEN 'complaint'              THEN '/complaints/'     || _entity_id
        WHEN 'correspondence'         THEN '/correspondence/manager?thread=' || _entity_id
        WHEN 'correspondence_thread'  THEN '/correspondence/manager?thread=' || _entity_id
        WHEN 'escalation'             THEN '/escalations?escalation=' || _entity_id
        WHEN 'fp_individual'          THEN '/fit-and-proper/individuals/' || _entity_id
        WHEN 'fp_assessment'          THEN '/fit-and-proper/assessments/' || _entity_id
        WHEN 'prudential_assessment'  THEN '/prudential/assessments/' || _entity_id
        WHEN 'enforcement_action'     THEN '/enforcement/'    || _entity_id
        WHEN 'inspection'             THEN '/inspections/'    || _entity_id
        WHEN 'payment'                THEN '/payments/'       || _entity_id
        WHEN 'report'                 THEN '/reports/'        || _entity_id
        WHEN 'form_template'          THEN '/admin/forms/'    || _entity_id
        ELSE NULL
      END
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.notification_source_route(text, text) TO authenticated, service_role;

-- 3. Notification route status -------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS route_status text;

UPDATE public.notifications n
   SET route_status = CASE
         WHEN coalesce(n.source_route, '') <> '' THEN 'resolved'
         WHEN public.notification_source_route(n.entity_type, n.entity_id) IS NOT NULL
           THEN 'resolvable_legacy'
         ELSE 'legacy_no_route'
       END
 WHERE n.route_status IS NULL;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_route_status_chk
  CHECK (route_status IS NULL OR route_status IN ('resolved', 'resolvable_legacy', 'legacy_no_route'));

CREATE OR REPLACE FUNCTION public.notification_route_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.source_route, '') = '' THEN
    NEW.source_route := public.notification_source_route(NEW.entity_type, NEW.entity_id);
  END IF;
  NEW.route_status := CASE
    WHEN coalesce(NEW.source_route, '') <> '' THEN 'resolved'
    ELSE 'legacy_no_route'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_route_status ON public.notifications;
CREATE TRIGGER trg_notification_route_status
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notification_route_status();

-- 4. Template placeholder contract ---------------------------------------
CREATE OR REPLACE FUNCTION public.notification_global_template_tokens()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'app_name', 'portal_name', 'support_email', 'cta_url', 'cta_label',
    'recipient_name', 'recipient_email', 'actor_name', 'actor_role',
    'entity_name', 'entity_type', 'entity_id', 'reference', 'source_reference',
    'status', 'previous_status', 'new_status', 'due_date', 'deadline',
    'comment', 'comments', 'remarks', 'reason', 'link', 'url', 'date', 'now',
    'step_name', 'previous_step_name', 'next_step_name', 'workflow_name',
    'severity', 'module', 'event_key', 'tier', 'sla_status'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.notification_template_placeholders(_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[])
  FROM regexp_matches(coalesce(_text, ''), '\{\{\s*([\w.]+)\s*\}\}', 'g') AS m;
$$;

CREATE OR REPLACE FUNCTION public.notification_template_placeholder_check(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.notification_templates;
  used text[];
  declared text[];
  unsupported text[];
BEGIN
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id;
  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  used := public.notification_template_placeholders(coalesce(t.subject, '') || ' ' || coalesce(t.body, ''));
  SELECT coalesce(array_agg(v), ARRAY[]::text[]) INTO declared
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(coalesce(t.variables, '[]'::jsonb)) = 'array'
           THEN t.variables ELSE '[]'::jsonb END
    ) AS v;

  SELECT coalesce(array_agg(u), ARRAY[]::text[]) INTO unsupported
    FROM unnest(used) AS u
   WHERE NOT (u = ANY(declared))
     AND NOT (u = ANY(public.notification_global_template_tokens()));

  RETURN jsonb_build_object(
    'ok', coalesce(array_length(unsupported, 1), 0) = 0,
    'template_id', t.id,
    'used', to_jsonb(used),
    'declared', to_jsonb(declared),
    'unsupported', to_jsonb(unsupported)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notification_template_placeholder_check(uuid) TO authenticated, service_role;

-- 5. Enforce the contract at publish time --------------------------------
CREATE OR REPLACE FUNCTION public.notification_template_publish(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.notification_templates;
  next_version integer;
  chk jsonb;
BEGIN
  PERFORM public.notification_admin_guard('manage_templates');
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;
  IF COALESCE(t.subject, '') = '' AND t.channel <> 'in_app' THEN RAISE EXCEPTION 'subject_required'; END IF;
  IF COALESCE(t.body, '') = '' THEN RAISE EXCEPTION 'body_required'; END IF;

  -- Placeholder contract: refuse to publish wording that uses tokens the
  -- template does not declare and that are not standard system tokens.
  chk := public.notification_template_placeholder_check(t.id);
  IF NOT (chk->>'ok')::boolean THEN
    RAISE EXCEPTION 'unsupported_placeholder: %', chk->>'unsupported';
  END IF;

  -- Refuse wording that renders to nothing once tokens are stripped.
  IF t.channel <> 'in_app'
     AND btrim(regexp_replace(COALESCE(t.subject, ''), '\{\{[^}]*\}\}', '', 'g')) = '' THEN
    RAISE EXCEPTION 'subject_renders_blank';
  END IF;
  IF btrim(regexp_replace(COALESCE(t.body, ''), '\{\{[^}]*\}\}', '', 'g')) = '' THEN
    RAISE EXCEPTION 'body_renders_blank';
  END IF;

  next_version := COALESCE(t.published_version, 0) + 1;

  INSERT INTO public.notification_template_versions (
    template_id, version, template_code, name, module, event_key, channel, severity,
    subject, body, variables, content_hash, published_by
  ) VALUES (
    t.id, next_version, t.template_code, t.name, t.module, t.event_key, t.channel, t.severity,
    t.subject, t.body, COALESCE(t.variables, '[]'::jsonb),
    md5(COALESCE(t.subject,'') || '|' || COALESCE(t.body,'')), auth.uid()
  );

  UPDATE public.notification_templates
     SET status = 'active', is_active = true, version = next_version,
         published_version = next_version, archived_at = NULL,
         updated_by = auth.uid(), updated_at = now()
   WHERE id = t.id;

  PERFORM public.notification_admin_audit('notification_template_published', 'notification_template', t.id::text,
    NULL, jsonb_build_object('version', next_version, 'template_code', t.template_code));

  RETURN jsonb_build_object('template_id', t.id, 'version', next_version, 'status', 'active');
END;
$$;