CREATE OR REPLACE FUNCTION public.trg_application_rfi_open_sets_info_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'open' THEN
    RETURN NEW;
  END IF;

  SELECT a.status INTO v_status FROM public.applications a WHERE a.id = NEW.application_id;
  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status = ANY (ARRAY['submitted','under_review','clarification_requested']) THEN
    PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

    UPDATE public.applications a
       SET status = 'info_requested',
           data = coalesce(a.data, '{}'::jsonb) || jsonb_build_object('pre_rfi_status', v_status),
           updated_at = now()
     WHERE a.id = NEW.application_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (NEW.raised_by, 'application.info_requested', 'application', NEW.application_id::text,
            jsonb_build_object('status', v_status),
            jsonb_build_object('status', 'info_requested'),
            jsonb_build_object('rfi_id', NEW.id, 'summary', NEW.summary));
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_application_rfi_closed_restores_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open int;
  v_status text;
  v_prev text;
BEGIN
  IF NEW.status = 'open' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_step_action_id IS NOT NULL THEN
    UPDATE public.approval_step_actions
       SET resumed_at = now()
     WHERE id = NEW.approval_step_action_id
       AND paused_at IS NOT NULL
       AND resumed_at IS NULL;
  END IF;

  SELECT count(*) INTO v_open
    FROM public.application_rfis r
   WHERE r.application_id = NEW.application_id
     AND r.status = 'open';
  IF v_open > 0 THEN
    RETURN NEW;
  END IF;

  SELECT a.status, nullif(a.data->>'pre_rfi_status','')
    INTO v_status, v_prev
    FROM public.applications a
   WHERE a.id = NEW.application_id;

  IF v_status = 'info_requested' THEN
    PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

    UPDATE public.applications a
       SET status = coalesce(v_prev, 'submitted'),
           data = coalesce(a.data, '{}'::jsonb) - 'pre_rfi_status',
           updated_at = now()
     WHERE a.id = NEW.application_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
    VALUES (coalesce(NEW.closed_by, auth.uid()), 'application.info_request_resolved', 'application',
            NEW.application_id::text,
            jsonb_build_object('status', 'info_requested'),
            jsonb_build_object('status', coalesce(v_prev, 'submitted')),
            jsonb_build_object('rfi_id', NEW.id, 'rfi_status', NEW.status));
  ELSIF v_status IS NOT NULL AND v_prev IS NOT NULL THEN
    -- Applicant already resubmitted: just clear the stash.
    UPDATE public.applications a
       SET data = coalesce(a.data, '{}'::jsonb) - 'pre_rfi_status'
     WHERE a.id = NEW.application_id;
  END IF;

  RETURN NEW;
END;
$$;