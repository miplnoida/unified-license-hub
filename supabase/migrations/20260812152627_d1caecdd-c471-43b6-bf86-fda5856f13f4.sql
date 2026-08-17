-- Read-only listing of previously generated advisory AI analyses for the
-- Supervisory AI Reports hub. Visibility is enforced per row with the existing
-- can_view_advisory_ai(module, source_modules) hardening, which is stricter
-- than the permissive report_management read policy on ai_insights.
create or replace function public.supervisory_ai_reports_list(
  _modules text[] default null,
  _analysis_types text[] default null,
  _entity_id uuid default null,
  _from timestamptz default null,
  _to timestamptz default null,
  _search text default null,
  _include_failed boolean default false,
  _limit integer default 25,
  _offset integer default 0
)
returns table (
  id uuid,
  module text,
  analysis_type text,
  title text,
  scope text,
  scope_id uuid,
  entity_id uuid,
  object_type text,
  object_id uuid,
  source_modules text[],
  period_key text,
  provider_state text,
  model text,
  input_fingerprint text,
  feedback text,
  generated_at timestamptz,
  generated_by uuid,
  summary text,
  confidence text,
  limitation_count integer,
  insufficient_evidence boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select i.*
    from public.ai_insights i
    where public.can_view_advisory_ai(i.module, i.source_modules)
      and (_modules is null or i.module = any(_modules))
      and (_analysis_types is null or i.analysis_type = any(_analysis_types))
      and (
        _entity_id is null
        or i.entity_id = _entity_id
        or i.scope_id = _entity_id
        or i.object_id = _entity_id
      )
      and (_from is null or i.generated_at >= _from)
      and (_to is null or i.generated_at <= _to)
      and (
        _include_failed
        or coalesce(i.provider_state, 'live') in ('live', 'success', 'INSUFFICIENT_DATA')
      )
      and (
        _search is null
        or length(btrim(_search)) = 0
        or i.title ilike '%' || btrim(_search) || '%'
        or i.analysis_type ilike '%' || btrim(_search) || '%'
        or coalesce(i.payload->>'summary', '') ilike '%' || btrim(_search) || '%'
      )
  )
  select
    v.id,
    v.module,
    v.analysis_type,
    v.title,
    v.scope,
    v.scope_id,
    v.entity_id,
    v.object_type,
    v.object_id,
    v.source_modules,
    v.period_key,
    v.provider_state,
    v.model,
    v.input_fingerprint,
    v.feedback,
    v.generated_at,
    v.generated_by,
    nullif(btrim(coalesce(v.payload->>'summary', coalesce(v.explanation, ''))), '') as summary,
    v.payload->>'confidence' as confidence,
    coalesce(jsonb_array_length(case when jsonb_typeof(v.payload->'limitations') = 'array'
      then v.payload->'limitations' else '[]'::jsonb end), 0) as limitation_count,
    coalesce((v.payload->>'insufficient_evidence')::boolean, false) as insufficient_evidence,
    count(*) over () as total_count
  from visible v
  order by v.generated_at desc nulls last
  limit greatest(coalesce(_limit, 25), 1)
  offset greatest(coalesce(_offset, 0), 0);
$$;

grant execute on function public.supervisory_ai_reports_list(
  text[], text[], uuid, timestamptz, timestamptz, text, boolean, integer, integer
) to authenticated;

-- Full payload for a single analysis, same visibility rules.
create or replace function public.supervisory_ai_report_detail(_id uuid)
returns table (
  id uuid,
  module text,
  analysis_type text,
  title text,
  scope text,
  scope_id uuid,
  entity_id uuid,
  object_type text,
  object_id uuid,
  source_modules text[],
  source_records jsonb,
  citations jsonb,
  period_key text,
  provider_state text,
  model text,
  input_fingerprint text,
  feedback text,
  generated_at timestamptz,
  generated_by uuid,
  explanation text,
  recommendation text,
  payload jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.module, i.analysis_type, i.title, i.scope, i.scope_id, i.entity_id,
    i.object_type, i.object_id, i.source_modules, i.source_records, i.citations,
    i.period_key, i.provider_state, i.model, i.input_fingerprint, i.feedback,
    i.generated_at, i.generated_by, i.explanation, i.recommendation,
    coalesce(i.payload, '{}'::jsonb)
  from public.ai_insights i
  where i.id = _id
    and public.can_view_advisory_ai(i.module, i.source_modules)
  limit 1;
$$;

grant execute on function public.supervisory_ai_report_detail(uuid) to authenticated;