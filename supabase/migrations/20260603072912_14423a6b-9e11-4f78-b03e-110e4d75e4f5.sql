-- =========================================================================
-- AUDIT LOGGING OVERHAUL
-- Adds a trusted server-side audit helper + automatic triggers so that
-- application / payment / document lifecycle events are always recorded
-- in public.audit_logs regardless of which client or RPC made the change.
-- =========================================================================

-- 1. Trusted helper. Anyone (including triggers running as the row owner)
--    may call it; the function inserts directly via SECURITY DEFINER so it
--    bypasses RLS. It also dedupes against rows written in the last 10s
--    for the same (entity_id, action) pair to avoid the case where both a
--    legacy RPC audit row and the new trigger fire for the same event.
CREATE OR REPLACE FUNCTION public.write_audit(
  _action       text,
  _entity_type  text,
  _entity_id    text,
  _user_id      uuid,
  _old_value    jsonb DEFAULT NULL,
  _new_value    jsonb DEFAULT NULL,
  _metadata     jsonb DEFAULT NULL,
  _dedupe_seconds int DEFAULT 10
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_exists uuid;
  v_legacy text;
BEGIN
  IF _action IS NULL OR _entity_type IS NULL THEN
    RETURN NULL;
  END IF;

  -- Map dot/underscore variants to a normalised legacy form so dedupe
  -- works regardless of which name was previously written.
  v_legacy := replace(_action, '.', '_');

  IF _entity_id IS NOT NULL AND _dedupe_seconds > 0 THEN
    SELECT id INTO v_exists
      FROM public.audit_logs
     WHERE entity_id = _entity_id
       AND (action = _action OR action = v_legacy OR action = replace(_action,'_','.'))
       AND created_at >= now() - make_interval(secs => _dedupe_seconds)
     LIMIT 1;
    IF v_exists IS NOT NULL THEN
      RETURN v_exists;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (_user_id, _action, _entity_type, _entity_id, _old_value, _new_value,
          COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit(text, text, text, uuid, jsonb, jsonb, jsonb, int) FROM public;
GRANT EXECUTE ON FUNCTION public.write_audit(text, text, text, uuid, jsonb, jsonb, jsonb, int) TO authenticated, service_role;

-- =========================================================================
-- 2. Application lifecycle trigger
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'application.created';
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
      v_action, 'application', NEW.id::text,
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
      'sector_id', NEW.data->>'sector_id',
      'sub_sector_id', NEW.data->>'sub_sector_id',
      'category_id', NEW.data->>'category_id',
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_audit_trg ON public.applications;
CREATE TRIGGER applications_audit_trg
AFTER INSERT OR UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.tg_applications_audit();

-- =========================================================================
-- 3. Payments trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_payments_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_app_number text;
  v_meta jsonb;
  v_status_norm text;
BEGIN
  IF NEW.application_id IS NOT NULL THEN
    SELECT application_number INTO v_app_number
      FROM public.applications WHERE id = NEW.application_id LIMIT 1;
  END IF;
  v_status_norm := lower(coalesce(NEW.status,''));

  v_meta := jsonb_build_object(
    'source','trigger',
    'payment_id', NEW.id,
    'application_id', NEW.application_id,
    'application_number', v_app_number,
    'amount', NEW.amount,
    'currency', NEW.currency,
    'status', NEW.status,
    'transaction_ref', NEW.transaction_ref,
    'receipt_number', NEW.receipt_number,
    'user_id', NEW.user_id
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(
      'payment.initiated','payment', NEW.id::text,
      COALESCE(v_actor, NEW.user_id), NULL, to_jsonb(NEW), v_meta
    );
    IF v_status_norm IN ('completed','success','paid') THEN
      PERFORM public.write_audit(
        'payment.completed','payment', NEW.id::text,
        COALESCE(v_actor, NEW.user_id), NULL, to_jsonb(NEW), v_meta
      );
    ELSIF v_status_norm = 'failed' THEN
      PERFORM public.write_audit(
        'payment.failed','payment', NEW.id::text,
        COALESCE(v_actor, NEW.user_id), NULL, to_jsonb(NEW), v_meta
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF v_status_norm IN ('completed','success','paid') THEN
      PERFORM public.write_audit(
        'payment.completed','payment', NEW.id::text,
        COALESCE(v_actor, NEW.user_id),
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        v_meta
      );
    ELSIF v_status_norm = 'failed' THEN
      PERFORM public.write_audit(
        'payment.failed','payment', NEW.id::text,
        COALESCE(v_actor, NEW.user_id),
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        v_meta
      );
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
     AND NEW.receipt_number IS NOT NULL THEN
    PERFORM public.write_audit(
      'payment.receipt_generated','payment', NEW.id::text,
      COALESCE(v_actor, NEW.user_id),
      jsonb_build_object('receipt_number', OLD.receipt_number),
      jsonb_build_object('receipt_number', NEW.receipt_number),
      v_meta
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_audit_trg ON public.payments;
CREATE TRIGGER payments_audit_trg
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_payments_audit();

-- =========================================================================
-- 4. Documents trigger
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
AFTER INSERT OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.tg_documents_audit();
