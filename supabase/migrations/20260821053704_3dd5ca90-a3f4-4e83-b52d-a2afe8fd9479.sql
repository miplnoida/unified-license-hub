-- A4 certification defect fix 3: canonical return filings store upper-case status
-- values (SUBMITTED / UNDER_REVIEW). The dashboard summary and team performance
-- read models matched lower-case, so "Returns awaiting review" reported 0 while
-- the canonical filing queue drill-down returned 32 records.
CREATE OR REPLACE FUNCTION public.sup_dashboard_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
declare
  u uuid := public.sup_read_guard();
  can_pru boolean := public.sup_can_read_domain(u,'prudential');
  can_con boolean := public.sup_can_read_domain(u,'conduct');
  can_lic boolean := public.sup_can_read_domain(u,'licensing');
  res jsonb := jsonb_build_object('generated_at', now(),
    'domains', jsonb_build_object('prudential', can_pru, 'conduct', can_con, 'licensing', can_lic));
begin
  if can_pru then
    res := res || jsonb_build_object('prudential', jsonb_build_object(
      'current_breaches', (select count(*) from public.v_prudential_current_breaches where level = 'breach'),
      'current_ewis', (select count(*) from public.v_prudential_current_breaches where level <> 'breach'),
      'awaiting_acknowledgement', (select count(*) from public.v_prudential_current_breaches where acknowledged_at is null),
      'entities_with_signals', (select count(distinct entity_id) from public.v_prudential_current_breaches),
      'open_plan_actions', (select count(*) from public.supervisory_plan_actions where status <> 'completed')
    ), 'returns', jsonb_build_object(
      'awaiting_review', (select count(*) from public.return_filings where upper(status) in ('SUBMITTED','UNDER_REVIEW')),
      'overdue', (select count(*) from public.return_filings f
         join public.reporting_periods rp on rp.id = f.reporting_period_id
         where f.accepted_at is null and rp.due_date < current_date),
      'due_next_30_days', (select count(*) from public.reporting_periods rp
         where rp.due_date between current_date and current_date + 30 and rp.closed_at is null),
      'accepted_last_30_days', (select count(*) from public.return_filings
         where accepted_at >= now() - interval '30 days')
    ));
  end if;

  if can_con then
    res := res || jsonb_build_object('conduct', jsonb_build_object(
      'open_complaints', (select count(*) from public.complaints where closed_at is null),
      'complaints_sla_breached', (select count(*) from public.complaints
         where closed_at is null and sla_due_at is not null and sla_due_at < now()),
      'open_alerts', (select count(*) from public.conduct_alerts where closed_at is null),
      'open_investigations', (select count(*) from public.conduct_investigations where closed_at is null),
      'open_thematic_reviews', (select count(*) from public.thematic_reviews where closed_at is null),
      'open_thematic_actions', (select count(*) from public.thematic_review_actions where status <> 'completed'),
      'overdue_conduct_actions', (select count(*) from public.conduct_actions
         where status not in ('completed','cancelled') and due_date < current_date),
      'open_enforcement', (select count(*) from public.enforcement_actions where closed_at is null)
    ));
  end if;

  if can_lic then
    res := res || jsonb_build_object('licensing', jsonb_build_object(
      'in_flight_applications', (select count(*) from public.applications
         where status in ('submitted','under_review','pending_approval')),
      'decided_last_30_days', (select count(*) from public.decision_artifacts
         where issued_at >= now() - interval '30 days'),
      'artifacts_total', (select count(*) from public.decision_artifacts)
    ));
  end if;

  return res;
end;
$function$;