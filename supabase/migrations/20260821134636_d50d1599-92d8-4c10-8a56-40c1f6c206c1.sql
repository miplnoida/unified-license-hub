
-- EPR-05 gate 9/10: explicit application <-> F&P assessment linkage
create table if not exists public.application_fp_links (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  assessment_id uuid not null references public.fp_assessments(id) on delete cascade,
  role_note text,
  is_required boolean not null default true,
  linked_by uuid,
  created_at timestamptz not null default now(),
  unique (application_id, assessment_id)
);

grant select on public.application_fp_links to authenticated;
grant all on public.application_fp_links to service_role;
alter table public.application_fp_links enable row level security;

drop policy if exists "fp links readable by licensing and applicant" on public.application_fp_links;
create policy "fp links readable by licensing and applicant"
  on public.application_fp_links for select to authenticated
  using (
    public.has_permission(auth.uid(), 'application_management', 'view')
    or exists (select 1 from public.applications a
                where a.id = application_id
                  and (a.applicant_id = auth.uid() or public.wb_entity_member(a.entity_id)))
  );

create index if not exists idx_application_fp_links_app on public.application_fp_links(application_id);

-- Gate 9: evaluate the explicitly linked assessment, never "the latest determined".
create or replace function public.application_fp_gate(_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  v_entity uuid;
  v_rows jsonb;
  v_pending int := 0;
  v_adverse int := 0;
  v_conditional int := 0;
  v_linkage text;
  v_explicit int := 0;
BEGIN
  SELECT entity_id INTO v_entity FROM applications WHERE id = _application_id;

  SELECT count(*) INTO v_explicit
    FROM application_fp_links WHERE application_id = _application_id;

  IF v_explicit = 0 AND v_entity IS NULL THEN
    RETURN jsonb_build_object('required', false, 'linked', '[]'::jsonb, 'linkage', 'none',
      'pending', 0, 'adverse', 0, 'conditional', 0, 'blocking', false);
  END IF;

  v_linkage := CASE WHEN v_explicit > 0 THEN 'explicit' ELSE 'entity_inferred' END;

  SELECT coalesce(jsonb_agg(x.row ORDER BY x.person), '[]'::jsonb),
         count(*) FILTER (WHERE x.outcome IS NULL AND x.is_required),
         count(*) FILTER (WHERE lower(coalesce(x.outcome, '')) IN ('not_fit','adverse','rejected','fail','refused')),
         count(*) FILTER (WHERE lower(coalesce(x.outcome, '')) IN ('conditional','fit_with_conditions'))
    INTO v_rows, v_pending, v_adverse, v_conditional
  FROM (
    SELECT coalesce(i.full_name, 'Unknown') AS person,
           d.outcome AS outcome,
           coalesce(l.is_required, true) AS is_required,
           jsonb_build_object(
             'assessment_id', a.id,
             'person', coalesce(i.full_name, 'Unknown'),
             'role', coalesce(l.role_note, r.role_title, r.role_type, a.assessment_type),
             'stage', a.status,
             'status', a.status,
             'determination', d.outcome,
             'determined_at', d.determined_at,
             'is_required', coalesce(l.is_required, true),
             'linkage', CASE WHEN l.id IS NOT NULL THEN 'explicit' ELSE 'entity_inferred' END,
             'licensing_blocker',
               (coalesce(l.is_required, true) AND d.outcome IS NULL)
               OR lower(coalesce(d.outcome, '')) IN ('not_fit','adverse','rejected','fail','refused'),
             'href', '/fpa/assessments/' || a.id
           ) AS row
      FROM fp_assessments a
      LEFT JOIN application_fp_links l
             ON l.assessment_id = a.id AND l.application_id = _application_id
      LEFT JOIN fp_individuals i ON i.id = a.individual_id
      LEFT JOIN fp_individual_roles r ON r.id = a.role_id
      LEFT JOIN fp_determinations d ON d.assessment_id = a.id AND coalesce(d.is_current, true)
     WHERE coalesce(a.status, '') NOT IN ('withdrawn', 'cancelled')
       AND (
         (v_explicit > 0 AND l.id IS NOT NULL)                      -- explicit linkage wins
         OR (v_explicit = 0 AND v_entity IS NOT NULL AND a.licensee_id = v_entity)
       )
  ) x;

  RETURN jsonb_build_object(
    'required', jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) > 0,
    'linkage', v_linkage,
    'linked', coalesce(v_rows, '[]'::jsonb),
    'pending', coalesce(v_pending, 0),
    'adverse', coalesce(v_adverse, 0),
    'conditional', coalesce(v_conditional, 0),
    'blocking', coalesce(v_pending, 0) > 0 OR coalesce(v_adverse, 0) > 0
  );
END;
$function$;

-- Gate 11: single canonical decision-gate source now includes the F&P gate.
create or replace function public.decision_gate_status(_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  v_eval RECORD;
  v_blockers int := 0;
  v_open_rfi int := 0;
  v_paid numeric := 0;
  v_gates jsonb := '[]'::jsonb;
  v_blocking int := 0;
  v_fp jsonb;
BEGIN
  SELECT * INTO v_eval
  FROM public.sufficiency_evaluations
  WHERE application_id = _application_id
  ORDER BY evaluated_at DESC
  LIMIT 1;

  IF v_eval.id IS NOT NULL THEN
    SELECT count(*) INTO v_blockers
    FROM public.sufficiency_evaluation_results r
    WHERE r.evaluation_id = v_eval.id
      AND r.status = 'fail'
      AND r.severity = 'blocker'
      AND NOT EXISTS (SELECT 1 FROM public.sufficiency_overrides o WHERE o.evaluation_result_id = r.id);
  END IF;

  SELECT count(*) INTO v_open_rfi
  FROM public.application_rfis
  WHERE application_id = _application_id AND status = 'open';

  SELECT coalesce(sum(amount), 0) INTO v_paid
  FROM public.payments
  WHERE application_id = _application_id AND status IN ('paid','completed','verified','success');

  v_fp := public.application_fp_gate(_application_id);

  v_gates := v_gates || jsonb_build_object(
    'key', 'sufficiency_blockers',
    'label', 'Sufficiency blockers resolved or overridden',
    'blocking', true,
    'passed', (v_eval.id IS NOT NULL AND v_blockers = 0),
    'detail', CASE
      WHEN v_eval.id IS NULL THEN 'No sufficiency evaluation has been run'
      WHEN v_blockers > 0 THEN v_blockers || ' unresolved blocker(s)'
      ELSE 'All blockers cleared' END);

  v_gates := v_gates || jsonb_build_object(
    'key', 'open_rfis',
    'label', 'No open requests for information',
    'blocking', true,
    'passed', (v_open_rfi = 0),
    'detail', CASE WHEN v_open_rfi > 0 THEN v_open_rfi || ' open RFI(s)' ELSE 'None open' END);

  v_gates := v_gates || jsonb_build_object(
    'key', 'fit_and_proper',
    'label', 'Required fit & proper assessments determined',
    'blocking', true,
    'passed', NOT coalesce((v_fp->>'blocking')::boolean, false),
    'detail', CASE
      WHEN NOT coalesce((v_fp->>'required')::boolean, false) THEN 'No fit & proper assessment required'
      ELSE coalesce(v_fp->>'pending','0') || ' pending, ' || coalesce(v_fp->>'adverse','0') || ' adverse'
           || ' (' || coalesce(v_fp->>'linkage','none') || ' linkage)' END,
    'evidence', v_fp);

  v_gates := v_gates || jsonb_build_object(
    'key', 'payment',
    'label', 'Application fees settled',
    'blocking', false,
    'passed', (v_paid > 0),
    'detail', CASE WHEN v_paid > 0 THEN 'Settled amount ' || v_paid::text ELSE 'No settled payment recorded' END);

  SELECT count(*) INTO v_blocking
  FROM jsonb_array_elements(v_gates) g
  WHERE (g->>'blocking')::boolean AND NOT (g->>'passed')::boolean;

  RETURN jsonb_build_object(
    'application_id', _application_id,
    'ready', v_blocking = 0,
    'blocking_unmet', v_blocking,
    'evaluated_at', now(),
    'gates', v_gates);
END;
$function$;

-- Gate 14: duplicate licence issuance invariant (one licence per application).
create unique index if not exists uq_licenses_application
  on public.licenses(application_id) where application_id is not null;

-- Gate 13: no authoritative browser DML on licences / pinned form requirements.
revoke insert, update, delete on public.licenses from authenticated, anon;
revoke insert, update, delete on public.application_form_requirements from authenticated, anon;
