CREATE OR REPLACE FUNCTION public.audit_step_assignee_label(_step_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  IF _step_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(r.name, initcap(replace(s.approver_role::text, '_', ' ')))
    INTO v_label
    FROM public.approval_steps s
    LEFT JOIN public.roles r ON r.id = s.approver_role_id
   WHERE s.id = _step_id
   LIMIT 1;

  RETURN v_label;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_step_assignee_label(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_step_assignee_label(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_document_review_status(_metadata jsonb)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    lower(
      trim(
        COALESCE(
          _metadata->>'review_status',
          _metadata->>'verification_status',
          CASE
            WHEN lower(COALESCE(_metadata->>'is_verified', '')) IN ('true', 't', '1', 'yes') THEN 'verified'
            ELSE NULL
          END
        )
      )
    ),
    ''
  )
$$;

REVOKE ALL ON FUNCTION public.audit_document_review_status(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_document_review_status(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_document_reason(_metadata jsonb)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(
      COALESCE(
        _metadata->>'review_comments',
        _metadata->>'rejection_reason',
        _metadata->>'comments',
        _metadata->>'reason'
      )
    ),
    ''
  )
$$;

REVOKE ALL ON FUNCTION public.audit_document_reason(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_document_reason(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_applications_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_meta jsonb;
  v_actor uuid := auth.uid();
  v_email text;
  v_changed text[];
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.applicant_id LIMIT 1;
  IF v_email IS NULL THEN
    SELECT email INTO v_email FROM public.pre_license_users WHERE id = NEW.applicant_id LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_meta := jsonb_build_object(
      'source','trigger',
      'application_id', NEW.id,
      'application_number', NEW.application_number,
      'applicant_id', NEW.applicant_id,
      'applicant_email', v_email,
      'license_type', NEW.license_type,
      'sector_id', NEW.data->>'sector_id',
      'sub_sector_id', NEW.data->>'sub_sector_id',
      'category_id', NEW.data->>'category_id',
      'to_status', NEW.status
    );

    PERFORM public.write_audit(
      'application.created',
      'application',
      NEW.id::text,
      COALESCE(v_actor, NEW.applicant_id),
      NULL,
      to_jsonb(NEW) - 'data' - 'search_vector',
      v_meta
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'submitted' THEN CASE WHEN OLD.status IN ('resubmission_requested','query_raised') THEN 'application.resubmitted' ELSE 'application.submitted' END
      WHEN 'cancelled' THEN 'application.cancelled'
      WHEN 'approved' THEN 'application.approved'
      WHEN 'rejected' THEN 'application.rejected'
      WHEN 'resubmission_requested' THEN 'application.resubmission_requested'
      ELSE 'application.status_changed'
    END;

    v_meta := jsonb_build_object(
      'source','trigger',
      'application_id', NEW.id,
      'application_number', NEW.application_number,
      'applicant_id', NEW.applicant_id,
      'applicant_email', v_email,
      'license_type', NEW.license_type,
      'sector_id', COALESCE(NEW.data->>'sector_id', OLD.data->>'sector_id'),
      'sub_sector_id', COALESCE(NEW.data->>'sub_sector_id', OLD.data->>'sub_sector_id'),
      'category_id', COALESCE(NEW.data->>'category_id', OLD.data->>'category_id'),
      'from_status', OLD.status,
      'to_status', NEW.status
    );

    PERFORM public.write_audit(
      v_action,
      'application',
      NEW.id::text,
      COALESCE(v_actor, NEW.applicant_id),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      v_meta
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND COALESCE(NEW.status, '') IN ('draft', 'in_progress') THEN
    v_changed := ARRAY[]::text[];

    IF NEW.license_type IS DISTINCT FROM OLD.license_type THEN
      v_changed := v_changed || 'license_type';
    END IF;
    IF NEW.regulator_id IS DISTINCT FROM OLD.regulator_id THEN
      v_changed := v_changed || 'regulator_id';
    END IF;
    IF NEW.data IS DISTINCT FROM OLD.data THEN
      v_changed := v_changed || 'data';
    END IF;

    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    v_meta := jsonb_build_object(
      'source','trigger',
      'application_id', NEW.id,
      'application_number', NEW.application_number,
      'applicant_id', NEW.applicant_id,
      'applicant_email', v_email,
      'license_type', NEW.license_type,
      'from_status', OLD.status,
      'to_status', NEW.status,
      'changed_fields', to_jsonb(v_changed),
      'sector_id', COALESCE(NEW.data->>'sector_id', OLD.data->>'sector_id'),
      'sub_sector_id', COALESCE(NEW.data->>'sub_sector_id', OLD.data->>'sub_sector_id'),
      'category_id', COALESCE(NEW.data->>'category_id', OLD.data->>'category_id')
    );

    PERFORM public.write_audit(
      'application.draft_updated',
      'application',
      NEW.id::text,
      COALESCE(v_actor, NEW.applicant_id),
      jsonb_build_object(
        'license_type', OLD.license_type,
        'regulator_id', OLD.regulator_id,
        'data', OLD.data
      ),
      jsonb_build_object(
        'license_type', NEW.license_type,
        'regulator_id', NEW.regulator_id,
        'data', NEW.data
      ),
      v_meta,
      30
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_audit_trg ON public.applications;
CREATE TRIGGER applications_audit_trg
AFTER INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.tg_applications_audit();

CREATE OR REPLACE FUNCTION public.tg_documents_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(
      'document.uploaded',
      'document',
      NEW.id::text,
      COALESCE(v_actor, NEW.uploaded_by),
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'source','trigger',
        'document_id', NEW.id,
        'application_id', CASE WHEN NEW.entity_type = 'application' THEN NEW.entity_id::text END,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id,
        'file_name', NEW.file_name,
        'file_size', NEW.file_size,
        'document_type', NEW.entity_type,
        'mime_type', NEW.mime_type
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.file_size IS DISTINCT FROM OLD.file_size THEN
      PERFORM public.write_audit(
        'document.replaced',
        'document',
        NEW.id::text,
        COALESCE(v_actor, NEW.uploaded_by),
        to_jsonb(OLD),
        to_jsonb(NEW),
        jsonb_build_object(
          'source','trigger',
          'document_id', NEW.id,
          'application_id', CASE WHEN NEW.entity_type = 'application' THEN NEW.entity_id::text END,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'old_file_name', OLD.file_name,
          'new_file_name', NEW.file_name,
          'old_file_size', OLD.file_size,
          'new_file_size', NEW.file_size,
          'document_type', NEW.entity_type
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.write_audit(
      'document.deleted',
      'document',
      OLD.id::text,
      COALESCE(v_actor, OLD.uploaded_by),
      to_jsonb(OLD),
      NULL,
      jsonb_build_object(
        'source','trigger',
        'document_id', OLD.id,
        'application_id', CASE WHEN OLD.entity_type = 'application' THEN OLD.entity_id::text END,
        'entity_type', OLD.entity_type,
        'entity_id', OLD.entity_id,
        'file_name', OLD.file_name,
        'document_type', OLD.entity_type
      )
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS documents_audit_trg ON public.documents;
CREATE TRIGGER documents_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.tg_documents_audit();

CREATE OR REPLACE FUNCTION public.tg_file_uploads_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old_review_status text;
  v_new_review_status text;
  v_reason text;
  v_application_id text;
  v_document_type text;
  v_review_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_application_id := CASE
      WHEN NEW.entity_type = 'application' THEN NEW.entity_id
      ELSE NEW.metadata->>'application_id'
    END;
    v_document_type := COALESCE(NEW.metadata->>'document_type', NEW.entity_type);

    PERFORM public.write_audit(
      'document.uploaded',
      'document',
      NEW.id::text,
      COALESCE(v_actor, NEW.uploaded_by),
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'source','trigger',
        'document_id', NEW.id,
        'application_id', v_application_id,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id,
        'file_name', NEW.file_name,
        'file_size', NEW.file_size,
        'document_type', v_document_type,
        'mime_type', NEW.mime_type
      )
    );

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_application_id := CASE
      WHEN NEW.entity_type = 'application' THEN NEW.entity_id
      ELSE COALESCE(NEW.metadata->>'application_id', OLD.metadata->>'application_id')
    END;
    v_document_type := COALESCE(NEW.metadata->>'document_type', OLD.metadata->>'document_type', NEW.entity_type);

    IF NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.file_size IS DISTINCT FROM OLD.file_size THEN
      PERFORM public.write_audit(
        'document.replaced',
        'document',
        NEW.id::text,
        COALESCE(v_actor, NEW.uploaded_by),
        to_jsonb(OLD),
        to_jsonb(NEW),
        jsonb_build_object(
          'source','trigger',
          'document_id', NEW.id,
          'application_id', v_application_id,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'old_file_name', OLD.file_name,
          'new_file_name', NEW.file_name,
          'old_file_size', OLD.file_size,
          'new_file_size', NEW.file_size,
          'document_type', v_document_type
        )
      );
    END IF;

    v_old_review_status := public.audit_document_review_status(OLD.metadata);
    v_new_review_status := public.audit_document_review_status(NEW.metadata);

    IF v_new_review_status IS DISTINCT FROM v_old_review_status THEN
      v_reason := public.audit_document_reason(NEW.metadata);
      v_review_actor := COALESCE(NULLIF(NEW.metadata->>'reviewed_by', '')::uuid, v_actor, NEW.uploaded_by);

      IF v_new_review_status IN ('verified', 'approved', 'accepted') THEN
        PERFORM public.write_audit(
          'document.verified',
          'document',
          NEW.id::text,
          v_review_actor,
          to_jsonb(OLD),
          to_jsonb(NEW),
          jsonb_build_object(
            'source','trigger',
            'document_id', NEW.id,
            'application_id', v_application_id,
            'entity_type', NEW.entity_type,
            'entity_id', NEW.entity_id,
            'file_name', NEW.file_name,
            'previous_status', v_old_review_status,
            'new_status', v_new_review_status,
            'comments', v_reason,
            'reason', v_reason,
            'actor_id', COALESCE(NEW.metadata->>'reviewed_by', v_actor::text),
            'document_type', v_document_type
          )
        );
      ELSIF v_new_review_status IN ('rejected', 'declined', 'invalid') THEN
        PERFORM public.write_audit(
          'document.rejected',
          'document',
          NEW.id::text,
          v_review_actor,
          to_jsonb(OLD),
          to_jsonb(NEW),
          jsonb_build_object(
            'source','trigger',
            'document_id', NEW.id,
            'application_id', v_application_id,
            'entity_type', NEW.entity_type,
            'entity_id', NEW.entity_id,
            'file_name', NEW.file_name,
            'previous_status', v_old_review_status,
            'new_status', v_new_review_status,
            'comments', v_reason,
            'reason', v_reason,
            'actor_id', COALESCE(NEW.metadata->>'reviewed_by', v_actor::text),
            'document_type', v_document_type
          )
        );
      END IF;
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_application_id := CASE
      WHEN OLD.entity_type = 'application' THEN OLD.entity_id
      ELSE OLD.metadata->>'application_id'
    END;
    v_document_type := COALESCE(OLD.metadata->>'document_type', OLD.entity_type);

    PERFORM public.write_audit(
      'document.deleted',
      'document',
      OLD.id::text,
      COALESCE(v_actor, OLD.uploaded_by),
      to_jsonb(OLD),
      NULL,
      jsonb_build_object(
        'source','trigger',
        'document_id', OLD.id,
        'application_id', v_application_id,
        'entity_type', OLD.entity_type,
        'entity_id', OLD.entity_id,
        'file_name', OLD.file_name,
        'document_type', v_document_type
      )
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS file_uploads_audit_trg ON public.file_uploads;
CREATE TRIGGER file_uploads_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.file_uploads
FOR EACH ROW EXECUTE FUNCTION public.tg_file_uploads_audit();

CREATE OR REPLACE FUNCTION public.tg_approval_actions_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_app RECORD;
  v_instance RECORD;
  v_step_name text;
  v_assignee text;
  v_to_status text;
  v_meta jsonb;
BEGIN
  SELECT id, application_number, applicant_id, status
    INTO v_app
    FROM public.applications
   WHERE id = NEW.application_id
   LIMIT 1;

  SELECT workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE id = NEW.workflow_instance_id
   LIMIT 1;

  SELECT name INTO v_step_name
    FROM public.approval_steps
   WHERE id = NEW.step_id
   LIMIT 1;

  v_assignee := public.audit_step_assignee_label(NEW.step_id);
  v_to_status := CASE
    WHEN lower(coalesce(NEW.action, NEW.action_type, '')) = 'approve_final' THEN 'approved'
    WHEN lower(coalesce(NEW.action, NEW.action_type, '')) = 'reject' THEN 'rejected'
    WHEN lower(coalesce(NEW.action, NEW.action_type, '')) = 'request_resubmission' THEN 'resubmission_requested'
    ELSE v_app.status
  END;

  v_action := CASE lower(coalesce(NEW.action, NEW.action_type, ''))
    WHEN 'edit_requested' THEN 'application.edit_requested'
    WHEN 'edit_approved' THEN 'application.edit_approved'
    WHEN 'edit_denied' THEN 'application.edit_denied'
    WHEN 'resubmitted' THEN 'application.resubmitted'
    WHEN 'approve_final' THEN 'workflow.step_completed'
    ELSE 'workflow.action_taken'
  END;

  v_meta := jsonb_build_object(
    'source', 'trigger',
    'application_id', NEW.application_id,
    'application_number', v_app.application_number,
    'workflow_id', v_instance.workflow_id,
    'workflow_instance_id', NEW.workflow_instance_id,
    'step_id', NEW.step_id,
    'step_name', v_step_name,
    'action', NEW.action,
    'action_type', NEW.action_type,
    'actor_id', NEW.actor_id,
    'comments', NEW.comments,
    'from_assignee', NEW.delegated_from,
    'to_assignee', COALESCE(NEW.delegated_to::text, v_assignee),
    'from_status', NULL,
    'to_status', v_to_status,
    'delegated_to', NEW.delegated_to,
    'delegated_from', NEW.delegated_from
  );

  PERFORM public.write_audit(
    v_action,
    'application',
    NEW.application_id::text,
    COALESCE(NEW.actor_id, auth.uid(), v_app.applicant_id),
    NULL,
    to_jsonb(NEW),
    v_meta
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_actions_audit_trg ON public.approval_actions;
CREATE TRIGGER approval_actions_audit_trg
AFTER INSERT ON public.approval_actions
FOR EACH ROW EXECUTE FUNCTION public.tg_approval_actions_audit();

CREATE OR REPLACE FUNCTION public.tg_workflow_instances_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_old_step_name text;
  v_new_step_name text;
  v_old_assignee text;
  v_new_assignee text;
  v_actor uuid := auth.uid();
BEGIN
  IF COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.entity_type ELSE NEW.entity_type END, '') <> 'application' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id, application_number, applicant_id, status
    INTO v_app
    FROM public.applications
   WHERE id = COALESCE(NEW.entity_id, OLD.entity_id)
   LIMIT 1;

  IF TG_OP <> 'INSERT' THEN
    SELECT name INTO v_old_step_name FROM public.approval_steps WHERE id = OLD.current_step_id LIMIT 1;
    v_old_assignee := public.audit_step_assignee_label(OLD.current_step_id);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT name INTO v_new_step_name FROM public.approval_steps WHERE id = NEW.current_step_id LIMIT 1;
    v_new_assignee := public.audit_step_assignee_label(NEW.current_step_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(
      'workflow.assigned',
      'application',
      NEW.entity_id::text,
      COALESCE(v_actor, v_app.applicant_id),
      NULL,
      to_jsonb(NEW),
      jsonb_build_object(
        'source', 'trigger',
        'application_id', NEW.entity_id,
        'application_number', v_app.application_number,
        'workflow_id', NEW.workflow_id,
        'step_id', NEW.current_step_id,
        'step_name', v_new_step_name,
        'actor_id', v_actor,
        'from_assignee', NULL,
        'to_assignee', v_new_assignee,
        'from_status', NULL,
        'to_status', NEW.status
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.current_step_id IS DISTINCT FROM OLD.current_step_id THEN
      PERFORM public.write_audit(
        'workflow.step_completed',
        'application',
        NEW.entity_id::text,
        COALESCE(v_actor, v_app.applicant_id),
        jsonb_build_object('step_id', OLD.current_step_id, 'status', OLD.status),
        jsonb_build_object('step_id', NEW.current_step_id, 'status', NEW.status),
        jsonb_build_object(
          'source', 'trigger',
          'application_id', NEW.entity_id,
          'application_number', v_app.application_number,
          'workflow_id', NEW.workflow_id,
          'step_id', OLD.current_step_id,
          'step_name', v_old_step_name,
          'actor_id', v_actor,
          'from_assignee', v_old_assignee,
          'to_assignee', v_new_assignee,
          'from_status', OLD.status,
          'to_status', NEW.status
        )
      );

      PERFORM public.write_audit(
        'workflow.reassigned',
        'application',
        NEW.entity_id::text,
        COALESCE(v_actor, v_app.applicant_id),
        jsonb_build_object('step_id', OLD.current_step_id, 'status', OLD.status),
        jsonb_build_object('step_id', NEW.current_step_id, 'status', NEW.status),
        jsonb_build_object(
          'source', 'trigger',
          'application_id', NEW.entity_id,
          'application_number', v_app.application_number,
          'workflow_id', NEW.workflow_id,
          'step_id', NEW.current_step_id,
          'step_name', v_new_step_name,
          'actor_id', v_actor,
          'from_assignee', v_old_assignee,
          'to_assignee', v_new_assignee,
          'from_status', OLD.status,
          'to_status', NEW.status
        )
      );
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status = 'active'
       AND OLD.status IN ('paused', 'pending') THEN
      PERFORM public.write_audit(
        'workflow.assigned',
        'application',
        NEW.entity_id::text,
        COALESCE(v_actor, v_app.applicant_id),
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        jsonb_build_object(
          'source', 'trigger',
          'application_id', NEW.entity_id,
          'application_number', v_app.application_number,
          'workflow_id', NEW.workflow_id,
          'step_id', NEW.current_step_id,
          'step_name', v_new_step_name,
          'actor_id', v_actor,
          'from_assignee', v_old_assignee,
          'to_assignee', v_new_assignee,
          'from_status', OLD.status,
          'to_status', NEW.status
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_instances_audit_trg ON public.workflow_instances;
CREATE TRIGGER workflow_instances_audit_trg
AFTER INSERT OR UPDATE ON public.workflow_instances
FOR EACH ROW EXECUTE FUNCTION public.tg_workflow_instances_audit();