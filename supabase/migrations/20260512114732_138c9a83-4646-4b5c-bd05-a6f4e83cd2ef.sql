DO $$
DECLARE
  rec record;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  FOR rec IN
    SELECT a.id
      FROM public.applications a
     WHERE a.status = 'draft'
       AND (
         EXISTS (
           SELECT 1 FROM public.form_responses fr
            WHERE fr.entity_id = a.id
              AND fr.entity_type = 'application'
              AND fr.response_data IS NOT NULL
              AND jsonb_typeof(fr.response_data) = 'object'
              AND fr.response_data <> '{}'::jsonb
         )
         OR EXISTS (
           SELECT 1
             FROM jsonb_each(COALESCE(a.data->'forms_data', '{}'::jsonb)) kv
            WHERE jsonb_typeof(kv.value) = 'object'
              AND kv.value <> '{}'::jsonb
         )
       )
     ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
  LOOP
    BEGIN
      UPDATE public.applications
         SET status = 'in_progress', updated_at = now()
       WHERE id = rec.id AND status = 'draft';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping % : %', rec.id, SQLERRM;
    END;
  END LOOP;
END $$;