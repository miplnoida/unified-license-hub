-- ============================================================
-- F1-B / GAP-F1-03 — Governed configuration writes + audit
-- ============================================================

-- 1. Change log (append only)
CREATE TABLE IF NOT EXISTS public.config_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('CREATE','UPDATE','RETIRE','REACTIVATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  reason text,
  changed_by uuid,
  changed_by_role text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS config_change_log_table_record_idx
  ON public.config_change_log (table_name, record_id, changed_at DESC);

GRANT SELECT ON public.config_change_log TO authenticated;
GRANT ALL ON public.config_change_log TO service_role;
ALTER TABLE public.config_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_change_log_read" ON public.config_change_log;
CREATE POLICY "config_change_log_read" ON public.config_change_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'settings', 'view')
    OR public.has_permission(auth.uid(), 'fee_management', 'view')
    OR public.has_permission(auth.uid(), 'workflow_management', 'view')
    OR public.has_permission(auth.uid(), 'role_management', 'view')
  );

-- append-only guard
CREATE OR REPLACE FUNCTION public.config_change_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'config_change_log is append-only';
END;
$$;
REVOKE ALL ON FUNCTION public.config_change_log_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS config_change_log_no_update ON public.config_change_log;
CREATE TRIGGER config_change_log_no_update
  BEFORE UPDATE OR DELETE ON public.config_change_log
  FOR EACH ROW EXECUTE FUNCTION public.config_change_log_append_only();

-- 2. Registry of governed configuration tables
CREATE TABLE IF NOT EXISTS public.config_governed_tables (
  table_name text PRIMARY KEY,
  domain text NOT NULL,
  required_module_key text NOT NULL,
  required_create_action text NOT NULL DEFAULT 'create',
  required_edit_action text NOT NULL DEFAULT 'edit',
  soft_delete_column text,
  soft_delete_retired_value text,
  allow_hard_delete boolean NOT NULL DEFAULT false,
  immutable_columns text[] NOT NULL DEFAULT ARRAY['id','created_at','created_by'],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.config_governed_tables TO authenticated;
GRANT ALL ON public.config_governed_tables TO service_role;
ALTER TABLE public.config_governed_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_governed_tables_read" ON public.config_governed_tables;
CREATE POLICY "config_governed_tables_read" ON public.config_governed_tables
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));

INSERT INTO public.config_governed_tables
  (table_name, domain, required_module_key, required_create_action, required_edit_action,
   soft_delete_column, soft_delete_retired_value, allow_hard_delete, notes)
VALUES
  ('sectors','taxonomy','settings','edit','edit','status','inactive',false,'Regulatory sector taxonomy'),
  ('sub_sectors','taxonomy','settings','edit','edit','status','inactive',false,'Sub-sector taxonomy'),
  ('categories','taxonomy','settings','edit','edit','status','inactive',false,'Category taxonomy'),
  ('services','taxonomy','settings','edit','edit','status','inactive',false,'Regulatory service catalogue'),
  ('regulators','organisation','settings','edit','edit','status','inactive',false,'Regulator register'),
  ('master_data_types','master_data','settings','edit','edit','is_active','false',false,'Master data type register'),
  ('master_data_items','master_data','settings','edit','edit','is_active','false',false,'Master data values'),
  ('fee_types','fees','fee_management','create','edit','is_active','false',false,'Fee type catalogue'),
  ('fee_configurations','fees','fee_management','create','edit','is_active','false',false,'Fee amounts by scope'),
  ('fee_rules','fees','fee_management','create','edit','is_active','false',false,'Fee calculation rules'),
  ('sla_configurations','sla','workflow_management','create','manage_config','active','false',false,'Process SLA definitions'),
  ('sla_escalation_tiers','sla','workflow_management','create','manage_config',NULL,NULL,true,'SLA escalation tiers'),
  ('business_calendar_profiles','sla','workflow_management','create','manage_config','is_active','false',false,'Working calendars'),
  ('business_calendar_holidays','sla','workflow_management','create','manage_config',NULL,NULL,true,'Calendar holidays'),
  ('return_configurations','returns','returns_management','create','edit','is_active','false',false,'Return configuration'),
  ('complaint_types','complaints','complaint_type','create','edit','is_active','false',false,'Complaint type catalogue'),
  ('registration_form_configs','forms','form_management','create','edit','is_active','false',false,'Registration form configuration'),
  ('captcha_configurations','security','settings','edit','edit','is_active','false',false,'Captcha provider configuration'),
  ('notification_event_configs','notifications','notification_management','manage_events','manage_events','is_active','false',false,'Notification event configuration'),
  ('decision_authority_rules','authority','role_management','manage_config','manage_config','status','RETIRED',false,'Decision authority policy')
ON CONFLICT (table_name) DO UPDATE SET
  domain = EXCLUDED.domain,
  required_module_key = EXCLUDED.required_module_key,
  required_create_action = EXCLUDED.required_create_action,
  required_edit_action = EXCLUDED.required_edit_action,
  soft_delete_column = EXCLUDED.soft_delete_column,
  soft_delete_retired_value = EXCLUDED.soft_delete_retired_value,
  allow_hard_delete = EXCLUDED.allow_hard_delete,
  notes = EXCLUDED.notes,
  updated_at = now();

-- 3. Authorisation helper for configuration writes
CREATE OR REPLACE FUNCTION public.config_can_write(_table_name text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.config_governed_tables;
  v_uid uuid := auth.uid();
  v_action text;
BEGIN
  IF public.is_trusted_service_request() THEN RETURN true; END IF;
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(v_uid) THEN RETURN true; END IF;

  SELECT * INTO r FROM public.config_governed_tables WHERE table_name = _table_name;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT public.is_internal_staff(v_uid) THEN RETURN false; END IF;

  v_action := CASE WHEN _action = 'CREATE' THEN r.required_create_action ELSE r.required_edit_action END;
  RETURN public.has_permission(v_uid, r.required_module_key, v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.config_can_write(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_can_write(text, text) TO authenticated, service_role;

-- 4. Governed writer: create / update
CREATE OR REPLACE FUNCTION public.config_save(
  _table_name text,
  _payload jsonb,
  _id uuid DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.config_governed_tables;
  v_uid uuid := auth.uid();
  v_action text := CASE WHEN _id IS NULL THEN 'CREATE' ELSE 'UPDATE' END;
  v_payload jsonb := coalesce(_payload, '{}'::jsonb);
  v_cols text[];
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
  v_sql text;
  v_set text;
BEGIN
  SELECT * INTO r FROM public.config_governed_tables WHERE table_name = _table_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'config_table_not_governed: %', _table_name USING ERRCODE = '22023';
  END IF;

  IF NOT public.config_can_write(_table_name, v_action) THEN
    RAISE EXCEPTION 'not_authorised: % requires %.%',
      _table_name, r.required_module_key,
      CASE WHEN v_action = 'CREATE' THEN r.required_create_action ELSE r.required_edit_action END
      USING ERRCODE = '42501';
  END IF;

  -- restrict payload to real, mutable columns of the target table
  SELECT array_agg(c.column_name ORDER BY c.column_name) INTO v_cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = _table_name
    AND c.is_generated = 'NEVER'
    AND NOT (c.column_name = ANY (r.immutable_columns))
    AND v_payload ? c.column_name;

  IF v_cols IS NULL OR array_length(v_cols, 1) = 0 THEN
    RAISE EXCEPTION 'config_payload_empty' USING ERRCODE = '22023';
  END IF;

  IF v_action = 'CREATE' THEN
    v_sql := format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) AS s RETURNING to_jsonb(public.%I.*)',
      _table_name,
      (SELECT string_agg(format('%I', c), ', ') FROM unnest(v_cols) c),
      (SELECT string_agg(format('s.%I', c), ', ') FROM unnest(v_cols) c),
      _table_name, _table_name);
    EXECUTE v_sql USING v_payload INTO v_new;
  ELSE
    EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', _table_name)
      USING _id INTO v_old;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'config_record_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT string_agg(format('%I = s.%I', c, c), ', ') INTO v_set FROM unnest(v_cols) c;
    v_sql := format(
      'UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I, $1) AS s WHERE t.id = $2 RETURNING to_jsonb(t.*)',
      _table_name, v_set, _table_name);
    EXECUTE v_sql USING v_payload, _id INTO v_new;
  END IF;

  v_id := (v_new->>'id')::uuid;

  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES (_table_name, v_id, v_action, v_old, v_new, _reason, v_uid, public.request_role());

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.config_save(text, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_save(text, jsonb, uuid, text) TO authenticated, service_role;

-- 5. Governed retire / reactivate (soft delete)
CREATE OR REPLACE FUNCTION public.config_retire(
  _table_name text,
  _id uuid,
  _reason text DEFAULT NULL,
  _reactivate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.config_governed_tables;
  v_old jsonb; v_new jsonb; v_value text; v_type text;
BEGIN
  SELECT * INTO r FROM public.config_governed_tables WHERE table_name = _table_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'config_table_not_governed: %', _table_name USING ERRCODE = '22023';
  END IF;
  IF r.soft_delete_column IS NULL THEN
    RAISE EXCEPTION 'config_no_soft_delete_column: %', _table_name USING ERRCODE = '22023';
  END IF;
  IF NOT public.config_can_write(_table_name, 'UPDATE') THEN
    RAISE EXCEPTION 'not_authorised: % requires %.%', _table_name, r.required_module_key, r.required_edit_action
      USING ERRCODE = '42501';
  END IF;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', _table_name) USING _id INTO v_old;
  IF v_old IS NULL THEN RAISE EXCEPTION 'config_record_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT data_type INTO v_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name=_table_name AND column_name=r.soft_delete_column;

  IF v_type = 'boolean' THEN
    v_value := CASE WHEN _reactivate THEN 'true' ELSE 'false' END;
  ELSIF _reactivate THEN
    v_value := CASE WHEN r.soft_delete_retired_value = 'RETIRED' THEN 'ACTIVE' ELSE 'active' END;
  ELSE
    v_value := r.soft_delete_retired_value;
  END IF;

  EXECUTE format('UPDATE public.%I t SET %I = $1::%s WHERE t.id = $2 RETURNING to_jsonb(t.*)',
                 _table_name, r.soft_delete_column,
                 (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
                   WHERE a.attrelid = format('public.%I', _table_name)::regclass
                     AND a.attname = r.soft_delete_column))
    USING v_value, _id INTO v_new;

  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES (_table_name, _id, CASE WHEN _reactivate THEN 'REACTIVATE' ELSE 'RETIRE' END,
          v_old, v_new, _reason, auth.uid(), public.request_role());

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.config_retire(text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_retire(text, uuid, text, boolean) TO authenticated, service_role;

-- 6. Governed hard delete (only where the registry allows it)
CREATE OR REPLACE FUNCTION public.config_delete(
  _table_name text,
  _id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.config_governed_tables;
  v_old jsonb;
BEGIN
  SELECT * INTO r FROM public.config_governed_tables WHERE table_name = _table_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'config_table_not_governed: %', _table_name USING ERRCODE = '22023';
  END IF;
  IF NOT public.config_can_write(_table_name, 'UPDATE') THEN
    RAISE EXCEPTION 'not_authorised: % requires %.%', _table_name, r.required_module_key, r.required_edit_action
      USING ERRCODE = '42501';
  END IF;
  IF NOT r.allow_hard_delete THEN
    RAISE EXCEPTION 'config_hard_delete_forbidden: % must be retired instead', _table_name USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1', _table_name) USING _id INTO v_old;
  IF v_old IS NULL THEN RAISE EXCEPTION 'config_record_not_found' USING ERRCODE = 'P0002'; END IF;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _table_name) USING _id;

  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES (_table_name, _id, 'DELETE', v_old, NULL, _reason, auth.uid(), public.request_role());

  RETURN v_old;
END;
$$;

REVOKE ALL ON FUNCTION public.config_delete(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_delete(text, uuid, text) TO authenticated, service_role;

-- 7. Read the audit history of a configuration record
CREATE OR REPLACE FUNCTION public.config_change_history(_table_name text, _record_id uuid DEFAULT NULL, _limit integer DEFAULT 100)
RETURNS SETOF public.config_change_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.* FROM public.config_change_log l
   WHERE l.table_name = _table_name
     AND (_record_id IS NULL OR l.record_id = _record_id)
     AND (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()))
   ORDER BY l.changed_at DESC
   LIMIT least(coalesce(_limit, 100), 500);
$$;

REVOKE ALL ON FUNCTION public.config_change_history(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.config_change_history(text, uuid, integer) TO authenticated, service_role;

-- 8. GAP-F1-08 — the permission the decision-authority writer demands must exist
INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system, audience, is_active)
SELECT m.id, 'manage_config', 'Manage Configuration',
       'Configure decision authority and role configuration policy', 90, true, m.audience, true
FROM public.permission_modules m
WHERE m.key = 'role_management'
  AND NOT EXISTS (
    SELECT 1 FROM public.permission_actions a WHERE a.module_id = m.id AND a.key = 'manage_config');

INSERT INTO public.permissions (name, module, description, action_id, enforced)
SELECT 'role_management.manage_config', 'role_management',
       'Configure decision authority rules', a.id, true
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key = 'role_management' AND a.key = 'manage_config'
  AND NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.name = 'role_management.manage_config');
