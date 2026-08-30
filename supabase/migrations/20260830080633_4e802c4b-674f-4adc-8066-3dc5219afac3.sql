-- F7-C certification repairs
-- 1. Regulatory history integrity: a decided (immutable) filing version must not
--    have its decision, provenance or lifecycle status rewritten by any path.
CREATE OR REPLACE FUNCTION public.return_filing_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_immutable THEN
      RAISE EXCEPTION 'Submitted filing versions are durable regulatory evidence and cannot be deleted'
        USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_immutable AND OLD.status IN ('ACCEPTED','REJECTED','SUPERSEDED') THEN
    IF NEW.version_number <> OLD.version_number
       OR NEW.return_filing_id <> OLD.return_filing_id
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
       OR NEW.declaration_accepted_at IS DISTINCT FROM OLD.declaration_accepted_at
       OR NEW.declaration_accepted_by IS DISTINCT FROM OLD.declaration_accepted_by THEN
      RAISE EXCEPTION 'Accepted filing version content is immutable' USING ERRCODE='42501';
    END IF;

    -- Decision provenance is permanent.
    IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
       OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
      RAISE EXCEPTION 'The decision record of a decided filing version is immutable' USING ERRCODE='42501';
    END IF;

    -- A decided version can never be reopened; the only permitted onward
    -- transition is an accepted version being superseded by a later one.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'ACCEPTED' AND NEW.status = 'SUPERSEDED') THEN
      RAISE EXCEPTION 'A decided filing version cannot be returned to an earlier lifecycle state'
        USING ERRCODE='42501';
    END IF;

    IF NOT NEW.is_immutable THEN
      RAISE EXCEPTION 'A decided filing version cannot be unsealed' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- 2. Privilege hygiene: returns configuration tables were still carrying blanket
--    browser DML privileges (denied by row level security, but latent drift).
REVOKE INSERT, UPDATE, DELETE ON public.return_definitions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.return_definition_forms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.entity_reporting_obligations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reporting_periods FROM anon, authenticated;
REVOKE SELECT ON public.return_definitions FROM anon;
REVOKE SELECT ON public.return_definition_forms FROM anon;
REVOKE SELECT ON public.entity_reporting_obligations FROM anon;
REVOKE SELECT ON public.reporting_periods FROM anon;

GRANT ALL ON public.return_definitions TO service_role;
GRANT ALL ON public.return_definition_forms TO service_role;
GRANT ALL ON public.entity_reporting_obligations TO service_role;
GRANT ALL ON public.reporting_periods TO service_role;