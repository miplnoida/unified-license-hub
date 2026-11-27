# Workflow creation fix — approval pack (NOT EXECUTED)

## Root cause (confirmed by live catalogue read, 2026-11-27)
- `public.approval_steps.allowed_actions` is **jsonb** (live `format_type`).
- No type named `workflow_action_type` exists in any schema (pg_type query returned none). It was removed when the column was converted to jsonb in May 2026 migrations.
- `create_approval_workflow_with_steps(jsonb,jsonb)` (SECURITY DEFINER, search_path=public) was last redefined in `20260702044232` and still casts the actions to `workflow_action_type[]`. PL/pgSQL resolves this on first execution, so every call fails with `type "workflow_action_type[]" does not exist`. The workflow INSERT runs before the step INSERT, but the whole call is one transaction, so nothing is left behind.
- Evidence: last `approval_workflows.created_at` = 2026-08-27; 16 workflows, 55 steps, 10 versions exist.

## Existing data shape
All 55 stored steps hold a JSON array of strings (e.g. `["approve","reject","send_back"]`), and that is the shape the fix writes.

## Proposed correction
One line changes. `...::workflow_action_type[]` becomes `v_step->'allowed_actions'`. Signature, SECURITY DEFINER, search_path, owner, the role check (super_admin/admin), validation and every other column stay the same. CREATE OR REPLACE keeps the existing EXECUTE grants (authenticated, service_role: yes; anon: no).

```sql
CREATE OR REPLACE FUNCTION public.create_approval_workflow_with_steps(_workflow jsonb, _steps jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_workflow_id uuid;
  v_step jsonb;
  v_idx int := 0;
  v_step_count int;
  v_role app_role;
  v_approver_role_id uuid;
  v_approver_type text;
  v_approver_config jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role)
    OR public.has_role(v_uid, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient privileges' USING ERRCODE = '42501';
  END IF;

  IF _workflow IS NULL OR jsonb_typeof(_workflow) <> 'object' THEN
    RAISE EXCEPTION 'workflow payload must be a JSON object';
  END IF;
  IF _steps IS NULL OR jsonb_typeof(_steps) <> 'array' THEN
    RAISE EXCEPTION 'steps payload must be a JSON array';
  END IF;
  v_step_count := jsonb_array_length(_steps);
  IF v_step_count = 0 THEN
    RAISE EXCEPTION 'at least one step is required';
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(_steps)
  LOOP
    v_approver_type := COALESCE(NULLIF(v_step->>'approver_type', ''), 'role_based_user');
    IF NULLIF(v_step->>'approver_role', '') IS NULL THEN
      RAISE EXCEPTION 'every step requires approver_role';
    END IF;
    IF v_approver_type <> 'specific_users' AND NULLIF(v_step->>'approver_role_id', '') IS NULL THEN
      RAISE EXCEPTION 'APPROVER_ROLE_ID_REQUIRED: approval steps must reference a configured role (roles.id)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(v_step->>'name', '') IS NULL THEN
      RAISE EXCEPTION 'every step requires a name';
    END IF;
    IF NOT (v_step ? 'allowed_actions')
       OR jsonb_typeof(v_step->'allowed_actions') <> 'array'
       OR jsonb_array_length(v_step->'allowed_actions') = 0 THEN
      RAISE EXCEPTION 'every step requires a non-empty allowed_actions array';
    END IF;
  END LOOP;

  INSERT INTO public.approval_workflows(
    name, description, license_type, entity_type, regulator_id,
    sector_id, sub_sector_id, category_id, service_id, is_active
  ) VALUES (
    _workflow->>'name',
    NULLIF(_workflow->>'description',''),
    _workflow->>'license_type',
    _workflow->>'entity_type',
    NULLIF(_workflow->>'regulator_id','')::uuid,
    NULLIF(_workflow->>'sector_id','')::uuid,
    NULLIF(_workflow->>'sub_sector_id','')::uuid,
    NULLIF(_workflow->>'category_id','')::uuid,
    NULLIF(_workflow->>'service_id','')::uuid,
    COALESCE((_workflow->>'is_active')::boolean, true)
  )
  RETURNING id INTO v_workflow_id;

  FOR v_step IN SELECT * FROM jsonb_array_elements(_steps)
  LOOP
    v_idx := v_idx + 1;
    v_role := (v_step->>'approver_role')::app_role;
    v_approver_type := COALESCE(NULLIF(v_step->>'approver_type', ''), 'role_based_user');
    v_approver_role_id := NULLIF(v_step->>'approver_role_id','')::uuid;
    v_approver_config := COALESCE(v_step->'approver_config', '{}'::jsonb);

    IF v_approver_type <> 'specific_users' AND v_approver_role_id IS NOT NULL THEN
      v_approver_config := jsonb_set(
        COALESCE(NULLIF(v_approver_config, 'null'::jsonb), '{}'::jsonb),
        '{role_ids}',
        jsonb_build_array(v_approver_role_id::text) || COALESCE(
          (
            SELECT jsonb_agg(x)
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(v_approver_config->'role_ids') = 'array' THEN v_approver_config->'role_ids'
                ELSE '[]'::jsonb
              END
            ) AS ids(x)
            WHERE x <> v_approver_role_id::text
              AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id::text = x)
          ),
          '[]'::jsonb
        ),
        true
      );
    END IF;

    INSERT INTO public.approval_steps(
      workflow_id, step_order, name, description,
      approver_role, approver_role_id, approver_type, approver_config,
      step_type, is_required, sla_hours,
      allowed_actions, escalation_role, escalation_after_hours
    ) VALUES (
      v_workflow_id,
      COALESCE((v_step->>'step_order')::int, v_idx),
      v_step->>'name',
      NULLIF(v_step->>'description',''),
      v_role,
      v_approver_role_id,
      v_approver_type,
      v_approver_config,
      COALESCE(NULLIF(v_step->>'step_type',''), 'sequential'),
      COALESCE((v_step->>'is_required')::boolean, true),
      COALESCE((v_step->>'sla_hours')::int, 48),
      v_step->'allowed_actions',
      NULLIF(v_step->>'escalation_role','')::app_role,
      NULLIF(v_step->>'escalation_after_hours','')::int
    );
  END LOOP;

  RETURN jsonb_build_object('workflow_id', v_workflow_id, 'step_count', v_step_count);
END;
$function$;
```

## Rollback (restores current live definition verbatim)
```sql
CREATE OR REPLACE FUNCTION public.create_approval_workflow_with_steps(_workflow jsonb, _steps jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_workflow_id uuid;
  v_step jsonb;
  v_idx int := 0;
  v_step_count int;
  v_role app_role;
  v_approver_role_id uuid;
  v_approver_type text;
  v_approver_config jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role)
    OR public.has_role(v_uid, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient privileges' USING ERRCODE = '42501';
  END IF;

  IF _workflow IS NULL OR jsonb_typeof(_workflow) <> 'object' THEN
    RAISE EXCEPTION 'workflow payload must be a JSON object';
  END IF;
  IF _steps IS NULL OR jsonb_typeof(_steps) <> 'array' THEN
    RAISE EXCEPTION 'steps payload must be a JSON array';
  END IF;
  v_step_count := jsonb_array_length(_steps);
  IF v_step_count = 0 THEN
    RAISE EXCEPTION 'at least one step is required';
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(_steps)
  LOOP
    v_approver_type := COALESCE(NULLIF(v_step->>'approver_type', ''), 'role_based_user');
    IF NULLIF(v_step->>'approver_role', '') IS NULL THEN
      RAISE EXCEPTION 'every step requires approver_role';
    END IF;
    IF v_approver_type <> 'specific_users' AND NULLIF(v_step->>'approver_role_id', '') IS NULL THEN
      RAISE EXCEPTION 'APPROVER_ROLE_ID_REQUIRED: approval steps must reference a configured role (roles.id)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(v_step->>'name', '') IS NULL THEN
      RAISE EXCEPTION 'every step requires a name';
    END IF;
    IF NOT (v_step ? 'allowed_actions')
       OR jsonb_typeof(v_step->'allowed_actions') <> 'array'
       OR jsonb_array_length(v_step->'allowed_actions') = 0 THEN
      RAISE EXCEPTION 'every step requires a non-empty allowed_actions array';
    END IF;
  END LOOP;

  INSERT INTO public.approval_workflows(
    name, description, license_type, entity_type, regulator_id,
    sector_id, sub_sector_id, category_id, service_id, is_active
  ) VALUES (
    _workflow->>'name',
    NULLIF(_workflow->>'description',''),
    _workflow->>'license_type',
    _workflow->>'entity_type',
    NULLIF(_workflow->>'regulator_id','')::uuid,
    NULLIF(_workflow->>'sector_id','')::uuid,
    NULLIF(_workflow->>'sub_sector_id','')::uuid,
    NULLIF(_workflow->>'category_id','')::uuid,
    NULLIF(_workflow->>'service_id','')::uuid,
    COALESCE((_workflow->>'is_active')::boolean, true)
  )
  RETURNING id INTO v_workflow_id;

  FOR v_step IN SELECT * FROM jsonb_array_elements(_steps)
  LOOP
    v_idx := v_idx + 1;
    v_role := (v_step->>'approver_role')::app_role;
    v_approver_type := COALESCE(NULLIF(v_step->>'approver_type', ''), 'role_based_user');
    v_approver_role_id := NULLIF(v_step->>'approver_role_id','')::uuid;
    v_approver_config := COALESCE(v_step->'approver_config', '{}'::jsonb);

    IF v_approver_type <> 'specific_users' AND v_approver_role_id IS NOT NULL THEN
      v_approver_config := jsonb_set(
        COALESCE(NULLIF(v_approver_config, 'null'::jsonb), '{}'::jsonb),
        '{role_ids}',
        jsonb_build_array(v_approver_role_id::text) || COALESCE(
          (
            SELECT jsonb_agg(x)
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(v_approver_config->'role_ids') = 'array' THEN v_approver_config->'role_ids'
                ELSE '[]'::jsonb
              END
            ) AS ids(x)
            WHERE x <> v_approver_role_id::text
              AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id::text = x)
          ),
          '[]'::jsonb
        ),
        true
      );
    END IF;

    INSERT INTO public.approval_steps(
      workflow_id, step_order, name, description,
      approver_role, approver_role_id, approver_type, approver_config,
      step_type, is_required, sla_hours,
      allowed_actions, escalation_role, escalation_after_hours
    ) VALUES (
      v_workflow_id,
      COALESCE((v_step->>'step_order')::int, v_idx),
      v_step->>'name',
      NULLIF(v_step->>'description',''),
      v_role,
      v_approver_role_id,
      v_approver_type,
      v_approver_config,
      COALESCE(NULLIF(v_step->>'step_type',''), 'sequential'),
      COALESCE((v_step->>'is_required')::boolean, true),
      COALESCE((v_step->>'sla_hours')::int, 48),
      ARRAY(SELECT jsonb_array_elements_text(v_step->'allowed_actions'))::workflow_action_type[],
      NULLIF(v_step->>'escalation_role','')::app_role,
      NULLIF(v_step->>'escalation_after_hours','')::int
    );
  END LOOP;

  RETURN jsonb_build_object('workflow_id', v_workflow_id, 'step_count', v_step_count);
END;
$function$;
```

## Impact
- Existing workflows/steps/versions/applications: none. The function only inserts new rows and is never called for existing ones, and existing step rows are not touched.
- Active applications: unaffected. Routing reads existing steps.
- Behaviour change: new workflows can be created again. Action values are no longer checked against an enum (there hasn't been one since the jsonb change), which matches how existing steps are already edited.

## Verification after approval
1. Re-read `pg_get_functiondef` and confirm only the one line differs. Re-check EXECUTE privileges for anon/authenticated/service_role.
2. Negative: a call without admin role returns `insufficient privileges`. A call with empty steps returns the validation error.
3. Browser: Workflows → New for the QA-B1 service. Create a one-step workflow, then edit the step. Publishing is held because it sends notifications.
4. Check the new step's `allowed_actions` is a jsonb array, then set the QA workflow inactive.
5. Run the Vitest workflow tests.
