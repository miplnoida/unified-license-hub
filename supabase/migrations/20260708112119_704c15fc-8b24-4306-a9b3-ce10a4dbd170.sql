
DO $$
DECLARE
  r RECORD;
  new_name text;
  suffix_idx int;
BEGIN
  FOR r IN
    SELECT id, version_id, section_id, field_name
    FROM (
      SELECT id, version_id, section_id, field_name,
             row_number() OVER (
               PARTITION BY version_id, section_id, field_name
               ORDER BY sort_order NULLS LAST, created_at NULLS LAST, id
             ) AS rn
      FROM public.form_fields
      WHERE field_name IS NOT NULL
    ) x
    WHERE rn > 1
    ORDER BY version_id, section_id, field_name, id
  LOOP
    suffix_idx := 1;
    LOOP
      new_name := r.field_name || '_' || chr(97 + suffix_idx); -- _b, _c, _d...
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.form_fields
        WHERE version_id = r.version_id
          AND section_id IS NOT DISTINCT FROM r.section_id
          AND field_name = new_name
      );
      suffix_idx := suffix_idx + 1;
      IF suffix_idx > 25 THEN
        new_name := r.field_name || '_' || substr(r.id::text, 1, 6);
        EXIT;
      END IF;
    END LOOP;

    UPDATE public.form_fields SET field_name = new_name WHERE id = r.id;
  END LOOP;
END $$;
