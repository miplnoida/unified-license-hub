UPDATE public.registration_form_configs
SET form_schema = (
  SELECT jsonb_agg(
    CASE WHEN step ? 'rows' THEN jsonb_set(step, '{rows}', (
      SELECT jsonb_agg(
        jsonb_set(row, '{columns}', (
          SELECT jsonb_agg(
            CASE
              WHEN col->'field' IS NOT NULL
                   AND (col->'field'->>'type') = 'text'
                   AND (
                     lower(coalesce(col->'field'->>'label','')) ~ '(^|[^a-z])signature([^a-z]|$)'
                     OR lower(coalesce(col->'field'->>'fieldName','')) ~ '(^|[^a-z_])signature([^a-z_]|$)'
                   )
              THEN jsonb_set(col, '{field,type}', '"signature"'::jsonb)
              ELSE col
            END
          )
          FROM jsonb_array_elements(row->'columns') AS col
        ))
      )
      FROM jsonb_array_elements(step->'rows') AS row
    )) ELSE step END
  )
  FROM jsonb_array_elements(form_schema) AS step
)
WHERE form_schema IS NOT NULL;