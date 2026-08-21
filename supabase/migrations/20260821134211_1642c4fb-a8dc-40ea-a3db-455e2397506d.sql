
-- EPR-05 closure gate 1/2: server-authoritative application form applicability
create or replace function public.application_resolve_form_set(
  _regulator_id uuid,
  _sector_id uuid,
  _sub_sector_id uuid,
  _category_id uuid,
  _license_type text default null,
  _application_type text default 'pre_license'
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_pkg jsonb;
  v_items jsonb;
  v_scope text;
begin
  if _sector_id is null or _sub_sector_id is null or _category_id is null then
    return jsonb_build_object('resolved', false, 'reason', 'INCOMPLETE_TAXONOMY',
                              'source', 'none', 'items', '[]'::jsonb);
  end if;

  -- 1) Configured Forms & Packages authority.
  v_pkg := public.resolve_applicable_form_package(jsonb_build_object(
    'regulator_id', _regulator_id,
    'sector_id', _sector_id,
    'sub_sector_id', _sub_sector_id,
    'category_id', _category_id,
    'license_type', _license_type,
    'lifecycle_key', 'applicant',
    'application_type', coalesce(_application_type, 'pre_license')));

  if coalesce((v_pkg->>'resolved')::boolean, false) then
    return v_pkg || jsonb_build_object('source', 'package', 'scope', 'package');
  end if;

  -- 2) Configured template taxonomy ladder (category -> sub-sector -> sector),
  --    executed on the server so the browser never derives the form set.
  for v_scope in select unnest(array['category','sub_sector','sector']) loop
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
           and t.form_type in ('pre_license', 'application')
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
end $$;

revoke all on function public.application_resolve_form_set(uuid,uuid,uuid,uuid,text,text) from public;
grant execute on function public.application_resolve_form_set(uuid,uuid,uuid,uuid,text,text) to authenticated, service_role;


create or replace function public.application_classification_update(
  _application_id uuid,
  _sector_id uuid default null,
  _sub_sector_id uuid default null,
  _category_id uuid default null,
  _license_type text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_app record;
  v_editable boolean;
  v_sec record; v_sub record; v_cat record;
  v_set jsonb;
  v_item jsonb;
  v_tids uuid[] := '{}';
  v_versions jsonb := '{}'::jsonb;
  v_data jsonb;
  v_prev_forms jsonb;
  v_kept jsonb := '{}'::jsonb;
  v_retired jsonb := '{}'::jsonb;
  v_key text;
  v_pruned int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED');
  end if;

  select * into v_app from public.applications where id = _application_id for update;
  if not found then
    return jsonb_build_object('error','Application not found','code','NOT_FOUND');
  end if;

  if not (v_app.applicant_id = v_uid
          or public.has_permission(v_uid,'application_management','edit')
          or public.wb_entity_member(v_app.entity_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_editable := coalesce(lower(v_app.status),'draft')
                in ('draft','in_progress','resubmission_requested','query_raised');
  if not v_editable then
    return jsonb_build_object('error','Application is not in an editable state',
                              'code','APPLICATION_NOT_EDITABLE','status',v_app.status);
  end if;

  -- Taxonomy relationship validation (server authority).
  if _sector_id is not null then
    select * into v_sec from public.sectors where id = _sector_id and status = 'active';
    if not found then return jsonb_build_object('error','Unknown or inactive sector','code','INVALID_SECTOR'); end if;
  end if;
  if _sub_sector_id is not null then
    select * into v_sub from public.sub_sectors where id = _sub_sector_id and status = 'active';
    if not found then return jsonb_build_object('error','Unknown or inactive sub-sector','code','INVALID_SUB_SECTOR'); end if;
    if v_sub.sector_id is distinct from _sector_id then
      return jsonb_build_object('error','Sub-sector does not belong to the selected sector','code','TAXONOMY_MISMATCH');
    end if;
  end if;
  if _category_id is not null then
    select * into v_cat from public.categories where id = _category_id and status = 'active';
    if not found then return jsonb_build_object('error','Unknown or inactive category','code','INVALID_CATEGORY'); end if;
    if v_cat.sub_sector_id is distinct from _sub_sector_id then
      return jsonb_build_object('error','Category does not belong to the selected sub-sector','code','TAXONOMY_MISMATCH');
    end if;
  end if;
  if _category_id is not null and _sub_sector_id is null then
    return jsonb_build_object('error','Category requires a sub-sector','code','TAXONOMY_MISMATCH');
  end if;
  if _sub_sector_id is not null and _sector_id is null then
    return jsonb_build_object('error','Sub-sector requires a sector','code','TAXONOMY_MISMATCH');
  end if;

  v_set := public.application_resolve_form_set(
             v_app.regulator_id, _sector_id, _sub_sector_id, _category_id,
             coalesce(nullif(_license_type,''), v_app.license_type),
             coalesce(v_app.data->>'application_type','pre_license'));

  for v_item in select * from jsonb_array_elements(coalesce(v_set->'items','[]'::jsonb)) loop
    v_tids := v_tids || (v_item->>'template_id')::uuid;
    if nullif(v_item->>'form_version_id','') is not null then
      v_versions := v_versions || jsonb_build_object(v_item->>'template_id', v_item->>'form_version_id');
    end if;
  end loop;

  -- Draft answers: keep applicable, ARCHIVE (never destroy) the rest.
  v_data := coalesce(v_app.data, '{}'::jsonb);
  v_prev_forms := coalesce(v_data->'forms_data', '{}'::jsonb);
  v_retired := coalesce(v_data->'retired_forms_data', '{}'::jsonb);
  for v_key in select jsonb_object_keys(v_prev_forms) loop
    if v_key = any (select unnest(v_tids)::text) then
      v_kept := v_kept || jsonb_build_object(v_key, v_prev_forms->v_key);
    else
      v_retired := v_retired || jsonb_build_object(v_key, v_prev_forms->v_key);
      v_pruned := v_pruned + 1;
    end if;
  end loop;

  v_data := v_data
    || jsonb_build_object(
         'sector_id', coalesce(_sector_id::text, ''),
         'sub_sector_id', coalesce(_sub_sector_id::text, ''),
         'category_id', coalesce(_category_id::text, ''),
         'sector_name', coalesce(v_sec.name, ''),
         'sub_sector_name', coalesce(v_sub.name, ''),
         'category_name', coalesce(v_cat.name, ''),
         'form_template_ids', to_jsonb(coalesce(array(select unnest(v_tids)::text), '{}'::text[])),
         'form_version_ids', v_versions,
         'forms_data', v_kept,
         'retired_forms_data', v_retired,
         'form_applicability', jsonb_build_object(
            'source', v_set->>'source',
            'scope', v_set->>'scope',
            'package_id', v_set->>'package_id',
            'applicability_rule_id', v_set->>'applicability_rule_id',
            'resolved_at', now()));

  update public.applications
     set data = v_data,
         license_type = coalesce(nullif(_license_type,''), license_type),
         updated_at = now()
   where id = _application_id;

  -- Server-owned requirement pin for this application.
  delete from public.application_form_requirements
   where application_id = _application_id
     and (array_length(v_tids,1) is null or template_id <> all (v_tids));

  for v_item in select * from jsonb_array_elements(coalesce(v_set->'items','[]'::jsonb)) loop
    if nullif(v_item->>'form_version_id','') is null then continue; end if;
    insert into public.application_form_requirements
      (application_id, template_id, form_version_id, package_id, applicability_rule_id, is_required, sequence)
    values (_application_id, (v_item->>'template_id')::uuid, (v_item->>'form_version_id')::uuid,
            nullif(v_set->>'package_id','')::uuid, nullif(v_set->>'applicability_rule_id','')::uuid,
            coalesce((v_item->>'is_required')::boolean, true), coalesce((v_item->>'sequence')::int, 0))
    on conflict (application_id, template_id)
      do update set form_version_id = excluded.form_version_id,
                    is_required = excluded.is_required,
                    sequence = excluded.sequence,
                    updated_at = now();
  end loop;

  perform public.create_audit_log(
    v_uid, 'application.classification.updated', 'application', _application_id::text, null,
    jsonb_build_object('sector_id',_sector_id,'sub_sector_id',_sub_sector_id,'category_id',_category_id,
                       'license_type', coalesce(nullif(_license_type,''), v_app.license_type),
                       'source', v_set->>'source', 'scope', v_set->>'scope',
                       'templates', to_jsonb(coalesce(array(select unnest(v_tids)::text),'{}'::text[])),
                       'archived_form_answers', v_pruned), null);

  return jsonb_build_object(
    'success', true,
    'application_id', _application_id,
    'resolved', coalesce((v_set->>'resolved')::boolean, false),
    'source', v_set->>'source',
    'scope', v_set->>'scope',
    'package_id', v_set->>'package_id',
    'items', coalesce(v_set->'items','[]'::jsonb),
    'form_template_ids', to_jsonb(coalesce(array(select unnest(v_tids)::text),'{}'::text[])),
    'form_version_ids', v_versions,
    'archived_form_answers', v_pruned);
end $$;

revoke all on function public.application_classification_update(uuid,uuid,uuid,uuid,text) from public;
grant execute on function public.application_classification_update(uuid,uuid,uuid,uuid,text) to authenticated, service_role;
