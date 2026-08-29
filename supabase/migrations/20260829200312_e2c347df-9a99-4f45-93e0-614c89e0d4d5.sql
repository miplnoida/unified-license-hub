-- ============================================================================
-- F7-B (part 1) — canonical returns: extensions, evidence, overdue ledger,
-- legacy spine de-privileging. Additive only; no history is deleted.
-- ============================================================================

-- ---------------------------------------------------------------- request kinds
ALTER TABLE public.return_filing_requests
  DROP CONSTRAINT IF EXISTS return_filing_requests_request_kind_check;
ALTER TABLE public.return_filing_requests
  ADD CONSTRAINT return_filing_requests_request_kind_check
  CHECK (request_kind = ANY (ARRAY['CORRECTION','RFI','COMMENT','AMENDMENT','EXTENSION']));

-- ---------------------------------------------------------------- extensions
CREATE TABLE IF NOT EXISTS public.return_filing_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  reporting_period_id uuid NOT NULL REFERENCES public.reporting_periods(id) ON DELETE CASCADE,
  entity_reporting_obligation_id uuid NOT NULL REFERENCES public.entity_reporting_obligations(id) ON DELETE CASCADE,
  return_filing_id uuid REFERENCES public.return_filings(id) ON DELETE SET NULL,
  original_due_date date NOT NULL,
  requested_due_date date NOT NULL,
  granted_due_date date,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status = ANY (ARRAY['REQUESTED','GRANTED','REFUSED','WITHDRAWN'])),
  decision_reason text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_filing_extensions_forward CHECK (requested_due_date > original_due_date),
  CONSTRAINT return_filing_extensions_decision CHECK (
    (status = 'GRANTED' AND granted_due_date IS NOT NULL AND decided_by IS NOT NULL)
    OR (status <> 'GRANTED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS return_filing_extensions_one_open
  ON public.return_filing_extensions (reporting_period_id) WHERE status = 'REQUESTED';
CREATE INDEX IF NOT EXISTS return_filing_extensions_entity_idx
  ON public.return_filing_extensions (entity_id, status);

GRANT SELECT ON public.return_filing_extensions TO authenticated;
GRANT ALL ON public.return_filing_extensions TO service_role;
ALTER TABLE public.return_filing_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS return_filing_extensions_read ON public.return_filing_extensions;
CREATE POLICY return_filing_extensions_read ON public.return_filing_extensions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'returns_management','view')
    OR public.returns_can_view_filing_scope(entity_id)
  );

-- ---------------------------------------------------------------- evidence
CREATE TABLE IF NOT EXISTS public.return_filing_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_filing_id uuid NOT NULL REFERENCES public.return_filings(id) ON DELETE CASCADE,
  return_filing_version_id uuid NOT NULL REFERENCES public.return_filing_versions(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL,
  document_name text NOT NULL,
  storage_path text NOT NULL,
  file_type text,
  file_size bigint,
  description text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdrawn_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS return_filing_evidence_unique_path
  ON public.return_filing_evidence (return_filing_version_id, storage_path);
CREATE INDEX IF NOT EXISTS return_filing_evidence_filing_idx
  ON public.return_filing_evidence (return_filing_id);

GRANT SELECT ON public.return_filing_evidence TO authenticated;
GRANT ALL ON public.return_filing_evidence TO service_role;
ALTER TABLE public.return_filing_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS return_filing_evidence_read ON public.return_filing_evidence;
CREATE POLICY return_filing_evidence_read ON public.return_filing_evidence
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'returns_management','view')
    OR public.returns_can_view_filing_scope(entity_id)
  );

-- ---------------------------------------------------------------- overdue ledger
CREATE TABLE IF NOT EXISTS public.return_overdue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_period_id uuid NOT NULL REFERENCES public.reporting_periods(id) ON DELETE CASCADE,
  entity_reporting_obligation_id uuid NOT NULL REFERENCES public.entity_reporting_obligations(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL,
  return_definition_id uuid NOT NULL REFERENCES public.return_definitions(id),
  return_filing_id uuid REFERENCES public.return_filings(id) ON DELETE SET NULL,
  effective_due_date date NOT NULL,
  as_of_date date NOT NULL,
  days_late integer NOT NULL CHECK (days_late > 0),
  filing_status text,
  -- F7 detects lateness only. Any money consequence is owned by frozen F6.
  late_fee_owner text NOT NULL DEFAULT 'F6_FEES_AND_PAYMENTS',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS return_overdue_events_unique
  ON public.return_overdue_events (reporting_period_id, as_of_date);
CREATE INDEX IF NOT EXISTS return_overdue_events_entity_idx
  ON public.return_overdue_events (entity_id, as_of_date DESC);

GRANT SELECT ON public.return_overdue_events TO authenticated;
GRANT ALL ON public.return_overdue_events TO service_role;
ALTER TABLE public.return_overdue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS return_overdue_events_read ON public.return_overdue_events;
CREATE POLICY return_overdue_events_read ON public.return_overdue_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'returns_management','view')
    OR public.returns_can_view_filing_scope(entity_id)
  );

-- ---------------------------------------------------------------- touch triggers
CREATE OR REPLACE FUNCTION public.returns_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_return_filing_extensions_touch ON public.return_filing_extensions;
CREATE TRIGGER trg_return_filing_extensions_touch
  BEFORE UPDATE ON public.return_filing_extensions
  FOR EACH ROW EXECUTE FUNCTION public.returns_touch_updated_at();

-- ============================================================================
-- Legacy / dead returns spine — de-privileged, history preserved
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.compliance_return_save_draft(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compliance_return_submit(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compliance_return_acknowledge(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compliance_return_review_decision(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compliance_return_can_file(uuid, uuid, uuid) FROM anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'compliance_returns','returns_filed','return_due_dates','return_cutoff_config',
    'return_validation_rules','return_validation_rule_versions','return_audit_log',
    'return_data_revisions','return_edit_requests','return_comments','return_documents',
    'return_form_data','return_requests','return_notifications_log','return_form_versions',
    'return_calculated_ratios','return_consolidated_analysis','return_upload_attempts',
    'return_upload_imports','return_template_downloads'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- The legacy notification trigger keys off a permanently empty table; the
-- canonical lifecycle now emits its own events.
DROP TRIGGER IF EXISTS trg_return_notification_events ON public.returns_filed;

COMMENT ON TABLE public.return_filing_extensions IS
  'F7 canonical governed filing-deadline extensions (maker-checker; RPC-only writes).';
COMMENT ON TABLE public.return_filing_evidence IS
  'F7 canonical filing evidence bound to a specific return filing version (RPC-only writes).';
COMMENT ON TABLE public.return_overdue_events IS
  'F7 canonical deterministic overdue detection ledger. Late-fee money is owned by F6.';
COMMENT ON TABLE public.return_validation_rules IS
  'RETIRED (F7-B). Canonical validation configuration is public.return_form_validation_rules.';
COMMENT ON TABLE public.return_audit_log IS
  'RETIRED (F7-B). Canonical returns audit target is public.audit_logs via create_audit_log().';