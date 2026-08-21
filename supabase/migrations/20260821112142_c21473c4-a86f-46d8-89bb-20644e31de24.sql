-- ============================================================
-- EPR-03 — normalise all enforcement entry points onto the process model
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_enforcement_referral_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_kind IS NULL THEN
    NEW.source_kind := CASE
      WHEN NEW.source_type IS NULL THEN 'MANUAL_REFERRAL'
      WHEN lower(NEW.source_type) LIKE '%complaint%' THEN 'COMPLAINT'
      WHEN lower(NEW.source_type) LIKE '%conduct%' THEN 'CONDUCT_INVESTIGATION'
      WHEN lower(NEW.source_type) LIKE '%thematic%' THEN 'THEMATIC_FINDING'
      WHEN lower(NEW.source_type) LIKE '%breach%' THEN 'PRUDENTIAL_BREACH'
      WHEN lower(NEW.source_type) LIKE '%prudential%' THEN 'PRUDENTIAL_ACTION'
      WHEN lower(NEW.source_type) LIKE '%inspection%' THEN 'EXAMINATION_FINDING'
      WHEN lower(NEW.source_type) LIKE '%exam%' THEN 'EXAMINATION_FINDING'
      WHEN lower(NEW.source_type) LIKE '%licen%' THEN 'LICENSING_VIOLATION'
      WHEN lower(NEW.source_type) LIKE '%fit%' OR lower(NEW.source_type) LIKE '%fp%' THEN 'FP_MATTER'
      ELSE 'MANUAL_REFERRAL' END;
  END IF;

  NEW.source_id := coalesce(NEW.source_id, NEW.source_reference_id, NEW.source_investigation_id);
  NEW.referred_by := coalesce(NEW.referred_by, NEW.opened_by, auth.uid());
  NEW.referred_at := coalesce(NEW.referred_at, now());
  NEW.referral_reason := coalesce(
    NEW.referral_reason,
    nullif(btrim(coalesce(NEW.description, '')), ''),
    'Referred into the enforcement process.');

  IF NEW.stage IS NULL OR NEW.stage = '' THEN NEW.stage := 'REFERRAL'; END IF;

  IF nullif(btrim(coalesce(NEW.case_number, '')), '') IS NULL THEN
    NEW.case_number := 'ENF-' || to_char(now(), 'YYYY') || '-' || lpad((
      SELECT count(*) + 1 FROM public.enforcement_actions
       WHERE date_trunc('year', created_at) = date_trunc('year', now()))::text, 5, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforcement_referral_defaults ON public.enforcement_actions;
CREATE TRIGGER trg_enforcement_referral_defaults
  BEFORE INSERT ON public.enforcement_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforcement_referral_defaults();

-- keep complaint-sourced cases provenance-complete when the legacy link is set
CREATE OR REPLACE FUNCTION public.tg_complaint_enforcement_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.enforcement_action_id IS NOT NULL
     AND NEW.enforcement_action_id IS DISTINCT FROM OLD.enforcement_action_id THEN
    UPDATE public.enforcement_actions
       SET source_kind = coalesce(source_kind, 'COMPLAINT'),
           source_id = coalesce(source_id, NEW.id),
           source_reference = coalesce(source_reference, NEW.complaint_number)
     WHERE id = NEW.enforcement_action_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaint_enforcement_provenance ON public.complaints;
CREATE TRIGGER trg_complaint_enforcement_provenance
  AFTER UPDATE OF enforcement_action_id ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.tg_complaint_enforcement_provenance();
