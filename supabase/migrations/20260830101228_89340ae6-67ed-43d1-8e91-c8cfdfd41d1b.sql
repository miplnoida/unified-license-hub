-- F7-C delta: decision status must carry coherent decision provenance
CREATE OR REPLACE FUNCTION public.return_filing_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_immutable THEN
      RAISE EXCEPTION 'Submitted filing versions are durable regulatory evidence and cannot be deleted'
        USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Sealing happens at submission. From that moment the version identity and
  -- submission provenance are permanent regulatory evidence, for the whole
  -- remaining lifecycle (SUBMITTED / UNDER_REVIEW / decided).
  IF OLD.is_immutable THEN
    IF NEW.version_number <> OLD.version_number
       OR NEW.return_filing_id <> OLD.return_filing_id
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
       OR NEW.declaration_accepted_at IS DISTINCT FROM OLD.declaration_accepted_at
       OR NEW.declaration_accepted_by IS DISTINCT FROM OLD.declaration_accepted_by THEN
      RAISE EXCEPTION 'Submitted filing version identity and provenance are immutable' USING ERRCODE='42501';
    END IF;

    IF NOT NEW.is_immutable THEN
      RAISE EXCEPTION 'A sealed filing version cannot be unsealed' USING ERRCODE='42501';
    END IF;

    -- Only the canonical review lifecycle may advance a sealed version.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status IN ('SUBMITTED','UNDER_REVIEW') THEN
        IF NEW.status NOT IN ('UNDER_REVIEW','ACCEPTED','REJECTED','SUPERSEDED') THEN
          RAISE EXCEPTION 'A submitted filing version cannot be returned to an earlier lifecycle state'
            USING ERRCODE='42501';
        END IF;
      ELSIF OLD.status = 'ACCEPTED' THEN
        IF NEW.status <> 'SUPERSEDED' THEN
          RAISE EXCEPTION 'A decided filing version cannot be returned to an earlier lifecycle state'
            USING ERRCODE='42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'A decided filing version cannot be returned to an earlier lifecycle state'
          USING ERRCODE='42501';
      END IF;
    END IF;

    -- Decision provenance may only be written by its own decision, once.
    IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by THEN
      IF OLD.accepted_at IS NOT NULL OR OLD.accepted_by IS NOT NULL THEN
        RAISE EXCEPTION 'The decision record of a decided filing version is immutable' USING ERRCODE='42501';
      END IF;
      IF NEW.status <> 'ACCEPTED' THEN
        RAISE EXCEPTION 'Acceptance provenance can only be recorded by an acceptance decision'
          USING ERRCODE='42501';
      END IF;
    END IF;

    IF NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
      IF OLD.rejected_at IS NOT NULL OR OLD.rejected_by IS NOT NULL OR OLD.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION 'The decision record of a decided filing version is immutable' USING ERRCODE='42501';
      END IF;
      IF NEW.status <> 'REJECTED' THEN
        RAISE EXCEPTION 'Rejection provenance can only be recorded by a rejection decision'
          USING ERRCODE='42501';
      END IF;
    END IF;

    -- A decision STATUS is only valid together with its decision record.
    IF NEW.status = 'ACCEPTED' THEN
      IF NEW.accepted_by IS NULL OR NEW.accepted_at IS NULL THEN
        RAISE EXCEPTION 'An accepted filing version must record the accepting officer and the acceptance time'
          USING ERRCODE='23514';
      END IF;
      IF NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION 'An accepted filing version cannot carry a rejection record' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.status = 'REJECTED' THEN
      IF NEW.rejected_by IS NULL OR NEW.rejected_at IS NULL THEN
        RAISE EXCEPTION 'A rejected filing version must record the rejecting officer and the rejection time'
          USING ERRCODE='23514';
      END IF;
      IF COALESCE(length(btrim(NEW.rejection_reason)),0) < 10 THEN
        RAISE EXCEPTION 'A rejected filing version must record a reason of at least 10 characters'
          USING ERRCODE='23514';
      END IF;
      IF NEW.accepted_by IS NOT NULL OR NEW.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION 'A rejected filing version cannot carry an acceptance record' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.status IN ('SUBMITTED','UNDER_REVIEW') THEN
      IF NEW.accepted_by IS NOT NULL OR NEW.accepted_at IS NOT NULL
         OR NEW.rejected_by IS NOT NULL OR NEW.rejected_at IS NOT NULL
         OR NEW.rejection_reason IS NOT NULL THEN
        RAISE EXCEPTION 'A filing version awaiting a decision cannot carry decision provenance'
          USING ERRCODE='23514';
      END IF;
    END IF;
    -- SUPERSEDED intentionally preserves whatever legitimate history it carried.
  END IF;

  RETURN NEW;
END
$fn$;

-- F7-C delta: persist the retirement of orphan Returns registry routes.
-- These four paths have no application implementation; canonical replacements
-- are /returns/queue, /returns/obligations, /returns/calendar,
-- /returns/filings/:filingId and /entity/returns.
UPDATE public.sec_navigation_items n
   SET is_active = false, updated_at = now()
 WHERE n.is_active
   AND COALESCE(
         n.href_override,
         (SELECT r.path_pattern FROM public.sec_routes r WHERE r.id = n.route_id)
       ) IN ('/admin/returns/definitions','/admin/returns/metrics',
             '/admin/returns/migration','/returns/filings');

UPDATE public.sec_routes
   SET is_active = false, updated_at = now()
 WHERE is_active
   AND path_pattern IN ('/admin/returns/definitions','/admin/returns/metrics',
                        '/admin/returns/migration','/returns/filings');