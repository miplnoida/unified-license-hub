
DO $$
DECLARE
  rec RECORD;
  new_snap jsonb;
  section jsonb;
  new_section jsonb;
  new_fields jsonb;
  field jsonb;
  fname text;
  base text;
  candidate text;
  seen jsonb;
  suffix_idx int;
BEGIN
  FOR rec IN SELECT id, schema_snapshot FROM public.form_versions
             WHERE jsonb_typeof(schema_snapshot) = 'array'
  LOOP
    new_snap := '[]'::jsonb;
    FOR section IN SELECT * FROM jsonb_array_elements(rec.schema_snapshot)
    LOOP
      IF jsonb_typeof(section->'fields') = 'array' THEN
        new_fields := '[]'::jsonb;
        seen := '{}'::jsonb;
        FOR field IN SELECT * FROM jsonb_array_elements(section->'fields')
        LOOP
          fname := field->>'fieldName';
          IF fname IS NULL OR fname = '' THEN
            new_fields := new_fields || jsonb_build_array(field);
            CONTINUE;
          END IF;

          IF seen ? fname THEN
            base := fname;
            suffix_idx := 0;
            LOOP
              candidate := base || '_' || chr(98 + suffix_idx); -- _b, _c, ...
              EXIT WHEN NOT (seen ? candidate) OR suffix_idx >= 24;
              suffix_idx := suffix_idx + 1;
            END LOOP;
            field := jsonb_set(field, '{fieldName}', to_jsonb(candidate), true);
            fname := candidate;
          END IF;

          seen := seen || jsonb_build_object(fname, true);
          new_fields := new_fields || jsonb_build_array(field);
        END LOOP;
        new_section := jsonb_set(section, '{fields}', new_fields, true);
      ELSE
        new_section := section;
      END IF;
      new_snap := new_snap || jsonb_build_array(new_section);
    END LOOP;

    IF new_snap IS DISTINCT FROM rec.schema_snapshot THEN
      UPDATE public.form_versions SET schema_snapshot = new_snap WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;
