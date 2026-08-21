create or replace function public.application_resolve_form_set(_regulator_id uuid, _sector_id uuid, _sub_sector_id uuid, _category_id uuid, _license_type text default null::text, _application_type text default 'pre_license'::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_pkg jsonb;
  v_items jsonb;
  v_scope text;
  v_types text[];
begin
  if _sector_id is null and _sub_sector_id is null and _category_id is null then
    return jsonb_build_object('resolved', false, 'reason', 'INCOMPLETE_TAXONOMY',
                              'source', 'none', 'items', '[]'::jsonb);
  end if;

  v_types := case when coalesce(_application_type, 'pre_license') = 'post_license'
                  then array['post_license','application']
                  else array['pre_license','application'] end;

  if _sector_id is not null and _sub_sector_id is not null and _category_id is not null then
    v_pkg := public.resolve_applicable_form_package(jsonb_build_object(
      'regulator_id', _regulator_id,
      'sector_id', _sector_id,
      'sub_sector_id', _sub_sector_id,
      'category_id', _category_id,
      'license_type', _license_type,
      'lifecycle_key', case when coalesce(_application_type,'pre_license')='post_license' then 'licensee' else 'applicant' end,
      'application_type', coalesce(_application_type, 'pre_license')));

    if coalesce((v_pkg->>'resolved')::boolean, false) then
      return v_pkg || jsonb_build_object('source', 'package', 'scope', 'package');
    end if;
  end if;

  for v_scope in select unnest(array['category','sub_sector','sector']) loop
    if (v_scope = 'category' and _category_id is null)
       or (v_scope = 'sub_sector' and _sub_sector_id is null)
       or (v_scope = 'sector' and _sector_id is null) then
      continue;
    end if;

    select jsonb_agg(x order by x->>'template_name')
      into v_items
      from (
        select jsonb_build_object(
                 'template_id', t.id,
                 'template_name', t.name,
                 'is_required', true,
                 'sequence', coalesce(t.form_order, 0),
                 'form_version_id', pv.id,
                 'form_version', pv.version) as x
          from public.form_templates t
          left join lateral (
            select v.id, v.version
              from public.form_versions v
             where v.template_id = t.id
               and v.status = 'published'
               and (v.effective_from is null or v.effective_from <= now())
               and (v.effective_until is null or v.effective_until >= now())
             order by v.version desc
             limit 1) pv on true
         where t.status = 'published'
           and t.form_type = any(v_types)
           and (t.regulator_id is null or _regulator_id is null or t.regulator_id = _regulator_id)
           and case v_scope
                 when 'category'   then t.category_id = _category_id
                 when 'sub_sector' then t.sub_sector_id = _sub_sector_id and t.category_id is null
                 else t.sector_id = _sector_id and t.sub_sector_id is null and t.category_id is null
               end
      ) s;

    if v_items is not null and jsonb_array_length(v_items) > 0 then
      return jsonb_build_object('resolved', true, 'source', 'template_taxonomy', 'scope', v_scope,
                                'package_id', null, 'applicability_rule_id', null, 'items', v_items);
    end if;
  end loop;

  return jsonb_build_object('resolved', false, 'reason', 'NO_APPLICABLE_FORMS',
                            'source', 'none', 'items', '[]'::jsonb);
end $function$;

grant execute on function public.application_resolve_form_set(uuid,uuid,uuid,uuid,text,text) to authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname='supabase_read_only_user') then
    execute 'grant execute on function public.application_resolve_form_set(uuid,uuid,uuid,uuid,text,text) to supabase_read_only_user';
  end if;
end $$;