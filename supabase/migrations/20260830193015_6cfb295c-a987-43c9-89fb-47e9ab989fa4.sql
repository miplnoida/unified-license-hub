-- SR-23: repair every stale DATABASE ROUTINE BODY contract found by the new
-- internal-contract gate (scripts/system-runtime/verify-internal-contracts.mjs).
--
-- Routine bodies reference columns that are resolved only at EXECUTION time, so a
-- renamed/dropped column stays invisible to catalog-level checks and surfaces to
-- the user as an opaque HTTP 400 on a screen. Every replacement below is a repoint
-- to the canonical live column. No table, policy, grant or role changes.
--
-- Runtime failures repaired here:
--   RF-01/02/03 /admin/forms*             get_form_version_usage_counts  42702 ambiguous version_id
--   RF-07       /conduct/interventions/:id conduct_intervention_case     licensees.entity_name -> name
--   RF-09       /conduct/supervision-loop  conduct_supervision_learning  btrim(jsonb) 42883
--   RF-11/12    /licenses/:id, lifecycle   license_related_cases         fp_individual_roles.person_id -> individual_id
--   RF-15       /settings/notifications    notification_preference_matrix notification_event_configs.entity_type
-- Latent defects of the same class (not yet user-visible): conduct_attention_case,
-- conduct_plan_case, conduct_related_cases, correspondence_export_manifest,
-- entity360_section, returns_test_obligation_rule, recompute_return_ratios,
-- complaint_rfi_finalize_evidence, finalize_complaint_with_attachments,
-- trg_examination_finding_notification.
--
-- Each routine is rewritten from its own current definition with an explicit,
-- asserted textual repoint: if a target string is absent the migration ABORTS
-- rather than silently leaving a stale contract in place.

-- Canonical helper: thematic-review regulatory learning is stored as jsonb and may
-- hold a JSON string or an object. One place decides how it becomes text.
CREATE OR REPLACE FUNCTION public.jsonb_to_learning_text(_v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT NULLIF(btrim(CASE
    WHEN _v IS NULL OR jsonb_typeof(_v) = 'null' THEN ''
    WHEN jsonb_typeof(_v) = 'string' THEN _v #>> '{}'
    ELSE _v::text
  END), '')
$fn$;

REVOKE ALL ON FUNCTION public.jsonb_to_learning_text(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsonb_to_learning_text(jsonb) TO authenticated, service_role;

DO $do$
DECLARE
  v_rec   record;
  v_def   text;
  v_count int;
BEGIN
  FOR v_rec IN
    SELECT * FROM (VALUES
      ('trg_examination_finding_notification',
       'COALESCE(l.entity_name, l.legal_name, l.id::text)',
       'COALESCE(l.name, l.id::text)'),
      ('finalize_complaint_with_attachments',
       'eua.licensee_id', 'eua.entity_id'),
      ('conduct_attention_case',        'l.entity_name', 'l.name'),
      ('conduct_related_cases',         'l.entity_name', 'l.name'),
      ('correspondence_export_manifest','l.entity_name', 'l.name'),
      ('conduct_plan_case',             'l.entity_name', 'l.name'),
      ('conduct_intervention_case',     'l.entity_name', 'l.name'),
      ('conduct_intervention_case',
       'SELECT entity_name FROM public.licensees',
       'SELECT name FROM public.licensees'),
      ('license_related_cases',
       '''person_id'', r.person_id', '''person_id'', r.individual_id'),
      ('license_related_cases',
       '''/fpa/individuals/'' || r.person_id', '''/fpa/individuals/'' || r.individual_id'),
      ('entity360_section', 'dc.label', 'dc.name'),
      ('entity360_section', 'dc.key',   'dc.code'),
      ('returns_test_obligation_rule', 'f.classification_value_id', 'f.value_uuid'),
      -- notification_event_configs has no entity_type; module is the canonical
      -- grouping and notification_type is the closest typed discriminator.
      ('notification_preference_matrix',
       'public.notification_module_for(c.event_key, c.entity_type)',
       'COALESCE(NULLIF(c.module, ''''), public.notification_module_for(c.event_key, c.notification_type))'),
      -- complaint_rfi_responses stores rfi_item_id and an ARRAY of upload ids.
      -- Repointed as ONE atomic replacement: splitting it left a residual
      -- resp.file_upload_id reference behind.
      ('complaint_rfi_finalize_evidence',
       'SELECT resp.id AS response_id, resp.file_upload_id, fu.file_name, fu.metadata
      FROM public.complaint_rfi_responses resp
      JOIN public.complaint_rfi_items it ON it.id = resp.item_id
      LEFT JOIN public.file_uploads fu ON fu.id = resp.file_upload_id
     WHERE it.rfi_id = _rfi_id AND resp.file_upload_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.complaint_evidence e
                        WHERE e.complaint_id = r.complaint_id AND e.file_upload_id = resp.file_upload_id)',
       'SELECT resp.id AS response_id, up.file_upload_id, fu.file_name, fu.metadata
      FROM public.complaint_rfi_responses resp
      JOIN public.complaint_rfi_items it ON it.id = resp.rfi_item_id
      CROSS JOIN LATERAL unnest(COALESCE(resp.file_upload_ids, ARRAY[]::uuid[])) AS up(file_upload_id)
      LEFT JOIN public.file_uploads fu ON fu.id = up.file_upload_id
     WHERE it.rfi_id = _rfi_id
       AND NOT EXISTS (SELECT 1 FROM public.complaint_evidence e
                        WHERE e.complaint_id = r.complaint_id AND e.file_upload_id = up.file_upload_id)'),
      -- return_form_data is one row per FIELD (form_id, field_name, field_value),
      -- never one row per form with a form_data document.
      ('recompute_return_ratios',
       'SELECT COALESCE(jsonb_object_agg(rfd.form_template_id::text, rfd.form_data), ''{}''::jsonb)
  INTO v_data FROM public.return_form_data rfd WHERE rfd.return_id = _return_id;',
       'SELECT COALESCE(jsonb_object_agg(g.form_id::text, g.fields), ''{}''::jsonb)
  INTO v_data
  FROM (
    SELECT rfd.form_id, jsonb_object_agg(rfd.field_name, to_jsonb(rfd.field_value)) AS fields
    FROM public.return_form_data rfd
    WHERE rfd.return_id = _return_id AND rfd.field_name IS NOT NULL
    GROUP BY rfd.form_id
  ) g;'),
      -- version_id is also an OUT column of get_form_version_usage_counts, so the
      -- unqualified reference raised 42702 and /admin/forms returned HTTP 400.
      ('get_form_version_usage_counts',
       'SELECT version_id AS vid, count(*)::bigint AS cnt
    FROM public.form_responses
    WHERE version_id IN (SELECT id FROM vs)',
       'SELECT fr.version_id AS vid, count(*)::bigint AS cnt
    FROM public.form_responses fr
    WHERE fr.version_id IN (SELECT id FROM vs)'),
      ('get_form_version_usage_counts',
       'AND status = ''submitted''', 'AND fr.status = ''submitted'''),
      ('conduct_supervision_learning',
       '''learning'',t.regulatory_learning,',
       '''learning'', public.jsonb_to_learning_text(t.regulatory_learning),'),
      ('conduct_supervision_learning',
       'WHERE t.regulatory_learning IS NOT NULL AND length(trim(t.regulatory_learning)) > 0',
       'WHERE public.jsonb_to_learning_text(t.regulatory_learning) IS NOT NULL')
    ) AS t(routine, find, repl)
  LOOP
    SELECT count(*) INTO v_count
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_rec.routine;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'SR-23: expected exactly one public.% routine, found %', v_rec.routine, v_count;
    END IF;

    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_rec.routine;

    IF position(v_rec.find IN v_def) = 0 THEN
      RAISE EXCEPTION 'SR-23: repoint target not present in public.%: %', v_rec.routine, v_rec.find;
    END IF;

    EXECUTE replace(v_def, v_rec.find, v_rec.repl);

    -- Fail immediately, naming the exact step, if the repoint did not take.
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_rec.routine;
    IF position(v_rec.find IN v_def) > 0 THEN
      RAISE EXCEPTION 'SR-23: repoint did not take in public.%: %', v_rec.routine, v_rec.find;
    END IF;
  END LOOP;
END
$do$;

-- Post-condition assertions: none of the repaired routine bodies may still carry
-- the stale reference after this migration.
DO $do$
DECLARE
  v_rec  record;
  v_bad  text[] := ARRAY[]::text[];
BEGIN
  FOR v_rec IN
    SELECT * FROM (VALUES
      ('trg_examination_finding_notification', 'l.entity_name'),
      ('finalize_complaint_with_attachments',  'eua.licensee_id'),
      ('conduct_attention_case',               'l.entity_name'),
      ('conduct_related_cases',                'l.entity_name'),
      ('correspondence_export_manifest',       'l.entity_name'),
      ('conduct_plan_case',                    'l.entity_name'),
      ('conduct_intervention_case',            'l.entity_name'),
      ('license_related_cases',                'r.person_id'),
      ('entity360_section',                    'dc.label'),
      ('entity360_section',                    'dc.key'),
      ('returns_test_obligation_rule',         'f.classification_value_id'),
      ('notification_preference_matrix',       'c.entity_type'),
      -- Markers must not be substrings of the CORRECT names
      -- (resp.file_upload_ids / resp.rfi_item_id), hence the surrounding syntax.
      ('complaint_rfi_finalize_evidence',      '= resp.file_upload_id)'),
      ('complaint_rfi_finalize_evidence',      'it.id = resp.item_id'),
      ('recompute_return_ratios',              'rfd.form_template_id'),
      ('conduct_supervision_learning',         'trim(t.regulatory_learning)')
    ) AS t(routine, stale)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_rec.routine
         AND position(v_rec.stale IN pg_get_functiondef(p.oid)) > 0
    ) THEN
      v_bad := v_bad || format('%s -> %s', v_rec.routine, v_rec.stale);
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'SR-23: stale routine contracts still present: %', array_to_string(v_bad, ', ');
  END IF;
END
$do$;