
DROP TRIGGER IF EXISTS enforce_complaint_vulnerability_consistency_trigger ON public.complaints;
DROP TRIGGER IF EXISTS enforce_complaint_vulnerability_consistency ON public.complaints;
DROP FUNCTION IF EXISTS public.enforce_complaint_vulnerability_consistency() CASCADE;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS vulnerability_category text;

DO $$ BEGIN
  CREATE TYPE public.complaint_vulnerability_review_state AS ENUM (
    'not_applicable', 'needs_remediation', 'confirmed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS vulnerability_review_state public.complaint_vulnerability_review_state
    NOT NULL DEFAULT 'not_applicable';

UPDATE public.complaints
SET vulnerability_review_state = 'needs_remediation',
    vulnerability_notes = NULL
WHERE vulnerability_indicator = TRUE
  AND (vulnerability_notes IS NULL
       OR btrim(vulnerability_notes) = ''
       OR vulnerability_notes ILIKE '%(not recorded)%'
       OR vulnerability_notes ILIKE '%backfill%');

UPDATE public.complaints
SET vulnerability_review_state = 'confirmed'
WHERE vulnerability_indicator = TRUE
  AND vulnerability_review_state = 'not_applicable'
  AND COALESCE(btrim(vulnerability_notes), '') <> '';

UPDATE public.complaints
SET vulnerability_review_state = 'not_applicable',
    vulnerability_notes = NULL,
    vulnerability_category = NULL
WHERE vulnerability_indicator = FALSE
  AND (vulnerability_review_state <> 'not_applicable'
       OR vulnerability_notes IS NOT NULL);

CREATE OR REPLACE FUNCTION public.trg_complaints_vulnerability_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vulnerability_indicator = FALSE THEN
    NEW.vulnerability_notes := NULL;
    NEW.vulnerability_category := NULL;
    NEW.vulnerability_review_state := 'not_applicable';
  ELSE
    IF NEW.vulnerability_review_state = 'not_applicable' THEN
      IF COALESCE(btrim(NEW.vulnerability_notes), '') <> ''
         OR COALESCE(btrim(NEW.vulnerability_category), '') <> '' THEN
        NEW.vulnerability_review_state := 'confirmed';
      ELSE
        NEW.vulnerability_review_state := 'needs_remediation';
      END IF;
    ELSIF NEW.vulnerability_review_state = 'confirmed' THEN
      IF COALESCE(btrim(NEW.vulnerability_notes), '') = ''
         AND COALESCE(btrim(NEW.vulnerability_category), '') = '' THEN
        RAISE EXCEPTION 'vulnerability_confirmed_requires_detail'
          USING HINT = 'Provide vulnerability_category or vulnerability_notes to confirm.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaints_vulnerability_consistency ON public.complaints;
CREATE TRIGGER complaints_vulnerability_consistency
BEFORE INSERT OR UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.trg_complaints_vulnerability_consistency();

CREATE OR REPLACE FUNCTION public.trg_complaints_block_progress_when_needs_remediation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.vulnerability_review_state = 'needs_remediation'
     AND NEW.status NOT IN ('rejected', 'duplicate', 'closed') THEN
    RAISE EXCEPTION 'vulnerability_remediation_required'
      USING HINT = 'Complete vulnerability review (confirm or mark not applicable) before advancing status.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaints_block_progress_needs_remediation ON public.complaints;
CREATE TRIGGER complaints_block_progress_needs_remediation
BEFORE UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.trg_complaints_block_progress_when_needs_remediation();

CREATE OR REPLACE FUNCTION public.complete_vulnerability_review(
  _complaint_id uuid,
  _decision text,
  _category text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF _decision NOT IN ('confirmed', 'not_applicable') THEN
    RAISE EXCEPTION 'invalid_decision' USING HINT = 'decision must be confirmed or not_applicable';
  END IF;
  IF NOT (public.has_role(v_uid, 'super_admin'::app_role)
          OR public.has_role(v_uid, 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.regulator_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF _decision = 'not_applicable' THEN
    UPDATE public.complaints
      SET vulnerability_indicator = FALSE,
          vulnerability_review_state = 'not_applicable',
          vulnerability_notes = NULL,
          vulnerability_category = NULL,
          updated_at = now()
    WHERE id = _complaint_id;
  ELSE
    IF COALESCE(btrim(_category), '') = '' AND COALESCE(btrim(_notes), '') = '' THEN
      RAISE EXCEPTION 'category_or_notes_required';
    END IF;
    UPDATE public.complaints
      SET vulnerability_indicator = TRUE,
          vulnerability_review_state = 'confirmed',
          vulnerability_category = NULLIF(btrim(_category), ''),
          vulnerability_notes = NULLIF(btrim(_notes), ''),
          updated_at = now()
    WHERE id = _complaint_id;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, details, created_at)
  VALUES (
    'complaint.vulnerability_review_completed',
    'complaint',
    _complaint_id,
    v_uid,
    jsonb_build_object('decision', _decision, 'category', _category, 'notes_provided', _notes IS NOT NULL),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_vulnerability_review(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_vulnerability_review(uuid, text, text, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_complaints_vulnerability_review_state
  ON public.complaints (vulnerability_review_state)
  WHERE vulnerability_review_state = 'needs_remediation';
