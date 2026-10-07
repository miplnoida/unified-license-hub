CREATE OR REPLACE FUNCTION public.sup_dashboard_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
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
    res := res || (
      select jsonb_build_object('prudential', jsonb_build_object(
        'current_breaches', count(*) filter (where level = 'breach'),
        'current_ewis', count(*) filter (where level <> 'breach'),
        'awaiting_acknowledgement', count(*) filter (where acknowledged_at is null),
        'entities_with_signals', count(distinct entity_id),
        'open_plan_actions', (select count(*) from public.supervisory_plan_actions where status <> 'completed')
      ))
      from public.v_prudential_current_breaches
    ) || jsonb_build_object('returns', jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.supervisory_work_queue(_scope text DEFAULT 'MY_WORK'::text, _domain text DEFAULT NULL::text, _entity_id uuid DEFAULT NULL::uuid, _work_type text DEFAULT NULL::text, _limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid   uuid := auth.uid();
  _scope_u text := upper(COALESCE(_scope,'MY_WORK'));
  _teams uuid[];
  _items jsonb;
  _counts jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_internal_staff(_uid) THEN
    RAISE EXCEPTION 'not_authorized: supervisory work queue is restricted to internal staff'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(m.team_id), ARRAY[]::uuid[]) INTO _teams
  FROM public.regulatory_team_members m
  WHERE m.user_id = _uid
    AND COALESCE(m.status,'active') = 'active'
    AND (m.effective_to IS NULL OR m.effective_to > now());

  WITH base AS MATERIALIZED (
    SELECT w.* FROM public.supervisory_work_item w
    WHERE (_domain IS NULL OR w.domain_code = upper(_domain))
      AND (_entity_id IS NULL OR w.entity_id = _entity_id)
      AND (_work_type IS NULL OR w.work_type = upper(_work_type))
  ), scoped AS (
    SELECT b.* FROM base b
    WHERE CASE _scope_u
      WHEN 'MY_WORK'             THEN b.effective_owner_id = _uid
      WHEN 'MY_TEAM'             THEN b.effective_team_id = ANY(_teams)
      WHEN 'UNASSIGNED'          THEN b.is_unassigned
      WHEN 'DUE_SOON'            THEN b.is_due_soon
      WHEN 'OVERDUE'             THEN b.is_overdue
      WHEN 'HIGH_PRIORITY'       THEN b.priority IN ('CRITICAL','HIGH')
      WHEN 'AWAITING_MY_APPROVAL' THEN b.decision_point
                                       AND b.work_state = 'AWAITING_DECISION'
                                       AND (b.maker_id IS NULL OR b.maker_id <> _uid)
      WHEN 'ALL'                 THEN true
      ELSE b.effective_owner_id = _uid END
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.is_overdue DESC,
            CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
                            WHEN 'LOW' THEN 4 ELSE 5 END,
            t.due_date NULLS LAST, t.sort_order), '[]'::jsonb)
       FROM (SELECT * FROM scoped LIMIT GREATEST(COALESCE(_limit,200), 1)) t),
    (SELECT jsonb_build_object(
      'MY_WORK',              count(*) FILTER (WHERE effective_owner_id = _uid),
      'MY_TEAM',              count(*) FILTER (WHERE effective_team_id = ANY(_teams)),
      'UNASSIGNED',           count(*) FILTER (WHERE is_unassigned),
      'DUE_SOON',             count(*) FILTER (WHERE is_due_soon),
      'OVERDUE',              count(*) FILTER (WHERE is_overdue),
      'HIGH_PRIORITY',        count(*) FILTER (WHERE priority IN ('CRITICAL','HIGH')),
      'AWAITING_MY_APPROVAL', count(*) FILTER (WHERE decision_point
                                                 AND work_state = 'AWAITING_DECISION'
                                                 AND (maker_id IS NULL OR maker_id <> _uid)),
      'ALL',                  count(*)
    ) FROM base)
  INTO _items, _counts;

  RETURN jsonb_build_object(
    'scope', _scope_u,
    'generated_at', now(),
    'counts', _counts,
    'items', _items
  );
END $function$;