CREATE OR REPLACE FUNCTION public.mark_application_in_progress(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, applicant_id, status
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND');
  END IF;

  IF v_uid IS NOT NULL AND v_app.applicant_id <> v_uid THEN
    RETURN jsonb_build_object('error','Not owner','code','FORBIDDEN');
  END IF;

  IF v_app.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_app.status, 'changed', false);
  END IF;

  UPDATE public.applications
     SET status = 'in_progress', updated_at = now()
   WHERE id = _application_id AND status = 'draft';

  RETURN jsonb_build_object('ok', true, 'status', 'in_progress', 'changed', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_application_in_progress(uuid) TO authenticated, service_role;

-- Safe row-by-row backfill that skips rows blocked by other guards (e.g. duplicate active)
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  FOR r IN
    SELECT a.id
      FROM public.applications a
     WHERE a.status = 'draft'
       AND (
         EXISTS (
           SELECT 1 FROM public.form_responses fr
            WHERE fr.entity_type = 'application' AND fr.entity_id = a.id
         )
         OR (
           a.data ? 'forms_data'
           AND EXISTS (
             SELECT 1
               FROM jsonb_each(a.data->'forms_data') e
              WHERE jsonb_typeof(e.value) = 'object'
                AND (SELECT count(*) FROM jsonb_object_keys(e.value)) > 0
           )
         )
       )
  LOOP
    BEGIN
      PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
      UPDATE public.applications
         SET status = 'in_progress', updated_at = now()
       WHERE id = r.id AND status = 'draft';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped backfill for application %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;