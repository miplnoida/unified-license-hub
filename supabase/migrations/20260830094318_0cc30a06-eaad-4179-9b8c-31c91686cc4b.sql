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
  END IF;

  RETURN NEW;
END $function$;

-- Returns configuration / log surface: browser roles are read-only.
REVOKE ALL ON public.reporting_obligation_rules FROM anon, authenticated;
REVOKE ALL ON public.return_form_validation_rules FROM anon, authenticated;
REVOKE ALL ON public.return_templates FROM anon, authenticated;
REVOKE ALL ON public.return_validation_run_log FROM anon, authenticated;
REVOKE ALL ON public.returns_legacy_mappings FROM anon, authenticated;
REVOKE ALL ON public.return_threshold_breach_acknowledgements FROM anon, authenticated;

GRANT SELECT ON public.reporting_obligation_rules TO authenticated;
GRANT SELECT ON public.return_form_validation_rules TO authenticated;
GRANT SELECT ON public.return_templates TO authenticated;
GRANT SELECT ON public.return_validation_run_log TO authenticated;
GRANT SELECT ON public.returns_legacy_mappings TO authenticated;
GRANT SELECT ON public.return_threshold_breach_acknowledgements TO authenticated;

GRANT ALL ON public.reporting_obligation_rules TO service_role;
GRANT ALL ON public.return_form_validation_rules TO service_role;
GRANT ALL ON public.return_templates TO service_role;
GRANT ALL ON public.return_validation_run_log TO service_role;
GRANT ALL ON public.returns_legacy_mappings TO service_role;
GRANT ALL ON public.return_threshold_breach_acknowledgements TO service_role;

-- Residual DDL-adjacent privileges on the whole returns estate are removed:
-- no browser role ever needs TRUNCATE / REFERENCES / TRIGGER.
DO $sweep$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (c.relname LIKE 'return\_%' OR c.relname LIKE 'returns\_%'
           OR c.relname LIKE 'reporting\_%' OR c.relname LIKE 'compliance\_return%')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END
$sweep$;