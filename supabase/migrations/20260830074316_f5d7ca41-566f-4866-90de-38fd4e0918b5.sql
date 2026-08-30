-- 1. Revoke inappropriate anonymous/PUBLIC execution on the routines introduced
--    by the F7-B / F6-X / enforcement currency work (GAP-F0-08 contract).
REVOKE ALL ON FUNCTION public.entity_currency_approval_mode(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_currency_override_set(uuid,text,date,text,date,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_currency_override_supersede(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_reporting_currency_resolve(uuid,date,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_reporting_regulator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.returns_rebase_filing_currency(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.returns_snapshot_filing_currency(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.entity_currency_approval_mode(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_set(uuid,text,date,text,date,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_supersede(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_reporting_currency_resolve(uuid,date,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_reporting_regulator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.returns_rebase_filing_currency(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.returns_snapshot_filing_currency(uuid) TO authenticated, service_role;

-- 2. Trigger functions are never callable through the API roles (F0-B7 contract).
REVOKE ALL ON FUNCTION public.return_filing_currency_snapshot_protect() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.returns_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enforcement_penalty_currency_authority() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enforcement_penalty_payment_currency() FROM PUBLIC, anon, authenticated;

-- 3. The overdue sweep must authorize a system run through the canonical
--    trusted-service helper, not through the database login name.
CREATE OR REPLACE FUNCTION public.returns_overdue_sweep(_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_as_of date := COALESCE(_as_of, (now() AT TIME ZONE 'UTC')::date);
        v_inserted int := 0; r record;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.returns_require('workflow_action');
  ELSIF NOT public.is_trusted_service_request() THEN
    RAISE EXCEPTION 'Not authorised to run the overdue sweep' USING ERRCODE='42501';
  END IF;

  FOR r IN
    SELECT p.id AS period_id, p.due_date, p.entity_reporting_obligation_id AS obligation_id,
           o.entity_id, o.return_definition_id, f.id AS filing_id, f.status AS filing_status
      FROM public.reporting_periods p
      JOIN public.entity_reporting_obligations o ON o.id = p.entity_reporting_obligation_id
      LEFT JOIN public.return_filings f ON f.reporting_period_id = p.id
     WHERE p.status IN ('OPEN','SCHEDULED')
       AND p.due_date IS NOT NULL
       AND p.due_date < v_as_of
       AND COALESCE(f.status,'NONE') NOT IN ('SUBMITTED','UNDER_REVIEW','ACCEPTED','WITHDRAWN')
       AND NOT EXISTS (SELECT 1 FROM public.return_filing_extensions x
                        WHERE x.reporting_period_id = p.id AND x.status = 'REQUESTED')
  LOOP
    INSERT INTO public.return_overdue_events(
      reporting_period_id, entity_reporting_obligation_id, entity_id, return_definition_id,
      return_filing_id, effective_due_date, as_of_date, days_late, filing_status)
    VALUES (r.period_id, r.obligation_id, r.entity_id, r.return_definition_id, r.filing_id,
            r.due_date, v_as_of, (v_as_of - r.due_date), COALESCE(r.filing_status,'NOT_STARTED'))
    ON CONFLICT (reporting_period_id, as_of_date) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
      IF r.filing_id IS NOT NULL THEN
        PERFORM public.returns_notify('return.overdue', r.filing_id,
          jsonb_build_object('days_late', (v_as_of - r.due_date), 'as_of', v_as_of,
                             'effective_due_date', r.due_date),
          v_as_of::text);
      ELSE
        PERFORM public.notification_enqueue_event('return.overdue', 'reporting_period', r.period_id,
          jsonb_build_object('entity_id', r.entity_id, 'period_id', r.period_id,
                             'effective_due_date', r.due_date, 'days_late', (v_as_of - r.due_date),
                             'module','returns_management','route','/entity/returns'),
          v_as_of::text);
      END IF;
    END IF;
  END LOOP;

  PERFORM public.create_audit_log('return_overdue_sweep', gen_random_uuid(), 'RUN',
    jsonb_build_object('as_of', v_as_of, 'recorded', v_inserted));
  RETURN jsonb_build_object('as_of', v_as_of, 'recorded', v_inserted);
END $function$;

REVOKE ALL ON FUNCTION public.returns_overdue_sweep(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_overdue_sweep(date) TO authenticated, service_role;