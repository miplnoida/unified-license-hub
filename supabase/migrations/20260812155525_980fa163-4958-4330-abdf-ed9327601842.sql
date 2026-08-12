-- Freshness helper: latest change across the records an analysis actually depends on.
create or replace function public.supervisory_ai_source_updated_at(
  _module text,
  _record_id uuid,
  _entity_id uuid
) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case _module
    when 'examination' then greatest(
      (select e.updated_at from public.examinations e where e.id = _record_id),
      (select max(w.updated_at) from public.examination_workpapers w where w.examination_id = _record_id),
      (select max(f.updated_at) from public.examination_findings f where f.examination_id = _record_id),
      (select max(s.updated_at) from public.examination_scoping s where s.examination_id = _record_id),
      (select max(d.updated_at) from public.examination_data_requests d where d.examination_id = _record_id)
    )
    when 'complaints' then greatest(
      (select c.updated_at from public.complaints c where c.id = _record_id),
      (select max(t.updated_at) from public.complaint_investigation_tasks t where t.complaint_id = _record_id),
      (select max(ev.created_at) from public.complaint_evidence ev where ev.complaint_id = _record_id),
      (select max(r.updated_at) from public.complaint_rfis r where r.complaint_id = _record_id),
      (select max(k.created_at) from public.complaint_correspondence k where k.complaint_id = _record_id),
      (select max(q.created_at) from public.complaint_closure_reviews q where q.complaint_id = _record_id)
    )
    when 'enforcement' then greatest(
      (select a.updated_at from public.enforcement_actions a where a.id = _record_id),
      (select max(ev.created_at) from public.enforcement_case_events ev where ev.case_id = _record_id),
      (select max(o.updated_at) from public.enforcement_obligations o where o.case_id = _record_id),
      (select max(ce.created_at) from public.enforcement_compliance_evidence ce where ce.case_id = _record_id)
    )
    when 'licensing' then (select a.updated_at from public.applications a where a.id = _record_id)
    when 'prudential' then greatest(
      (select l.updated_at from public.licensees l where l.id = coalesce(_entity_id, _record_id)),
      (select max(rs.updated_at) from public.entity_risk_scores rs where rs.entity_id = coalesce(_entity_id, _record_id))
    )
    when 'conduct' then greatest(
      (select l.updated_at from public.licensees l where l.id = coalesce(_entity_id, _record_id)),
      (select max(c.updated_at) from public.complaints c where c.licensee_id = coalesce(_entity_id, _record_id))
    )
    when 'cross_module' then greatest(
      (select l.updated_at from public.licensees l where l.id = coalesce(_entity_id, _record_id)),
      (select max(rs.updated_at) from public.entity_risk_scores rs where rs.entity_id = coalesce(_entity_id, _record_id)),
      (select max(c.updated_at) from public.complaints c where c.licensee_id = coalesce(_entity_id, _record_id)),
      (select max(a.updated_at) from public.enforcement_actions a where a.entity_id = coalesce(_entity_id, _record_id)),
      (select max(e.updated_at) from public.examinations e where e.entity_id = coalesce(_entity_id, _record_id))
    )
    else null
  end;
$$;

grant execute on function public.supervisory_ai_source_updated_at(text, uuid, uuid) to authenticated;

-- Which AI sources may the current user see at all?
create or replace function public.supervisory_ai_report_sources()
returns table(source text, available boolean)
language sql stable security definer set search_path = public as $$
  select 'ai_insights'::text,
         coalesce(public.is_super_admin(auth.uid()), false)
         or public.can_view_advisory_ai('examination')
         or public.can_view_advisory_ai('enforcement')
         or public.can_view_advisory_ai('complaints')
         or public.can_view_advisory_ai('conduct')
         or public.can_view_advisory_ai('cross_module')
         or public.can_view_advisory_ai('executive')
  union all
  select 'application_assessment'::text,
         coalesce(public.is_super_admin(auth.uid()), false)
         or public.has_permission(auth.uid(), 'application_management', 'view')
         or public.has_permission(auth.uid(), 'application_management', 'view_all_entities')
  union all
  select 'fpa'::text,
         coalesce(public.is_super_admin(auth.uid()), false)
         or public.has_permission(auth.uid(), 'fit_and_proper', 'view')
         or public.has_permission(auth.uid(), 'fit_and_proper', 'view_all_entities');
$$;

grant execute on function public.supervisory_ai_report_sources() to authenticated;

-- Combined, permission-aware read index over every stored AI analysis.
create or replace function public.supervisory_ai_reports_index(
  _modules text[] default null,
  _analysis_types text[] default null,
  _entity_id uuid default null,
  _from timestamptz default null,
  _to timestamptz default null,
  _search text default null,
  _include_failed boolean default false,
  _confidence text default null,
  _freshness text default null,
  _limit integer default 25,
  _offset integer default 0
) returns table(
  id uuid,
  source text,
  module text,
  analysis_type text,
  title text,
  summary text,
  entity_id uuid,
  entity_name text,
  record_id uuid,
  record_reference text,
  subject_name text,
  period_key text,
  generated_at timestamptz,
  generated_by uuid,
  confidence text,
  report_state text,
  freshness text,
  limited_evidence boolean,
  flagged boolean,
  feedback text,
  review_status text,
  version_key text,
  total_count bigint,
  recent_7d bigint,
  outdated_count bigint,
  limited_count bigint,
  module_counts jsonb
)
language sql stable security definer set search_path = public as $$
  with raw as (
    -- 1. Advisory analyses (ai_insights)
    select
      i.id,
      'ai_insights'::text as source,
      i.module,
      i.analysis_type,
      coalesce(nullif(btrim(i.title), ''), i.analysis_type) as title,
      nullif(btrim(coalesce(i.payload->>'summary', coalesce(i.explanation, ''))), '') as summary,
      coalesce(i.entity_id, case when i.scope = 'entity' then i.scope_id end) as entity_id,
      coalesce(i.scope_id, i.object_id, i.entity_id) as record_id,
      i.period_key,
      i.generated_at,
      i.generated_by,
      case lower(coalesce(i.payload->>'confidence', ''))
        when 'high' then 'high' when 'moderate' then 'moderate' when 'medium' then 'moderate'
        when 'limited' then 'limited' when 'low' then 'limited' else null end as confidence,
      case
        when coalesce(i.provider_state, 'live') in ('live', 'success') then 'available'
        when i.provider_state = 'INSUFFICIENT_DATA' then 'limited'
        when i.provider_state in ('pending', 'processing', 'running') then 'processing'
        else 'failed'
      end as report_state,
      coalesce((i.payload->>'insufficient_evidence')::boolean, false)
        or lower(coalesce(i.payload->>'confidence','')) in ('limited','low') as limited_evidence,
      (i.feedback = 'flagged') as flagged,
      i.feedback,
      i.review_status,
      i.module || '|' || coalesce(i.analysis_type, '') || '|' ||
        coalesce(
          (coalesce(i.scope_id, i.object_id, i.entity_id))::text,
          'scope:' || coalesce(i.scope, '') || ':' || coalesce(i.period_key, '')
        ) as version_key,
      i.input_fingerprint
    from public.ai_insights i
    where (_modules is null or i.module = any(_modules))
      and public.can_view_advisory_ai(i.module, i.source_modules)

    union all

    -- 2. Licensing application AI assessments
    select
      x.id,
      'application_assessment'::text,
      'licensing'::text,
      'application_assessment'::text,
      'Licensing application AI assessment'::text,
      nullif(btrim(coalesce(x.summary, '')), ''),
      x.entity_id,
      x.application_id,
      null::text,
      coalesce(x.generated_at, x.created_at),
      null::uuid,
      case
        when x.confidence_score is null then null
        when x.confidence_score >= 0.75 then 'high'
        when x.confidence_score >= 0.5 then 'moderate'
        else 'limited' end,
      case
        when x.status in ('completed', 'ready') then 'available'
        when x.status in ('pending', 'processing', 'running', 'queued') then 'processing'
        else 'failed' end,
      (x.confidence_score is not null and x.confidence_score < 0.5),
      false,
      null::text,
      null::text,
      'licensing|application_assessment|' || x.application_id::text,
      x.source_payload_hash
    from (
      select aa.id, aa.application_id, aa.status, aa.summary, aa.confidence_score,
             aa.generated_at, aa.created_at, aa.source_payload_hash,
             (select l.holder_id from public.licenses l where l.application_id = aa.application_id
               order by l.created_at desc limit 1) as entity_id
      from public.application_ai_assessments aa
      where (_modules is null or 'licensing' = any(_modules))
        and public.can_read_application(auth.uid(), aa.application_id)
    ) x

    union all

    -- 3. Fit & Proper adverse-media screening analyses
    select
      r.id,
      'fpa'::text,
      'fit_proper'::text,
      'fp_ai_media_screening'::text,
      'Fit & Proper adverse-media screening analysis'::text,
      case when r.total_hits is not null and r.total_checks is not null
        then r.total_hits || ' potential adverse-media match(es) from ' || r.total_checks || ' check(s).'
        else null end,
      fa.licensee_id,
      coalesce(r.assessment_id, r.individual_id),
      null::text,
      coalesce(r.completed_at, r.started_at),
      r.triggered_by,
      null::text,
      case
        when r.status = 'completed' then 'available'
        when r.status in ('pending', 'running', 'processing') then 'processing'
        else 'failed' end,
      false,
      false,
      null::text,
      null::text,
      'fit_proper|fp_ai_media_screening|' || coalesce(r.assessment_id, r.individual_id)::text,
      null::text
    from public.fp_screening_runs r
    left join public.fp_assessments fa on fa.id = r.assessment_id
    where r.run_type = 'ai_media'
      and (_modules is null or 'fit_proper' = any(_modules))
      and (
        public.can_read_fp_assessment(auth.uid(), r.assessment_id)
        or public.can_read_fp_individual(auth.uid(), r.individual_id)
      )
  ),
  resolved as (
    select
      b.*,
      coalesce(
        (select l.name from public.licensees l where l.id = b.entity_id),
        case when b.source = 'application_assessment' then (
          select coalesce(a.data->>'organization_name', a.data->>'entity_name',
                          a.data->>'company_name', a.data->>'applicant_name')
          from public.applications a where a.id = b.record_id
        ) end
      ) as entity_name,
      case b.module
        when 'examination' then (select e.reference from public.examinations e where e.id = b.record_id)
        when 'complaints' then (select c.complaint_number from public.complaints c where c.id = b.record_id)
        when 'enforcement' then (select a.case_number from public.enforcement_actions a where a.id = b.record_id)
        when 'licensing' then (select a.application_number from public.applications a where a.id = b.record_id)
        when 'fit_proper' then (
          select fi.full_name from public.fp_individuals fi
          where fi.id = coalesce(
            (select fa2.individual_id from public.fp_assessments fa2 where fa2.id = b.record_id),
            b.record_id)
        )
        else null
      end as record_reference,
      case b.module
        when 'examination' then (select e.title from public.examinations e where e.id = b.record_id)
        when 'complaints' then (select c.subject from public.complaints c where c.id = b.record_id)
        else null
      end as subject_name,
      -- authoritative entity for record-scoped modules (a case id is never an entity id)
      case b.module
        when 'examination' then (select e.entity_id from public.examinations e where e.id = b.record_id)
        when 'complaints' then (select c.licensee_id from public.complaints c where c.id = b.record_id)
        when 'enforcement' then (select a.entity_id from public.enforcement_actions a where a.id = b.record_id)
        else null
      end as resolved_entity_id
    from raw b
  ),
  shaped as (
    select
      r.id, r.source, r.module, r.analysis_type, r.title, r.summary,
      coalesce(r.resolved_entity_id, r.entity_id) as entity_id,
      coalesce(
        (select l.name from public.licensees l where l.id = coalesce(r.resolved_entity_id, r.entity_id)),
        r.entity_name
      ) as entity_name,
      r.record_id, r.record_reference, r.subject_name, r.period_key,
      r.generated_at, r.generated_by, r.confidence, r.report_state,
      case
        when r.generated_at is null then 'unknown'
        when r.source = 'fpa' then 'unknown'
        else case
          when public.supervisory_ai_source_updated_at(
                 r.module, r.record_id, coalesce(r.resolved_entity_id, r.entity_id)) is null then 'unknown'
          when public.supervisory_ai_source_updated_at(
                 r.module, r.record_id, coalesce(r.resolved_entity_id, r.entity_id)) > r.generated_at
            then 'outdated'
          else 'current'
        end
      end as freshness,
      r.limited_evidence, r.flagged, r.feedback, r.review_status, r.version_key
    from resolved r
  ),
  filtered as (
    select s.*
    from shaped s
    where (_analysis_types is null or s.analysis_type = any(_analysis_types))
      and (_entity_id is null or s.entity_id = _entity_id)
      and (_from is null or s.generated_at >= _from)
      and (_to is null or s.generated_at < _to)
      and (_include_failed or s.report_state in ('available', 'limited'))
      and (_confidence is null or s.confidence = _confidence)
      and (_freshness is null or s.freshness = _freshness)
      and (
        _search is null or length(btrim(_search)) = 0
        or concat_ws(' ', s.title, s.analysis_type, s.summary, s.entity_name,
                     s.record_reference, s.subject_name)
           ilike '%' || btrim(_search) || '%'
      )
  ),
  totals as (
    select
      count(*) as total_count,
      count(*) filter (where generated_at >= now() - interval '7 days') as recent_7d,
      count(*) filter (where freshness = 'outdated') as outdated_count,
      count(*) filter (where limited_evidence) as limited_count,
      coalesce(jsonb_object_agg(module, n) filter (where module is not null), '{}'::jsonb) as module_counts
    from (
      select generated_at, freshness, limited_evidence, module,
             count(*) over (partition by module) as n
      from filtered
    ) z
  )
  select
    f.id, f.source, f.module, f.analysis_type, f.title, f.summary,
    f.entity_id, f.entity_name, f.record_id, f.record_reference, f.subject_name,
    f.period_key, f.generated_at, f.generated_by, f.confidence, f.report_state,
    f.freshness, f.limited_evidence, f.flagged, f.feedback, f.review_status, f.version_key,
    t.total_count, t.recent_7d, t.outdated_count, t.limited_count, t.module_counts
  from filtered f cross join totals t
  order by f.generated_at desc nulls last, f.id
  limit greatest(coalesce(_limit, 25), 1)
  offset greatest(coalesce(_offset, 0), 0);
$$;

grant execute on function public.supervisory_ai_reports_index(
  text[], text[], uuid, timestamptz, timestamptz, text, boolean, text, text, integer, integer
) to authenticated;

-- Filter options built from the full authorised set, not the current page.
create or replace function public.supervisory_ai_report_facets(
  _modules text[] default null,
  _from timestamptz default null,
  _to timestamptz default null,
  _search text default null,
  _include_failed boolean default false
) returns table(kind text, value text, label text, n bigint)
language sql stable security definer set search_path = public as $$
  with idx as (
    select * from public.supervisory_ai_reports_index(
      _modules, null, null, _from, _to, _search, _include_failed, null, null, 100000, 0)
  )
  select 'entity'::text, i.entity_id::text, i.entity_name, count(*)
  from idx i
  where i.entity_id is not null and i.entity_name is not null
  group by 2, 3
  union all
  select 'analysis_type'::text, i.analysis_type, i.analysis_type, count(*)
  from idx i
  where i.analysis_type is not null
  group by 2, 3;
$$;

grant execute on function public.supervisory_ai_report_facets(
  text[], timestamptz, timestamptz, text, boolean
) to authenticated;

-- Full authorised version history for one logical analysis, independent of paging.
create or replace function public.supervisory_ai_report_versions(_version_key text)
returns table(
  id uuid, source text, module text, analysis_type text, title text, summary text,
  entity_id uuid, entity_name text, record_id uuid, record_reference text, subject_name text,
  period_key text, generated_at timestamptz, generated_by uuid, confidence text,
  report_state text, freshness text, limited_evidence boolean, flagged boolean,
  feedback text, review_status text, version_key text
)
language sql stable security definer set search_path = public as $$
  select i.id, i.source, i.module, i.analysis_type, i.title, i.summary,
         i.entity_id, i.entity_name, i.record_id, i.record_reference, i.subject_name,
         i.period_key, i.generated_at, i.generated_by, i.confidence,
         i.report_state, i.freshness, i.limited_evidence, i.flagged,
         i.feedback, i.review_status, i.version_key
  from public.supervisory_ai_reports_index(null, null, null, null, null, null, true, null, null, 100000, 0) i
  where i.version_key = _version_key
  order by i.generated_at desc nulls last;
$$;

grant execute on function public.supervisory_ai_report_versions(text) to authenticated;