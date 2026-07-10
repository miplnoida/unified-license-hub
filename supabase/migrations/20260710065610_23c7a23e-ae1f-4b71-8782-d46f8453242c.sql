
CREATE OR REPLACE FUNCTION public.start_complaint_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_step_role text;
  v_step_approver_type text;
  v_step_config jsonb;
  v_instance_id uuid;
  v_user_ids uuid[];
  v_uid uuid;
BEGIN
  SELECT w.id INTO v_workflow_id
  FROM public.approval_workflows w
  WHERE w.entity_type = 'complaint'
    AND w.is_active = true
    AND (NEW.regulator_id IS NULL OR w.regulator_id IS NULL OR w.regulator_id = NEW.regulator_id)
  ORDER BY
    (w.regulator_id IS NOT NULL AND w.regulator_id = NEW.regulator_id)::int DESC,
    (w.regulator_id IS NOT NULL)::int DESC,
    w.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_workflow_id IS NOT NULL THEN
    SELECT s.id, s.approver_role, s.approver_type, s.approver_config
      INTO v_first_step_id, v_step_role, v_step_approver_type, v_step_config
    FROM public.approval_steps s
    WHERE s.workflow_id = v_workflow_id
    ORDER BY s.step_order ASC
    LIMIT 1;

    IF v_first_step_id IS NOT NULL THEN
      INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status, started_at)
      VALUES (v_workflow_id, 'complaint', NEW.id, v_first_step_id, 'active', now())
      RETURNING id INTO v_instance_id;

      -- Resolve assignees
      IF v_step_approver_type = 'specific_users' THEN
        SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step_config->'user_ids','[]'::jsonb))::uuid)
          INTO v_user_ids;
      ELSE
        SELECT ARRAY(
          SELECT DISTINCT ur.user_id
          FROM public.user_roles ur
          WHERE ur.role::text = v_step_role
        ) INTO v_user_ids;
      END IF;

      IF v_step_role IS NOT NULL THEN
        UPDATE public.complaints SET assigned_team = v_step_role WHERE id = NEW.id;
      END IF;

      IF v_user_ids IS NOT NULL THEN
        FOREACH v_uid IN ARRAY v_user_ids LOOP
          INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id, channel, delivery_status)
          VALUES (
            v_uid,
            'Complaint ' || NEW.complaint_number || ' assigned',
            'Complaint "' || NEW.subject || '" is assigned to you. SLA due ' || COALESCE(to_char(NEW.sla_due_at,'YYYY-MM-DD HH24:MI'),'—'),
            'complaint.assigned', 'complaint', NEW.id::text, 'in_app', 'delivered'
          );
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF NEW.complainant_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id, channel, delivery_status)
    VALUES (
      NEW.complainant_id,
      'Complaint ' || NEW.complaint_number || ' received',
      'Your complaint "' || NEW.subject || '" was received. SLA due ' || COALESCE(to_char(NEW.sla_due_at,'YYYY-MM-DD HH24:MI'),'—'),
      'complaint.filed', 'complaint', NEW.id::text, 'in_app', 'delivered'
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'start_complaint_workflow error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Backfill: create workflow instances for complaints missing one
DO $$
DECLARE
  r record;
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_step_role text;
  v_step_approver_type text;
  v_step_config jsonb;
  v_user_ids uuid[];
  v_uid uuid;
BEGIN
  FOR r IN
    SELECT c.* FROM public.complaints c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workflow_instances wi
      WHERE wi.entity_type='complaint' AND wi.entity_id=c.id AND wi.status IN ('active','paused')
    )
  LOOP
    SELECT w.id INTO v_workflow_id
    FROM public.approval_workflows w
    WHERE w.entity_type = 'complaint' AND w.is_active
      AND (r.regulator_id IS NULL OR w.regulator_id IS NULL OR w.regulator_id = r.regulator_id)
    ORDER BY (w.regulator_id IS NOT NULL AND w.regulator_id = r.regulator_id)::int DESC,
             (w.regulator_id IS NOT NULL)::int DESC,
             w.updated_at DESC NULLS LAST
    LIMIT 1;
    IF v_workflow_id IS NULL THEN CONTINUE; END IF;

    SELECT s.id, s.approver_role, s.approver_type, s.approver_config
      INTO v_first_step_id, v_step_role, v_step_approver_type, v_step_config
    FROM public.approval_steps s
    WHERE s.workflow_id = v_workflow_id
    ORDER BY s.step_order ASC LIMIT 1;
    IF v_first_step_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status, started_at)
    VALUES (v_workflow_id, 'complaint', r.id, v_first_step_id, 'active', now());

    IF v_step_approver_type = 'specific_users' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step_config->'user_ids','[]'::jsonb))::uuid)
        INTO v_user_ids;
    ELSE
      SELECT ARRAY(SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role::text = v_step_role)
        INTO v_user_ids;
    END IF;

    IF v_step_role IS NOT NULL THEN
      UPDATE public.complaints SET assigned_team = v_step_role WHERE id = r.id;
    END IF;

    IF v_user_ids IS NOT NULL THEN
      FOREACH v_uid IN ARRAY v_user_ids LOOP
        INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id, channel, delivery_status)
        VALUES (
          v_uid,
          'Complaint ' || r.complaint_number || ' assigned',
          'Complaint "' || r.subject || '" is assigned to you.',
          'complaint.assigned', 'complaint', r.id::text, 'in_app', 'delivered'
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;
