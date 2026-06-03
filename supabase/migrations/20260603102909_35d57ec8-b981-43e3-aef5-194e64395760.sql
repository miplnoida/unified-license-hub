CREATE OR REPLACE FUNCTION public.tg_applications_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      v_changed := array_append(v_changed, 'license_type');
    END IF;
    IF NEW.regulator_id IS DISTINCT FROM OLD.regulator_id THEN
      v_changed := array_append(v_changed, 'regulator_id');
    END IF;
    IF NEW.data IS DISTINCT FROM OLD.data THEN
      v_changed := array_append(v_changed, 'data');
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
$function$;