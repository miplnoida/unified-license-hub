-- ===========================================================================
-- F6: privilege lockdown of the financial estate.
-- Money may only move through the governed F6 RPCs; direct DML from browser
-- roles is removed and anonymous read access is withdrawn entirely.
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.fee_assessments',
    'public.fee_assessment_lines',
    'public.fee_ledger_entries',
    'public.fee_payment_allocations',
    'public.fee_waivers',
    'public.refunds',
    'public.fee_reconciliation_runs',
    'public.fee_reconciliation_items',
    'public.fee_payment_references',
    'public.fee_components',
    'public.payments'
  ] LOOP
    -- no direct writes from the browser, ever
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON %s FROM anon, authenticated', t);
    -- no anonymous read of any financial record
    EXECUTE format('REVOKE ALL ON %s FROM anon', t);
    -- RLS-scoped read stays available to signed-in users
    EXECUTE format('GRANT SELECT ON %s TO authenticated', t);
    -- trusted server path unchanged
    EXECUTE format('GRANT ALL ON %s TO service_role', t);
  END LOOP;
END $$;