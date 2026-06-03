
-- =========================================================================
-- 1. Extend application trigger: emit application.draft_updated when a
--    draft row is mutated without a status change.
-- =========================================================================
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
  IF TG_OP = 'INSERT' THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = NEW.applicant_id LIMIT 1;
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
      'application.created', 'application', NEW.id::text,
      COALESCE(v_actor, NEW.applicant_id), NULL,
      to_jsonb(NEW) - 'data' - 'search_vector', v_meta
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'submitted' THEN
        CASE WHEN OLD.status IN ('resubmission_requested','query_raised')
             THEN 'application.resubmitted' ELSE 'application.submitted' END
      WHEN 'cancelled' THEN 'application.cancelled'
      WHEN 'approved'  THEN 'application.approved'
      WHEN 'rejected'  THEN 'application.rejected'
      WHEN 'resubmission_requested' THEN 'application.resubmission_requested'
      ELSE 'application.status_changed'
    END;
    SELECT email INTO v_email FROM public.profiles WHERE id = NEW.applicant_id LIMIT 1;
    v_meta := jsonb_build_object(
      'source','trigger',
      'application_id', NEW.id,
      'application_number', NEW.application_number,
      'applicant_id', NEW.applicant_id,
      'applicant_email', v_email,
      'license_type', NEW.license_type,
      'from_status', OLD.status,
      'to_status', NEW.status
    );
    PERFORM public.write_audit(
      v_action, 'application', NEW.id::text,
      COALESCE(v_actor, NEW.applicant_id),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      v_meta
    );
    RETURN NEW;
  END IF;

  -- Draft updates: only emit when status hasn't changed and the row is
  -- still a draft/in_progress (avoid noise from internal updates on
  -- submitted/approved rows). Dedupe per 30s so rapid auto-saves collapse.
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND COALESCE(NEW.status, '') IN ('draft', 'in_progress') THEN
    v_changed := ARRAY[]::text[];
    IF NEW.license_type IS DISTINCT FROM OLD.license_type THEN v_changed := v_changed || 'license_type'; END IF;
    IF NEW.regulator_id IS DISTINCT FROM OLD.regulator_id THEN v_changed := v_changed || 'regulator_id'; END IF;
    IF NEW.data IS DISTINCT FROM OLD.data THEN v_changed := v_changed || 'data'; END IF;
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    v_meta := jsonb_build_object(
      'source','trigger',
      'application_id', NEW.id,
      'application_number', NEW.application_number,
      'applicant_id', NEW.applicant_id,
      'from_status', OLD.status,
      'to_status', NEW.status,
      'changed_fields', to_jsonb(v_changed)
    );
    PERFORM public.write_audit(
      'application.draft_updated', 'application', NEW.id::text,
      COALESCE(v_actor, NEW.applicant_id),
      jsonb_build_object('license_type', OLD.license_type, 'regulator_id', OLD.regulator_id),
      jsonb_build_object('license_type', NEW.license_type, 'regulator_id', NEW.regulator_id),
      v_meta,
      30
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Replace the trigger so it covers INSERT and any column UPDATE (not just status).
DROP TRIGGER IF EXISTS applications_audit_trg ON public.applications;
CREATE TRIGGER applications_audit_trg
AFTER INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.tg_applications_audit();


-- =========================================================================
-- 2. Extend documents trigger: emit document.replaced when file_path or
--    file_name changes on an existing row.
-- =========================================================================
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
      'document.uploaded','document', NEW.id::text,
      COALESCE(v_actor, NEW.uploaded_by),
      NULL, to_jsonb(NEW),
      jsonb_build_object(
        'source','trigger',
        'document_id', NEW.id,
        'file_name', NEW.file_name,
        'mime_type', NEW.mime_type,
        'file_size', NEW.file_size,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id,
        'application_id', CASE WHEN NEW.entity_type='application' THEN NEW.entity_id::text END
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.file_name IS DISTINCT FROM OLD.file_name THEN
      PERFORM public.write_audit(
        'document.replaced','document', NEW.id::text,
        COALESCE(v_actor, NEW.uploaded_by),
        to_jsonb(OLD), to_jsonb(NEW),
        jsonb_build_object(
          'source','trigger',
          'document_id', NEW.id,
          'previous_file_name', OLD.file_name,
          'file_name', NEW.file_name,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'application_id', CASE WHEN NEW.entity_type='application' THEN NEW.entity_id::text END
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.write_audit(
      'document.deleted','document', OLD.id::text,
      COALESCE(v_actor, OLD.uploaded_by),
      to_jsonb(OLD), NULL,
      jsonb_build_object(
        'source','trigger',
        'document_id', OLD.id,
        'file_name', OLD.file_name,
        'entity_type', OLD.entity_type,
        'entity_id', OLD.entity_id,
        'application_id', CASE WHEN OLD.entity_type='application' THEN OLD.entity_id::text END
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
